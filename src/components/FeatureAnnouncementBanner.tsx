import React, { useState } from 'react';
import { 
  Sparkles, 
  PenTool, 
  FileEdit, 
  X 
} from 'lucide-react';

interface FeatureAnnouncementBannerProps {
  onOpenFilter?: () => void;
  className?: string;
}

export default function FeatureAnnouncementBanner({ className = '' }: FeatureAnnouncementBannerProps) {
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('smartpix_annotation_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem('smartpix_annotation_banner_dismissed', 'true');
    } catch {}
  };

  // If dismissed, do not display the banner
  if (isDismissed) {
    return null;
  }

  return (
    <div 
      className={`w-full max-w-xl relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-400 text-slate-950 p-5 md:p-6 shadow-xl shadow-amber-400/25 border-2 border-amber-300/90 transition-all hover:shadow-2xl hover:shadow-amber-400/35 ${className}`}
    >
      {/* Ambient background glows */}
      <div className="absolute -top-10 -right-10 w-44 h-44 bg-white/40 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-44 h-44 bg-amber-500/30 rounded-full blur-2xl pointer-events-none" />

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-slate-800/70 hover:text-slate-950 hover:bg-black/5 transition-colors cursor-pointer z-10"
        title="Đóng thông báo"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header with Badge */}
      <div className="flex items-center gap-2 mb-3 pr-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950 text-amber-300 text-[11px] font-black uppercase tracking-wider shadow-sm">
          <Sparkles className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
          TÍNH NĂNG MỚI
        </span>
      </div>

      {/* Main Title */}
      <div className="mb-4">
        <h2 className="text-xl md:text-2xl font-black text-slate-950 tracking-tight leading-snug">
          Khoanh Vùng & Ghi Chú Chỉnh Sửa Ảnh
        </h2>
      </div>

      {/* 2 Feature Items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3 border-y border-amber-500/25 mb-4 text-xs">
        <div className="flex items-center gap-3 bg-white/80 hover:bg-white/95 rounded-2xl p-3 border border-amber-400/50 shadow-xs transition-colors">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-xs">
            <PenTool className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight">
            Khoanh vùng khu vực muốn chỉnh sửa
          </span>
        </div>

        <div className="flex items-center gap-3 bg-white/80 hover:bg-white/95 rounded-2xl p-3 border border-amber-400/50 shadow-xs transition-colors">
          <div className="w-8 h-8 rounded-xl bg-slate-950 text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
            <FileEdit className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight">
            Ghi chú muốn chỉnh sửa gì
          </span>
        </div>
      </div>

      {/* Single Action Button */}
      <div className="flex items-center justify-center pt-1">
        <button
          type="button"
          onClick={handleDismiss}
          className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-slate-950 hover:bg-slate-900 text-amber-300 hover:text-white text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer flex items-center justify-center gap-2 border border-slate-900"
        >
          <span>Không hiện lại nữa</span>
        </button>
      </div>
    </div>
  );
}
