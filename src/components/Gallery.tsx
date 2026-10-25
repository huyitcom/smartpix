import { useState, useEffect } from 'react';
import { 
  Camera, 
  Heart, 
  Download, 
  Image as ImageIcon, 
  Loader2, 
  ArrowLeft, 
  Link as LinkIcon, 
  FolderSync, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  X,
  PenTool,
  FileText,
  Crown,
  Sparkles,
  LogIn,
  QrCode,
  Shield
} from 'lucide-react';
import type { DriveFile, StrokeAnnotation, AlbumAnnotations } from '../types';
import { db, auth, UserProfile, signInWithGoogle } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import PhotoAnnotationCanvas from './PhotoAnnotationCanvas';
import AuthModal from './AuthModal';
import UserProfileModal from './UserProfileModal';

export default function Gallery({ 
  folderId, 
  onBack, 
  onOpenFilter,
  userProfile,
  setUserProfile,
  onOpenVIPModal,
  onOpenTopupModal,
  onOpenAdmin,
}: { 
  folderId: string; 
  onBack: () => void; 
  onOpenFilter: (text: string) => void;
  userProfile?: UserProfile | null;
  setUserProfile?: (profile: UserProfile | null) => void;
  onOpenVIPModal?: () => void;
  onOpenTopupModal?: () => void;
  onOpenAdmin?: () => void;
}) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [annotations, setAnnotations] = useState<AlbumAnnotations>({});
  const [retouchedImages, setRetouchedImages] = useState<Record<string, string>>({});
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [copied, setCopied] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'selected' | 'unselected' | 'annotated'>('all');
  const [sortMode, setSortMode] = useState<'name-asc' | 'name-desc' | 'date-asc' | 'date-desc'>('name-asc');
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleDirectGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const profile = await signInWithGoogle();
      if (setUserProfile) setUserProfile(profile);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setShowAuthModal(true);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const isVIP = userProfile?.role === 'vip' || userProfile?.role === 'admin';

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/?folder=${folderId}` : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // LocalStorage instant backup key for this folder
  const localCacheKey = `photobook_album_${folderId}`;

  const saveToLocalBackup = (updated: {
    selectedIds?: string[];
    annotations?: AlbumAnnotations;
    retouched?: Record<string, string>;
  }) => {
    try {
      const existing = localStorage.getItem(localCacheKey);
      const prev = existing ? JSON.parse(existing) : {};
      localStorage.setItem(localCacheKey, JSON.stringify({
        ...prev,
        ...updated,
        updatedAt: Date.now()
      }));
    } catch (e) {
      console.warn("Could not save to localStorage backup:", e);
    }
  };

  useEffect(() => {
    // 1. Instant offline cache restore from localStorage so user never sees blank on refresh
    try {
      const cachedStr = localStorage.getItem(localCacheKey);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (cached.selectedIds && Array.isArray(cached.selectedIds)) {
          setSelectedIds(new Set(cached.selectedIds));
          if (cached.selectedIds.length > 0) setSyncStatus('saved');
        }
        if (cached.annotations && typeof cached.annotations === 'object') {
          setAnnotations(cached.annotations);
        }
        if (cached.retouched && typeof cached.retouched === 'object') {
          setRetouchedImages(cached.retouched);
        }
      }
    } catch (e) {
      // ignore
    }

    const fetchFilesAndSelections = async () => {
      setLoading(true);
      setError('');
      try {
        // Fetch files from Drive
        const resFiles = await fetch(`/api/drive/files?folderId=${folderId}`);
        const dataFiles = await resFiles.json();
        if (!resFiles.ok) throw new Error(dataFiles.error || 'Failed to fetch files');
        setFiles(dataFiles.files || []);

        // Fetch saved selections & annotations from server (which reads from persistent disk storage)
        const resSelections = await fetch(`/api/albums/${folderId}/selections?t=${Date.now()}`, {
          cache: 'no-store'
        });
        const dataSelections = await resSelections.json();
        if (resSelections.ok) {
          const serverSelected = dataSelections.selectedIds || [];
          const serverAnnotations = dataSelections.annotations || {};
          const serverRetouched = dataSelections.retouched || {};

          // Safely merge with any existing local cache to prevent data loss
          let mergedSelected = serverSelected;
          let mergedAnnotations = serverAnnotations;
          let mergedRetouched = serverRetouched;

          try {
            const cachedStr = localStorage.getItem(localCacheKey);
            if (cachedStr) {
              const cached = JSON.parse(cachedStr);
              if (cached.annotations && typeof cached.annotations === 'object') {
                mergedAnnotations = { ...cached.annotations, ...serverAnnotations };
              }
              if (cached.selectedIds && Array.isArray(cached.selectedIds)) {
                mergedSelected = Array.from(new Set([...cached.selectedIds, ...serverSelected]));
              }
              if (cached.retouched && typeof cached.retouched === 'object') {
                mergedRetouched = { ...cached.retouched, ...serverRetouched };
              }
            }
          } catch (e) {}

          setSelectedIds(new Set(mergedSelected));
          setAnnotations(mergedAnnotations);
          setRetouchedImages(mergedRetouched);
          if (mergedSelected.length > 0 || Object.keys(mergedAnnotations).length > 0) {
            setSyncStatus('saved');
          }

          saveToLocalBackup({
            selectedIds: mergedSelected,
            annotations: mergedAnnotations,
            retouched: mergedRetouched,
          });

          // Also check Firestore directly if client SDK has access
          if (db) {
            try {
              const albumDocRef = doc(db, 'albums', folderId);
              // Read from Firestore to sync any real-time changes
              // Non-blocking
            } catch (e) {}
          }
        } else {
          console.warn("Could not load previous selections:", dataSelections.error);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchFilesAndSelections();
  }, [folderId]);

  const toggleSelect = async (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set<string>(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      
      const arr = Array.from(newSet);
      saveToLocalBackup({ selectedIds: arr });
      saveToDatabase(newSet);
      return newSet;
    });
  };

  const saveToDatabase = async (newSet: Set<string>) => {
    setSyncStatus('saving');
    const arr = Array.from(newSet);

    try {
      // 1. Save to server persistent disk API
      const res = await fetch(`/api/albums/${folderId}/selections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedIds: arr })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save');
      }
      setSyncStatus('saved');

      // 2. Direct Firestore Client Sync (Tier 3 - when authenticated with Firebase Auth)
      if (db && auth?.currentUser) {
        try {
          const albumRef = doc(db, 'albums', folderId);
          await setDoc(albumRef, {
            selectedIds: arr,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch {
          // Handled by server /api/albums persistence
        }
      }
    } catch (err) {
      console.error("Save error", err);
      setSyncStatus('error');
    }
  };

  // Save annotations for a specific file across 3 tiers (LocalStorage, Server Disk, and Firestore)
  const handleSaveFileAnnotations = async (fileId: string, newAnnotations: StrokeAnnotation[]) => {
    let nextState: AlbumAnnotations = {};
    setAnnotations(prev => {
      const next = { ...prev };
      if (newAnnotations.length === 0) {
        delete next[fileId];
      } else {
        next[fileId] = newAnnotations;
      }
      nextState = next;
      return next;
    });

    // 1. Instant client-side persistence in LocalStorage
    saveToLocalBackup({ annotations: nextState });
    setSyncStatus('saving');

    try {
      // 2. Persistent Server Disk API (/data/albums/{folderId}.json)
      const res = await fetch(`/api/albums/${folderId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, fileAnnotations: newAnnotations })
      });

      if (res.ok) {
        setSyncStatus('saved');
      } else {
        setSyncStatus('error');
      }

      // 3. Direct Firestore Client Sync (Tier 3 - when authenticated with Firebase Auth)
      if (db && auth?.currentUser) {
        try {
          const albumRef = doc(db, 'albums', folderId);
          await setDoc(albumRef, {
            annotations: nextState,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch {
          // Handled by server /api/albums persistence
        }
      }
    } catch (err) {
      console.error("Save annotations error:", err);
      setSyncStatus('error');
    }
  };

  // Save retouched image for a specific file across 3 tiers
  const handleSaveRetouchedImage = async (fileId: string, retouchedUrl: string) => {
    let nextRetouched: Record<string, string> = {};
    setRetouchedImages(prev => {
      const next = { ...prev, [fileId]: retouchedUrl };
      nextRetouched = next;
      return next;
    });

    // 1. LocalStorage
    saveToLocalBackup({ retouched: nextRetouched });

    try {
      // 2. Server Disk API
      await fetch(`/api/albums/${folderId}/retouched`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, retouchedImageUrl: retouchedUrl })
      });

      // 3. Firestore (when authenticated with Firebase Auth)
      if (db && auth?.currentUser) {
        try {
          const albumRef = doc(db, 'albums', folderId);
          await setDoc(albumRef, {
            retouched: nextRetouched,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch {
          // Handled by server /api/albums persistence
        }
      }
    } catch (err) {
      console.warn("Save retouched image error:", err);
    }
  };

  const handleDownload = () => {
    if (selectedIds.size === 0) return;
    
    const selectedFiles = files
      .filter(f => selectedIds.has(f.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const text = selectedFiles.map(f => f.name).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `danh-sach-anh-chon-${folderId.slice(0, 6)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export summary of all annotations across the album
  const handleExportAllAnnotations = () => {
    const annotatedFiles = files.filter(f => (annotations[f.id]?.length || 0) > 0);
    if (annotatedFiles.length === 0) {
      alert("Chưa có bức ảnh nào được ghi chú chỉnh sửa.");
      return;
    }

    let totalNotes = 0;
    let content = `BẢNG TỔNG HỢP YÊU CẦU CHỈNH SỬA ẢNH - PHOTOBOOK VIETNAM\n`;
    content += `Mã Album: ${folderId}\n`;
    content += `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}\n`;
    content += `Số lượng ảnh có ghi chú: ${annotatedFiles.length} ảnh\n`;
    content += `=========================================================\n\n`;

    annotatedFiles.forEach((file, fIdx) => {
      const fileNotes = annotations[file.id] || [];
      totalNotes += fileNotes.length;
      content += `[ẢNH #${fIdx + 1}] File: ${file.name} (${fileNotes.length} yêu cầu):\n`;
      fileNotes.forEach((anno, nIdx) => {
        content += `   ${nIdx + 1}. [Vị trí #${nIdx + 1}]: ${anno.note}\n`;
      });
      content += `\n---------------------------------------------------------\n\n`;
    });

    content += `Tổng cộng: ${totalNotes} ghi chú cần chỉnh sửa.\n`;
    content += `Photobook Vietnam | Hotline: 0938023079\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tong-hop-ghi-chu-sua-anh-${folderId.slice(0, 6)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered & sorted files
  const filteredAndSortedFiles = files
    .filter(f => {
      if (filterMode === 'all') return true;
      if (filterMode === 'selected') return selectedIds.has(f.id);
      if (filterMode === 'unselected') return !selectedIds.has(f.id);
      if (filterMode === 'annotated') return (annotations[f.id]?.length || 0) > 0;
      return true;
    })
    .sort((a, b) => {
      if (sortMode === 'name-asc') return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      if (sortMode === 'name-desc') return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
      if (sortMode === 'date-asc') {
        const timeA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
        const timeB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
        return timeA - timeB;
      }
      if (sortMode === 'date-desc') {
        const timeA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
        const timeB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
        return timeB - timeA;
      }
      return 0;
    });

  const totalAnnotatedPhotos = files.filter(f => (annotations[f.id]?.length || 0) > 0).length;

  // Keyboard navigation for viewer (disable arrow switching while actively drawing)
  useEffect(() => {
    if (viewingIndex === null) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not navigate with arrows if user is in drawing mode or typing in an input
      if (isDrawingMode) {
        if (e.key === 'Escape') {
          setIsDrawingMode(false);
        }
        return;
      }

      if (e.key === 'ArrowRight' && viewingIndex < filteredAndSortedFiles.length - 1) {
        setViewingIndex(viewingIndex + 1);
        setZoomLevel(1);
      } else if (e.key === 'ArrowLeft' && viewingIndex > 0) {
        setViewingIndex(viewingIndex - 1);
        setZoomLevel(1);
      } else if (e.key === 'Escape') {
        setViewingIndex(null);
        setZoomLevel(1);
        setIsDrawingMode(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingIndex, filteredAndSortedFiles.length, isDrawingMode]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-sky-50">
        <Loader2 className="w-12 h-12 text-sky-500 animate-spin mb-4" />
        <p className="text-sky-400 font-medium text-lg">Đang tải danh sách ảnh...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-sky-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md w-full border border-sky-100">
          <div className="w-20 h-20 bg-sky-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ImageIcon className="w-10 h-10 text-sky-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">Không thể tải ảnh</h2>
          <p className="text-slate-600 mb-8 leading-relaxed">{error}</p>
          <button 
            onClick={onBack}
            className="w-full py-3.5 bg-sky-100 hover:bg-sky-200 text-sky-700 font-bold rounded-xl transition-colors"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  const currentViewingFile = viewingIndex !== null ? filteredAndSortedFiles[viewingIndex] : null;
  const currentFileAnnotations = currentViewingFile ? (annotations[currentViewingFile.id] || []) : [];

  return (
    <div className="flex flex-col flex-1 bg-sky-50 overflow-hidden relative">
      
      {/* Floating Counter Badge */}
      <div className="fixed right-0 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-40">
        <button
          type="button"
          onClick={() => setFilterMode('selected')}
          className="bg-sky-400 hover:bg-sky-500 text-white px-3 py-3 rounded-l-2xl shadow-lg flex flex-col items-center justify-center font-bold border-l-2 border-y-2 border-white/20 transition-transform active:scale-95 cursor-pointer"
          title="Xem các ảnh đã chọn"
        >
          <span className="text-lg md:text-xl leading-none mb-1">{selectedIds.size}</span>
          <Heart className="w-5 h-5 fill-current text-white" />
        </button>
        {totalAnnotatedPhotos > 0 && (
          <button
            type="button"
            onClick={() => setFilterMode('annotated')}
            className="bg-red-600 hover:bg-red-500 text-white px-3 py-2.5 rounded-l-2xl shadow-lg flex flex-col items-center justify-center font-bold border-l-2 border-y-2 border-white/20 transition-transform active:scale-95 cursor-pointer"
            title="Xem các ảnh có ghi chú sửa"
          >
            <span className="text-sm md:text-base leading-none mb-1">{totalAnnotatedPhotos}</span>
            <PenTool className="w-4 h-4 text-white" />
          </button>
        )}
      </div>
      
      {/* Header */}
      <header className="h-20 bg-white border-b-4 border-sky-100 flex items-center px-4 md:px-8 justify-between shadow-sm z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack} 
            className="p-2 hover:bg-sky-50 text-slate-400 hover:text-sky-500 rounded-full transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center shadow-lg transform rotate-3 hidden sm:flex">
            <Camera className="w-6 h-6 text-white fill-current" />
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight hidden lg:block">SMART <span className="text-sky-500">PIX</span></h1>
        </div>

        <div className="flex-1 max-w-xl mx-4 md:mx-12">
          <div className="relative flex items-center">
            <div className="absolute left-3 text-slate-400">
              <LinkIcon className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <input 
              type="text" 
              value={shareUrl} 
              className="w-full pl-9 md:pl-10 pr-24 py-2 md:py-2.5 bg-slate-100 border-2 border-transparent rounded-full text-xs md:text-sm text-slate-500 font-medium outline-none truncate" 
              readOnly 
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button 
              onClick={handleCopyLink}
              className={`absolute right-1 top-1 bottom-1 px-3 md:px-4 font-bold rounded-full text-xs md:text-sm transition-colors flex items-center gap-1 ${
                copied ? 'bg-green-100 text-green-600' : 'bg-sky-100 hover:bg-sky-200 text-sky-600'
              }`}
            >
              {copied ? 'Đã copy' : 'Copy link'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button 
            onClick={handleDownload}
            disabled={selectedIds.size === 0}
            className={`px-4 md:px-6 py-2 md:py-2.5 rounded-full font-bold shadow-md flex items-center gap-2 transition-all ${
              selectedIds.size > 0 
                ? 'bg-sky-500 hover:bg-sky-600 text-white cursor-pointer' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Download className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden sm:inline">Tải danh sách</span>
          </button>
          
          <button 
            onClick={() => {
              if (selectedIds.size === 0) return;
              const selectedFiles = files
                .filter(f => selectedIds.has(f.id))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
              const text = selectedFiles.map(f => f.name).join(', ');
              onOpenFilter(text);
            }}
            disabled={selectedIds.size === 0}
            className={`px-4 md:px-6 py-2 md:py-2.5 rounded-full font-bold shadow-md flex items-center gap-2 transition-all ${
              selectedIds.size > 0 
                ? 'bg-sky-500 hover:bg-sky-600 text-white cursor-pointer' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <FolderSync className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden sm:inline">Lọc ảnh</span>
          </button>

          {/* Admin Panel Button */}
          {userProfile?.role === 'admin' && onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-full text-xs font-black shadow-sm transition-all cursor-pointer"
              title="Mở Hệ Thống Quản Trị Lượt Render AI"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Quản trị</span>
            </button>
          )}

          {/* User Profile Pill or Login Button */}
          {userProfile ? (
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-full border border-slate-200 transition cursor-pointer text-left"
              title="Quản lý tài khoản & Quyền hạn"
            >
              {userProfile.photoURL ? (
                <img src={userProfile.photoURL} alt="Avatar" className="w-6 h-6 rounded-full" />
              ) : (
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                  userProfile.role === 'admin' 
                    ? 'bg-rose-500 text-white' 
                    : userProfile.role === 'vip' 
                      ? 'bg-amber-500 text-white' 
                      : 'bg-sky-500 text-white'
                }`}>
                  {userProfile.displayName?.charAt(0)?.toUpperCase() || userProfile.email?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              )}
              <span className="text-xs font-bold text-slate-700 hidden lg:inline max-w-[120px] truncate">
                {userProfile.displayName || userProfile.email}
              </span>
            </button>
          ) : (
            <button
              onClick={handleDirectGoogleLogin}
              disabled={googleLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-sky-600 rounded-full text-xs font-bold border border-slate-200 shadow-2xs transition cursor-pointer disabled:opacity-70"
            >
              {googleLoading ? (
                <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin" />
              ) : (
                <LogIn className="w-3.5 h-3.5 text-sky-500" />
              )}
              <span>{googleLoading ? 'Đang mở Google...' : 'Đăng nhập'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b-2 border-sky-50 px-4 md:px-8 py-3 flex flex-col md:flex-row items-center justify-center gap-3 shrink-0">
        <div className="bg-slate-100 p-1 rounded-full flex flex-wrap gap-1 shadow-inner justify-center">
          <button 
            onClick={() => setFilterMode('all')}
            className={`px-3.5 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all ${filterMode === 'all' ? 'bg-white text-slate-800 shadow' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Tất cả ảnh ({files.length})
          </button>
          <button 
            onClick={() => setFilterMode('selected')}
            className={`px-3.5 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${filterMode === 'selected' ? 'bg-sky-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Đã chọn ({selectedIds.size})
          </button>
          <button 
            onClick={() => setFilterMode('unselected')}
            className={`px-3.5 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all ${filterMode === 'unselected' ? 'bg-white text-slate-800 shadow' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Chưa chọn ({files.length - selectedIds.size})
          </button>
          {totalAnnotatedPhotos > 0 && (
            <button 
              onClick={() => setFilterMode('annotated')}
              className={`px-3.5 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${filterMode === 'annotated' ? 'bg-red-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <PenTool className="w-3.5 h-3.5 text-current" />
              Có ghi chú ({totalAnnotatedPhotos})
            </button>
          )}
        </div>

        <div className="flex items-center">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as any)}
            className="bg-slate-100 text-slate-700 text-xs md:text-sm font-bold px-4 py-2.5 rounded-full outline-none focus:ring-2 focus:ring-sky-200 cursor-pointer shadow-inner border-none"
          >
            <option value="name-asc">Tên (A-Z)</option>
            <option value="name-desc">Tên (Z-A)</option>
            <option value="date-desc">Mới nhất</option>
            <option value="date-asc">Cũ nhất</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {filteredAndSortedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">Không có ảnh nào trong mục này</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6 max-w-[1600px] mx-auto pb-4">
            {filteredAndSortedFiles.map((file, index) => {
              const isSelected = selectedIds.has(file.id);
              const thumbUrl = file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+/, '=s600') : '';
              const fileNotes = annotations[file.id] || [];
              const hasNotes = fileNotes.length > 0;
              
              return (
                <div 
                  key={file.id} 
                  className={`relative bg-white p-2 rounded-3xl transition-all duration-300 cursor-pointer group ${
                    isSelected 
                      ? 'shadow-xl transform scale-[1.02] border-4 border-sky-500' 
                      : hasNotes
                        ? 'shadow-lg border-4 border-red-200 hover:border-red-400'
                        : 'shadow-md border-4 border-transparent hover:scale-[1.01]'
                  }`}
                  onClick={() => {
                    setViewingIndex(index);
                    setIsDrawingMode(hasNotes);
                  }}
                >
                  <div className={`w-full aspect-[4/3] rounded-2xl relative overflow-hidden flex items-center justify-center ${!thumbUrl ? 'bg-blue-100' : 'bg-slate-100'}`}>
                    {thumbUrl ? (
                      <img 
                        src={thumbUrl} 
                        alt={file.name} 
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span className="text-blue-400 font-bold truncate px-4">{file.name}</span>
                    )}
                    
                    <div className={`absolute inset-0 transition-colors pointer-events-none ${isSelected ? 'bg-sky-500/20' : 'bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100'}`}></div>
                    
                    {/* Note Badge on Thumbnail */}
                    {hasNotes && (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingIndex(index);
                          setIsDrawingMode(true);
                        }}
                        className="absolute top-2.5 left-2.5 bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 z-10 transition-transform active:scale-95 border border-white/40"
                        title={`${fileNotes.length} ghi chú chỉnh sửa - Bấm để xem`}
                      >
                        <PenTool className="w-3 h-3 text-white" />
                        <span>{fileNotes.length} note</span>
                      </div>
                    )}

                    {/* AI Retouched Badge on Thumbnail */}
                    {retouchedImages[file.id] && (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingIndex(index);
                        }}
                        className="absolute bottom-2.5 left-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-sky-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1 z-10 border border-white/40"
                        title="Ảnh đã được chỉnh sửa trực tiếp bởi AI"
                      >
                        <Sparkles className="w-2.5 h-2.5 text-amber-300 animate-pulse" />
                        <span>Đã sửa AI</span>
                      </div>
                    )}

                    {/* Selection Heart Button */}
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(file.id);
                      }}
                      title={isSelected ? "Bỏ chọn ảnh" : "Chọn ảnh này"}
                      aria-label={isSelected ? "Bỏ chọn ảnh" : "Chọn ảnh này"}
                      className={`absolute top-2.5 right-2.5 sm:top-3 sm:right-3 w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-200 transform active:scale-90 z-10 touch-manipulation ${
                        isSelected 
                          ? 'bg-sky-500 text-white shadow-lg border-2 border-white scale-105' 
                          : 'bg-black/45 hover:bg-black/60 text-white backdrop-blur-md border border-white/30 shadow-md'
                      }`}
                    >
                      <Heart className={`w-5 h-5 ${isSelected ? 'fill-white text-white' : 'text-white stroke-[2.2]'}`} />
                    </button>
                  </div>
                  
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(file.id);
                    }}
                    className="mt-3 px-1.5 flex justify-between items-center h-6 cursor-pointer select-none"
                    title={isSelected ? "Nhấn để bỏ chọn ảnh" : "Nhấn để chọn ảnh"}
                  >
                    {isSelected ? (
                      <div className="flex items-center gap-1.5 w-full min-w-0">
                        <span className="w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                          <Heart className="w-3 h-3 fill-white text-white" />
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-sky-600 truncate flex-1">{file.name}</span>
                      </div>
                    ) : (
                      <>
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">
                          Chưa chọn
                        </span>
                        <span className="text-[10px] sm:text-xs font-bold truncate max-w-[65%] text-slate-400 text-right">
                          {file.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="h-20 md:h-24 bg-sky-500 border-t-4 border-sky-400 px-4 md:px-10 flex items-center justify-between text-white shadow-2xl z-20 shrink-0">
        <div className="flex items-center gap-4 md:gap-8">
          <div className="flex flex-col">
            <span className="text-sky-100 text-[10px] md:text-xs font-black uppercase tracking-widest">Tổng cộng</span>
            <span className="text-2xl md:text-3xl font-black leading-none">{files.length} <span className="text-xs md:text-sm font-medium opacity-80">ảnh</span></span>
          </div>
          <div className="w-px h-8 md:h-10 bg-sky-400"></div>
          <div className="flex flex-col">
            <span className="text-sky-100 text-[10px] md:text-xs font-black uppercase tracking-widest">Đã chọn</span>
            <span className="text-2xl md:text-3xl font-black leading-none text-white">{selectedIds.size} <span className="text-xs md:text-sm font-medium opacity-80">ảnh</span></span>
          </div>
          {totalAnnotatedPhotos > 0 && (
            <>
              <div className="w-px h-8 md:h-10 bg-sky-400 hidden sm:block"></div>
              <div className="hidden sm:flex flex-col">
                <span className="text-red-200 text-[10px] md:text-xs font-black uppercase tracking-widest">Có ghi chú</span>
                <span className="text-2xl md:text-3xl font-black leading-none text-red-200">{totalAnnotatedPhotos} <span className="text-xs md:text-sm font-medium opacity-80">ảnh</span></span>
              </div>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm text-xs font-medium">
            {syncStatus === 'saving' && <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Đang lưu máy chủ...</span>}
            {syncStatus === 'saved' && <span className="flex items-center gap-1">✓ Đã đồng bộ máy chủ</span>}
            {syncStatus === 'error' && <span className="flex items-center gap-1 text-red-200">⚠ Lỗi khi lưu</span>}
          </div>
        </div>
      </footer>

      {/* Lightbox Viewer with Red Callout Annotation */}
      {viewingIndex !== null && filteredAndSortedFiles[viewingIndex] && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Top Bar */}
          <div className="h-16 px-4 flex items-center justify-between text-white/70 absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
            <div className="text-xs sm:text-sm font-medium flex items-center gap-2 text-white">
              <span className="bg-white/20 px-2.5 py-1 rounded-full text-xs font-bold">
                {viewingIndex + 1} / {filteredAndSortedFiles.length}
              </span>
              <span className="hidden sm:inline font-semibold truncate max-w-xs">
                {filteredAndSortedFiles[viewingIndex].name}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Toggle Drawing Mode Button */}
              <button
                onClick={() => {
                  setIsDrawingMode(!isDrawingMode);
                  if (!isDrawingMode) setZoomLevel(1);
                }}
                className={`px-3 py-1.5 rounded-full font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md ${
                  isDrawingMode 
                    ? 'bg-red-600 text-white ring-2 ring-red-400' 
                    : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
                title="Bật/Tắt chế độ vẽ bút đỏ khoanh vùng cần sửa"
              >
                <PenTool className="w-4 h-4" />
                <span>{isDrawingMode ? 'Đang bật vẽ đỏ' : 'Khoanh vùng & Note'}</span>
              </button>

              <button 
                onClick={() => {
                  const file = filteredAndSortedFiles[viewingIndex];
                  if (file.webContentLink) window.open(file.webContentLink, '_blank');
                }}
                className="p-2 hover:text-white transition-colors"
                title="Tải ảnh gốc"
              >
                <Download className="w-5 h-5" />
              </button>

              {!isDrawingMode && (
                <>
                  <button 
                    onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}
                    className="p-2 hover:text-white transition-colors"
                    title="Thu nhỏ"
                  >
                    <ZoomOut className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setZoomLevel(z => Math.min(4, z + 0.25))}
                    className="p-2 hover:text-white transition-colors"
                    title="Phóng to"
                  >
                    <ZoomIn className="w-5 h-5" />
                  </button>
                </>
              )}

              <button 
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen();
                  } else {
                    document.exitFullscreen();
                  }
                }}
                className="p-2 hover:text-white transition-colors"
                title="Toàn màn hình"
              >
                <Maximize className="w-5 h-5" />
              </button>
              
              <button 
                onClick={() => {
                  setViewingIndex(null);
                  setZoomLevel(1);
                  setIsDrawingMode(false);
                }}
                className="p-2 hover:text-white transition-colors ml-2"
                title="Đóng (ESC)"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div 
            className="flex-1 relative flex items-center justify-center overflow-hidden h-full pt-14 pb-16"
            onWheel={(e) => {
              if (isDrawingMode) return;
              if (e.deltaY < 0) {
                setZoomLevel(z => Math.min(4, z + 0.15));
              } else {
                setZoomLevel(z => Math.max(0.5, z - 0.15));
              }
            }}
          >
            {/* Prev Button (disabled during active drawing) */}
            {viewingIndex > 0 && !isDrawingMode && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setViewingIndex(viewingIndex - 1);
                  setZoomLevel(1);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white transition-colors z-20"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
            )}

            {/* Photo Canvas with Annotation Engine */}
            <div 
              className="w-full h-full flex items-center justify-center p-2 sm:p-4"
              style={{ 
                transform: !isDrawingMode ? `scale(${zoomLevel})` : 'scale(1)', 
                transition: isDrawingMode ? 'none' : 'transform 0.2s ease-out' 
              }}
            >
              <PhotoAnnotationCanvas
                file={filteredAndSortedFiles[viewingIndex]}
                imageUrl={filteredAndSortedFiles[viewingIndex].thumbnailLink?.replace(/=s\d+/, '=s2048') || ''}
                retouchedImageUrl={retouchedImages[filteredAndSortedFiles[viewingIndex].id]}
                onSaveRetouchedImage={(url) => {
                  handleSaveRetouchedImage(filteredAndSortedFiles[viewingIndex].id, url);
                }}
                annotations={currentFileAnnotations}
                onSaveAnnotations={(newAnnos) => {
                  handleSaveFileAnnotations(filteredAndSortedFiles[viewingIndex].id, newAnnos);
                }}
                isDrawingMode={isDrawingMode}
                setIsDrawingMode={setIsDrawingMode}
                userProfile={userProfile}
                onUpdateUserProfile={(updated) => {
                  if (setUserProfile) setUserProfile(updated);
                }}
                onOpenVIPModal={onOpenVIPModal}
                onOpenTopupModal={() => {
                  if (!userProfile) {
                    setShowAuthModal(true);
                  } else if (onOpenTopupModal) {
                    onOpenTopupModal();
                  }
                }}
                folderId={folderId}
              />
            </div>

            {/* Next Button (disabled during active drawing) */}
            {viewingIndex < filteredAndSortedFiles.length - 1 && !isDrawingMode && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setViewingIndex(viewingIndex + 1);
                  setZoomLevel(1);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white transition-colors z-20"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            )}
          </div>

          {/* Bottom Bar */}
          <div className="h-16 px-4 sm:px-6 flex items-center justify-between text-white/70 absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
            <div className="text-xs sm:text-sm truncate max-w-[50%] sm:max-w-[70%] font-medium text-white/90 flex items-center gap-2">
              <span className="truncate">{filteredAndSortedFiles[viewingIndex].name}</span>
              {currentFileAnnotations.length > 0 && (
                <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                  {currentFileAnnotations.length} ghi chú
                </span>
              )}
            </div>
            
            <button 
              onClick={(e) => {
                e.stopPropagation();
                toggleSelect(filteredAndSortedFiles[viewingIndex].id);
              }}
              className={`px-4 py-2 rounded-full font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-md active:scale-95 ${
                selectedIds.has(filteredAndSortedFiles[viewingIndex].id)
                  ? 'bg-sky-500 text-white shadow-sky-500/40 ring-2 ring-white/30'
                  : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border border-white/20'
              }`}
            >
              <Heart 
                className={`w-4 h-4 sm:w-5 sm:h-5 ${selectedIds.has(filteredAndSortedFiles[viewingIndex].id) ? 'fill-white text-white' : 'text-white'}`} 
              />
              <span>{selectedIds.has(filteredAndSortedFiles[viewingIndex].id) ? 'Đã chọn ảnh' : 'Chọn ảnh này'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLoginSuccess={(profile) => {
          if (setUserProfile) setUserProfile(profile);
        }}
      />

      {/* User Profile / VIP Management Modal */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        userProfile={userProfile}
        setUserProfile={(profile) => {
          if (setUserProfile) setUserProfile(profile);
        }}
        onOpenAuthModal={() => setShowAuthModal(true)}
        onOpenTopupModal={onOpenTopupModal}
        onOpenAdmin={onOpenAdmin}
      />
    </div>
  );
}
