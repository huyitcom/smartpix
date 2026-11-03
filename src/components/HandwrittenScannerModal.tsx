import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Trash2,
  Crown,
  LogIn,
  PhoneCall,
  Loader2,
  Check,
  Plus,
  RefreshCw,
  Image as ImageIcon,
  ScanLine,
  EyeOff,
} from 'lucide-react';
import type { DriveFile } from '../types';
import { UserProfile, signInWithGoogle } from '../firebase';

interface UncertainCodeItem {
  code: string;
  alternative?: string;
  note?: string;
}

interface HandwrittenScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: DriveFile[];
  selectedIds: Set<string>;
  onApplySelections: (newSelectedIds: Set<string>) => void;
  userProfile?: UserProfile | null;
  setUserProfile?: (profile: UserProfile | null) => void;
  onOpenAuthModal?: () => void;
  onOpenTopupModal?: () => void;
}

// Helper to extract the primary trailing number from a camera filename
// e.g. "DSC_6025.JPG" -> "6025", "IMG_0045 (1).jpg" -> "0045", "6025.jpg" -> "6025"
function extractPrimaryPhotoNumber(fileName: string): string | null {
  // Remove extension
  const base = fileName.replace(/\.[^/.]+$/, '').trim();
  // Remove common copy suffixes like " (1)", " - Copy", "_copy"
  const cleaned = base
    .replace(/\s*\(\d+\)$/, '')
    .replace(/[\s_-]+copy(\s*\d*)?$/i, '')
    .trim();

  // Match the last group of digits in the cleaned base name
  const matches = cleaned.match(/(\d+)/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
}

// Compress uploaded image before sending to Gemini Vision so multi-page uploads are fast
async function compressImageFile(file: File, maxDim = 2048): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('File ảnh không hợp lệ'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ base64: dataUrl, mimeType: file.type || 'image/jpeg', previewUrl: dataUrl });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        resolve({
          base64: compressedDataUrl,
          mimeType: 'image/jpeg',
          previewUrl: compressedDataUrl,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export default function HandwrittenScannerModal({
  isOpen,
  onClose,
  files,
  selectedIds,
  onApplySelections,
  userProfile,
  setUserProfile,
  onOpenAuthModal,
  onOpenTopupModal,
}: HandwrittenScannerModalProps) {
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; name: string; base64: string; mimeType: string; previewUrl: string }>>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [codesText, setCodesText] = useState('');
  const [crossedOutCodes, setCrossedOutCodes] = useState<string[]>([]);
  const [uncertainCodes, setUncertainCodes] = useState<UncertainCodeItem[]>([]);
  const [detectedTotalOnPage, setDetectedTotalOnPage] = useState<number | null>(null);
  const [pageNote, setPageNote] = useState('');
  const [applyMode, setApplyMode] = useState<'merge' | 'replace'>('merge');
  const [manualExtraFileIds, setManualExtraFileIds] = useState<Set<string>>(new Set());
  const [excludedFileIds, setExcludedFileIds] = useState<Set<string>>(new Set());

  // VIP upgrade states for non-VIP users
  const [authLoading, setAuthLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVIP = userProfile?.role === 'vip' || userProfile?.role === 'admin';

  // Index album files by their trailing photo number and base name for instant matching
  const albumIndex = useMemo(() => {
    const byExactName = new Map<string, DriveFile[]>();
    const byBaseName = new Map<string, DriveFile[]>();
    const byRawNumber = new Map<string, DriveFile[]>();
    const byNumericValue = new Map<number, DriveFile[]>();
    const allTrailingNumbers: string[] = [];

    files.forEach((f) => {
      const lower = f.name.toLowerCase().trim();
      const base = lower.replace(/\.[^/.]+$/, '').trim();

      if (!byExactName.has(lower)) byExactName.set(lower, []);
      byExactName.get(lower)!.push(f);

      if (!byBaseName.has(base)) byBaseName.set(base, []);
      byBaseName.get(base)!.push(f);

      const numStr = extractPrimaryPhotoNumber(f.name);
      if (numStr) {
        allTrailingNumbers.push(numStr);
        if (!byRawNumber.has(numStr)) byRawNumber.set(numStr, []);
        byRawNumber.get(numStr)!.push(f);

        const numVal = parseInt(numStr, 10);
        if (!Number.isNaN(numVal)) {
          if (!byNumericValue.has(numVal)) byNumericValue.set(numVal, []);
          byNumericValue.get(numVal)!.push(f);
        }
      }
    });

    const uniqueHints = Array.from(new Set(allTrailingNumbers)).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );

    return {
      byExactName,
      byBaseName,
      byRawNumber,
      byNumericValue,
      uniqueHints,
    };
  }, [files]);

  const handleFilesAdded = async (fileList: FileList | File[]) => {
    setScanError('');
    const arr = Array.from(fileList).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (arr.length === 0) {
      setScanError('Vui lòng chọn file hình ảnh (JPG, PNG, WEBP).');
      return;
    }

    try {
      const processed = await Promise.all(
        arr.map(async (f) => {
          const comp = await compressImageFile(f);
          return {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: f.name,
            base64: comp.base64,
            mimeType: comp.mimeType,
            previewUrl: comp.previewUrl,
          };
        })
      );
      setUploadedImages((prev) => [...prev, ...processed]);
    } catch (err: any) {
      setScanError(err.message || 'Lỗi khi tải ảnh lên');
    }
  };

  // Support Ctrl+V paste of image when modal is open and user is VIP
  useEffect(() => {
    if (!isOpen || !isVIP) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) imageFiles.push(f);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        await handleFilesAdded(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, isVIP]);

  const handleScanWithAI = async () => {
    if (uploadedImages.length === 0) {
      setScanError('Vui lòng tải lên hoặc dán (Ctrl+V) ít nhất 1 ảnh chụp tờ giấy viết tay.');
      return;
    }

    setIsScanning(true);
    setScanError('');

    try {
      const res = await fetch('/api/ai/scan-handwritten-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: uploadedImages.map((img) => ({
            base64: img.base64,
            mimeType: img.mimeType,
          })),
          albumNumberHints: albumIndex.uniqueHints,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lỗi khi quét danh sách viết tay bằng AI');
      }

      const validCodes: string[] = Array.isArray(data.validCodes) ? data.validCodes : [];
      setCodesText((prev) => {
        const existing = prev.trim();
        const joined = validCodes.join(', ');
        return existing ? `${existing}, ${joined}` : joined;
      });
      setCrossedOutCodes(Array.isArray(data.crossedOutCodes) ? data.crossedOutCodes : []);
      setUncertainCodes(Array.isArray(data.uncertainCodes) ? data.uncertainCodes : []);
      setDetectedTotalOnPage(typeof data.detectedTotalOnPage === 'number' ? data.detectedTotalOnPage : null);
      setPageNote(data.pageNote || '');
    } catch (err: any) {
      setScanError(err.message || 'Không thể kết nối AI để đọc danh sách.');
    } finally {
      setIsScanning(false);
    }
  };

  // Parse codes from textarea and match against album files
  const parsedCodes = useMemo(() => {
    if (!codesText.trim()) return [];
    return codesText
      .split(/[\n,;|\t\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [codesText]);

  const matchingReport = useMemo(() => {
    const matchedFilesMap = new Map<string, { file: DriveFile; matchedByCode: string }>();
    const unmatchedCodes: Array<{ code: string; suggestions: DriveFile[] }> = [];
    const duplicateCodeMatches: Array<{ code: string; files: DriveFile[] }> = [];

    parsedCodes.forEach((rawCode) => {
      const lower = rawCode.toLowerCase();
      const base = lower.replace(/\.[^/.]+$/, '');
      let found: DriveFile[] = [];

      // 1. Exact filename or base name match
      if (albumIndex.byExactName.has(lower)) {
        found = albumIndex.byExactName.get(lower)!;
      } else if (albumIndex.byBaseName.has(base)) {
        found = albumIndex.byBaseName.get(base)!;
      } else {
        // 2. Extract digits from rawCode and match against trailing photo numbers
        const digitMatch = rawCode.match(/(\d+)/g);
        const codeDigits = digitMatch ? digitMatch[digitMatch.length - 1] : null;

        if (codeDigits) {
          if (albumIndex.byRawNumber.has(codeDigits)) {
            found = albumIndex.byRawNumber.get(codeDigits)!;
          } else {
            const numVal = parseInt(codeDigits, 10);
            if (!Number.isNaN(numVal) && albumIndex.byNumericValue.has(numVal)) {
              found = albumIndex.byNumericValue.get(numVal)!;
            } else {
              // 3. Fallback: check if any file's trailing number ends with codeDigits (e.g. 3 digits written instead of 4)
              const suffixMatches: DriveFile[] = [];
              albumIndex.byRawNumber.forEach((fileList, numKey) => {
                if (numKey.endsWith(codeDigits)) {
                  suffixMatches.push(...fileList);
                }
              });
              found = suffixMatches;
            }
          }
        }
      }

      if (found.length === 1) {
        const f = found[0];
        if (!excludedFileIds.has(f.id)) {
          matchedFilesMap.set(f.id, { file: f, matchedByCode: rawCode });
        }
      } else if (found.length > 1) {
        duplicateCodeMatches.push({ code: rawCode, files: found });
        found.forEach((f) => {
          if (!excludedFileIds.has(f.id)) {
            matchedFilesMap.set(f.id, { file: f, matchedByCode: rawCode });
          }
        });
      } else {
        // Find nearby numeric suggestions within +/- 5 so user can resolve handwriting typos in 1 click
        const suggestions: DriveFile[] = [];
        const digitMatch = rawCode.match(/(\d+)/g);
        const codeDigits = digitMatch ? digitMatch[digitMatch.length - 1] : null;
        if (codeDigits) {
          const targetNum = parseInt(codeDigits, 10);
          if (!Number.isNaN(targetNum)) {
            for (let delta = 1; delta <= 5; delta++) {
              const minus = albumIndex.byNumericValue.get(targetNum - delta);
              const plus = albumIndex.byNumericValue.get(targetNum + delta);
              if (minus) suggestions.push(...minus);
              if (plus) suggestions.push(...plus);
              if (suggestions.length >= 4) break;
            }
          }
        }
        unmatchedCodes.push({ code: rawCode, suggestions: suggestions.slice(0, 4) });
      }
    });

    // Also include manually added suggestion files
    manualExtraFileIds.forEach((fid) => {
      if (!excludedFileIds.has(fid) && !matchedFilesMap.has(fid)) {
        const f = files.find((item) => item.id === fid);
        if (f) {
          matchedFilesMap.set(f.id, { file: f, matchedByCode: 'Chọn bổ sung' });
        }
      }
    });

    return {
      matchedList: Array.from(matchedFilesMap.values()),
      unmatchedCodes,
      duplicateCodeMatches,
    };
  }, [parsedCodes, albumIndex, manualExtraFileIds, excludedFileIds, files]);

  if (!isOpen) return null;

  // Swap an uncertain code with its alternative in codesText
  const handleSwapUncertainCode = (fromCode: string, toCode: string) => {
    setCodesText((prev) => {
      const tokens = prev.split(/([\n,;|\t\s]+)/);
      let replaced = false;
      return tokens
        .map((t) => {
          if (!replaced && t.trim() === fromCode.trim()) {
            replaced = true;
            return toCode;
          }
          return t;
        })
        .join('');
    });
  };

  const handleConfirmSelection = () => {
    const nextSet = applyMode === 'merge' ? new Set<string>(selectedIds) : new Set<string>();
    matchingReport.matchedList.forEach(({ file }) => {
      nextSet.add(file.id);
    });
    onApplySelections(nextSet);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-3xl shadow-2xl w-full relative border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
          isVIP ? 'max-w-4xl max-h-[92vh] flex flex-col' : 'max-w-md p-6 sm:p-7 text-center'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* CASE 1: NOT LOGGED IN OR NOT VIP -> STRICT VIP GATE */}
        {!isVIP ? (
          <div className="flex flex-col items-center">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/25 mb-4">
              <Crown className="w-8 h-8 stroke-[2.2]" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-black uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Tính năng Độc quyền VIP</span>
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-slate-800 mb-2">
              Quét Danh Sách Ảnh Viết Tay AI
            </h3>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-5">
              Tự động đọc tờ giấy ghi mã ảnh viết tay của khách hàng và tích chọn hàng loạt ảnh
            </p>

            {!userProfile ? (
              <div className="w-full space-y-3">
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={async () => {
                    setAuthLoading(true);
                    try {
                      const profile = await signInWithGoogle();
                      if (setUserProfile) setUserProfile(profile);
                    } catch (err: any) {
                      if (err?.code !== 'auth/popup-closed-by-user' && onOpenAuthModal) {
                        onOpenAuthModal();
                      }
                    } finally {
                      setAuthLoading(false);
                    }
                  }}
                  className="w-full py-3.5 px-5 rounded-2xl font-bold text-white bg-sky-500 hover:bg-sky-600 transition flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-70"
                >
                  {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                  <span>{authLoading ? 'Đang mở Google...' : 'Đăng nhập tài khoản VIP'}</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 transition cursor-pointer"
                >
                  Đóng lại
                </button>
              </div>
            ) : (
              <div className="w-full space-y-3.5 text-left">
                {/* VIP Activation Notice & Contact Admin Action */}
                <div className="w-full bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-300/90 rounded-2xl p-4 text-center shadow-xs">
                  <div className="inline-flex items-center justify-center gap-1.5 text-amber-900 font-black text-sm mb-1.5">
                    <Crown className="w-4 h-4 text-amber-600" />
                    <span>Dành riêng cho Khách hàng Photobook</span>
                  </div>
                  <p className="text-xs text-amber-900/85 leading-relaxed mb-3.5 font-medium">
                    Tính năng quét ảnh viết tay chỉ kích hoạt cho khách hàng đã đặt in Photobook / Album tại hệ thống. Quý khách vui lòng liên hệ Admin để được kiểm tra đơn và mở quyền VIP!
                  </p>
                  <a
                    href="https://zalo.me/0938023079"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.99]"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>Liên hệ Admin để được kích hoạt VIP</span>
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <a
                    href="tel:0938023079"
                    className="py-2.5 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Hotline: 0938023079</span>
                  </a>
                  <a
                    href="https://zalo.me/0938023079"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <span>Zalo Admin: 0938023079</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* CASE 2: VIP / ADMIN FULL SCANNER INTERFACE */
          <>
            {/* Header */}
            <div className="px-5 sm:px-7 py-4 bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/25 shadow-inner">
                  <ScanLine className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black tracking-tight">
                      Quét Danh Sách Ảnh Viết Tay Bằng AI
                    </h2>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase">
                      <Crown className="w-3 h-3" />
                      VIP
                    </span>
                  </div>
                  <p className="text-xs text-sky-100">
                    Đọc chữ viết tay theo cột, tự động bỏ qua số gạch xóa & khớp đuôi số với {files.length} ảnh trong Album
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-full transition cursor-pointer"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
              {/* Top 2-Column Section: Image Upload + Extracted Numbers Editor */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left Column: Upload Handwritten Sheet Photos */}
                <div className="lg:col-span-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-sky-500" />
                      <span>1. Ảnh chụp tờ giấy viết tay</span>
                    </label>
                    {uploadedImages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setUploadedImages([])}
                        className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa ảnh</span>
                      </button>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFilesAdded(e.target.files);
                        e.target.value = '';
                      }
                    }}
                  />

                  {uploadedImages.length === 0 ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          handleFilesAdded(e.dataTransfer.files);
                        }
                      }}
                      className="border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50/50 hover:bg-sky-50 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition min-h-[190px]"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center mb-3 shadow-2xs">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-700 mb-1">
                        Bấm để chọn ảnh hoặc kéo thả vào đây
                      </p>
                      <p className="text-xs text-slate-500">
                        Có thể dán trực tiếp ảnh vừa copy từ Zalo bằng <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-bold">Ctrl + V</kbd>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2.5 max-h-[180px] overflow-y-auto p-1">
                        {uploadedImages.map((img) => (
                          <div
                            key={img.id}
                            className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[4/3]"
                          >
                            <img
                              src={img.previewUrl}
                              alt={img.name}
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setUploadedImages((prev) => prev.filter((item) => item.id !== img.id))
                              }
                              className="absolute top-1.5 right-1.5 p-1.5 bg-black/65 hover:bg-rose-600 text-white rounded-full transition cursor-pointer"
                              title="Xóa ảnh này"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-xl border-2 border-dashed border-slate-300 hover:border-sky-400 flex flex-col items-center justify-center text-slate-500 hover:text-sky-600 aspect-[4/3] text-xs font-bold transition cursor-pointer bg-slate-50/60"
                        >
                          <Plus className="w-5 h-5 mb-1" />
                          <span>Thêm trang</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleScanWithAI}
                    disabled={isScanning || uploadedImages.length === 0}
                    className={`w-full py-3 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition ${
                      uploadedImages.length > 0 && !isScanning
                        ? 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white cursor-pointer active:scale-[0.99]'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI đang đọc chữ viết tay & đối chiếu mã ảnh...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span>Đọc mã số từ ảnh viết tay ({uploadedImages.length} trang)</span>
                      </>
                    )}
                  </button>

                  {scanError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>{scanError}</span>
                    </div>
                  )}
                </div>

                {/* Right Column: Extracted / Editable Photo Numbers Textarea */}
                <div className="lg:col-span-7 flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-sky-500" />
                      <span>2. Danh sách mã số ảnh (Có thể nhập tay hoặc chỉnh sửa)</span>
                    </label>
                    {codesText.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setCodesText('');
                          setCrossedOutCodes([]);
                          setUncertainCodes([]);
                          setDetectedTotalOnPage(null);
                          setPageNote('');
                          setManualExtraFileIds(new Set());
                          setExcludedFileIds(new Set());
                        }}
                        className="text-xs font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Làm mới danh sách</span>
                      </button>
                    )}
                  </div>

                  <textarea
                    value={codesText}
                    onChange={(e) => setCodesText(e.target.value)}
                    rows={7}
                    placeholder="Kết quả AI đọc từ ảnh viết tay sẽ hiện tại đây, hoặc bạn có thể dán trực tiếp danh sách 4 số cuối (VD: 6025, 6038, 6042, 6045...)"
                    className="w-full rounded-2xl border-2 border-slate-200 focus:border-sky-500 bg-slate-50/70 focus:bg-white p-3.5 text-sm font-mono font-bold text-slate-800 outline-none transition resize-y"
                  />

                  {/* Summary Pills Row */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold">
                      Tổng mã trong ô: <strong className="text-slate-900">{parsedCodes.length}</strong>
                    </span>

                    <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Khớp trong Album: <strong>{matchingReport.matchedList.length} ảnh</strong>
                    </span>

                    {detectedTotalOnPage !== null && (
                      <span
                        className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 border ${
                          parsedCodes.length === detectedTotalOnPage
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-amber-50 border-amber-200 text-amber-800'
                        }`}
                      >
                        <span>Số tổng khách khoanh trên giấy{pageNote ? ` (${pageNote})` : ''}:</span>
                        <strong>{detectedTotalOnPage}</strong>
                      </span>
                    )}

                    {crossedOutCodes.length > 0 && (
                      <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 font-bold flex items-center gap-1">
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                        Đã bỏ qua {crossedOutCodes.length} chỗ gạch xóa
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 3: Uncertain / Overwritten Handwritten Numbers Alert */}
              {uncertainCodes.length > 0 && (
                <div className="rounded-2xl bg-amber-50/90 border border-amber-200 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-900 font-black text-xs sm:text-sm">
                    <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      AI phát hiện {uncertainCodes.length} số viết đè / sửa nét trên giấy — Bạn hãy kiểm tra nhanh:
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {uncertainCodes.map((item, idx) => {
                      const alt = item.alternative?.trim();
                      const altExists =
                        alt &&
                        (albumIndex.byRawNumber.has(alt) ||
                          albumIndex.byNumericValue.has(parseInt(alt, 10)));
                      const primaryExists =
                        albumIndex.byRawNumber.has(item.code.trim()) ||
                        albumIndex.byNumericValue.has(parseInt(item.code.trim(), 10));

                      return (
                        <div
                          key={idx}
                          className="bg-white rounded-xl p-3 border border-amber-200/80 flex items-center justify-between gap-2 shadow-2xs"
                        >
                          <div className="text-xs">
                            <div className="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                              <span>Đang chọn:</span>
                              <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-mono font-black">
                                {item.code}
                              </span>
                              {primaryExists ? (
                                <span className="text-[10px] text-emerald-600 font-bold">(Có trong album)</span>
                              ) : (
                                <span className="text-[10px] text-rose-600 font-bold">(Không có trong album)</span>
                              )}
                            </div>
                            {item.note && <p className="text-[11px] text-slate-500 mt-0.5">{item.note}</p>}
                          </div>

                          {alt && alt !== item.code && (
                            <button
                              type="button"
                              onClick={() => handleSwapUncertainCode(item.code, alt)}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs shrink-0 transition cursor-pointer"
                              title={`Đổi mã ${item.code} thành ${alt}`}
                            >
                              Đổi sang {alt} {altExists ? '✓' : ''}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section 4: Unmatched Codes + Smart Nearby Photo Suggestions */}
              {matchingReport.unmatchedCodes.length > 0 && (
                <div className="rounded-2xl bg-rose-50/80 border border-rose-200 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-rose-900 font-black text-xs sm:text-sm">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      Có {matchingReport.unmatchedCodes.length} mã số không tìm thấy file khớp trong Album (Gợi ý các ảnh số gần nhất bên dưới):
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {matchingReport.unmatchedCodes.map((unmatched, idx) => (
                      <div
                        key={idx}
                        className="bg-white rounded-xl p-3 border border-rose-200/80 flex flex-col gap-2 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700">
                            Mã không khớp:{' '}
                            <strong className="font-mono text-sm text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                              {unmatched.code}
                            </strong>
                          </span>
                          <span className="text-[11px] text-slate-400">Không tồn tại trong thư mục</span>
                        </div>

                        {unmatched.suggestions.length > 0 ? (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-bold text-slate-500">
                              Bấm để chọn ảnh có số gần nhất trong Album:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {unmatched.suggestions.map((sug) => {
                                const isAdded = manualExtraFileIds.has(sug.id);
                                return (
                                  <button
                                    key={sug.id}
                                    type="button"
                                    onClick={() => {
                                      setManualExtraFileIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(sug.id)) next.delete(sug.id);
                                        else next.add(sug.id);
                                        return next;
                                      });
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                                      isAdded
                                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-2xs'
                                        : 'bg-slate-50 hover:bg-sky-50 text-slate-700 border-slate-200'
                                    }`}
                                  >
                                    {isAdded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-sky-500" />}
                                    <span>{sug.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Không có ảnh nào có số thứ tự lân cận trong album.
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 5: Preview of Matched Photos */}
              {matchingReport.matchedList.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-emerald-500" />
                      <span>
                        Danh sách {matchingReport.matchedList.length} ảnh sẽ được đánh dấu Đã Chọn (Thả tim)
                      </span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Bấm vào ảnh bất kỳ nếu muốn bỏ chọn riêng ảnh đó
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-[230px] overflow-y-auto p-2 bg-slate-50 rounded-2xl border border-slate-200/80">
                    {matchingReport.matchedList.map(({ file, matchedByCode }) => {
                      const thumbUrl = file.thumbnailLink
                        ? file.thumbnailLink.replace(/=s\d+/, '=s240')
                        : '';
                      return (
                        <div
                          key={file.id}
                          onClick={() => {
                            setExcludedFileIds((prev) => {
                              const next = new Set(prev);
                              next.add(file.id);
                              return next;
                            });
                          }}
                          className="group relative bg-white rounded-xl p-1.5 border border-emerald-200 hover:border-rose-400 shadow-2xs cursor-pointer transition"
                          title={`Khớp từ mã "${matchedByCode}" — Bấm để loại khỏi danh sách chọn`}
                        >
                          <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-100 relative">
                            {thumbUrl ? (
                              <img
                                src={thumbUrl}
                                alt={file.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400 px-1 truncate">
                                {file.name}
                              </div>
                            )}
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-mono font-bold">
                              #{matchedByCode}
                            </div>
                            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-emerald-500 group-hover:bg-rose-500 text-white flex items-center justify-center shadow">
                              <Check className="w-3 h-3 group-hover:hidden" />
                              <X className="w-3 h-3 hidden group-hover:block" />
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] font-bold text-slate-700 truncate px-0.5">
                            {file.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-5 sm:px-7 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <span>Chế độ chọn:</span>
                <button
                  type="button"
                  onClick={() => setApplyMode('merge')}
                  className={`px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                    applyMode === 'merge'
                      ? 'bg-sky-50 border-sky-300 text-sky-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Cộng thêm vào Đã chọn ({selectedIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setApplyMode('replace')}
                  className={`px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                    applyMode === 'replace'
                      ? 'bg-sky-50 border-sky-300 text-sky-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Thay thế danh sách cũ
                </button>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={matchingReport.matchedList.length === 0}
                  onClick={handleConfirmSelection}
                  className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition ${
                    matchingReport.matchedList.length > 0
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer active:scale-95'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Chọn ngay {matchingReport.matchedList.length} ảnh khớp</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
