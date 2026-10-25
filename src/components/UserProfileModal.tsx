import React, { useState } from 'react';
import { 
  X, 
  Crown, 
  ShieldCheck, 
  User as UserIcon, 
  LogOut, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  PhoneCall
} from 'lucide-react';
import { UserProfile, validateAccessCode, syncUserCreditsWithServer, logOut } from '../firebase';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  setUserProfile: (profile: UserProfile | null) => void;
  onOpenAuthModal: () => void;
  onOpenTopupModal?: () => void;
  onOpenAdmin?: () => void;
}

export default function UserProfileModal({
  isOpen,
  onClose,
  userProfile,
  setUserProfile,
  onOpenAuthModal,
  onOpenTopupModal,
  onOpenAdmin,
}: UserProfileModalProps) {
  const [vipCode, setVipCode] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen || !userProfile) return null;

  const handleActivateVIP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vipCode.trim()) {
      setFeedback({ type: 'error', message: 'Vui lòng nhập mã kích hoạt VIP.' });
      return;
    }

    const check = validateAccessCode(vipCode.trim());
    if (check.valid && check.role) {
      const nextRole = userProfile.role === 'admin' ? 'admin' : check.role;
      const updated: UserProfile = {
        ...userProfile,
        role: nextRole,
        vipActivatedAt: new Date().toISOString(),
        vipCodeUsed: vipCode.trim().toUpperCase()
      };
      setUserProfile(updated);
      syncUserCreditsWithServer(updated).then((synced) => setUserProfile(synced)).catch(() => {});
      setFeedback({ 
        type: 'success', 
        message: `Kích hoạt thành công! Quyền hiện tại của bạn: ${nextRole.toUpperCase()} 👑` 
      });
      setVipCode('');
    } else {
      setFeedback({ type: 'error', message: check.message });
    }
  };

  const handleLogout = async () => {
    await logOut();
    setUserProfile(null);
    onClose();
  };

  const isVIP = userProfile.role === 'vip' || userProfile.role === 'admin';
  const isAdmin = userProfile.role === 'admin';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-7 relative border border-slate-100 flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
          aria-label="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Profile Header */}
        <div className="flex items-center gap-4 mb-6">
          {userProfile.photoURL ? (
            <img 
              src={userProfile.photoURL} 
              alt="Avatar" 
              className="w-16 h-16 rounded-full border-2 border-sky-400 shadow-sm" 
            />
          ) : (
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl shadow-md ${
              isAdmin 
                ? 'bg-rose-500 text-white' 
                : isVIP 
                  ? 'bg-amber-500 text-white' 
                  : 'bg-sky-500 text-white'
            }`}>
              {userProfile.displayName?.charAt(0)?.toUpperCase() || userProfile.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-slate-800 truncate">
                {userProfile.displayName || 'Khách hàng'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 font-medium truncate mb-1">
              {userProfile.email || 'Chưa liên kết email'}
            </p>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-2xs border">
              {isAdmin ? (
                <span className="text-rose-600 border-rose-200 bg-rose-50 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-rose-500" />
                  Quản trị viên
                </span>
              ) : isVIP ? (
                <span className="text-amber-700 border-amber-300 bg-amber-50 flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5 text-amber-500" />
                  Thành viên VIP
                </span>
              ) : (
                <span className="text-sky-700 border-sky-200 bg-sky-50 flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5 text-sky-500" />
                  Khách hàng thường
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div className={`mb-4 p-3 rounded-2xl flex items-center gap-2 text-xs font-bold border ${
            feedback.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
              : 'bg-red-50 border-red-200 text-red-600'
          }`}>
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* AI Render Credit Balance Card */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 shadow-md">
          <div>
            <div className="text-[11px] text-slate-400 font-semibold mb-0.5">
              Số dư Lượt Render AI khả dụng
            </div>
            <div className="text-xl font-black text-amber-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>{typeof userProfile.credits === 'number' ? userProfile.credits : 3} lượt</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              1K = 1 lượt • 2K = 2 lượt • 4K = 3 lượt
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {onOpenTopupModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTopupModal();
                }}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow cursor-pointer transition"
              >
                + Nạp lượt VietQR
              </button>
            )}
            {isAdmin && onOpenAdmin && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAdmin();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow cursor-pointer transition"
              >
                Mở Quản Trị AI
              </button>
            )}
          </div>
        </div>

        {/* VIP Status card */}
        {isVIP ? (
          <div className="bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-purple-500/5 border border-amber-300 rounded-2xl p-4 mb-4 text-left">
            <div className="flex items-center gap-2 font-bold text-amber-900 text-sm mb-1.5">
              <Crown className="w-4 h-4 text-amber-500" />
              <span>Đặc quyền VIP đã kích hoạt</span>
            </div>
            <ul className="text-xs text-amber-900/90 space-y-1">
              <li className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span><strong>AI Retouch trực tiếp:</strong> Tự động sửa ảnh theo nét vẽ khoanh đỏ và ghi chú</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span><strong>Lọc ảnh máy tính:</strong> Tự động copy ảnh chọn vào thư mục trên ổ cứng</span>
              </li>
              <li className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span><strong>Xuất danh sách:</strong> Không giới hạn số lượng ảnh tải về</span>
              </li>
            </ul>
          </div>
        ) : (
          <form onSubmit={handleActivateVIP} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 text-left">
            <div className="flex items-center gap-2 font-bold text-slate-800 text-xs mb-1">
              <Crown className="w-4 h-4 text-amber-500" />
              <span>Nâng cấp lên VIP (Nhập mã kích hoạt)</span>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
              Nhập mã VIP để mở khóa AI Retouch ảnh ghi chú và các quyền lợi đặc biệt:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={vipCode}
                onChange={(e) => setVipCode(e.target.value)}
                placeholder="Mã: PHOTOBOOKVIP..."
                className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold uppercase outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
              >
                Kích hoạt
              </button>
            </div>
          </form>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAuthModal();
            }}
            className="flex-1 py-2.5 px-4 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition text-xs sm:text-sm cursor-pointer"
          >
            Đổi tài khoản
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="flex-1 py-2.5 px-4 rounded-xl font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </div>
  );
}
