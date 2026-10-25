import React, { useState } from 'react';
import { LogIn, PhoneCall, Sparkles, X, ArrowLeft, Crown, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { UserProfile, signInWithGoogle, markTrialAsUsed, validateAccessCode } from '../firebase';
import AuthModal from './AuthModal';

export type VIPModalStep = 'closed' | 'login_required' | 'customer_check' | 'already_customer' | 'new_customer';

interface VIPAccessModalProps {
  step: VIPModalStep;
  onClose: () => void;
  userProfile: UserProfile | null;
  setUserProfile: (profile: UserProfile | null) => void;
  onGrantAccess: () => void;
}

export default function VIPAccessModal({
  step,
  onClose,
  userProfile,
  setUserProfile,
  onGrantAccess,
}: VIPAccessModalProps) {
  const [currentStep, setCurrentStep] = useState<VIPModalStep>(step);
  const [authLoading, setAuthLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [vipCodeInput, setVipCodeInput] = useState('');
  const [codeFeedback, setCodeFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Synchronize internal state when prop changes
  React.useEffect(() => {
    setCurrentStep(step);
    setCodeFeedback(null);
    setVipCodeInput('');
  }, [step]);

  if (currentStep === 'closed' && !showAuthModal) return null;

  // Check if trial was already used by this user
  const isTrialUsed = Boolean(
    userProfile?.trialUsed || 
    (userProfile?.uid && localStorage.getItem(`photobook_trial_used_${userProfile.uid}`) === 'true')
  );

  const handleUseTrial = async () => {
    if (userProfile?.uid) {
      localStorage.setItem(`photobook_trial_used_${userProfile.uid}`, 'true');
      await markTrialAsUsed(userProfile.uid);
      setUserProfile({
        ...userProfile,
        trialUsed: true
      });
    }
    onGrantAccess();
    onClose();
  };

  const handleQuickVipActivation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vipCodeInput.trim()) return;

    const check = validateAccessCode(vipCodeInput.trim());
    if (check.valid && check.role) {
      const updated: UserProfile = {
        uid: userProfile?.uid || 'vip_' + Date.now().toString(36),
        email: userProfile?.email || 'vip@photobook.vn',
        displayName: userProfile?.displayName || 'Thành viên VIP Photobook',
        photoURL: userProfile?.photoURL || null,
        role: check.role,
        vipActivatedAt: new Date().toISOString(),
        vipCodeUsed: vipCodeInput.trim().toUpperCase()
      };
      setUserProfile(updated);
      setCodeFeedback({
        type: 'success',
        message: 'Kích hoạt VIP thành công! Đang mở tính năng...'
      });
      setTimeout(() => {
        onGrantAccess();
        onClose();
      }, 700);
    } else {
      setCodeFeedback({
        type: 'error',
        message: check.message
      });
    }
  };

  return (
    <>
      {currentStep !== 'closed' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div 
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative border border-slate-100 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button top right */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>

            {/* 1. POPUP YÊU CẦU ĐĂNG NHẬP */}
            {currentStep === 'login_required' && (
              <div className="flex flex-col items-center w-full">
                <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center text-sky-500 mb-5">
                  <LogIn className="w-7 h-7 stroke-[2.2]" />
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">
                  Yêu cầu đăng nhập
                </h3>

                <p className="text-sm text-slate-500 leading-relaxed mb-6 max-w-xs">
                  Vui lòng đăng nhập tài khoản để sử dụng tính năng VIP, lưu ghi chú và xuất file chất lượng cao.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full sm:flex-1 py-3 px-4 rounded-2xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors text-sm sm:text-base cursor-pointer"
                  >
                    Đóng
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="w-full sm:flex-1 py-3 px-4 rounded-2xl font-bold text-white bg-sky-500 hover:bg-sky-600 transition-colors flex items-center justify-center gap-2 shadow-sm text-sm sm:text-base cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Đăng nhập ngay</span>
                  </button>
                </div>
              </div>
            )}

            {/* 2. POPUP KIỂM TRA KHÁCH HÀNG PHOTOBOOK VIETNAM */}
            {currentStep === 'customer_check' && (
              <div className="flex flex-col items-center w-full">
                <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center text-sky-500 mb-5">
                  <Crown className="w-7 h-7 stroke-[2.2]" />
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-slate-800 mb-2 leading-snug">
                  Chức năng chỉ áp dụng cho khách hàng của Photobook Vietnam
                </h3>

                <p className="text-xs sm:text-sm text-slate-500 mb-5">
                  Bạn đã từng là khách hàng đặt in tại Photobook Vietnam chưa?
                </p>

                {/* VIP Code Direct input */}
                <form onSubmit={handleQuickVipActivation} className="w-full mb-4 bg-amber-50/70 border border-amber-300 rounded-2xl p-3 text-left">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 mb-1">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    <span>Đã có mã kích hoạt VIP?</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={vipCodeInput}
                      onChange={(e) => setVipCodeInput(e.target.value)}
                      placeholder="Mã: PHOTOBOOKVIP..."
                      className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-bold uppercase outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
                    >
                      Kích hoạt
                    </button>
                  </div>
                  {codeFeedback && (
                    <div className={`mt-2 text-[11px] font-bold flex items-center gap-1.5 ${
                      codeFeedback.type === 'success' ? 'text-emerald-700' : 'text-red-600'
                    }`}>
                      {codeFeedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                      <span>{codeFeedback.message}</span>
                    </div>
                  )}
                </form>

                <div className="flex flex-col gap-2.5 w-full">
                  <button
                    type="button"
                    onClick={() => setCurrentStep('already_customer')}
                    className="w-full py-3 px-4 rounded-2xl font-bold text-white bg-sky-500 hover:bg-sky-600 transition-all shadow-sm text-sm cursor-pointer active:scale-[0.99]"
                  >
                    Đã là khách hàng
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentStep('new_customer')}
                    className="w-full py-3 px-4 rounded-2xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all text-sm cursor-pointer active:scale-[0.99]"
                  >
                    Chưa là khách hàng
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-1 text-xs text-slate-400 hover:text-slate-600 font-semibold transition"
                  >
                    Đóng lại
                  </button>
                </div>
              </div>
            )}

            {/* 3. KHI BẤM "ĐÃ LÀ KHÁCH HÀNG" */}
            {currentStep === 'already_customer' && (
              <div className="flex flex-col items-center w-full">
                <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center text-sky-500 mb-5">
                  <PhoneCall className="w-7 h-7 stroke-[2.2]" />
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-slate-800 mb-3">
                  Khách hàng Photobook Vietnam
                </h3>

                <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-4 font-medium">
                  Nếu đang là khách hàng của Photobook Vietnam, hãy liên hệ chúng tôi để được nâng lên VIP và tải file không giới hạn (hotline <span className="font-bold text-sky-600">0938023079</span>)
                </p>

                {/* VIP Code Direct input */}
                <form onSubmit={handleQuickVipActivation} className="w-full mb-4 bg-amber-50/70 border border-amber-300 rounded-2xl p-3 text-left">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 mb-1">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    <span>Nhập mã kích hoạt VIP được cấp:</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={vipCodeInput}
                      onChange={(e) => setVipCodeInput(e.target.value)}
                      placeholder="Mã: PHOTOBOOKVIP..."
                      className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-bold uppercase outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
                    >
                      Kích hoạt
                    </button>
                  </div>
                  {codeFeedback && (
                    <div className={`mt-2 text-[11px] font-bold flex items-center gap-1.5 ${
                      codeFeedback.type === 'success' ? 'text-emerald-700' : 'text-red-600'
                    }`}>
                      {codeFeedback.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                      <span>{codeFeedback.message}</span>
                    </div>
                  )}
                </form>

                <div className="flex flex-col gap-2.5 w-full">
                  <a
                    href="tel:0938023079"
                    className="w-full py-3 px-6 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold flex items-center justify-center gap-2 shadow-md transition-all text-sm active:scale-[0.99]"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>Gọi Hotline (0938023079)</span>
                  </a>

                  <a
                    href="https://zalo.me/0938023079"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-600 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    Nhắn tin Zalo (0938023079)
                  </a>

                  <div className="flex items-center gap-3 mt-1 w-full">
                    <button
                      type="button"
                      onClick={() => setCurrentStep('customer_check')}
                      className="flex-1 py-2 px-3 rounded-xl text-slate-500 hover:bg-slate-100 text-xs font-bold flex items-center justify-center gap-1 transition"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Quay lại</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2 px-3 rounded-xl text-slate-500 hover:bg-slate-100 text-xs font-bold transition"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. KHI BẤM "CHƯA LÀ KHÁCH HÀNG" */}
            {currentStep === 'new_customer' && (
              <div className="flex flex-col items-center w-full">
                <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center text-sky-500 mb-5">
                  <Sparkles className="w-7 h-7 stroke-[2.2]" />
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-slate-800 mb-3">
                  Trải nghiệm tính năng VIP
                </h3>

                <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-5 font-medium">
                  Nếu chưa đặt in tại Photobook Vietnam, hãy đặt đơn hàng đầu tiên để trở thành khách hàng VIP hoặc sử dụng 1 lượt dùng thử miễn phí này:
                </p>

                {!isTrialUsed ? (
                  <div className="flex flex-col gap-3 w-full">
                    <button
                      type="button"
                      onClick={handleUseTrial}
                      className="w-full py-3.5 px-6 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold flex items-center justify-center gap-2 shadow-md transition-all text-sm sm:text-base cursor-pointer active:scale-[0.99]"
                    >
                      <Sparkles className="w-5 h-5" />
                      <span>Sử dụng 1 lượt miễn phí</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCurrentStep('customer_check')}
                      className="text-xs text-slate-400 hover:text-slate-600 font-semibold transition py-1"
                    >
                      Quay lại
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center w-full">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs sm:text-sm font-semibold mb-4 leading-relaxed">
                      Bạn đã sử dụng hết lượt trải nghiệm miễn phí. Vui lòng liên hệ Photobook Vietnam để nâng cấp VIP!
                    </div>

                    <a
                      href="tel:0938023079"
                      className="w-full py-3 px-6 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold flex items-center justify-center gap-2 shadow-md transition-all text-sm mb-3"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>Liên hệ Hotline: 0938023079</span>
                    </a>

                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-100 text-xs sm:text-sm font-bold transition"
                    >
                      Đóng
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Auth Modal sub-modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLoginSuccess={(profile) => {
          setUserProfile(profile);
          if (profile.role === 'vip' || profile.role === 'admin') {
            onGrantAccess();
            onClose();
          } else {
            setCurrentStep('customer_check');
          }
        }}
      />
    </>
  );
}
