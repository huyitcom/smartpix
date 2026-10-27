import { useState, useEffect, FormEvent } from 'react';
import {
  Camera,
  Link as LinkIcon,
  FolderSync,
  LogOut,
  Crown,
  Shield,
  History,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Edit3,
  Search,
  RefreshCw,
  FolderOpen,
  Lock,
  X,
  Tag,
  Sparkles,
} from 'lucide-react';
import {
  logOut,
  UserProfile,
  signInWithGoogle,
  recordLinkCreation,
  LinkHistoryItem,
  fetchUserLinkHistory,
  updateLinkCustomTitle,
  deleteUserLinkItem,
  getGuestCreatedCount,
  incrementGuestCreatedCount,
} from '../firebase';
import AuthModal from './AuthModal';
import UserProfileModal from './UserProfileModal';
import FeatureAnnouncementBanner from './FeatureAnnouncementBanner';
import AdBanners from './AdBanners';

export default function Landing({
  onStart,
  onOpenFilter,
  userProfile,
  setUserProfile,
  onOpenTopupModal,
  onOpenAdmin,
}: {
  onStart: (folderId: string) => void;
  onOpenFilter: () => void;
  userProfile: UserProfile | null;
  setUserProfile: (profile: UserProfile | null) => void;
  onOpenTopupModal?: () => void;
  onOpenAdmin?: () => void;
}) {
  const [link, setLink] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [error, setError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMyLinksModal, setShowMyLinksModal] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Guest 1-time limit states
  const [guestCreateCount, setGuestCreateCount] = useState<number>(() => getGuestCreatedCount());
  const [showGuestLimitModal, setShowGuestLimitModal] = useState(false);
  const [pendingCreateFolder, setPendingCreateFolder] = useState<{
    folderId: string;
    driveUrl: string;
    customTitle?: string;
  } | null>(null);

  // Member created links management states
  const [myLinks, setMyLinks] = useState<LinkHistoryItem[]>([]);
  const [loadingMyLinks, setLoadingMyLinks] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedFolderId, setCopiedFolderId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);

  const loadMemberLinks = async (profile: UserProfile | null) => {
    if (!profile) {
      setMyLinks([]);
      return;
    }
    setLoadingMyLinks(true);
    try {
      const items = await fetchUserLinkHistory(profile);
      setMyLinks(items);
    } catch (e) {
      console.warn('Failed to load member links:', e);
    } finally {
      setLoadingMyLinks(false);
    }
  };

  useEffect(() => {
    setGuestCreateCount(getGuestCreatedCount());
    if (userProfile) {
      loadMemberLinks(userProfile);
    } else {
      setMyLinks([]);
    }
  }, [userProfile?.uid, userProfile?.email]);

  const handleDirectGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const profile = await signInWithGoogle();
      setUserProfile(profile);
      setShowGuestLimitModal(false);

      // If the user had a pending link from hitting the 2nd guest creation limit, proceed automatically
      if (pendingCreateFolder) {
        const pending = pendingCreateFolder;
        setPendingCreateFolder(null);
        await recordLinkCreation({
          folderId: pending.folderId,
          driveUrl: pending.driveUrl,
          customTitle: pending.customTitle,
          creator: profile,
        });
        onStart(pending.folderId);
      }
    } catch (err: any) {
      console.warn('Direct Google sign-in:', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        // User closed the popup, do nothing
      } else {
        setShowAuthModal(true);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogout = async () => {
    await logOut();
    setUserProfile(null);
  };

  const handleVIPFilterClick = () => {
    onOpenFilter();
  };

  const extractFolderId = (url: string) => {
    // Handle drive.google.com/drive/folders/ID
    const match1 = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (match1) return match1[1];

    // Handle drive.google.com/open?id=ID
    const match2 = url.match(/id=([a-zA-Z0-9-_]+)/);
    if (match2) return match2[1];

    // If it's just the ID
    if (/^[a-zA-Z0-9-_]+$/.test(url.trim())) return url.trim();

    return null;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!link.trim()) {
      setError('Vui lòng nhập link thư mục Google Drive.');
      return;
    }
    const id = extractFolderId(link);
    if (!id) {
      setError('Link không hợp lệ. Vui lòng nhập link thư mục Google Drive.');
      return;
    }

    const normalizedDriveUrl = link.trim().startsWith('http')
      ? link.trim()
      : `https://drive.google.com/drive/folders/${id}`;
    const trimmedTitle = customTitle.trim() || undefined;

    // Kiểm tra giới hạn khi chưa đăng nhập: chỉ cho tạo trang 1 lần đầu, từ lần thứ 2 bắt buộc đăng nhập
    if (!userProfile) {
      const currentGuestCount = getGuestCreatedCount();
      if (currentGuestCount >= 1) {
        setError('');
        setPendingCreateFolder({
          folderId: id,
          driveUrl: normalizedDriveUrl,
          customTitle: trimmedTitle,
        });
        setShowGuestLimitModal(true);
        return;
      }

      // Lần đầu tiên của khách chưa đăng nhập -> cho phép tạo và tăng bộ đếm
      const nextCount = incrementGuestCreatedCount();
      setGuestCreateCount(nextCount);
    }

    setError('');
    recordLinkCreation({
      folderId: id,
      driveUrl: normalizedDriveUrl,
      customTitle: trimmedTitle,
      creator: userProfile,
    });
    onStart(id);
  };

  const handleCopyShareLink = (folderId: string) => {
    const shareUrl = `${window.location.origin}/?folder=${folderId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedFolderId(folderId);
    setTimeout(() => {
      setCopiedFolderId((prev) => (prev === folderId ? null : prev));
    }, 2000);
  };

  const handleStartEditTitle = (item: LinkHistoryItem) => {
    setEditingFolderId(item.folderId);
    setEditingTitleValue(item.customTitle || '');
  };

  const handleSaveCustomTitle = async (folderId: string) => {
    setSavingTitleId(folderId);
    try {
      await updateLinkCustomTitle(folderId, editingTitleValue, userProfile);
      setMyLinks((prev) =>
        prev.map((item) =>
          item.folderId === folderId
            ? { ...item, customTitle: editingTitleValue.trim() || undefined }
            : item
        )
      );
      setEditingFolderId(null);
    } finally {
      setSavingTitleId(null);
    }
  };

  const handleDeleteLinkItem = async (folderId: string) => {
    setDeletingFolderId(folderId);
    try {
      await deleteUserLinkItem(folderId, userProfile);
      setMyLinks((prev) => prev.filter((item) => item.folderId !== folderId));
    } finally {
      setDeletingFolderId(null);
    }
  };

  const handleOpenMyLinksPopup = () => {
    if (userProfile) {
      loadMemberLinks(userProfile);
    }
    setShowMyLinksModal(true);
  };

  const filteredMyLinks = myLinks.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      (item.customTitle && item.customTitle.toLowerCase().includes(q)) ||
      item.folderId.toLowerCase().includes(q) ||
      item.driveUrl.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-sky-50 p-4 pt-20 pb-12 font-sans relative overflow-y-auto w-full">
      {/* Top Left: User profile or Login button */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2">
        {userProfile ? (
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100 hover:shadow-md transition">
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-2.5 text-left cursor-pointer group"
              title="Xem thông tin tài khoản, Quản lý Link đã tạo & Nâng cấp VIP"
            >
              {userProfile.photoURL ? (
                <img
                  src={userProfile.photoURL}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full border border-sky-400"
                />
              ) : (
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                    userProfile.role === 'admin'
                      ? 'bg-rose-500 text-white'
                      : userProfile.role === 'vip'
                      ? 'bg-amber-500 text-white'
                      : 'bg-sky-100 text-sky-600'
                  }`}
                >
                  {userProfile.displayName?.charAt(0)?.toUpperCase() ||
                    userProfile.email?.charAt(0)?.toUpperCase() ||
                    'U'}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800 group-hover:text-sky-600 transition truncate max-w-[130px] sm:max-w-[180px]">
                  {userProfile.displayName || userProfile.email}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase flex items-center gap-1 ${
                    userProfile.role === 'vip'
                      ? 'text-amber-600'
                      : userProfile.role === 'admin'
                      ? 'text-rose-600'
                      : 'text-sky-500'
                  }`}
                >
                  {userProfile.role === 'vip' && <Crown className="w-3 h-3 text-amber-500" />}
                  {userProfile.role === 'admin' && <Crown className="w-3 h-3 text-rose-500" />}
                  {userProfile.role}
                </span>
              </div>
            </button>

            {userProfile.role === 'admin' && (
              <button
                type="button"
                onClick={() =>
                  onOpenAdmin ? onOpenAdmin() : window.history.pushState({}, '', '?admin=true')
                }
                className="ml-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-full text-xs font-black transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                title="Mở Hệ Thống Quản Trị Lượt Render AI"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Quản trị AI</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors ml-1 cursor-pointer"
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleDirectGoogleLogin}
              disabled={googleLoading}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm hover:shadow hover:bg-slate-50 transition font-bold text-slate-700 hover:text-sky-600 text-sm border border-slate-200 cursor-pointer disabled:opacity-75 active:scale-98"
            >
              {googleLoading ? (
                <div className="w-4 h-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>{googleLoading ? 'Đang mở Google...' : 'Đăng nhập Google'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Top Right: PC Filter shortcut */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={handleVIPFilterClick}
          className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow hover:bg-slate-50 transition font-bold text-sky-500 text-sm border border-slate-100 cursor-pointer"
        >
          <FolderSync className="w-4 h-4 text-sky-500" />
          <span>Lọc ảnh máy tính</span>
        </button>
      </div>

      <div className="text-center mb-6 max-w-xl w-full">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-12 bg-sky-500 rounded-xl flex items-center justify-center shadow-lg transform rotate-3">
            <Camera className="w-7 h-7 text-white fill-current" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tight">
            SMART <span className="text-sky-500">PIX</span>
          </h1>
        </div>
        <p className="text-sky-400 text-sm md:text-base font-medium mb-3.5">
          Lọc ảnh nhanh từ Google Drive
        </p>

        {/* Giới thiệu chuẩn SEO & GEO ngay bên dưới phần logo */}
        <div className="px-2 text-slate-600 space-y-1.5 text-center">
          <div className="flex items-center justify-center flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 text-sky-600 text-xs font-bold tracking-tight">
              <Sparkles className="w-3.5 h-3.5 text-sky-500" />
              SmartPix by Photobook Vietnam
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-400 font-medium">TP.HCM • Hà Nội • Toàn quốc</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-600 font-normal">
            Giải pháp <strong>chọn lọc &amp; chấm ảnh Google Drive trực tuyến tốc độ cao</strong> dành cho Studio ảnh cưới, tiệc, sự kiện và Nhiếp ảnh gia tại Việt Nam. Khách hàng xem &amp; duyệt mượt mà kho ảnh lên tới <strong>2.000+ tấm</strong>, vẽ ghi chú trực tiếp, xuất danh sách in album photobook tự động, tích hợp <strong>AI Retouch da</strong> và công cụ <strong>Lọc ảnh máy tính</strong> siêu tốc.
          </p>
        </div>
      </div>

      {/* Main Form Card */}
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-xl p-2 border-2 border-sky-100 mb-6">
        <form onSubmit={handleSubmit} className="p-4 md:p-6 flex flex-col gap-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
              Link thư mục Google Drive
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-4 text-slate-400">
                <LinkIcon className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full pl-12 pr-4 py-3 bg-slate-100 border-2 border-transparent focus:border-sky-400 rounded-full text-sm text-slate-700 font-medium outline-none transition-colors"
              />
            </div>

            {/* Optional Album / Customer Name when logged in */}
            {userProfile && (
              <div className="mt-3">
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400">
                    <Tag className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Tên gợi nhớ album / khách hàng (Tùy chọn, VD: Cưới Minh - Lan)"
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-sky-400 rounded-full text-xs text-slate-700 font-medium outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            {error && <p className="text-rose-500 text-xs mt-2 font-bold pl-2">{error}</p>}

            <p className="text-xs text-slate-500 mt-3 font-medium px-2 leading-relaxed opacity-80">
              * Hoạt động mượt mà với thư mục chứa tới 2000 ảnh.
              <br />
              * Hãy chắc chắn thư mục đã được chia sẻ <strong>"Bất kỳ ai có liên kết"</strong>.
            </p>

            {/* Guest 1-time limit notice */}
            {!userProfile && (
              <div
                className={`mt-3 px-3.5 py-2.5 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
                  guestCreateCount === 0
                    ? 'bg-sky-50/80 border-sky-200 text-sky-700'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Lock className="w-4 h-4 shrink-0 text-sky-500" />
                  {guestCreateCount === 0 ? (
                    <span>
                      Khách chưa đăng nhập được tạo thử <strong>1 trang đầu tiên</strong>. Đăng nhập để tạo không giới hạn & quản lý link!
                    </span>
                  ) : (
                    <span>
                      Bạn đã dùng <strong>1/1 lượt tạo thử</strong>. Từ lần thứ 2 trở đi vui lòng đăng nhập để tạo tiếp.
                    </span>
                  )}
                </div>
                {guestCreateCount >= 1 && (
                  <button
                    type="button"
                    onClick={handleDirectGoogleLogin}
                    className="shrink-0 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-full text-[11px] transition cursor-pointer"
                  >
                    Đăng nhập ngay
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-1">
            <button
              type="submit"
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3.5 rounded-full transition-all shadow-md flex items-center justify-center gap-2 text-lg cursor-pointer"
            >
              Tạo trang
            </button>
          </div>
        </form>
      </div>

      {/* Prominent New Feature Banner: Region Marking & Annotations (Placed below main card) */}
      <FeatureAnnouncementBanner onOpenFilter={handleVIPFilterClick} />

      {/* 2 Advertisement Banners (Designed with dual smart placement: Bottom cards + Desktop skyscrapers) */}
      <AdBanners onOpenTopupModal={onOpenTopupModal} />

      <div className="mt-6 text-slate-400 text-sm font-medium tracking-wide">
        Một sản phẩm của Photobook Vietnam
      </div>

      {/* Popup Quản lý các Link bạn đã tạo (Chỉ hiện khi người dùng bấm mở từ popup tài khoản) */}
      {showMyLinksModal && userProfile && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowMyLinksModal(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-5 sm:p-6 relative border border-sky-100 flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                    <span>Quản lý các Link bạn đã tạo</span>
                    <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-sky-500 text-white">
                      {myLinks.length}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Lưu trữ tự động các trang lọc ảnh của bạn để gửi khách hoặc mở lại bất cứ lúc nào
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => loadMemberLinks(userProfile)}
                  disabled={loadingMyLinks}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Làm mới danh sách"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${loadingMyLinks ? 'animate-spin text-sky-500' : ''}`}
                  />
                  <span className="hidden sm:inline">Làm mới</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowMyLinksModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
                  aria-label="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Search bar */}
            {myLinks.length > 0 && (
              <div className="relative mt-4">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên album hoặc mã Folder ID..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-sky-400 rounded-2xl text-xs text-slate-700 font-medium outline-none transition"
                />
              </div>
            )}

            {/* Links list */}
            <div className="mt-4 overflow-y-auto flex-1 pr-1">
              {loadingMyLinks && myLinks.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-medium flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
                  <span>Đang tải danh sách link đã tạo...</span>
                </div>
              ) : filteredMyLinks.length === 0 ? (
                <div className="py-10 px-4 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <FolderOpen className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs sm:text-sm font-bold text-slate-600">
                    {searchQuery.trim()
                      ? 'Không tìm thấy link nào khớp với từ khóa.'
                      : 'Bạn chưa có link lọc ảnh nào được lưu.'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Hãy dán link thư mục Google Drive ngoài trang chủ và bấm "Tạo trang" để bắt đầu!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMyLinks.map((item) => {
                    const isEditing = editingFolderId === item.folderId;
                    const isCopied = copiedFolderId === item.folderId;
                    const formattedDate = (() => {
                      try {
                        return new Date(item.createdAt).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                      } catch {
                        return item.createdAt;
                      }
                    })();

                    return (
                      <div
                        key={item.folderId}
                        className="p-3.5 rounded-2xl bg-slate-50 hover:bg-sky-50/50 border border-slate-200/80 hover:border-sky-200 transition flex flex-col gap-2.5"
                      >
                        {/* Top row: Title / Edit title & created date */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={editingTitleValue}
                                  onChange={(e) => setEditingTitleValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveCustomTitle(item.folderId);
                                    if (e.key === 'Escape') setEditingFolderId(null);
                                  }}
                                  placeholder="Nhập tên gợi nhớ (VD: Album cưới Minh - Lan)..."
                                  autoFocus
                                  className="flex-1 px-2.5 py-1 bg-white border border-sky-400 rounded-lg text-xs font-bold text-slate-800 outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={savingTitleId === item.folderId}
                                  onClick={() => handleSaveCustomTitle(item.folderId)}
                                  className="px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                                >
                                  Lưu
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingFolderId(null)}
                                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg text-[11px] font-bold cursor-pointer"
                                >
                                  Hủy
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 group">
                                <span className="text-sm font-black text-slate-800 truncate">
                                  {item.customTitle || `Thư mục #${item.folderId.slice(0, 10)}...`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditTitle(item)}
                                  className="p-1 text-slate-400 hover:text-sky-600 rounded-md hover:bg-white transition cursor-pointer"
                                  title="Đặt tên gợi nhớ cho link này"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
                              <span>Tạo lúc: {formattedDate}</span>
                              <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                                ID: {item.folderId.slice(0, 14)}...
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={deletingFolderId === item.folderId}
                            onClick={() => handleDeleteLinkItem(item.folderId)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Xóa khỏi danh sách của bạn"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Action buttons row */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60">
                          <button
                            type="button"
                            onClick={() => {
                              setShowMyLinksModal(false);
                              onStart(item.folderId);
                            }}
                            className="flex-1 min-w-[130px] py-1.5 px-3 bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>Mở trang chọn ảnh</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyShareLink(item.folderId)}
                            className={`py-1.5 px-3 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                              isCopied
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Đã copy link!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-500" />
                                <span>Copy link gửi khách</span>
                              </>
                            )}
                          </button>

                          <a
                            href={item.driveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-1.5 px-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-sky-600 font-bold text-xs rounded-xl flex items-center gap-1 transition"
                            title="Mở thư mục Google Drive gốc"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Drive gốc</span>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal yêu cầu đăng nhập khi khách chưa đăng nhập bấm Tạo trang từ lần thứ 2 trở đi */}
      {showGuestLimitModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-7 relative border border-sky-100 text-center animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setShowGuestLimitModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center mx-auto mb-4 shadow-inner">
              <Lock className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-black text-slate-800 mb-2">
              Vui lòng đăng nhập để tạo trang tiếp!
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">
              Khách chưa đăng nhập chỉ được tạo thử miễn phí <strong>1 trang đầu tiên</strong>. Từ lần thứ 2 trở đi, bạn cần đăng nhập tài khoản để tiếp tục tạo trang không giới hạn và <strong>quản lý danh sách các link đã tạo</strong>.
            </p>

            <div className="bg-sky-50 border border-sky-100 rounded-2xl p-3.5 text-left text-xs text-sky-900 space-y-1.5 mb-6">
              <div className="font-bold flex items-center gap-1.5 text-sky-700">
                <Sparkles className="w-4 h-4 text-sky-500" />
                <span>Quyền lợi sau khi đăng nhập (Miễn phí):</span>
              </div>
              <p>• Tạo trang lọc ảnh Google Drive không giới hạn số lần.</p>
              <p>• Tự động lưu & quản lý toàn bộ các link đã tạo cho khách.</p>
              <p>• Đặt tên gợi nhớ cho từng album, copy link gửi khách nhanh chóng.</p>
            </div>

            <button
              type="button"
              onClick={handleDirectGoogleLogin}
              disabled={googleLoading}
              className="w-full py-3.5 px-5 bg-sky-500 hover:bg-sky-600 text-white font-black rounded-2xl shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2.5 text-sm cursor-pointer disabled:opacity-70"
            >
              <svg className="w-5 h-5 bg-white rounded-full p-0.5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>
                {googleLoading
                  ? 'Đang mở đăng nhập Google...'
                  : 'Đăng nhập Google & Tạo trang ngay'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLoginSuccess={async (profile) => {
          setUserProfile(profile);
          setShowGuestLimitModal(false);
          if (pendingCreateFolder) {
            const pending = pendingCreateFolder;
            setPendingCreateFolder(null);
            await recordLinkCreation({
              folderId: pending.folderId,
              driveUrl: pending.driveUrl,
              customTitle: pending.customTitle,
              creator: profile,
            });
            onStart(pending.folderId);
          }
        }}
      />

      {/* User Profile / VIP Management Modal */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        userProfile={userProfile}
        setUserProfile={setUserProfile}
        onOpenAuthModal={() => setShowAuthModal(true)}
        onOpenTopupModal={onOpenTopupModal}
        onOpenAdmin={onOpenAdmin}
        onOpenMyLinks={handleOpenMyLinksPopup}
        myLinksCount={myLinks.length}
      />
    </div>
  );
}
