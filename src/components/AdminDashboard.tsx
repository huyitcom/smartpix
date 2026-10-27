import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Users,
  QrCode,
  History,
  Search,
  RefreshCw,
  X,
  Check,
  Sparkles,
  Plus,
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
  Clock,
  Crown,
  Loader2,
  AlertTriangle,
  Copy,
  UserPlus,
  Link2,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  Upload,
  Trash2,
  Save,
  Eye,
  Video,
  Play,
} from 'lucide-react';
import {
  UserProfile,
  fetchAllFirestoreUsersResult,
  updateFirestoreUser,
  fetchAllLinkHistory,
  LinkHistoryItem,
} from '../firebase';
import { BannersConfig } from '../types';
import {
  fetchBannersConfig,
  saveBannersConfig,
  DEFAULT_BANNERS_CONFIG,
  DEFAULT_LEFT_BANNER_IMAGE,
  DEFAULT_RIGHT_BANNER_IMAGE,
} from '../services/bannerService';
import { compressBannerImage } from '../utils/imageCompressor';
import { getYouTubeEmbedInfo } from '../utils/youtubeHelper';

interface AdminUserRecord {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  role: 'admin' | 'vip' | 'user';
  credits: number;
  renderCount: number;
  createdAt?: string;
  lastLoginAt?: string;
}

interface AdminTopupOrder {
  orderCode: number;
  uid: string;
  email: string;
  displayName: string;
  packageId: string;
  packageName: string;
  credits: number;
  amount: number;
  transferContent: string;
  status: 'PENDING' | 'WAITING_APPROVAL' | 'PAID' | 'CANCELLED';
  createdAt: string;
  paidAt?: string;
  userReportedAt?: string;
  approvedBy?: string;
}

interface AdminRenderLog {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  resolution: '1K' | '2K' | '4K';
  creditsCost: number;
  remainingCredits: number;
  fileId?: string;
  fileName?: string;
  folderId?: string;
  notesCount?: number;
  createdAt: string;
}

interface AdminDashboardProps {
  onBack: () => void;
  currentUser: UserProfile | null;
  onUpdateCurrentUser?: (updated: UserProfile) => void;
}

export default function AdminDashboard({
  onBack,
  currentUser,
  onUpdateCurrentUser,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'members' | 'orders' | 'logs' | 'links' | 'banners'>('members');
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [orders, setOrders] = useState<AdminTopupOrder[]>([]);
  const [renderLogs, setRenderLogs] = useState<AdminRenderLog[]>([]);
  const [links, setLinks] = useState<LinkHistoryItem[]>([]);
  const [bannersConfig, setBannersConfig] = useState<BannersConfig>(DEFAULT_BANNERS_CONFIG);
  const [bannersSaving, setBannersSaving] = useState(false);
  const [bannersLoaded, setBannersLoaded] = useState(false);
  const [bannerOptimizing, setBannerOptimizing] = useState<{ left?: boolean; right?: boolean }>({});
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [copiedDriveId, setCopiedDriveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [busyOrderCode, setBusyOrderCode] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Filter & manual VIP state
  const [roleFilter, setRoleFilter] = useState<'all' | 'vip' | 'user' | 'admin'>('all');
  const [firestorePermissionDenied, setFirestorePermissionDenied] = useState(false);
  const [showRulesGuide, setShowRulesGuide] = useState(false);
  const [manualIdentifier, setManualIdentifier] = useState('');
  const [manualActionLoading, setManualActionLoading] = useState(false);

  // Custom credit adjustment modal state (replaces window.prompt)
  const [customModalUser, setCustomModalUser] = useState<AdminUserRecord | null>(null);
  const [customCreditMode, setCustomCreditMode] = useState<'add' | 'set'>('add');
  const [customCreditValue, setCustomCreditValue] = useState<string>('20');
  const [customRoleValue, setCustomRoleValue] = useState<'admin' | 'vip' | 'user'>('vip');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleCopyLink = (shareUrl: string, id: string) => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLinkId(id);
    showToast('✓ Đã sao chép link chọn ảnh!');
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  const handleCopyDrive = (driveUrl: string, id: string) => {
    navigator.clipboard.writeText(driveUrl);
    setCopiedDriveId(id);
    showToast('✓ Đã sao chép link Google Drive gốc!');
    setTimeout(() => setCopiedDriveId(null), 2000);
  };

  const handleBannerUpload = async (side: 'left' | 'right', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      showToast('⚠️ Kích thước file tối đa là 20MB');
      return;
    }

    setBannerOptimizing((prev) => ({ ...prev, [side]: true }));
    try {
      showToast(`⏳ Đang tối ưu & nén ảnh cho Banner ${side === 'left' ? 'Trái' : 'Phải'}...`);
      const { dataUrl, sizeKb, originalSizeKb } = await compressBannerImage(file);

      setBannersConfig((prev) => ({
        ...prev,
        [side === 'left' ? 'leftBanner' : 'rightBanner']: {
          ...prev[side === 'left' ? 'leftBanner' : 'rightBanner'],
          imageUrl: dataUrl,
        },
      }));
      setBannersLoaded(true);
      showToast(`✓ Đã nạp ảnh thành công (${originalSizeKb} KB ➜ ${sizeKb} KB - Siêu nhẹ, nét căng)! Nhớ bấm 'LƯU 2 BANNER NGAY'.`);
    } catch (err: any) {
      console.error('Error compressing banner:', err);
      showToast(`⚠️ Không thể xử lý ảnh: ${err?.message || 'Vui lòng thử file ảnh khác'}`);
    } finally {
      setBannerOptimizing((prev) => ({ ...prev, [side]: false }));
      e.target.value = '';
    }
  };

  const handleSaveBannersAction = async () => {
    setBannersSaving(true);
    try {
      const ok = await saveBannersConfig(bannersConfig);
      if (ok) {
        setBannersLoaded(true);
        showToast('✓ Đã lưu cấu hình 2 banner quảng cáo thành công!');
      } else {
        showToast('⚠️ Lỗi khi lưu banner, vui lòng thử lại');
      }
    } catch {
      showToast('⚠️ Lỗi lưu banner');
    } finally {
      setBannersSaving(false);
    }
  };

  const handleResetSideBanner = (side: 'left' | 'right') => {
    setBannersConfig((prev) => ({
      ...prev,
      [side === 'left' ? 'leftBanner' : 'rightBanner']: {
        ...prev[side === 'left' ? 'leftBanner' : 'rightBanner'],
        imageUrl: side === 'left' ? DEFAULT_LEFT_BANNER_IMAGE : DEFAULT_RIGHT_BANNER_IMAGE,
      },
    }));
    setBannersLoaded(true);
    showToast(`✓ Đã khôi phục ảnh mẫu cho Banner ${side === 'left' ? 'Trái' : 'Phải'}. Bấm 'Lưu' để áp dụng!`);
  };

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      // 0. Pull current ad banners configuration if not loaded yet
      if (!bannersLoaded) {
        fetchBannersConfig().then((b) => {
          setBannersConfig(b);
          setBannersLoaded(true);
        });
      }

      // 1. Pull link creation history from both Firestore and Server store
      const fetchedLinks = await fetchAllLinkHistory();
      setLinks(fetchedLinks);

      // 2. Pull all users directly from Firebase Firestore 'users' collection (photo-picker-507413)
      const { users: fbUsers, permissionDenied } = await fetchAllFirestoreUsersResult();
      setFirestorePermissionDenied(Boolean(permissionDenied));

      // 3. Sync with backend store so both Firestore 'users' and server credit/order/log/link records are unified
      const res = await fetch('/api/admin/sync-firestore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: fbUsers }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        const mergedUsers: AdminUserRecord[] = data.users || [];
        setUsers(mergedUsers);
        setOrders(data.orders || []);
        setRenderLogs(data.renderLogs || []);

        if (Array.isArray(data.links) && data.links.length > 0) {
          const map = new Map<string, LinkHistoryItem>();
          for (const l of [...fetchedLinks, ...data.links]) {
            const existing = map.get(l.folderId);
            if (!existing || new Date(l.createdAt).getTime() >= new Date(existing.createdAt).getTime()) {
              map.set(l.folderId, {
                ...existing,
                ...l,
                photoCount: l.photoCount ?? existing?.photoCount,
              });
            }
          }
          setLinks(Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        }

        if (currentUser && onUpdateCurrentUser) {
          const me = mergedUsers.find(
            (u: AdminUserRecord) =>
              u.uid === currentUser.uid ||
              (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase())
          );
          if (me) {
            onUpdateCurrentUser({
              ...currentUser,
              credits: me.credits,
              renderCount: me.renderCount,
              role: me.role,
            });
          }
        }
      } else if (fbUsers.length > 0) {
        setUsers(
          fbUsers.map((u) => ({
            uid: u.uid,
            email: u.email || `${u.uid}@photobook.vn`,
            displayName: u.displayName || 'Khách hàng',
            photoURL: u.photoURL,
            role: u.role,
            credits: u.credits ?? 3,
            renderCount: u.renderCount ?? 0,
            createdAt: u.createdAt,
            lastLoginAt: u.lastLoginAt,
          }))
        );
      }
    } catch (err) {
      console.error('Error loading admin overview:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser, onUpdateCurrentUser]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleQuickToggleRole = async (targetUser: AdminUserRecord, newRole: 'admin' | 'vip' | 'user') => {
    setBusyUid(targetUser.uid);
    try {
      const res = await fetch('/api/admin/credits/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: targetUser.uid,
          role: newRole,
          adminEmail: currentUser?.email || 'Admin',
        }),
      });
      const data = await res.json();
      if (res.ok && data?.user) {
        await updateFirestoreUser(targetUser.uid, {
          role: data.user.role,
        });
        setUsers((prev) =>
          prev.map((u) => (u.uid === targetUser.uid ? { ...u, role: data.user.role } : u))
        );
        if (currentUser && targetUser.uid === currentUser.uid && onUpdateCurrentUser) {
          onUpdateCurrentUser({
            ...currentUser,
            role: data.user.role,
          });
        }
        showToast(
          `✓ Đã đổi vai trò ${targetUser.displayName || targetUser.email} thành: ${data.user.role === 'vip' ? '👑 VIP' : data.user.role.toUpperCase()}`
        );
      }
    } catch (err) {
      console.error('Role toggle error:', err);
    } finally {
      setBusyUid(null);
    }
  };

  const handleManualAddVip = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = manualIdentifier.trim();
    if (!id) return;
    setManualActionLoading(true);
    try {
      const isEmail = id.includes('@');
      const cleanEmail = isEmail ? id.toLowerCase() : `${id}@photobook.vn`;
      const uid = isEmail
        ? 'usr_' + Math.abs(cleanEmail.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)).toString(36)
        : id;

      const res = await fetch('/api/admin/credits/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          email: cleanEmail,
          displayName: cleanEmail.split('@')[0],
          role: 'vip',
          exactCredits: 10,
          adminEmail: currentUser?.email || 'Admin',
        }),
      });
      const data = await res.json();
      if (res.ok && data?.user) {
        await updateFirestoreUser(uid, {
          role: 'vip',
          credits: data.user.credits,
          email: cleanEmail,
        });
        await fetchOverview();
        setManualIdentifier('');
        showToast(`✓ Đã kích hoạt VIP thành công cho ${cleanEmail}!`);
      }
    } catch (err) {
      console.error('Manual VIP add error:', err);
    } finally {
      setManualActionLoading(false);
    }
  };

  const handleQuickAddCredits = async (targetUser: AdminUserRecord, delta: number) => {
    setBusyUid(targetUser.uid);
    try {
      const res = await fetch('/api/admin/credits/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: targetUser.uid,
          delta,
          adminEmail: currentUser?.email || 'Admin',
        }),
      });
      const data = await res.json();
      if (res.ok && data?.user) {
        await updateFirestoreUser(targetUser.uid, {
          credits: data.user.credits,
          role: data.user.role,
        });
        setUsers((prev) =>
          prev.map((u) => (u.uid === targetUser.uid ? { ...u, ...data.user } : u))
        );
        if (currentUser && targetUser.uid === currentUser.uid && onUpdateCurrentUser) {
          onUpdateCurrentUser({
            ...currentUser,
            credits: data.user.credits,
          });
        }
        showToast(
          `✓ Đã cộng +${delta} lượt cho ${targetUser.displayName || targetUser.email} (Số dư mới: ${data.user.credits} lượt)`
        );
      }
    } catch (err) {
      console.error('Quick add error:', err);
    } finally {
      setBusyUid(null);
    }
  };

  const handleSaveCustomAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customModalUser) return;
    const numVal = Number(customCreditValue);
    if (Number.isNaN(numVal)) return;

    setBusyUid(customModalUser.uid);
    try {
      const payload: Record<string, any> = {
        uid: customModalUser.uid,
        role: customRoleValue,
        adminEmail: currentUser?.email || 'Admin',
      };
      if (customCreditMode === 'set') {
        payload.exactCredits = Math.max(0, Math.round(numVal));
      } else {
        payload.delta = Math.round(numVal);
      }

      const res = await fetch('/api/admin/credits/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data?.user) {
        await updateFirestoreUser(customModalUser.uid, {
          credits: data.user.credits,
          role: data.user.role,
        });
        setUsers((prev) =>
          prev.map((u) => (u.uid === customModalUser.uid ? { ...u, ...data.user } : u))
        );
        if (currentUser && customModalUser.uid === currentUser.uid && onUpdateCurrentUser) {
          onUpdateCurrentUser({
            ...currentUser,
            credits: data.user.credits,
            role: data.user.role,
          });
        }
        showToast(
          `✓ Đã cập nhật ${customModalUser.displayName}: ${data.user.credits} lượt (${data.user.role.toUpperCase()})`
        );
        setCustomModalUser(null);
      }
    } catch (err) {
      console.error('Custom adjust error:', err);
    } finally {
      setBusyUid(null);
    }
  };

  const handleApproveOrder = async (orderCode: number) => {
    setBusyOrderCode(orderCode);
    try {
      const res = await fetch(`/api/admin/orders/${orderCode}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: currentUser?.email || 'Admin' }),
      });
      const data = await res.json();
      if (res.ok && data?.order) {
        setOrders((prev) =>
          prev.map((o) => (o.orderCode === orderCode ? data.order : o))
        );
        if (data.user) {
          await updateFirestoreUser(data.user.uid, {
            credits: data.user.credits,
            role: data.user.role,
          });
          setUsers((prev) =>
            prev.map((u) => (u.uid === data.user.uid ? { ...u, ...data.user } : u))
          );
          if (currentUser && data.user.uid === currentUser.uid && onUpdateCurrentUser) {
            onUpdateCurrentUser({
              ...currentUser,
              credits: data.user.credits,
              role: data.user.role,
            });
          }
        }
        showToast(
          `✓ Đã duyệt đơn #${orderCode} và cộng +${data.order.credits} lượt cho ${data.order.email}!`
        );
      }
    } catch (err) {
      console.error('Approve order error:', err);
    } finally {
      setBusyOrderCode(null);
    }
  };

  const handleRejectOrder = async (orderCode: number) => {
    setBusyOrderCode(orderCode);
    try {
      const res = await fetch(`/api/admin/orders/${orderCode}/reject`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data?.order) {
        setOrders((prev) =>
          prev.map((o) => (o.orderCode === orderCode ? data.order : o))
        );
        showToast(`Đã hủy đơn nạp #${orderCode}`);
      }
    } catch (err) {
      console.error('Reject order error:', err);
    } finally {
      setBusyOrderCode(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      u.email?.toLowerCase().includes(q) ||
      u.displayName?.toLowerCase().includes(q) ||
      u.uid?.toLowerCase().includes(q)
    );
  });

  const filteredLinks = links.filter((l) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      l.creatorEmail?.toLowerCase().includes(q) ||
      l.creatorName?.toLowerCase().includes(q) ||
      l.folderId?.toLowerCase().includes(q) ||
      l.driveUrl?.toLowerCase().includes(q)
    );
  });

  const vipUsersCount = users.filter((u) => u.role === 'vip').length;
  const standardUsersCount = users.filter((u) => u.role === 'user').length;
  const adminUsersCount = users.filter((u) => u.role === 'admin').length;

  const pendingOrdersCount = orders.filter(
    (o) => o.status === 'PENDING' || o.status === 'WAITING_APPROVAL'
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 overflow-y-auto font-sans">
      <div className="bg-[#0e1320] border border-slate-800 rounded-3xl max-w-6xl w-full text-white shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Toast notification */}
        {toastMsg && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-950/95 border border-emerald-500/50 text-emerald-200 px-5 py-2.5 rounded-full shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* TOP HEADER BAR (Matches Screenshot 2) */}
        <div className="px-5 sm:px-7 py-4 sm:py-5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-4 bg-[#111728]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
              <Shield className="w-6 h-6 text-slate-950 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-black text-white tracking-tight">
                Hệ Thống Quản Trị Lượt Render AI & Phân Quyền VIP
              </h1>
              <p className="text-xs text-slate-400">
                Quản lý thành viên, theo dõi lịch sử tạo link lọc ảnh, gán quyền VIP & duyệt thanh toán VietQR
              </p>
            </div>
          </div>

          {/* 5 Navigation Tabs + Close Button */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            <div className="bg-[#0a0e19] p-1 rounded-2xl border border-slate-800 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('members')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'members'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Thành Viên & Số Dư ({users.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('links')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'links'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Lịch Sử Tạo Link ({links.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('banners')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'banners'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Banner 2 Bên Sườn</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'orders'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Duyệt Nạp VietQR</span>
                {pendingOrdersCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-black text-[10px]">
                    {pendingOrdersCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('logs')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'logs'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Nhật Ký Render</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onBack}
              className="p-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer ml-1"
              title="Đóng bảng quản trị"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MAIN TAB BODY */}
        <div className="p-5 sm:p-7 flex-1 overflow-y-auto space-y-5">
          {/* FIREBASE PERMISSION WARNING / RULES GUIDE BANNER */}
          {firestorePermissionDenied && (
            <div className="bg-amber-950/70 border border-amber-500/50 rounded-2xl p-4 sm:p-5 text-amber-100 flex flex-col gap-3 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm text-amber-300">
                      Firebase Firestore đang chặn quyền đọc toàn bộ bảng `users` (permission-denied)
                    </div>
                    <div className="text-xs text-amber-200/90 mt-1 leading-relaxed">
                      Vì quy tắc bảo mật trên Firebase Console đang hạn chế, hệ thống hiện chỉ nạp được 3 tài khoản đã đồng bộ vào bộ nhớ. Hãy cập nhật tab <b>Rules</b> trên Firebase Console (chỉ mất 10s) để bảng hiển thị tất cả hàng chục thành viên!
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRulesGuide(!showRulesGuide)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition shrink-0 cursor-pointer"
                >
                  {showRulesGuide ? 'Ẩn hướng dẫn' : 'Xem mã Rules cần dán'}
                </button>
              </div>

              {(firestorePermissionDenied || showRulesGuide) && (
                <div className="bg-[#0b0f1a] p-3.5 rounded-xl border border-amber-500/30 text-xs space-y-2">
                  <p className="text-slate-300">
                    👉 Trong Firebase Console dự án <b>Photo Picker</b> &gt; <b>Firestore Database</b> &gt; chọn tab <b>Rules</b> (bên cạnh tab Data bạn đang xem) và dán đoạn sau rồi bấm <b>Publish</b>:
                  </p>
                  <div className="bg-black/60 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-emerald-400 select-all overflow-x-auto">
                    {`rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{userId} {\n      allow read, write: if true;\n    }\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}`}
                  </div>
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{userId} {\n      allow read, write: if true;\n    }\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}`);
                        showToast("✓ Đã sao chép mã Rules!");
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow transition"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao chép mã Rules</span>
                    </button>
                    <button
                      type="button"
                      onClick={fetchOverview}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer border border-slate-700 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Đã Publish, tải lại danh sách ngay</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search, Filter & Quick Manual VIP Row */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm theo tên, email hoặc UID..."
                  className="w-full pl-11 pr-4 py-3 bg-[#141a2e] border border-slate-800 focus:border-indigo-500 rounded-2xl text-xs sm:text-sm text-white placeholder-slate-500 outline-none transition"
                />
              </div>

              <button
                type="button"
                onClick={fetchOverview}
                disabled={loading}
                className="px-4 py-3 rounded-2xl bg-[#182036] hover:bg-[#1f2945] border border-slate-700/80 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
                <span>Làm mới danh sách</span>
              </button>
            </div>

            {/* Role Filter tabs & Manual Add/Set VIP bar */}
            {activeTab === 'members' && (
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#111627] p-3 rounded-2xl border border-slate-800/80">
                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                  <button
                    type="button"
                    onClick={() => setRoleFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                      roleFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-[#141a2e] text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Tất cả ({users.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter('vip')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer shrink-0 ${
                      roleFilter === 'vip'
                        ? 'bg-purple-600 text-white shadow'
                        : 'bg-[#141a2e] text-purple-300 hover:text-white border border-slate-800'
                    }`}
                  >
                    <Crown className="w-3 h-3 text-amber-400" />
                    <span>Thành viên VIP ({vipUsersCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter('user')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                      roleFilter === 'user'
                        ? 'bg-slate-700 text-white shadow'
                        : 'bg-[#141a2e] text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    User thường ({standardUsersCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoleFilter('admin')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                      roleFilter === 'admin'
                        ? 'bg-amber-600 text-white shadow'
                        : 'bg-[#141a2e] text-amber-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    Admin ({adminUsersCount})
                  </button>
                </div>

                {/* Quick Manual User / Set VIP Form */}
                <form onSubmit={handleManualAddVip} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={manualIdentifier}
                    onChange={(e) => setManualIdentifier(e.target.value)}
                    placeholder="Nhập Email hoặc UID để set VIP nhanh..."
                    className="px-3.5 py-1.5 bg-[#141a2e] border border-slate-800 focus:border-purple-500 rounded-xl text-xs text-white placeholder-slate-500 outline-none w-56 sm:w-64"
                  />
                  <button
                    type="submit"
                    disabled={manualActionLoading || !manualIdentifier.trim()}
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition shadow shrink-0"
                  >
                    {manualActionLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Crown className="w-3.5 h-3.5 text-amber-300" />
                    )}
                    <span>Gán VIP ngay</span>
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* TAB 1: THÀNH VIÊN & SỐ DƯ */}
          {activeTab === 'members' && (
            <div className="bg-[#121728] border border-slate-800/90 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 bg-[#0d1220]">
                      <th className="py-3.5 px-5">NGƯỜI DÙNG</th>
                      <th className="py-3.5 px-4">VAI TRÒ & SET VIP</th>
                      <th className="py-3.5 px-4">SỐ LƯỢT KHẢ DỤNG</th>
                      <th className="py-3.5 px-4">ĐÃ RENDER</th>
                      <th className="py-3.5 px-5 text-right">THAO TÁC CỘNG LƯỢT NHANH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500">
                          Không tìm thấy thành viên nào phù hợp.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const isBusy = busyUid === u.uid;
                        const initial =
                          u.displayName?.charAt(0)?.toUpperCase() ||
                          u.email?.charAt(0)?.toUpperCase() ||
                          'U';

                        return (
                          <tr
                            key={u.uid}
                            className="hover:bg-[#161d33] transition-colors"
                          >
                            {/* NGƯỜI DÙNG */}
                            <td className="py-4 px-5">
                              <div className="flex items-center gap-3">
                                {u.photoURL ? (
                                  <img
                                    src={u.photoURL}
                                    alt={u.displayName}
                                    className="w-9 h-9 rounded-full object-cover border border-slate-700"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-indigo-900/80 border border-indigo-500/40 text-indigo-200 font-bold text-xs flex items-center justify-center shrink-0">
                                    {initial}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-bold text-white truncate">
                                    {u.displayName || 'Khách hàng'}
                                  </div>
                                  <div className="text-xs text-slate-400 truncate">
                                    {u.email}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* VAI TRÒ & 1-CLICK SET VIP */}
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2 flex-wrap">
                                {u.role === 'admin' ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-950/90 border border-amber-500/40 text-amber-300 font-bold text-xs">
                                    Admin
                                  </span>
                                ) : u.role === 'vip' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-950/90 border border-purple-500/40 text-purple-300 font-bold text-xs">
                                    <Crown className="w-3 h-3 text-amber-400" />
                                    VIP
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-xs">
                                    User (Chuẩn)
                                  </span>
                                )}

                                {/* Direct 1-Click VIP / User Toggle button */}
                                {u.role !== 'admin' && (
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleQuickToggleRole(u, u.role === 'vip' ? 'user' : 'vip')}
                                    className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 disabled:opacity-50 ${
                                      u.role === 'vip'
                                        ? 'bg-slate-800/80 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border-slate-700 hover:border-rose-700'
                                        : 'bg-purple-900/60 hover:bg-purple-800 text-amber-300 hover:text-white border-purple-500/40 shadow-xs'
                                    }`}
                                    title={u.role === 'vip' ? 'Hạ xuống User chuẩn' : 'Nâng cấp lên VIP ngay lập tức'}
                                  >
                                    <Crown className={`w-3 h-3 ${u.role === 'vip' ? 'text-slate-400' : 'text-amber-400'}`} />
                                    <span>{u.role === 'vip' ? 'Bỏ VIP' : 'Set VIP'}</span>
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* SỐ LƯỢT KHẢ DỤNG */}
                            <td className="py-4 px-4">
                              <span
                                className={`inline-flex items-center px-3 py-1 rounded-full font-extrabold text-xs border ${
                                  (u.credits ?? 0) > 0
                                    ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
                                    : 'bg-rose-950/80 border-rose-500/40 text-rose-400'
                                }`}
                              >
                                {u.credits ?? 0} lượt
                              </span>
                            </td>

                            {/* ĐÃ RENDER */}
                            <td className="py-4 px-4 text-slate-300 font-medium">
                              {u.renderCount ?? 0} lần
                            </td>

                            {/* THAO TÁC CỘNG LƯỢT NHANH */}
                            <td className="py-4 px-5 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                                {[5, 10, 25].map((amt) => (
                                  <button
                                    key={amt}
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleQuickAddCredits(u, amt)}
                                    className="px-2.5 py-1.5 rounded-xl bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/30 text-emerald-300 font-extrabold text-xs transition cursor-pointer disabled:opacity-50"
                                  >
                                    +{amt}
                                  </button>
                                ))}

                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setCustomModalUser(u);
                                    setCustomCreditMode('add');
                                    setCustomCreditValue('20');
                                    setCustomRoleValue(u.role);
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer flex items-center gap-1"
                                >
                                  <SlidersHorizontal className="w-3 h-3" />
                                  <span>Tùy chỉnh...</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: DUYỆT NẠP VIETQR */}
          {activeTab === 'orders' && (
            <div className="bg-[#121728] border border-slate-800/90 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 bg-[#0d1220]">
                      <th className="py-3.5 px-5">MÃ ĐƠN / NỘI DUNG CK</th>
                      <th className="py-3.5 px-4">THÀNH VIÊN</th>
                      <th className="py-3.5 px-4">GÓI NẠP</th>
                      <th className="py-3.5 px-4">SỐ TIỀN</th>
                      <th className="py-3.5 px-4">TRẠNG THÁI</th>
                      <th className="py-3.5 px-5 text-right">THAO TÁC DUYỆT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          Chưa có giao dịch nạp VietQR nào phát sinh.
                        </td>
                      </tr>
                    ) : (
                      orders.map((ord) => {
                        const isBusy = busyOrderCode === ord.orderCode;
                        return (
                          <tr key={ord.orderCode} className="hover:bg-[#161d33] transition-colors">
                            <td className="py-4 px-5">
                              <div className="font-black text-amber-300">{ord.transferContent}</div>
                              <div className="text-[11px] text-slate-500">
                                Mã đơn: #{ord.orderCode} •{' '}
                                {new Date(ord.createdAt).toLocaleString('vi-VN')}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="font-bold text-white">{ord.displayName}</div>
                              <div className="text-xs text-slate-400">{ord.email}</div>
                            </td>
                            <td className="py-4 px-4">
                              <span className="font-bold text-indigo-300">{ord.packageName}</span>
                              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/30 text-emerald-300 font-black text-xs">
                                +{ord.credits} lượt
                              </span>
                            </td>
                            <td className="py-4 px-4 font-black text-emerald-400">
                              {Number(ord.amount).toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-4 px-4">
                              {ord.status === 'PAID' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 font-bold text-xs">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Đã cộng lượt
                                </span>
                              ) : ord.status === 'WAITING_APPROVAL' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-950/90 border border-amber-500/50 text-amber-300 font-bold text-xs animate-pulse">
                                  <Clock className="w-3.5 h-3.5" />
                                  Khách báo đã CK
                                </span>
                              ) : ord.status === 'CANCELLED' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-950/80 border border-rose-500/30 text-rose-300 font-bold text-xs">
                                  <XCircle className="w-3.5 h-3.5" />
                                  Đã hủy
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-xs">
                                  <Clock className="w-3.5 h-3.5" />
                                  Đang chờ quét QR
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-5 text-right">
                              {ord.status !== 'PAID' && ord.status !== 'CANCELLED' ? (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleApproveOrder(ord.orderCode)}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition shadow"
                                  >
                                    {isBusy ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5" />
                                    )}
                                    <span>Duyệt & Cộng +{ord.credits} lượt</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleRejectOrder(ord.orderCode)}
                                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs font-semibold cursor-pointer transition"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500">
                                  {ord.approvedBy || 'Hoàn tất'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: NHẬT KÝ RENDER */}
          {activeTab === 'logs' && (
            <div className="bg-[#121728] border border-slate-800/90 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 bg-[#0d1220]">
                      <th className="py-3.5 px-5">THỜI GIAN</th>
                      <th className="py-3.5 px-4">THÀNH VIÊN</th>
                      <th className="py-3.5 px-4">FILE ẢNH</th>
                      <th className="py-3.5 px-4">ĐỘ PHÂN GIẢI</th>
                      <th className="py-3.5 px-4">LƯỢT TRỪ</th>
                      <th className="py-3.5 px-5 text-right">SỐ DƯ CÒN LẠI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                    {renderLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          Chưa có lịch sử chỉnh sửa ảnh AI nào.
                        </td>
                      </tr>
                    ) : (
                      renderLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-[#161d33] transition-colors">
                          <td className="py-3.5 px-5 text-xs text-slate-400">
                            {new Date(log.createdAt).toLocaleString('vi-VN')}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white">{log.displayName}</div>
                            <div className="text-xs text-slate-400">{log.email}</div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-300 font-medium">
                            {log.fileName || log.fileId || 'Ảnh Studio'}
                            {log.notesCount ? (
                              <span className="ml-1.5 text-[11px] text-slate-500">
                                ({log.notesCount} note)
                              </span>
                            ) : null}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-0.5 rounded-full bg-purple-950 border border-purple-500/40 text-purple-300 font-bold text-xs">
                              {log.resolution}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-amber-400">
                            -{log.creditsCost} lượt
                          </td>
                          <td className="py-3.5 px-5 text-right font-bold text-emerald-400">
                            {log.remainingCredits} lượt
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: LỊCH SỬ TẠO LINK LỌC ẢNH */}
          {activeTab === 'links' && (
            <div className="space-y-4">
              {/* Quick Summary Cards for Link History */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[#121728] border border-slate-800/90 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Tổng số link đã tạo
                    </div>
                    <div className="text-2xl font-black text-white mt-1">
                      {links.length} <span className="text-xs font-semibold text-slate-400">link album</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                    <Link2 className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-[#121728] border border-slate-800/90 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Do VIP & Admin tạo
                    </div>
                    <div className="text-2xl font-black text-amber-300 mt-1">
                      {links.filter((l) => l.creatorRole === 'vip' || l.creatorRole === 'admin').length}{' '}
                      <span className="text-xs font-semibold text-slate-400">link</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <Crown className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-[#121728] border border-slate-800/90 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Khách hàng & User thường
                    </div>
                    <div className="text-2xl font-black text-emerald-400 mt-1">
                      {links.filter((l) => l.creatorRole !== 'vip' && l.creatorRole !== 'admin').length}{' '}
                      <span className="text-xs font-semibold text-slate-400">link</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Links Table */}
              <div className="bg-[#121728] border border-slate-800/90 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800/90 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 bg-[#0d1220]">
                        <th className="py-3.5 px-5">THỜI GIAN</th>
                        <th className="py-3.5 px-4">THÀNH VIÊN TẠO LINK</th>
                        <th className="py-3.5 px-4">THƯ MỤC & SỐ ẢNH</th>
                        <th className="py-3.5 px-4">LINK CHỌN ẢNH (SMART PIX)</th>
                        <th className="py-3.5 px-5 text-right">GOOGLE DRIVE GỐC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
                      {filteredLinks.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-500">
                            {searchTerm ? 'Không tìm thấy link nào khớp với tìm kiếm.' : 'Chưa có lịch sử tạo link lọc ảnh nào.'}
                          </td>
                        </tr>
                      ) : (
                        filteredLinks.map((item) => {
                          const initial =
                            item.creatorName?.charAt(0)?.toUpperCase() ||
                            item.creatorEmail?.charAt(0)?.toUpperCase() ||
                            'U';
                          const isJustCreated =
                            Date.now() - new Date(item.createdAt).getTime() < 2 * 60 * 60 * 1000;
                          const shareUrl =
                            item.shareUrl ||
                            (typeof window !== 'undefined'
                              ? `${window.location.origin}/?folder=${item.folderId}`
                              : `/?folder=${item.folderId}`);
                          const driveUrl =
                            item.driveUrl || `https://drive.google.com/drive/folders/${item.folderId}`;

                          return (
                            <tr key={item.id || item.folderId} className="hover:bg-[#161d33] transition-colors">
                              {/* THỜI GIAN */}
                              <td className="py-4 px-5">
                                <div className="flex flex-col gap-1">
                                  <span className="font-semibold text-white text-xs">
                                    {new Date(item.createdAt).toLocaleString('vi-VN')}
                                  </span>
                                  {isJustCreated && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold text-[10px] w-fit border border-emerald-500/30">
                                      Vừa tạo
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* THÀNH VIÊN TẠO LINK */}
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-3">
                                  {item.creatorPhotoURL ? (
                                    <img
                                      src={item.creatorPhotoURL}
                                      alt={item.creatorName}
                                      className="w-9 h-9 rounded-full object-cover border border-slate-700 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-9 h-9 rounded-full bg-indigo-900/80 border border-indigo-500/40 text-indigo-200 font-bold text-xs flex items-center justify-center shrink-0">
                                      {initial}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-white truncate max-w-[150px]">
                                        {item.creatorName || 'Khách vãng lai'}
                                      </span>
                                      {item.creatorRole === 'admin' ? (
                                        <span className="px-1.5 py-0.2 rounded-md bg-amber-950 border border-amber-500/40 text-amber-300 font-black text-[10px]">
                                          ADMIN
                                        </span>
                                      ) : item.creatorRole === 'vip' ? (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-purple-950 border border-purple-500/40 text-purple-300 font-black text-[10px]">
                                          <Crown className="w-2.5 h-2.5 text-amber-400" />
                                          VIP
                                        </span>
                                      ) : item.creatorRole === 'user' ? (
                                        <span className="px-1.5 py-0.2 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-[10px]">
                                          USER
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.2 rounded-md bg-zinc-800 text-zinc-400 text-[10px]">
                                          Khách
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-400 truncate max-w-[200px]">
                                      {item.creatorEmail || 'Chưa đăng nhập'}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* THƯ MỤC & SỐ ẢNH */}
                              <td className="py-4 px-4">
                                <div className="flex flex-col gap-1">
                                  {item.customTitle && (
                                    <div className="font-bold text-xs text-amber-300 truncate max-w-[200px]">
                                      {item.customTitle}
                                    </div>
                                  )}
                                  <div className="font-mono text-xs text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-800/40 w-fit truncate max-w-[180px]">
                                    {item.folderId}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-slate-300 text-xs font-semibold">
                                    <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                                    <span>
                                      {typeof item.photoCount === 'number'
                                        ? `${item.photoCount} ảnh trong album`
                                        : 'Đã sẵn sàng'}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* LINK CHỌN ẢNH (SMART PIX) */}
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-2">
                                  <a
                                    href={shareUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow cursor-pointer shrink-0"
                                    title="Mở giao diện khách lọc ảnh"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Mở link lọc</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyLink(shareUrl, item.folderId)}
                                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1 shrink-0"
                                    title="Sao chép link chia sẻ cho khách"
                                  >
                                    {copiedLinkId === item.folderId ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                    <span>{copiedLinkId === item.folderId ? 'Đã chép' : 'Copy'}</span>
                                  </button>
                                </div>
                              </td>

                              {/* GOOGLE DRIVE GỐC */}
                              <td className="py-4 px-5 text-right">
                                <div className="inline-flex items-center justify-end gap-2">
                                  <a
                                    href={driveUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 rounded-xl bg-[#17223b] hover:bg-[#1f2f52] border border-blue-500/40 text-blue-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                    title="Mở thư mục Google Drive gốc trên drive.google.com"
                                  >
                                    <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                                    <span>Mở Drive gốc</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyDrive(driveUrl, item.folderId)}
                                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                                    title="Sao chép link Google Drive gốc"
                                  >
                                    {copiedDriveId === item.folderId ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                    <span>{copiedDriveId === item.folderId ? 'Đã chép' : 'Copy'}</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: QUẢN LÝ 2 BANNER HÌNH ẢNH 2 BÊN SƯỜN MÀN HÌNH */}
          {activeTab === 'banners' && (
            <div className="space-y-6">
              {/* Header Box & Save Controls */}
              <div className="bg-[#121728] border border-slate-800/90 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-black text-[11px] uppercase tracking-wider border border-indigo-500/30">
                      Giao Diện Trang Chủ
                    </span>
                    <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mặc định hiển thị 2 bên sườn
                    </span>
                  </div>
                  <h2 className="text-lg font-black text-white">
                    Quản Lý Hình Ảnh 2 Banner Quảng Cáo Sườn Màn Hình
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Tải lên 1 tấm hình cho mỗi banner (không cần text). Hình ảnh sẽ xuất hiện cố định ở 2 bên sườn màn hình máy tính và bên dưới trang trên di động.
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <a
                    href="/"
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border border-slate-700 shrink-0"
                    title="Mở tab mới xem trực tiếp trang chủ"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Xem trang chủ</span>
                  </a>

                  <button
                    type="button"
                    disabled={bannersSaving}
                    onClick={handleSaveBannersAction}
                    className="flex-1 md:flex-initial px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-98"
                  >
                    {bannersSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>{bannersSaving ? 'Đang lưu...' : 'LƯU 2 BANNER NGAY'}</span>
                  </button>
                </div>
              </div>

              {/* 2 Banner Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. BANNER BÊN TRÁI (LEFT SIDE) */}
                <div className="bg-[#121728] border border-slate-800/90 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-5">
                  <div className="space-y-4">
                    {/* Header + Toggle */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-400">
                          CỘT TRÁI (LEFT SIDEBAR)
                        </div>
                        <h3 className="text-base font-black text-white mt-0.5">
                          Banner Quảng Cáo Bên Trái
                        </h3>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <span className="text-xs font-bold text-slate-300">
                          {bannersConfig.leftBanner.enabled ? 'Đang Bật' : 'Đang Tắt'}
                        </span>
                        <input
                          type="checkbox"
                          checked={bannersConfig.leftBanner.enabled}
                          onChange={(e) =>
                            setBannersConfig((prev) => ({
                              ...prev,
                              leftBanner: { ...prev.leftBanner, enabled: e.target.checked },
                            }))
                          }
                          className="w-5 h-5 accent-rose-500 rounded cursor-pointer"
                        />
                      </label>
                    </div>

                    {/* Tùy chọn định dạng: Hình ảnh hoặc Video YouTube */}
                    <div className="flex items-center gap-1.5 p-1 bg-[#0a0e19] rounded-xl border border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setBannersConfig((prev) => ({
                            ...prev,
                            leftBanner: { ...prev.leftBanner, mediaType: 'image' },
                          }));
                          setBannersLoaded(true);
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          (bannersConfig.leftBanner.mediaType || 'image') === 'image'
                            ? 'bg-rose-600 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Hình ảnh</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBannersConfig((prev) => ({
                            ...prev,
                            leftBanner: { ...prev.leftBanner, mediaType: 'youtube' },
                          }));
                          setBannersLoaded(true);
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          bannersConfig.leftBanner.mediaType === 'youtube'
                            ? 'bg-red-600 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Video YouTube</span>
                      </button>
                    </div>

                    {/* Preview box */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-slate-300">
                          {bannersConfig.leftBanner.mediaType === 'youtube'
                            ? 'Video YouTube (Xem trước):'
                            : 'Hình ảnh hiển thị (Xem trước):'}
                        </label>
                        {bannersConfig.leftBanner.mediaType === 'youtube' ? (
                          (() => {
                            const info = getYouTubeEmbedInfo(bannersConfig.leftBanner.youtubeUrl);
                            return info ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold border border-red-500/30">
                                ✓ YouTube {info.isShorts ? 'Shorts (Dọc)' : 'Video (16:9)'}
                              </span>
                            ) : null;
                          })()
                        ) : bannersConfig.leftBanner.imageUrl?.startsWith('data:') ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                            ✓ Ảnh đã nén & tối ưu sẵn sàng
                          </span>
                        ) : null}
                      </div>

                      <div className="relative group rounded-2xl overflow-hidden border-2 border-dashed border-slate-700 bg-[#0a0e1a] p-3 flex items-center justify-center min-h-[300px]">
                        {bannersConfig.leftBanner.mediaType === 'youtube' ? (
                          (() => {
                            const info = getYouTubeEmbedInfo(bannersConfig.leftBanner.youtubeUrl);
                            return info ? (
                              <div className={`w-full max-w-[240px] mx-auto rounded-xl overflow-hidden border border-slate-700 bg-black ${info.isShorts ? 'aspect-[9/16]' : 'aspect-video'}`}>
                                <iframe
                                  src={info.embedUrl}
                                  title="YouTube preview"
                                  className="w-full h-full border-0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              </div>
                            ) : (
                              <div className="text-center text-slate-500 text-xs p-6 space-y-2">
                                <Video className="w-8 h-8 text-slate-600 mx-auto" />
                                <div>Chưa có video YouTube. Vui lòng dán link video vào ô bên dưới.</div>
                              </div>
                            );
                          })()
                        ) : bannerOptimizing.left ? (
                          <div className="flex flex-col items-center gap-2 py-12 text-rose-400">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span className="text-xs font-bold">Đang nén & tối ưu ảnh...</span>
                          </div>
                        ) : bannersConfig.leftBanner.imageUrl ? (
                          <div className="relative max-w-[200px] w-full mx-auto">
                            <img
                              src={bannersConfig.leftBanner.imageUrl}
                              alt="Banner trái"
                              className="w-full h-auto max-h-[380px] object-contain rounded-xl shadow-lg border border-slate-700"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div className="text-center text-[10px] text-slate-500 mt-2">
                              Kích thước khuyến nghị: 240 x 500px (Dạng ảnh đứng)
                            </div>
                          </div>
                        ) : (
                          <div className="text-center text-slate-500 text-xs">
                            Chưa có ảnh banner. Hãy tải ảnh lên.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inputs depending on Media Type */}
                    {bannersConfig.leftBanner.mediaType === 'youtube' ? (
                      <div className="space-y-1.5 pt-1">
                        <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <Video className="w-3.5 h-3.5 text-red-400" />
                          <span>Dán link video YouTube (watch, shorts, embed, youtu.be):</span>
                        </label>
                        <input
                          type="text"
                          value={bannersConfig.leftBanner.youtubeUrl || ''}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            setBannersConfig((prev) => ({
                              ...prev,
                              leftBanner: { ...prev.leftBanner, youtubeUrl: val, mediaType: 'youtube' },
                            }));
                            setBannersLoaded(true);
                          }}
                          placeholder="https://www.youtube.com/watch?v=... hoặc https://youtube.com/shorts/..."
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0e19] border border-slate-700 text-white text-xs placeholder-slate-500 outline-none focus:border-red-500 transition"
                        />
                        <p className="text-[11px] text-slate-400">
                          * Hỗ trợ mọi link YouTube (kể cả YouTube Shorts dọc). Video sẽ tự động phát êm dịu (tắt tiếng).
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Upload button & restore default */}
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <label className="flex-1 min-w-[170px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow transition active:scale-98">
                            <Upload className="w-4 h-4" />
                            <span>Tải ảnh từ máy tính</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleBannerUpload('left', e)}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => handleResetSideBanner('left')}
                            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition cursor-pointer border border-slate-700"
                            title="Khôi phục ảnh mẫu ban đầu"
                          >
                            Khôi phục ảnh mẫu
                          </button>
                        </div>

                        {/* Direct image URL input (Optional alternative) */}
                        <div className="space-y-1.5 pt-1">
                          <label className="block text-xs font-bold text-slate-300">
                            Hoặc nhập link URL ảnh trực tiếp (Tùy chọn):
                          </label>
                          <input
                            type="text"
                            value={bannersConfig.leftBanner.imageUrl?.startsWith('data:') ? '' : (bannersConfig.leftBanner.imageUrl || '')}
                            onChange={(e) => {
                              const val = e.target.value.trim();
                              if (val) {
                                setBannersConfig((prev) => ({
                                  ...prev,
                                  leftBanner: { ...prev.leftBanner, imageUrl: val, mediaType: 'image' },
                                }));
                                setBannersLoaded(true);
                              }
                            }}
                            placeholder="https://... (Nếu có sẵn link ảnh online)"
                            className="w-full px-3.5 py-2 rounded-xl bg-[#0a0e19] border border-slate-700 text-white text-xs placeholder-slate-500 outline-none focus:border-rose-500 transition"
                          />
                        </div>
                      </>
                    )}

                    {/* Width setting (Bề ngang px - chiều cao tự co giãn theo tỷ lệ) */}
                    <div className="space-y-2 pt-2 bg-[#0a0e19] p-3.5 rounded-2xl border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-rose-400" />
                          <span>Bề ngang banner (Chiều rộng):</span>
                        </label>
                        <div className="flex items-center gap-1 bg-[#121728] px-2.5 py-1 rounded-xl border border-slate-700">
                          <input
                            type="number"
                            min={160}
                            max={450}
                            value={bannersConfig.leftBanner.width || 260}
                            onChange={(e) => {
                              const val = Math.max(160, Math.min(500, Number(e.target.value) || 260));
                              setBannersConfig((prev) => ({
                                ...prev,
                                leftBanner: { ...prev.leftBanner, width: val },
                              }));
                              setBannersLoaded(true);
                            }}
                            className="w-12 text-center text-xs font-black text-rose-300 bg-transparent outline-none"
                          />
                          <span className="text-xs text-slate-400 font-bold">px</span>
                        </div>
                      </div>

                      {/* Slider */}
                      <input
                        type="range"
                        min={160}
                        max={420}
                        step={10}
                        value={bannersConfig.leftBanner.width || 260}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBannersConfig((prev) => ({
                            ...prev,
                            leftBanner: { ...prev.leftBanner, width: val },
                          }));
                          setBannersLoaded(true);
                        }}
                        className="w-full accent-rose-500 cursor-pointer"
                      />

                      {/* Quick preset buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        {[
                          { label: '200px (Nhỏ)', w: 200 },
                          { label: '250px (Vừa)', w: 250 },
                          { label: '280px (Rộng)', w: 280 },
                          { label: '320px (Lớn)', w: 320 },
                          { label: '360px (Cực đại)', w: 360 },
                        ].map((preset) => (
                          <button
                            key={preset.w}
                            type="button"
                            onClick={() => {
                              setBannersConfig((prev) => ({
                                ...prev,
                                leftBanner: { ...prev.leftBanner, width: preset.w },
                              }));
                              setBannersLoaded(true);
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${
                              (bannersConfig.leftBanner.width || 260) === preset.w
                                ? 'bg-rose-600 text-white border-rose-500'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const curW = bannersConfig.leftBanner.width || 260;
                            setBannersConfig((prev) => ({
                              ...prev,
                              rightBanner: { ...prev.rightBanner, width: curW },
                            }));
                            setBannersLoaded(true);
                            showToast(`✓ Đã áp dụng bề ngang ${curW}px cho cả 2 bên banner! Bấm Lưu.`);
                          }}
                          className="ml-auto px-2 py-1 rounded-lg text-[10px] font-semibold text-rose-300 hover:text-rose-200 bg-rose-950/50 border border-rose-800/50 cursor-pointer"
                          title="Đồng bộ bề ngang này sang banner bên phải"
                        >
                          Áp dụng cho bên phải ➔
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 italic">
                        * Chiều cao sẽ tự động co giãn theo tỷ lệ ảnh gốc, không bị méo hình.
                      </p>
                    </div>

                    {/* Destination URL */}
                    <div className="space-y-1.5 pt-1">
                      <label className="block text-xs font-bold text-slate-300">
                        Link chuyển đến khi khách bấm vào ảnh (Tùy chọn):
                      </label>
                      <input
                        type="text"
                        value={bannersConfig.leftBanner.linkUrl || ''}
                        onChange={(e) =>
                          setBannersConfig((prev) => ({
                            ...prev,
                            leftBanner: { ...prev.leftBanner, linkUrl: e.target.value },
                          }))
                        }
                        placeholder="https://photobook.vn hoặc link Facebook/Zalo..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0e19] border border-slate-700 text-white text-xs placeholder-slate-500 outline-none focus:border-rose-500 transition"
                      />
                      <p className="text-[11px] text-slate-500">
                        * Nhập đường link bất kỳ, hoặc nhập <b>topup</b> để mở popup nạp lượt VIP.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. BANNER BÊN PHẢI (RIGHT SIDE) */}
                <div className="bg-[#121728] border border-slate-800/90 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-5">
                  <div className="space-y-4">
                    {/* Header + Toggle */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-400">
                          CỘT PHẢI (RIGHT SIDEBAR)
                        </div>
                        <h3 className="text-base font-black text-white mt-0.5">
                          Banner Quảng Cáo Bên Phải
                        </h3>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <span className="text-xs font-bold text-slate-300">
                          {bannersConfig.rightBanner.enabled ? 'Đang Bật' : 'Đang Tắt'}
                        </span>
                        <input
                          type="checkbox"
                          checked={bannersConfig.rightBanner.enabled}
                          onChange={(e) =>
                            setBannersConfig((prev) => ({
                              ...prev,
                              rightBanner: { ...prev.rightBanner, enabled: e.target.checked },
                            }))
                          }
                          className="w-5 h-5 accent-indigo-500 rounded cursor-pointer"
                        />
                      </label>
                    </div>

                    {/* Tùy chọn định dạng: Hình ảnh hoặc Video YouTube */}
                    <div className="flex items-center gap-1.5 p-1 bg-[#0a0e19] rounded-xl border border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setBannersConfig((prev) => ({
                            ...prev,
                            rightBanner: { ...prev.rightBanner, mediaType: 'image' },
                          }));
                          setBannersLoaded(true);
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          (bannersConfig.rightBanner.mediaType || 'image') === 'image'
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Hình ảnh</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBannersConfig((prev) => ({
                            ...prev,
                            rightBanner: { ...prev.rightBanner, mediaType: 'youtube' },
                          }));
                          setBannersLoaded(true);
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          bannersConfig.rightBanner.mediaType === 'youtube'
                            ? 'bg-red-600 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Video YouTube</span>
                      </button>
                    </div>

                    {/* Preview box */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-slate-300">
                          {bannersConfig.rightBanner.mediaType === 'youtube'
                            ? 'Video YouTube (Xem trước):'
                            : 'Hình ảnh hiển thị (Xem trước):'}
                        </label>
                        {bannersConfig.rightBanner.mediaType === 'youtube' ? (
                          (() => {
                            const info = getYouTubeEmbedInfo(bannersConfig.rightBanner.youtubeUrl);
                            return info ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold border border-red-500/30">
                                ✓ YouTube {info.isShorts ? 'Shorts (Dọc)' : 'Video (16:9)'}
                              </span>
                            ) : null;
                          })()
                        ) : bannersConfig.rightBanner.imageUrl?.startsWith('data:') ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                            ✓ Ảnh đã nén & tối ưu sẵn sàng
                          </span>
                        ) : null}
                      </div>

                      <div className="relative group rounded-2xl overflow-hidden border-2 border-dashed border-slate-700 bg-[#0a0e1a] p-3 flex items-center justify-center min-h-[300px]">
                        {bannersConfig.rightBanner.mediaType === 'youtube' ? (
                          (() => {
                            const info = getYouTubeEmbedInfo(bannersConfig.rightBanner.youtubeUrl);
                            return info ? (
                              <div className={`w-full max-w-[240px] mx-auto rounded-xl overflow-hidden border border-slate-700 bg-black ${info.isShorts ? 'aspect-[9/16]' : 'aspect-video'}`}>
                                <iframe
                                  src={info.embedUrl}
                                  title="YouTube preview"
                                  className="w-full h-full border-0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              </div>
                            ) : (
                              <div className="text-center text-slate-500 text-xs p-6 space-y-2">
                                <Video className="w-8 h-8 text-slate-600 mx-auto" />
                                <div>Chưa có video YouTube. Vui lòng dán link video vào ô bên dưới.</div>
                              </div>
                            );
                          })()
                        ) : bannerOptimizing.right ? (
                          <div className="flex flex-col items-center gap-2 py-12 text-indigo-400">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span className="text-xs font-bold">Đang nén & tối ưu ảnh...</span>
                          </div>
                        ) : bannersConfig.rightBanner.imageUrl ? (
                          <div className="relative max-w-[200px] w-full mx-auto">
                            <img
                              src={bannersConfig.rightBanner.imageUrl}
                              alt="Banner phải"
                              className="w-full h-auto max-h-[380px] object-contain rounded-xl shadow-lg border border-slate-700"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div className="text-center text-[10px] text-slate-500 mt-2">
                              Kích thước khuyến nghị: 240 x 500px (Dạng ảnh đứng)
                            </div>
                          </div>
                        ) : (
                          <div className="text-center text-slate-500 text-xs">
                            Chưa có ảnh banner. Hãy tải ảnh lên.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inputs depending on Media Type */}
                    {bannersConfig.rightBanner.mediaType === 'youtube' ? (
                      <div className="space-y-1.5 pt-1">
                        <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <Video className="w-3.5 h-3.5 text-red-400" />
                          <span>Dán link video YouTube (watch, shorts, embed, youtu.be):</span>
                        </label>
                        <input
                          type="text"
                          value={bannersConfig.rightBanner.youtubeUrl || ''}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            setBannersConfig((prev) => ({
                              ...prev,
                              rightBanner: { ...prev.rightBanner, youtubeUrl: val, mediaType: 'youtube' },
                            }));
                            setBannersLoaded(true);
                          }}
                          placeholder="https://www.youtube.com/watch?v=... hoặc https://youtube.com/shorts/..."
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0e19] border border-slate-700 text-white text-xs placeholder-slate-500 outline-none focus:border-red-500 transition"
                        />
                        <p className="text-[11px] text-slate-400">
                          * Hỗ trợ mọi link YouTube (kể cả YouTube Shorts dọc). Video sẽ tự động phát êm dịu (tắt tiếng).
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Upload button & restore default */}
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <label className="flex-1 min-w-[170px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow transition active:scale-98">
                            <Upload className="w-4 h-4" />
                            <span>Tải ảnh từ máy tính</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleBannerUpload('right', e)}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => handleResetSideBanner('right')}
                            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition cursor-pointer border border-slate-700"
                            title="Khôi phục ảnh mẫu ban đầu"
                          >
                            Khôi phục ảnh mẫu
                          </button>
                        </div>

                        {/* Direct image URL input (Optional alternative) */}
                        <div className="space-y-1.5 pt-1">
                          <label className="block text-xs font-bold text-slate-300">
                            Hoặc nhập link URL ảnh trực tiếp (Tùy chọn):
                          </label>
                          <input
                            type="text"
                            value={bannersConfig.rightBanner.imageUrl?.startsWith('data:') ? '' : (bannersConfig.rightBanner.imageUrl || '')}
                            onChange={(e) => {
                              const val = e.target.value.trim();
                              if (val) {
                                setBannersConfig((prev) => ({
                                  ...prev,
                                  rightBanner: { ...prev.rightBanner, imageUrl: val, mediaType: 'image' },
                                }));
                                setBannersLoaded(true);
                              }
                            }}
                            placeholder="https://... (Nếu có sẵn link ảnh online)"
                            className="w-full px-3.5 py-2 rounded-xl bg-[#0a0e19] border border-slate-700 text-white text-xs placeholder-slate-500 outline-none focus:border-indigo-500 transition"
                          />
                        </div>
                      </>
                    )}

                    {/* Width setting (Bề ngang px - chiều cao tự co giãn theo tỷ lệ) */}
                    <div className="space-y-2 pt-2 bg-[#0a0e19] p-3.5 rounded-2xl border border-slate-800">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Bề ngang banner (Chiều rộng):</span>
                        </label>
                        <div className="flex items-center gap-1 bg-[#121728] px-2.5 py-1 rounded-xl border border-slate-700">
                          <input
                            type="number"
                            min={160}
                            max={450}
                            value={bannersConfig.rightBanner.width || 260}
                            onChange={(e) => {
                              const val = Math.max(160, Math.min(500, Number(e.target.value) || 260));
                              setBannersConfig((prev) => ({
                                ...prev,
                                rightBanner: { ...prev.rightBanner, width: val },
                              }));
                              setBannersLoaded(true);
                            }}
                            className="w-12 text-center text-xs font-black text-indigo-300 bg-transparent outline-none"
                          />
                          <span className="text-xs text-slate-400 font-bold">px</span>
                        </div>
                      </div>

                      {/* Slider */}
                      <input
                        type="range"
                        min={160}
                        max={420}
                        step={10}
                        value={bannersConfig.rightBanner.width || 260}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBannersConfig((prev) => ({
                            ...prev,
                            rightBanner: { ...prev.rightBanner, width: val },
                          }));
                          setBannersLoaded(true);
                        }}
                        className="w-full accent-indigo-500 cursor-pointer"
                      />

                      {/* Quick preset buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        {[
                          { label: '200px (Nhỏ)', w: 200 },
                          { label: '250px (Vừa)', w: 250 },
                          { label: '280px (Rộng)', w: 280 },
                          { label: '320px (Lớn)', w: 320 },
                          { label: '360px (Cực đại)', w: 360 },
                        ].map((preset) => (
                          <button
                            key={preset.w}
                            type="button"
                            onClick={() => {
                              setBannersConfig((prev) => ({
                                ...prev,
                                rightBanner: { ...prev.rightBanner, width: preset.w },
                              }));
                              setBannersLoaded(true);
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${
                              (bannersConfig.rightBanner.width || 260) === preset.w
                                ? 'bg-indigo-600 text-white border-indigo-500'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const curW = bannersConfig.rightBanner.width || 260;
                            setBannersConfig((prev) => ({
                              ...prev,
                              leftBanner: { ...prev.leftBanner, width: curW },
                            }));
                            setBannersLoaded(true);
                            showToast(`✓ Đã áp dụng bề ngang ${curW}px cho cả 2 bên banner! Bấm Lưu.`);
                          }}
                          className="ml-auto px-2 py-1 rounded-lg text-[10px] font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-950/50 border border-indigo-800/50 cursor-pointer"
                          title="Đồng bộ bề ngang này sang banner bên trái"
                        >
                          Áp dụng cho bên trái ➔
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 italic">
                        * Chiều cao sẽ tự động co giãn theo tỷ lệ ảnh gốc, không bị méo hình.
                      </p>
                    </div>

                    {/* Destination URL */}
                    <div className="space-y-1.5 pt-1">
                      <label className="block text-xs font-bold text-slate-300">
                        Link chuyển đến khi khách bấm vào ảnh (Tùy chọn):
                      </label>
                      <input
                        type="text"
                        value={bannersConfig.rightBanner.linkUrl || ''}
                        onChange={(e) =>
                          setBannersConfig((prev) => ({
                            ...prev,
                            rightBanner: { ...prev.rightBanner, linkUrl: e.target.value },
                          }))
                        }
                        placeholder="topup hoặc https://..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a0e19] border border-slate-700 text-white text-xs placeholder-slate-500 outline-none focus:border-indigo-500 transition"
                      />
                      <p className="text-[11px] text-slate-500">
                        * Nhập <b>topup</b> để khi khách bấm vào sẽ mở bảng Nạp Lượt VIP VietQR.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Big Save Button Bar */}
              <div className="bg-[#121728] border border-slate-800/90 rounded-2xl p-4 flex items-center justify-between gap-4">
                <span className="text-xs text-slate-400">
                  Sau khi thay đổi hình ảnh hoặc link, hãy bấm <b>Lưu 2 Banner Ngay</b> để áp dụng cho toàn bộ người dùng.
                </span>

                <button
                  type="button"
                  disabled={bannersSaving}
                  onClick={handleSaveBannersAction}
                  className="px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-black flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-98 shrink-0"
                >
                  {bannersSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{bannersSaving ? 'Đang lưu cài đặt...' : 'LƯU 2 BANNER NGAY'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* CUSTOM CREDIT ADJUSTMENT MODAL */}
        {customModalUser && (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setCustomModalUser(null)}
          >
            <div
              className="bg-[#141a2e] border border-slate-700 rounded-3xl p-6 max-w-md w-full text-white shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-black text-base text-white">
                  Tùy chỉnh Lượt & Vai trò Thành viên
                </h3>
                <button
                  type="button"
                  onClick={() => setCustomModalUser(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-[#0d1220] p-3.5 rounded-2xl border border-slate-800 text-xs space-y-1">
                <div className="font-bold text-white text-sm">{customModalUser.displayName}</div>
                <div className="text-slate-400">{customModalUser.email}</div>
                <div className="text-emerald-400 font-bold pt-1">
                  Số dư hiện tại: {customModalUser.credits} lượt
                </div>
              </div>

              <form onSubmit={handleSaveCustomAdjustment} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">
                    Chế độ điều chỉnh lượt:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomCreditMode('add')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        customCreditMode === 'add'
                          ? 'bg-indigo-600 border-indigo-400 text-white'
                          : 'bg-[#0d1220] border-slate-800 text-slate-400'
                      }`}
                    >
                      Cộng / Trừ thêm (+/-)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomCreditMode('set');
                        setCustomCreditValue(String(customModalUser.credits));
                      }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        customCreditMode === 'set'
                          ? 'bg-indigo-600 border-indigo-400 text-white'
                          : 'bg-[#0d1220] border-slate-800 text-slate-400'
                      }`}
                    >
                      Đặt số dư cố định (=)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    {customCreditMode === 'add'
                      ? 'Số lượt muốn cộng thêm (nhập số âm để trừ):'
                      : 'Số dư lượt mới cần đặt:'}
                  </label>
                  <input
                    type="number"
                    value={customCreditValue}
                    onChange={(e) => setCustomCreditValue(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d1220] border border-slate-700 text-white font-bold text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Vai trò tài khoản:
                  </label>
                  <select
                    value={customRoleValue}
                    onChange={(e) => setCustomRoleValue(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d1220] border border-slate-700 text-white font-bold text-xs outline-none focus:border-indigo-500"
                  >
                    <option value="user">User (Chuẩn)</option>
                    <option value="vip">Thành viên VIP</option>
                    <option value="admin">Quản trị viên (Admin)</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCustomModalUser(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Lưu cập nhật</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
