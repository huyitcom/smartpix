import React, { useState } from 'react';
import { 
  X, 
  LogIn, 
  CheckCircle2, 
  AlertCircle
} from 'lucide-react';
import { 
  UserProfile, 
  signInWithGoogle
} from '../firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (profile: UserProfile) => void;
  defaultMode?: 'login' | 'vip_code' | 'quick';
}

export default function AuthModal({
  isOpen,
  onClose,
  onLoginSuccess,
}: AuthModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const profile = await signInWithGoogle();
      setSuccessMsg(`Đăng nhập Google thành công: ${profile.displayName || profile.email}`);
      setTimeout(() => {
        onLoginSuccess(profile);
        onClose();
      }, 400);
    } catch (err: any) {
      console.warn("Google popup error:", err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Bạn đã đóng cửa sổ đăng nhập Google.');
      } else if (err?.code === 'auth/popup-blocked') {
        setError('Trình duyệt đã chặn popup. Vui lòng cấp quyền cho phép mở cửa sổ đăng nhập Google.');
      } else if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
        setError('UNAUTHORIZED_DOMAIN');
      } else {
        setError(err?.message || 'Không thể mở cửa sổ đăng nhập Google lúc này.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-7 relative border border-slate-100 flex flex-col animate-in fade-in zoom-in-95 duration-150 text-left"
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

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-sky-500 text-white flex items-center justify-center shadow-md shadow-sky-500/20 shrink-0">
            <LogIn className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800">
              Đăng nhập tài khoản
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Smart Pix • Photobook Vietnam
            </p>
          </div>
        </div>

        {/* Feedback Messages */}
        {error && error === 'UNAUTHORIZED_DOMAIN' ? (
          <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col gap-2.5 text-xs text-amber-900">
            <div className="flex items-start gap-2 text-amber-800 font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>Tên miền chưa nằm trong Authorized domains của Firebase</span>
            </div>
            <p className="text-[11px] text-amber-800/90 leading-relaxed">
              Vui lòng thêm tên miền bên dưới vào danh sách Authorized domains trong Firebase Console (dự án <code>photo-picker-507413</code>):
            </p>
            <div className="bg-white/90 p-2 rounded-xl border border-amber-200 font-mono text-[10px] break-all text-slate-700 flex items-center justify-between gap-2">
              <span className="truncate">{typeof window !== 'undefined' ? window.location.hostname : ''}</span>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    navigator.clipboard.writeText(window.location.hostname);
                    setSuccessMsg('Đã sao chép tên miền vào bộ nhớ tạm!');
                  }
                }}
                className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold rounded-lg text-[10px] shrink-0 cursor-pointer"
              >
                Copy miền
              </button>
            </div>
          </div>
        ) : error ? (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-600 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <div className="flex-1 leading-snug">{error}</div>
          </div>
        ) : null}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-emerald-700 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successMsg}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-sky-400 rounded-2xl font-bold text-slate-700 text-sm flex items-center justify-center gap-3 shadow-xs transition-all cursor-pointer active:scale-[0.99] disabled:opacity-75"
        >
          {loading ? (
            <div className="w-4 h-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
          ) : (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
          )}
          <span>{loading ? 'Đang mở đăng nhập Google...' : 'Đăng nhập bằng tài khoản Google'}</span>
        </button>

        {/* Footer info */}
        <div className="mt-4 pt-3 border-t border-slate-100 text-center text-slate-400 text-[11px]">
          Hotline hỗ trợ: <a href="tel:0938023079" className="text-sky-600 font-bold hover:underline">0938023079</a> (Photobook Vietnam)
        </div>
      </div>
    </div>
  );
}
