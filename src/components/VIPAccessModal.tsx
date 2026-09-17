import React, { useState } from 'react';
import { LogIn, PhoneCall, Sparkles, X, ArrowLeft, Crown, ShieldAlert } from 'lucide-react';
import { UserProfile, signInWithGoogle, markTrialAsUsed } from '../firebase';

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

  // Synchronize internal state when prop changes
  React.useEffect(() => {
    setCurrentStep(step);
  }, [step]);

  if (currentStep === 'closed') return null;

  // Check if trial was already used by this user
  const isTrialUsed = Boolean(
    userProfile?.trialUsed || 
    (userProfile?.uid && localStorage.getItem(`photobook_trial_used_${userProfile.uid}`) === 'true')
  );

  const handleLogin = async () => {
    setAuthLoading(true);
    try {
      const profile = await signInWithGoogle();
      if (profile) {
        setUserProfile(profile);
        // If already VIP or Admin, grant access immediately!
        if (profile.role === 'vip' || profile.role === 'admin') {
          onGrantAccess();
          onClose();
        } else {
          // If regular user, proceed to customer verification step
          setCurrentStep('customer_check');
        }
      }
    } catch (error: any) {
      console.error("Login failed", error);
      alert(`Đăng nhập thất bại: ${error.message || 'Vui lòng thử lại'}`);
    } finally {
      setAuthLoading(false);
    }
  };

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

  return (
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

        {/* 1. POPUP YÊU CẦU ĐĂNG NHẬP (Khớp chính xác hình ảnh mẫu) */}
        {currentStep === 'login_required' && (
          <div className="flex flex-col items-center w-full">
            <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center text-sky-500 mb-5">
              <LogIn className="w-7 h-7 stroke-[2.2]" />
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-slate-800 mb-3">
              Yêu cầu đăng nhập
            </h3>

            <p className="text-sm text-slate-500 leading-relaxed mb-6 max-w-xs">
              Vui lòng đăng nhập tài khoản để tiếp tục tải file chất lượng cao.
            </p>

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-2xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors text-sm sm:text-base cursor-pointer"
              >
                Đóng
              </button>

              <button
                type="button"
                onClick={handleLogin}
                disabled={authLoading}
                className="flex-1 py-3 px-4 rounded-2xl font-bold text-white bg-sky-500 hover:bg-sky-600 transition-colors flex items-center justify-center gap-2 shadow-sm text-sm sm:text-base cursor-pointer disabled:opacity-75"
              >
                {authLoading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Đăng nhập</span>
                  </>
                )}
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
              Chức năng tải file chỉ áp dụng cho khách hàng của Photobook Vietnam
            </h3>

            <p className="text-xs sm:text-sm text-slate-500 mb-6">
              Bạn đã từng là khách hàng đặt in tại Photobook Vietnam chưa?
            </p>

            <div className="flex flex-col gap-3 w-full">
              <button
                type="button"
                onClick={() => setCurrentStep('already_customer')}
                className="w-full py-3.5 px-4 rounded-2xl font-bold text-white bg-sky-500 hover:bg-sky-600 transition-all shadow-sm text-sm sm:text-base cursor-pointer active:scale-[0.99]"
              >
                Đã là khách hàng
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep('new_customer')}
                className="w-full py-3.5 px-4 rounded-2xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all text-sm sm:text-base cursor-pointer active:scale-[0.99]"
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

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-6 font-medium">
              Nếu đang là khách hàng của Photobook Vietnam, hãy liên hệ chúng tôi để được nâng lên VIP và tải file không giới hạn (hotline <span className="font-bold text-sky-600">0938023079</span>)
            </p>

            <div className="flex flex-col gap-3 w-full">
              <a
                href="tel:0938023079"
                className="w-full py-3.5 px-6 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold flex items-center justify-center gap-2 shadow-md transition-all text-sm sm:text-base active:scale-[0.99]"
              >
                <PhoneCall className="w-5 h-5" />
                <span>Liên hệ ngay</span>
              </a>

              <a
                href="https://zalo.me/0938023079"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-600 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition"
              >
                Nhắn tin Zalo (0938023079)
              </a>

              <div className="flex items-center gap-3 mt-2 w-full">
                <button
                  type="button"
                  onClick={() => setCurrentStep('customer_check')}
                  className="flex-1 py-2.5 px-3 rounded-xl text-slate-500 hover:bg-slate-100 text-xs sm:text-sm font-bold flex items-center justify-center gap-1 transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Quay lại</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-3 rounded-xl text-slate-500 hover:bg-slate-100 text-xs sm:text-sm font-bold transition"
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
              Nếu chưa đặt in tại Photobook Vietnam, hãy đặt đơn hàng đầu tiên để được trở thành khách hàng VIP và tải file không giới hạn hoặc bạn sẽ được tặng 1 lượt sử dụng thử miễn phí này
            </p>

            {!isTrialUsed ? (
              <div className="flex flex-col gap-3 w-full">
                <button
                  type="button"
                  onClick={handleUseTrial}
                  className="w-full py-3.5 px-6 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold flex items-center justify-center gap-2 shadow-md transition-all text-sm sm:text-base cursor-pointer active:scale-[0.99]"
                >
                  <Sparkles className="w-5 h-5" />
                  <span>Dùng thử miễn phí 1 lần</span>
                </button>

                <a
                  href="tel:0938023079"
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition"
                >
                  <PhoneCall className="w-4 h-4 text-sky-500" />
                  <span>Đặt in đơn hàng đầu tiên (0938023079)</span>
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-3 w-full">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-amber-800 text-xs sm:text-sm font-medium">
                  Bạn đã sử dụng 1 lượt dùng thử miễn phí này. Hãy đặt in tại Photobook Vietnam hoặc liên hệ để được nâng cấp VIP không giới hạn!
                </div>

                <a
                  href="tel:0938023079"
                  className="w-full py-3.5 px-6 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold flex items-center justify-center gap-2 shadow-md transition-all text-sm sm:text-base"
                >
                  <PhoneCall className="w-5 h-5" />
                  <span>Liên hệ nâng cấp VIP (0938023079)</span>
                </a>
              </div>
            )}

            <div className="flex items-center gap-3 mt-3 w-full">
              <button
                type="button"
                onClick={() => setCurrentStep('customer_check')}
                className="flex-1 py-2.5 px-3 rounded-xl text-slate-500 hover:bg-slate-100 text-xs sm:text-sm font-bold flex items-center justify-center gap-1 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-3 rounded-xl text-slate-500 hover:bg-slate-100 text-xs sm:text-sm font-bold transition"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
