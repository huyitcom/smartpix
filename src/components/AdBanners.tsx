import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Play } from 'lucide-react';
import { BannersConfig } from '../types';
import { fetchBannersConfig, DEFAULT_BANNERS_CONFIG } from '../services/bannerService';
import { getYouTubeEmbedInfo } from '../utils/youtubeHelper';

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

  const leftYoutubeInfo = getYouTubeEmbedInfo(leftBanner?.youtubeUrl);
  const rightYoutubeInfo = getYouTubeEmbedInfo(rightBanner?.youtubeUrl);

  const isLeftYoutube = leftBanner?.mediaType === 'youtube' && Boolean(leftYoutubeInfo);
  const isRightYoutube = rightBanner?.mediaType === 'youtube' && Boolean(rightYoutubeInfo);

  const isLeftActive = leftBanner?.enabled && (isLeftYoutube || Boolean(leftBanner?.imageUrl));
  const isRightActive = rightBanner?.enabled && (isRightYoutube || Boolean(rightBanner?.imageUrl));

  return (
    <>
      {/* ============================================================== */}
      {/* 1. MẶC ĐỊNH: HAI BANNER 2 BÊN SƯỜN MÀN HÌNH (DESKTOP SKYSCRAPERS)*/}
      {/* Hiển thị cố định 2 bên sườn, hỗ trợ cả Ảnh và Nhúng YouTube Video */}
      {/* ============================================================== */}
      <div className="hidden xl:block pointer-events-none">
        {/* Banner 1: Bên Trái (Left Side Banner) */}
        {isLeftActive && !dismissed.left && (
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

              {/* Tấm hình banner hoặc Video YouTube */}
              {isLeftYoutube && leftYoutubeInfo ? (
                <div className={`overflow-hidden rounded-2xl shadow-xl border border-slate-200/60 bg-black w-full ${leftYoutubeInfo.isShorts ? 'aspect-[9/16]' : 'aspect-video'}`}>
                  <iframe
                    src={leftYoutubeInfo.embedUrl}
                    title="YouTube video banner"
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
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
              )}
            </div>
          </aside>
        )}

        {/* Banner 2: Bên Phải (Right Side Banner) */}
        {isRightActive && !dismissed.right && (
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

              {/* Tấm hình banner hoặc Video YouTube */}
              {isRightYoutube && rightYoutubeInfo ? (
                <div className={`overflow-hidden rounded-2xl shadow-xl border border-slate-200/60 bg-black w-full ${rightYoutubeInfo.isShorts ? 'aspect-[9/16]' : 'aspect-video'}`}>
                  <iframe
                    src={rightYoutubeInfo.embedUrl}
                    title="YouTube video banner"
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
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
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ============================================================== */}
      {/* 2. DÀNH CHO MOBILE & TABLET (MÀN HÌNH NHỎ HƠN XL)                */}
      {/* Hiển thị bên dưới trang: Hiện TOP thay vì MIDDLE               */}
      {/* ============================================================== */}
      <div className={`xl:hidden w-full max-w-xl my-4 space-y-3.5 ${className}`}>
        {/* Banner Trái trên Mobile / Bottom */}
        {isLeftActive && !dismissed.left && (
          <div className="relative group">
            <button
              type="button"
              onClick={() => setDismissed((prev) => ({ ...prev, left: true }))}
              className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer shadow"
              title="Đóng banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {isLeftYoutube && leftYoutubeInfo ? (
              <div className="overflow-hidden rounded-2xl shadow-md border border-slate-200/80 bg-black aspect-video w-full">
                <iframe
                  src={leftYoutubeInfo.embedUrl}
                  title="YouTube video banner"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div
                onClick={() => handleBannerClick(leftBanner.linkUrl)}
                className="overflow-hidden rounded-2xl shadow-md border border-slate-200/80 cursor-pointer active:scale-98 transition-transform bg-white"
              >
                <img
                  src={leftBanner.imageUrl}
                  alt={leftBanner.altText || 'Banner quảng cáo'}
                  className="w-full h-auto object-cover object-top max-h-80"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        )}

        {/* Banner Phải trên Mobile / Bottom */}
        {isRightActive && !dismissed.right && (
          <div className="relative group">
            <button
              type="button"
              onClick={() => setDismissed((prev) => ({ ...prev, right: true }))}
              className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer shadow"
              title="Đóng banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {isRightYoutube && rightYoutubeInfo ? (
              <div className="overflow-hidden rounded-2xl shadow-md border border-slate-200/80 bg-black aspect-video w-full">
                <iframe
                  src={rightYoutubeInfo.embedUrl}
                  title="YouTube video banner"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div
                onClick={() => handleBannerClick(rightBanner.linkUrl)}
                className="overflow-hidden rounded-2xl shadow-md border border-slate-200/80 cursor-pointer active:scale-98 transition-transform bg-white"
              >
                <img
                  src={rightBanner.imageUrl}
                  alt={rightBanner.altText || 'Banner quảng cáo'}
                  className="w-full h-auto object-cover object-top max-h-80"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
