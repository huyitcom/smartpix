import React, { useState, useEffect } from 'react';
import { LogIn, PhoneCall, Sparkles, X, ArrowLeft, Crown, KeyRound, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { UserProfile, signInWithGoogle, markTrialAsUsed, validateAccessCode } from '../firebase';
import { BannersConfig } from '../types';
import { fetchBannersConfig, DEFAULT_BANNERS_CONFIG, DEFAULT_VIP_BANNER_1_IMAGE, DEFAULT_VIP_BANNER_2_IMAGE } from '../services/bannerService';
import { getYouTubeEmbedInfo } from '../utils/youtubeHelper';
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
  const [bannersConfig, setBannersConfig] = useState<BannersConfig>(DEFAULT_BANNERS_CONFIG);

  // Load banners configuration and sync with updates
  useEffect(() => {
    fetchBannersConfig().then((cfg) => setBannersConfig(cfg));
    const handleUpdate = (e: any) => {
      if (e?.detail) setBannersConfig(e.detail);
    };
    window.addEventListener('smartpix_banners_updated', handleUpdate);
    return () => window.removeEventListener('smartpix_banners_updated', handleUpdate);
  }, []);

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

  // Check active banners for new customer popup
  const b1 = bannersConfig.vipBanner1;
  const b2 = bannersConfig.vipBanner2;
  const b1Youtube = getYouTubeEmbedInfo(b1?.youtubeUrl);
  const b2Youtube = getYouTubeEmbedInfo(b2?.youtubeUrl);

  const hasB1 = Boolean(b1?.enabled !== false && ((b1?.mediaType === 'youtube' && b1Youtube) || (b1?.imageUrl && b1.imageUrl.trim() !== '')));
  const hasB2 = Boolean(b2?.enabled !== false && ((b2?.mediaType === 'youtube' && b2Youtube) || (b2?.imageUrl && b2.imageUrl.trim() !== '')));

  const isB1Default = b1?.imageUrl === DEFAULT_VIP_BANNER_1_IMAGE && b1?.mediaType !== 'youtube';
  const isB2Default = b2?.imageUrl === DEFAULT_VIP_BANNER_2_IMAGE && b2?.mediaType !== 'youtube';

  const isB1Custom = hasB1 && !isB1Default;
  const isB2Custom = hasB2 && !isB2Default;

  // Rule: "Nếu chỉ upload 1 banner thì hiện 1 banner thôi và ẩn banner còn lại đi"
  let showB1 = hasB1;
  let showB2 = hasB2;
  if (isB1Custom && !isB2Custom) {
    showB2 = false;
  } else if (isB2Custom && !isB1Custom) {
    showB1 = false;
  }
  const activeBannersCount = (showB1 ? 1 : 0) + (showB2 ? 1 : 0);

  const handleBannerClick = (url?: string) => {
    if (!url) return;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (url.startsWith('tel:')) {
      window.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      {currentStep !== 'closed' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div 
            className={`bg-white rounded-3xl shadow-2xl w-full p-5 sm:p-7 relative border border-slate-100 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-150 transition-all ${
              currentStep === 'new_customer' 
                ? (activeBannersCount === 2 ? 'max-w-2xl max-h-[92vh] overflow-y-auto' : 'max-w-lg max-h-[92vh] overflow-y-auto') 
                : 'max-w-md'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button top right */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition z-20 cursor-pointer"
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
                    disabled={authLoading}
                    onClick={async () => {
                      setAuthLoading(true);
                      try {
                        const profile = await signInWithGoogle();
                        setUserProfile(profile);
                        if (profile.role === 'vip' || profile.role === 'admin') {
                          onGrantAccess();
                          onClose();
                        } else {
                          setCurrentStep('customer_check');
                        }
                      } catch (err: any) {
                        if (err?.code !== 'auth/popup-closed-by-user') {
                          setShowAuthModal(true);
                        }
                      } finally {
                        setAuthLoading(false);
                      }
                    }}
                    className="w-full sm:flex-1 py-3 px-4 rounded-2xl font-bold text-white bg-sky-500 hover:bg-sky-600 transition-colors flex items-center justify-center gap-2 shadow-sm text-sm sm:text-base cursor-pointer disabled:opacity-70"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{authLoading ? 'Đang mở Google...' : 'Đăng nhập Google'}</span>
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
                <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center text-sky-500 mb-3 shadow-xs">
                  <Sparkles className="w-7 h-7 stroke-[2.2]" />
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-slate-800 mb-2">
                  Trải nghiệm tính năng VIP
                </h3>

                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-3 max-w-lg font-medium">
                  Nếu chưa đặt in tại Photobook Vietnam, hãy đặt đơn hàng đầu tiên để trở thành khách hàng VIP hoặc sử dụng 1 lượt dùng thử miễn phí này:
                </p>

                {/* Yêu cầu người dùng: Đem dòng "Rất đơn giản để..." xuống dưới dòng "Nếu chưa đặt in tại ..." */}
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-sky-50 border border-sky-200/80 text-sky-700 text-xs sm:text-sm font-bold mb-4 shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span>Rất đơn giản để trở thành khách hàng của Photobook Vietnam</span>
                </div>

                {/* Banner Quảng Cáo Khách Hàng Mới (Nếu chỉ upload 1 banner thì hiện 1 banner thôi và ẩn banner còn lại đi) */}
                {activeBannersCount > 0 && (
                  <div className={`w-full mb-4 text-left ${
                    activeBannersCount === 2 ? 'grid grid-cols-1 sm:grid-cols-2 gap-3.5' : 'max-w-md mx-auto'
                  }`}>
                    {/* Banner 1 */}
                    {showB1 && (
                      <div
                        onClick={() => handleBannerClick(b1?.linkUrl)}
                        className="group relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5"
                        title="Bấm để xem chi tiết ưu đãi"
                      >
                        {b1?.mediaType === 'youtube' && b1Youtube ? (
                          <div className="w-full aspect-[16/9] overflow-hidden bg-black">
                            <iframe
                              src={b1Youtube.embedUrl}
                              title="Video ưu đãi Photobook Vietnam 1"
                              className="w-full h-full border-0 pointer-events-auto"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        ) : (
                          <div className="relative w-full aspect-[400/220] overflow-hidden bg-slate-950 flex items-center justify-center">
                            <img
                              src={b1?.imageUrl}
                              alt={b1?.altText || 'Ưu đãi Photobook Vietnam 1'}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                              <span className="text-[11px] font-bold text-white flex items-center gap-1 drop-shadow-md">
                                <span>Xem chi tiết ưu đãi</span>
                                <ExternalLink className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Banner 2 */}
                    {showB2 && (
                      <div
                        onClick={() => handleBannerClick(b2?.linkUrl)}
                        className="group relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5"
                        title="Bấm để xem chi tiết ưu đãi"
                      >
                        {b2?.mediaType === 'youtube' && b2Youtube ? (
                          <div className="w-full aspect-[16/9] overflow-hidden bg-black">
                            <iframe
                              src={b2Youtube.embedUrl}
                              title="Video ưu đãi Photobook Vietnam 2"
                              className="w-full h-full border-0 pointer-events-auto"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        ) : (
                          <div className="relative w-full aspect-[400/220] overflow-hidden bg-slate-950 flex items-center justify-center">
                            <img
                              src={b2?.imageUrl}
                              alt={b2?.altText || 'Ưu đãi Photobook Vietnam 2'}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                              <span className="text-[11px] font-bold text-white flex items-center gap-1 drop-shadow-md">
                                <span>Xem chi tiết ưu đãi</span>
                                <ExternalLink className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isTrialUsed ? (
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
                    <button
                      type="button"
                      onClick={() => setCurrentStep('customer_check')}
                      className="w-full sm:w-auto px-5 py-3 rounded-2xl text-xs sm:text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-bold transition flex items-center justify-center gap-1 cursor-pointer order-2 sm:order-1"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Quay lại</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleUseTrial}
                      className="w-full flex-1 py-3.5 px-6 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold flex items-center justify-center gap-2 shadow-md transition-all text-sm sm:text-base cursor-pointer active:scale-[0.99] order-1 sm:order-2"
                    >
                      <Sparkles className="w-5 h-5" />
                      <span>Sử dụng 1 lượt miễn phí</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center w-full max-w-md">
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs sm:text-sm font-semibold mb-3.5 leading-relaxed text-center w-full">
                      Bạn đã sử dụng hết lượt trải nghiệm miễn phí. Vui lòng liên hệ Photobook Vietnam để nâng cấp VIP!
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
                      <button
                        type="button"
                        onClick={() => setCurrentStep('customer_check')}
                        className="w-full sm:w-auto px-4 py-3 rounded-2xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Quay lại</span>
                      </button>

                      <a
                        href="tel:0938023079"
                        className="flex-1 w-full py-3 px-5 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold flex items-center justify-center gap-2 shadow-sm transition text-xs sm:text-sm"
                      >
                        <PhoneCall className="w-4 h-4" />
                        <span>Liên hệ Hotline: 0938023079</span>
                      </a>
                    </div>
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
