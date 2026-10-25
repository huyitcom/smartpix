import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Sparkles,
  Copy,
  Check,
  QrCode,
  ExternalLink,
  ShieldCheck,
  PhoneCall,
  MessageCircle,
  Loader2,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { UserProfile } from '../firebase';

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  pricePerCreditText: string;
  amount: number;
  badge?: string;
  badgeStyle?: string;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'pkg_10',
    name: 'Gói Trải Nghiệm',
    credits: 10,
    pricePerCreditText: 'Chỉ 3.500đ/lượt',
    amount: 35000,
  },
  {
    id: 'pkg_30',
    name: 'Gói Tiết Kiệm',
    credits: 30,
    pricePerCreditText: 'Chỉ 3.300đ/lượt',
    amount: 99000,
    badge: 'PHỔ BIẾN NHẤT',
    badgeStyle: 'bg-indigo-600 text-white border-indigo-400',
  },
  {
    id: 'pkg_70',
    name: 'Gói Studio Pro',
    credits: 70,
    pricePerCreditText: 'Chỉ 2.900đ/lượt',
    amount: 203000,
    badge: 'KHUYÊN DÙNG',
    badgeStyle: 'bg-purple-600 text-white border-purple-400',
  },
  {
    id: 'pkg_180',
    name: 'Gói VIP Đại Lý',
    credits: 180,
    pricePerCreditText: 'Chỉ 2.500đ/lượt',
    amount: 450000,
    badge: 'GIÁ SIÊU RẺ',
    badgeStyle: 'bg-amber-600 text-white border-amber-400',
  },
];

interface TopupOrderData {
  orderCode: number;
  uid: string;
  email: string;
  displayName: string;
  packageId: string;
  packageName: string;
  credits: number;
  amount: number;
  transferContent: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  qrImageUrl: string;
  checkoutUrl: string;
  status: 'PENDING' | 'WAITING_APPROVAL' | 'PAID' | 'CANCELLED';
  createdAt: string;
  paidAt?: string;
}

interface CreditTopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onUpdateUserProfile: (updated: UserProfile) => void;
  onOpenAuthModal?: () => void;
}

export default function CreditTopupModal({
  isOpen,
  onClose,
  userProfile,
  onUpdateUserProfile,
  onOpenAuthModal,
}: CreditTopupModalProps) {
  const [selectedPkg, setSelectedPkg] = useState<CreditPackage>(CREDIT_PACKAGES[1]); // Default: Gói Tiết Kiệm +30 lượt
  const [order, setOrder] = useState<TopupOrderData | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);
  const [paidSuccessMessage, setPaidSuccessMessage] = useState<string | null>(null);

  const formatVND = (amount: number) => {
    return amount.toLocaleString('vi-VN') + ' đ';
  };

  const handleCopy = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Create order whenever modal opens or selected package changes
  const createOrderForPackage = useCallback(
    async (pkg: CreditPackage) => {
      if (!userProfile) return;
      setLoadingOrder(true);
      setPaidSuccessMessage(null);

      try {
        const res = await fetch('/api/payos/create-payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: userProfile.uid,
            email: userProfile.email,
            displayName: userProfile.displayName,
            packageId: pkg.id,
            packageName: pkg.name,
            credits: pkg.credits,
            amount: pkg.amount,
          }),
        });
        const data = await res.json();
        if (res.ok && data?.order) {
          setOrder(data.order);
        }
      } catch (err) {
        console.warn('Could not create payment order:', err);
      } finally {
        setLoadingOrder(false);
      }
    },
    [userProfile]
  );

  useEffect(() => {
    if (isOpen && userProfile) {
      createOrderForPackage(selectedPkg);
    }
  }, [isOpen, selectedPkg, userProfile?.uid, createOrderForPackage]);

  // Poll order status every 4 seconds + listen to Firestore real-time updates
  useEffect(() => {
    if (!isOpen || !order || order.status === 'PAID') return;

    let isMounted = true;
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/payos/order/${order.orderCode}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        if (data?.order) {
          setOrder(data.order);
          if (data.order.status === 'PAID') {
            if (data.user && userProfile) {
              onUpdateUserProfile({
                ...userProfile,
                ...data.user,
                credits: data.user.credits,
                role: data.user.role || userProfile.role,
              });
            }
            setPaidSuccessMessage(
              `🎉 Thanh toán thành công! Đã cộng +${data.order.credits} lượt Render AI vào tài khoản của bạn.`
            );
          }
        }
      } catch {}
    };

    const intervalId = setInterval(checkStatus, 3000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [isOpen, order?.orderCode, order?.status, userProfile, onUpdateUserProfile]);

  const handleConfirmTransferSent = async () => {
    if (!order) return;
    setConfirmingTransfer(true);
    try {
      const res = await fetch(`/api/payos/order/${order.orderCode}/confirm-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data?.order) {
        setOrder(data.order);
        if (data.order.status === 'PAID' && data.user && userProfile) {
          onUpdateUserProfile({
            ...userProfile,
            ...data.user,
          });
          setPaidSuccessMessage(
            `🎉 Hệ thống đã xác nhận và cộng +${data.order.credits} lượt vào tài khoản!`
          );
        }
      }
    } catch (e) {
      console.warn('Confirm transfer error:', e);
    } finally {
      setConfirmingTransfer(false);
    }
  };

  if (!isOpen) return null;

  const currentCredits = typeof userProfile?.credits === 'number' ? userProfile.credits : 3;
  const fallbackTransferContent = order?.transferContent || `CS${String(Date.now()).slice(-6)} PBVN ${selectedPkg.credits}luot`;
  const qrUrl =
    order?.qrImageUrl ||
    `https://img.vietqr.io/image/MB-0007979999999-compact2.png?amount=${selectedPkg.amount}&addInfo=${encodeURIComponent(
      fallbackTransferContent
    )}&accountName=${encodeURIComponent('LE KHAC HUY')}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#0e1320] border border-slate-800 rounded-3xl max-w-4xl w-full text-white shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP HEADER */}
        <div className="px-5 sm:px-7 py-4 sm:py-5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3 bg-[#111728]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-black text-white tracking-tight">
                Nạp Lượt Render AI (PayOS VietQR)
              </h2>
              <p className="text-xs text-slate-400">
                Tài khoản:{' '}
                <span className="text-slate-200 font-semibold">
                  {userProfile?.email || 'Chưa đăng nhập'}
                </span>{' '}
                • Cộng lượt tự động 24/7
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <div className="text-right">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-950/90 border border-indigo-500/40 text-xs font-bold text-indigo-200">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Số dư hiện tại:</span>
                <span className="text-amber-400 font-black">{currentCredits} lượt</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                1K = 1 lượt • 2K = 2 lượt • 4K = 3 lượt
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* If user is not logged in, prompt login first */}
        {!userProfile ? (
          <div className="p-8 text-center space-y-4">
            <p className="text-sm text-slate-300">
              Vui lòng đăng nhập tài khoản để hệ thống gắn mã giao dịch VietQR và cộng lượt Render AI tự động cho bạn (Tặng 3 lượt miễn phí cho tài khoản mới).
            </p>
            {onOpenAuthModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuthModal();
                }}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg cursor-pointer transition"
              >
                Đăng nhập / Đăng ký ngay
              </button>
            )}
          </div>
        ) : (
          <div className="p-5 sm:p-7 space-y-6 max-h-[82vh] overflow-y-auto">
            {/* Paid Success Banner */}
            {paidSuccessMessage && (
              <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 flex items-center gap-3 text-xs sm:text-sm font-bold animate-in fade-in">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{paidSuccessMessage}</span>
              </div>
            )}

            {/* STEP 1: CHỌN GÓI LƯỢT RENDER */}
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 mb-3.5">
                1. CHỌN GÓI LƯỢT RENDER
              </h3>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
                {CREDIT_PACKAGES.map((pkg) => {
                  const isSelected = selectedPkg.id === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedPkg(pkg)}
                      className={`relative text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-[#1a1f3c] border-indigo-500 ring-2 ring-indigo-500/40 shadow-xl'
                          : 'bg-[#131829] border-slate-800 hover:border-slate-700 hover:bg-[#171d31]'
                      }`}
                    >
                      {pkg.badge && (
                        <span
                          className={`absolute -top-2.5 right-3 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shadow-sm ${pkg.badgeStyle}`}
                        >
                          {pkg.badge}
                        </span>
                      )}

                      <div>
                        <div className="text-xs font-semibold text-slate-400 mb-1">
                          {pkg.name}
                        </div>
                        <div className="flex items-baseline gap-1 mb-1">
                          <span className="text-2xl sm:text-3xl font-black text-white">
                            +{pkg.credits}
                          </span>
                          <span className="text-xs font-bold text-indigo-300">lượt</span>
                        </div>
                        <div className="text-[11px] font-semibold text-emerald-400 mb-3">
                          {pkg.pricePerCreditText}
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-slate-800/90 text-base sm:text-lg font-black text-amber-400">
                        {formatVND(pkg.amount)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 2: QUÉT MÃ VIETQR PAYOS */}
            <div className="bg-[#121728] border border-slate-800/90 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
                    2. QUÉT MÃ VIETQR PAYOS (TỰ ĐỘNG XÁC NHẬN TỨC THÌ)
                  </h3>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
                  {order?.status === 'PAID' ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Đã thanh toán thành công</span>
                    </>
                  ) : order?.status === 'WAITING_APPROVAL' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                      <span className="text-amber-300">Đã báo chuyển khoản • Đang duyệt nhanh...</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>Hệ thống đang lắng nghe giao dịch...</span>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
                {/* Left Column: VietQR Card */}
                <div className="md:col-span-5 bg-white rounded-2xl p-4 text-slate-900 flex flex-col items-center justify-between shadow-lg">
                  <div className="w-full flex items-center justify-center relative min-h-[230px]">
                    {loadingOrder ? (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
                        <span className="text-xs font-semibold">Đang tạo mã VietQR...</span>
                      </div>
                    ) : (
                      <img
                        src={qrUrl}
                        alt="VietQR MB Bank LE KHAC HUY"
                        className="w-full max-w-[240px] h-auto object-contain rounded-lg"
                      />
                    )}
                  </div>

                  <div className="w-full text-center mt-2 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-500">
                      Mở App Ngân Hàng bất kỳ để quét mã QR
                    </p>
                    <a
                      href={order?.checkoutUrl || qrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Mở giao diện thanh toán của PayOS</span>
                    </a>
                  </div>
                </div>

                {/* Right Column: Bank Transfer Details */}
                <div className="md:col-span-7 flex flex-col justify-between space-y-3">
                  {/* Row 1: Bank Name & Account Number */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-[#0b0f1c] border border-slate-800/90 rounded-xl p-3.5">
                      <div className="text-[11px] text-slate-400 mb-1">Ngân hàng thụ hưởng</div>
                      <div className="text-sm font-bold text-white">
                        {order?.bankName || 'MB Bank (Quân Đội)'}
                      </div>
                    </div>

                    <div className="bg-[#0b0f1c] border border-slate-800/90 rounded-xl p-3.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-slate-400 mb-1">Số tài khoản</div>
                        <div className="text-sm sm:text-base font-black text-amber-400 tracking-wide">
                          {order?.accountNumber || '0007979999999'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(order?.accountNumber || '0007979999999', 'accNum')
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer transition shrink-0"
                      >
                        {copiedField === 'accNum' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Account Holder & Exact Amount */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-[#0b0f1c] border border-slate-800/90 rounded-xl p-3.5">
                      <div className="text-[11px] text-slate-400 mb-1">Tên người nhận</div>
                      <div className="text-sm font-black text-white uppercase">
                        {order?.accountName || 'LE KHAC HUY'}
                      </div>
                    </div>

                    <div className="bg-[#0b0f1c] border border-slate-800/90 rounded-xl p-3.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-slate-400 mb-1">Số tiền chính xác</div>
                        <div className="text-sm sm:text-base font-black text-emerald-400">
                          {formatVND(selectedPkg.amount)}
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-950/90 border border-emerald-500/30 text-[11px] font-bold text-emerald-300 shrink-0">
                        Cộng tự động +{selectedPkg.credits} lượt
                      </span>
                    </div>
                  </div>

                  {/* Row 3: Mandatory Transfer Description */}
                  <div className="bg-amber-950/25 border border-amber-500/40 rounded-xl p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-amber-300/90 mb-1">
                        Nội dung chuyển khoản (Bắt buộc đúng)
                      </div>
                      <div className="text-sm sm:text-base font-black text-amber-300 tracking-wide truncate">
                        {fallbackTransferContent}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(fallbackTransferContent, 'content')}
                      className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition shrink-0 shadow"
                    >
                      {copiedField === 'content' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Info Note */}
                  <div className="bg-[#0b0f1c] border border-slate-800/80 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed">
                    <strong className="text-slate-200">Lưu ý:</strong> Hệ thống PayOS tự động kích hoạt và cộng{' '}
                    <strong className="text-emerald-400">+{selectedPkg.credits} lượt</strong> vào tài khoản ngay sau khi bạn chuyển khoản thành công (chỉ mất 3 - 5 giây, không cần chụp bill).
                  </div>

                  {/* User Manual Confirm Button */}
                  {order && order.status !== 'PAID' && (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => createOrderForPackage(selectedPkg)}
                        disabled={loadingOrder}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingOrder ? 'animate-spin' : ''}`} />
                        <span>Tạo mã mới</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleConfirmTransferSent}
                        disabled={confirmingTransfer || order.status === 'WAITING_APPROVAL'}
                        className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow ${
                          order.status === 'WAITING_APPROVAL'
                            ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-500/40'
                            : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white'
                        }`}
                      >
                        {confirmingTransfer ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {order.status === 'WAITING_APPROVAL'
                            ? 'Đã gửi yêu cầu xác nhận nhanh'
                            : 'Tôi đã chuyển khoản'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="px-5 sm:px-7 py-3.5 bg-[#0a0e19] border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Cổng thanh toán tự động PayOS VietQR • Bảo mật 100%</span>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <a
              href="tel:0938023079"
              className="flex items-center gap-1.5 text-slate-300 hover:text-white font-bold transition"
            >
              <PhoneCall className="w-3.5 h-3.5 text-amber-400" />
              <span>Hotline: 0938.023.079</span>
            </a>

            <a
              href="https://zalo.me/0938023079"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow transition"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Zalo Hỗ Trợ</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
