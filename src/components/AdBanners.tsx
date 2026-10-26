import React, { useState, useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { BannersConfig } from '../types';
import { fetchBannersConfig, DEFAULT_BANNERS_CONFIG } from '../services/bannerService';

interface AdBannersProps {
  onOpenTopupModal?: () => void;
  className?: string;
}

export default function AdBanners({ onOpenTopupModal, className = '' }: AdBannersProps) {
  const [config, setConfig] = useState<BannersConfig>(DEFAULT_BANNERS_CONFIG);
  const [dismissed, setDismissed] = useState<{ left?: boolean; right?: boolean }>({});

  useEffect(() => {
    fetchBannersConfig().then((data) => {
      setConfig(data);
    });

    // Listen to potential storage updates across tabs / admin edits
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'smartpix_ad_banners_config_v2' && e.newValue) {
        try {
          setConfig(JSON.parse(e.newValue));
        } catch {}
      }
    };
    const handleCustomEvent = (e: any) => {
      if (e.detail) {
        setConfig(e.detail);
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('smartpix_banners_updated', handleCustomEvent);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('smartpix_banners_updated', handleCustomEvent);
    };
  }, []);

  const handleBannerClick = (linkUrl?: string) => {
    if (!linkUrl) return;
    if (linkUrl === 'topup' && onOpenTopupModal) {
      onOpenTopupModal();
    } else if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
      window.open(linkUrl, '_blank', 'noopener,noreferrer');
    } else if (linkUrl === 'topup') {
      onOpenTopupModal?.();
    } else {
      window.open(linkUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const { leftBanner, rightBanner } = config;
  const leftWidth = leftBanner?.width || 260;
  const rightWidth = rightBanner?.width || 260;

  return (
    <>
      {/* ============================================================== */}
      {/* 1. MẶC ĐỊNH: HAI BANNER 2 BÊN SƯỜN MÀN HÌNH (DESKTOP SKYSCRAPERS)*/}
      {/* Hiển thị cố định 2 bên sườn, chỉ 1 tấm hình/banner, không text */}
      {/* ============================================================== */}
      <div className="hidden xl:block pointer-events-none">
        {/* Banner 1: Bên Trái (Left Side Banner) */}
        {leftBanner?.enabled && leftBanner?.imageUrl && !dismissed.left && (
          <aside 
            aria-label="Banner quảng cáo bên trái"
            style={{ width: `${leftWidth}px`, maxWidth: 'calc(50vw - 340px)' }}
            className="fixed left-3 2xl:left-7 top-24 2xl:top-28 z-30 pointer-events-auto transition-all duration-300"
          >
            <div className="relative group">
              {/* Nút đóng nhỏ gọn */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDismissed((prev) => ({ ...prev, left: true }));
                }}
                className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white flex items-center justify-center transition-all cursor-pointer opacity-70 group-hover:opacity-100 shadow-md backdrop-blur-xs"
                title="Đóng quảng cáo"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Tấm hình banner nguyên bản */}
              <div
                onClick={() => handleBannerClick(leftBanner.linkUrl)}
                className="block overflow-hidden rounded-2xl shadow-xl shadow-black/10 hover:shadow-2xl hover:scale-[1.01] transition-all duration-200 cursor-pointer border border-slate-200/60 bg-white"
                title={leftBanner.linkUrl ? `Bấm để mở: ${leftBanner.linkUrl}` : 'Quảng cáo'}
              >
                <img
                  src={leftBanner.imageUrl}
                  alt={leftBanner.altText || 'Banner quảng cáo bên trái'}
                  className="w-full h-auto object-contain block max-h-[85vh]"
                  loading="lazy"
                />
              </div>
            </div>
          </aside>
        )}

        {/* Banner 2: Bên Phải (Right Side Banner) */}
        {rightBanner?.enabled && rightBanner?.imageUrl && !dismissed.right && (
          <aside 
            aria-label="Banner quảng cáo bên phải"
            style={{ width: `${rightWidth}px`, maxWidth: 'calc(50vw - 340px)' }}
            className="fixed right-3 2xl:right-7 top-24 2xl:top-28 z-30 pointer-events-auto transition-all duration-300"
          >
            <div className="relative group">
              {/* Nút đóng nhỏ gọn */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDismissed((prev) => ({ ...prev, right: true }));
                }}
                className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white flex items-center justify-center transition-all cursor-pointer opacity-70 group-hover:opacity-100 shadow-md backdrop-blur-xs"
                title="Đóng quảng cáo"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Tấm hình banner nguyên bản */}
              <div
                onClick={() => handleBannerClick(rightBanner.linkUrl)}
                className="block overflow-hidden rounded-2xl shadow-xl shadow-black/10 hover:shadow-2xl hover:scale-[1.01] transition-all duration-200 cursor-pointer border border-slate-200/60 bg-white"
                title={rightBanner.linkUrl ? `Bấm để mở: ${rightBanner.linkUrl}` : 'Quảng cáo'}
              >
                <img
                  src={rightBanner.imageUrl}
                  alt={rightBanner.altText || 'Banner quảng cáo bên phải'}
                  className="w-full h-auto object-contain block max-h-[85vh]"
                  loading="lazy"
                />
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ============================================================== */}
      {/* 2. DÀNH CHO MOBILE & TABLET (MÀN HÌNH NHỎ HƠN XL)                */}
      {/* Hiển thị 2 tấm hình banner bên dưới trang để khách dùng phone  */}
      {/* vẫn thấy được banner quảng cáo                                */}
      {/* ============================================================== */}
      <div className={`xl:hidden w-full max-w-xl my-4 space-y-3 ${className}`}>
        {/* Banner Trái trên Mobile */}
        {leftBanner?.enabled && leftBanner?.imageUrl && !dismissed.left && (
          <div className="relative group">
            <button
              type="button"
              onClick={() => setDismissed((prev) => ({ ...prev, left: true }))}
              className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer shadow"
              title="Đóng banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div
              onClick={() => handleBannerClick(leftBanner.linkUrl)}
              className="overflow-hidden rounded-2xl shadow-md border border-slate-200/80 cursor-pointer active:scale-98 transition-transform bg-white"
            >
              <img
                src={leftBanner.imageUrl}
                alt={leftBanner.altText || 'Banner quảng cáo'}
                className="w-full h-auto object-cover max-h-72"
                loading="lazy"
              />
            </div>
          </div>
        )}

        {/* Banner Phải trên Mobile */}
        {rightBanner?.enabled && rightBanner?.imageUrl && !dismissed.right && (
          <div className="relative group">
            <button
              type="button"
              onClick={() => setDismissed((prev) => ({ ...prev, right: true }))}
              className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer shadow"
              title="Đóng banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div
              onClick={() => handleBannerClick(rightBanner.linkUrl)}
              className="overflow-hidden rounded-2xl shadow-md border border-slate-200/80 cursor-pointer active:scale-98 transition-transform bg-white"
            >
              <img
                src={rightBanner.imageUrl}
                alt={rightBanner.altText || 'Banner quảng cáo'}
                className="w-full h-auto object-cover max-h-72"
                loading="lazy"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
