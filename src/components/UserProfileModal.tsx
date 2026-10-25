import React, { useState } from 'react';
import { 
  X, 
  Crown, 
  ShieldCheck, 
  User as UserIcon, 
  LogOut, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  Loader2
} from 'lucide-react';
import { UserProfile, signInWithGoogle, logOut } from '../firebase';

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
  onOpenTopupModal,
  onOpenAdmin,
}: UserProfileModalProps) {
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen || !userProfile) return null;

  const handleSwitchGoogleAccount = async () => {
    setSwitchingAccount(true);
    setFeedback(null);
    try {
      const profile = await signInWithGoogle();
      setUserProfile(profile);
      onClose();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setFeedback({
          type: 'error',
          message: err?.message || 'Không thể mở cửa sổ đăng nhập Google lúc này.'
        });
      }
    } finally {
      setSwitchingAccount(false);
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
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
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
        <div className="bg-slate-900 text-white rounded-2xl p-4 mb-5 flex items-center justify-between gap-3 shadow-md">
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

        {/* Action Buttons */}
        <div className="flex items-center gap-3 w-full">
          <button
            type="button"
            disabled={switchingAccount}
            onClick={handleSwitchGoogleAccount}
            className="flex-1 py-2.5 px-4 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {switchingAccount && <Loader2 className="w-4 h-4 animate-spin text-sky-500" />}
            <span>Đổi tài khoản</span>
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
