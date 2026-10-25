import React, { useState } from 'react';
import { 
  X, 
  LogIn, 
  Mail, 
  Lock, 
  User as UserIcon, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle,
  Crown,
  Sparkles,
  ShieldCheck,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  UserProfile, 
  signInWithGoogle, 
  signInOrSignUpWithEmail,
  validateAccessCode,
  signInWithCustomCredentials 
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
  defaultMode = 'login'
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'vip_code' | 'quick'>(defaultMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Email / Password Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [vipCode, setVipCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // VIP Code Form State
  const [vipCodeOnly, setVipCodeOnly] = useState('');
  const [vipName, setVipName] = useState('');
  const [vipEmail, setVipEmail] = useState('');

  if (!isOpen) return null;

  // 1. Google OAuth Popup via Real Firebase Auth
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
      }, 500);
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

  // 2. Email + Password Sign In / Register via Firebase
  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Vui lòng nhập địa chỉ Email.');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu tài khoản.');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu cần tối thiểu 6 ký tự.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const profile = await signInOrSignUpWithEmail(
        cleanEmail,
        password,
        displayName.trim() || undefined,
        vipCode.trim() || undefined
      );

      setSuccessMsg(`Đăng nhập thành công! Quyền: ${profile.role.toUpperCase()}`);
      setTimeout(() => {
        onLoginSuccess(profile);
        onClose();
      }, 500);
    } catch (err: any) {
      console.error("Email auth error:", err);
      setError(err?.message || 'Đăng nhập không thành công. Vui lòng kiểm tra lại mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  // 3. VIP Code Activation
  const handleActivateVIP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vipCodeOnly.trim()) {
      setError('Vui lòng nhập mã kích hoạt VIP.');
      return;
    }

    const check = validateAccessCode(vipCodeOnly.trim());
    if (!check.valid) {
      setError(check.message);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const userEmail = vipEmail.trim() || `vip_${Date.now().toString().slice(-4)}@photobook.vn`;
      const userName = vipName.trim() || 'Thành viên VIP Photobook';
      const profile = await signInWithCustomCredentials(
        userEmail,
        userName,
        'vip',
        vipCodeOnly.trim().toUpperCase()
      );

      setSuccessMsg('Kích hoạt thành công! Bạn đã là Thành viên VIP 👑');
      setTimeout(() => {
        onLoginSuccess(profile);
        onClose();
      }, 600);
    } catch (err) {
      setError('Không thể kích hoạt lúc này.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-7 relative border border-slate-100 flex flex-col animate-in fade-in zoom-in-95 duration-150 text-left max-h-[92vh] overflow-y-auto"
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
        <div className="flex items-center gap-3 mb-4">
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

        {/* Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-2xl mb-4 text-xs font-bold gap-1">
          <button
            type="button"
            onClick={() => { setActiveTab('login'); setError(''); setSuccessMsg(''); }}
            className={`flex-1 py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'login' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email / Mật khẩu</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('vip_code'); setError(''); setSuccessMsg(''); }}
            className={`flex-1 py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'vip_code' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Crown className="w-3.5 h-3.5 text-amber-500" />
            <span>Kích hoạt mã VIP</span>
          </button>
        </div>

        {/* Feedback Messages */}
        {error && error === 'UNAUTHORIZED_DOMAIN' ? (
          <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col gap-2.5 text-xs text-amber-900">
            <div className="flex items-start gap-2 text-amber-800 font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>Tên miền xem trước chưa nằm trong Authorized domains của Firebase</span>
            </div>
            <p className="text-[11px] text-amber-800/90 leading-relaxed">
              Vui lòng thêm tên miền bên dưới vào danh sách Authorized domains trong Firebase Console (dự án <code>photo-picker-507413</code>) hoặc đăng nhập bằng Email &amp; Mật khẩu bên dưới.
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
          <div className="mb-3.5 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-600 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <div className="flex-1 leading-snug">{error}</div>
          </div>
        ) : null}
        {successMsg && (
          <div className="mb-3.5 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-emerald-700 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: EMAIL & PASSWORD / GOOGLE POPUP */}
        {activeTab === 'login' && (
          <div className="flex flex-col gap-3.5">
            {/* Real Firebase Google Sign-In Popup Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-3 px-4 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-300 rounded-2xl font-bold text-slate-700 text-xs sm:text-sm flex items-center justify-center gap-3 shadow-xs transition-all cursor-pointer active:scale-[0.99] disabled:opacity-75"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Đăng nhập bằng tài khoản Google</span>
            </button>

            <div className="flex items-center gap-3 my-0.5">
              <div className="flex-1 h-px bg-slate-200"></div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Hoặc bằng Email
              </span>
              <div className="flex-1 h-px bg-slate-200"></div>
            </div>

            {/* Email & Password Form */}
            <form onSubmit={handleEmailPasswordSubmit} className="flex flex-col gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Địa chỉ Email <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vd: huyitcom@gmail.com"
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-sky-500 focus:bg-white rounded-2xl text-xs sm:text-sm font-medium outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mật khẩu <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)"
                    required
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 focus:border-sky-500 focus:bg-white rounded-2xl text-xs sm:text-sm font-medium outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 text-slate-400 hover:text-slate-600 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Họ và tên hiển thị <span className="text-slate-400 text-[10px] font-normal">(Tùy chọn)</span>
                </label>
                <div className="relative flex items-center">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="vd: Nguyễn Văn Huy"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-sky-500 focus:bg-white rounded-2xl text-xs sm:text-sm font-medium outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mã VIP kích hoạt <span className="text-amber-600 text-[10px] font-semibold">(Nếu có)</span>
                </label>
                <div className="relative flex items-center">
                  <KeyRound className="w-4 h-4 text-amber-500 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={vipCode}
                    onChange={(e) => setVipCode(e.target.value)}
                    placeholder="Mã VIP: PHOTOBOOKVIP, VIP2025..."
                    className="w-full pl-10 pr-3.5 py-2.5 bg-amber-50/50 border border-amber-200 focus:border-amber-400 focus:bg-white rounded-2xl text-xs sm:text-sm font-semibold text-amber-800 outline-none transition uppercase placeholder:normal-case placeholder:font-normal"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-2xl shadow-md transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 active:scale-[0.99]"
              >
                {loading ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Đăng nhập / Đăng ký ngay</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* TAB 2: VIP CODE ACTIVATION */}
        {activeTab === 'vip_code' && (
          <form onSubmit={handleActivateVIP} className="flex flex-col gap-3">
            <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/60 rounded-2xl p-3 text-left">
              <div className="flex items-center gap-2 font-bold text-amber-800 text-xs mb-1">
                <Crown className="w-4 h-4 text-amber-500" />
                <span>Quyền lợi Thành viên VIP Photobook</span>
              </div>
              <ul className="text-[11px] text-amber-900/80 space-y-0.5 list-disc list-inside">
                <li>Sử dụng AI Retouch trực tiếp trên ảnh ghi chú</li>
                <li>Lọc và tách ảnh máy tính không giới hạn</li>
                <li>Tải ảnh chất lượng cao và xuất biên bản ghi chú</li>
              </ul>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mã kích hoạt VIP hoặc SĐT mua hàng <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <KeyRound className="w-4 h-4 text-amber-500 absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={vipCodeOnly}
                  onChange={(e) => setVipCodeOnly(e.target.value)}
                  placeholder="Mã: PHOTOBOOKVIP, VIP2025, 0938023079..."
                  required
                  className="w-full pl-10 pr-3.5 py-2.5 bg-amber-50/60 border-2 border-amber-300 focus:border-amber-500 focus:bg-white rounded-2xl text-xs sm:text-sm font-bold text-amber-900 outline-none transition uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tên của bạn <span className="text-slate-400 text-[10px] font-normal">(Tùy chọn)</span>
              </label>
              <input
                type="text"
                value={vipName}
                onChange={(e) => setVipName(e.target.value)}
                placeholder="vd: Anh Huy - Studio Photobook"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white rounded-2xl text-xs sm:text-sm font-medium outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Email nhận thông báo <span className="text-slate-400 text-[10px] font-normal">(Tùy chọn)</span>
              </label>
              <input
                type="email"
                value={vipEmail}
                onChange={(e) => setVipEmail(e.target.value)}
                placeholder="huyitcom@gmail.com"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white rounded-2xl text-xs sm:text-sm font-medium outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-2xl shadow-md transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
            >
              <Crown className="w-4 h-4" />
              <span>Kích hoạt quyền VIP ngay</span>
            </button>
          </form>
        )}

        {/* Footer info */}
        <div className="mt-4 pt-3 border-t border-slate-100 text-center text-slate-400 text-[11px]">
          Hotline hỗ trợ: <a href="tel:0938023079" className="text-sky-600 font-bold hover:underline">0938023079</a> (Photobook Vietnam)
        </div>
      </div>
    </div>
  );
}
