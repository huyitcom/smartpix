import { useState, useEffect } from 'react';
import { Heart, Download, Image as ImageIcon, Loader2, ArrowLeft, Link as LinkIcon, FolderSync } from 'lucide-react';
import type { DriveFile } from '../types';

export default function Gallery({ folderId, onBack, onOpenFilter }: { folderId: string, onBack: () => void, onOpenFilter: (text: string) => void }) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/?folder=${folderId}` : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const fetchFilesAndSelections = async () => {
      setLoading(true);
      setError('');
      try {
        // Fetch files from Drive
        const resFiles = await fetch(`/api/drive/files?folderId=${folderId}`);
        const dataFiles = await resFiles.json();
        if (!resFiles.ok) throw new Error(dataFiles.error || 'Failed to fetch files');
        setFiles(dataFiles.files || []);

        // Fetch saved selections from server
        const resSelections = await fetch(`/api/albums/${folderId}/selections?t=${Date.now()}`, {
          cache: 'no-store'
        });
        if (resSelections.ok) {
          const dataSelections = await resSelections.json();
          if (dataSelections.selectedIds) {
            setSelectedIds(new Set(dataSelections.selectedIds));
            if (dataSelections.selectedIds.length > 0) {
              setSyncStatus('saved');
            }
          }
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
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      
      // Save directly with the accurate new state
      saveToDatabase(newSet);
      return newSet;
    });
  };

  const saveToDatabase = async (newSet: Set<string>) => {
    setSyncStatus('saving');
    try {
      const res = await fetch(`/api/albums/${folderId}/selections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedIds: Array.from(newSet) })
      });
      
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "Database not configured on server") {
          alert("Lỗi: Chưa cấu hình Database (FIREBASE_SERVICE_ACCOUNT) trên máy chủ. Vui lòng thêm biến môi trường này để có thể lưu ảnh!");
        }
        throw new Error(data.error || 'Failed to save');
      }
      setSyncStatus('saved');
    } catch (err) {
      console.error("Save error", err);
      setSyncStatus('error');
    }
  };

  const handleDownload = () => {
    if (selectedIds.size === 0) return;
    
    const selectedFiles = files.filter(f => selectedIds.has(f.id));
    const text = selectedFiles.map(f => f.name).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `danh-sach-anh-chon-${folderId.slice(0, 6)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-rose-50">
        <Loader2 className="w-12 h-12 text-rose-500 animate-spin mb-4" />
        <p className="text-rose-400 font-medium text-lg">Đang tải danh sách ảnh...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-rose-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md w-full border border-rose-100">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ImageIcon className="w-10 h-10 text-rose-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">Không thể tải ảnh</h2>
          <p className="text-slate-600 mb-8 leading-relaxed">{error}</p>
          <button 
            onClick={onBack}
            className="w-full py-3.5 bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold rounded-xl transition-colors"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-rose-50 overflow-hidden relative">
      
      {/* Floating Counter Badge */}
      <div className="fixed right-0 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-50">
        <div className="bg-sky-400 text-white px-3 py-3 rounded-l-2xl shadow-lg flex flex-col items-center justify-center font-bold border-l-2 border-y-2 border-white/20">
          <span className="text-lg md:text-xl leading-none mb-1">{selectedIds.size}</span>
          <Heart className="w-5 h-5 fill-current text-white" />
        </div>
      </div>
      
      {/* Header */}
      <header className="h-20 bg-white border-b-4 border-rose-100 flex items-center px-4 md:px-8 justify-between shadow-sm z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack} 
            className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-full transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center shadow-lg transform rotate-3 hidden sm:flex">
            <Heart className="w-6 h-6 text-white fill-current" />
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight hidden lg:block">SMART <span className="text-rose-500">PIX</span></h1>
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
                copied ? 'bg-green-100 text-green-600' : 'bg-rose-100 hover:bg-rose-200 text-rose-600'
              }`}
            >
              {copied ? 'Đã copy' : 'Copy link'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleDownload}
            disabled={selectedIds.size === 0}
            className={`px-4 md:px-6 py-2 md:py-2.5 rounded-full font-bold shadow-md flex items-center gap-2 transition-all ${
              selectedIds.size > 0 
                ? 'bg-rose-500 hover:bg-rose-600 text-white cursor-pointer' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Download className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden sm:inline">Tải danh sách</span>
          </button>
          
          <button 
            onClick={() => {
              if (selectedIds.size === 0) return;
              const selectedFiles = files.filter(f => selectedIds.has(f.id));
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
            <span className="hidden sm:inline">Lọc ảnh máy tính</span>
          </button>
        </div>
      </header>

      {/* Grid */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6 max-w-[1600px] mx-auto pb-4">
          {files.map(file => {
            const isSelected = selectedIds.has(file.id);
            const thumbUrl = file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+/, '=s600') : '';
            
            return (
              <div 
                key={file.id} 
                className={`relative bg-white p-2 rounded-3xl transition-transform cursor-pointer group ${isSelected ? 'shadow-xl transform scale-[1.02] border-2 border-transparent' : 'shadow-md border-2 border-transparent hover:scale-[1.01]'}`}
                onClick={() => toggleSelect(file.id)}
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
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(file.id);
                    }}
                    className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-95 ${
                      isSelected 
                        ? 'bg-white/90 text-rose-500 shadow-lg border-2 border-rose-100 scale-100'
                        : 'bg-black/10 text-white backdrop-blur-md opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <Heart className={`w-5 h-5 ${isSelected ? 'fill-current' : ''}`} />
                  </button>
                </div>
                <div className="mt-3 px-2 flex justify-between items-center h-5">
                  {isSelected ? (
                    <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Đã chọn</span>
                  ) : (
                    <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Chưa chọn</span>
                  )}
                  <span className={`text-[10px] sm:text-xs font-bold truncate max-w-[100px] ${isSelected ? 'text-rose-400' : 'text-slate-400'}`}>{file.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="h-20 md:h-24 bg-rose-500 border-t-4 border-rose-400 px-4 md:px-10 flex items-center justify-between text-white shadow-2xl z-20 shrink-0">
        <div className="flex items-center gap-4 md:gap-8">
          <div className="flex flex-col">
            <span className="text-rose-100 text-[10px] md:text-xs font-black uppercase tracking-widest">Tổng cộng</span>
            <span className="text-2xl md:text-3xl font-black leading-none">{files.length} <span className="text-xs md:text-sm font-medium opacity-80">ảnh</span></span>
          </div>
          <div className="w-px h-8 md:h-10 bg-rose-400"></div>
          <div className="flex flex-col">
            <span className="text-rose-100 text-[10px] md:text-xs font-black uppercase tracking-widest">Đã thả tym</span>
            <span className="text-2xl md:text-3xl font-black leading-none text-white">{selectedIds.size} <span className="text-xs md:text-sm font-medium opacity-80">ảnh</span></span>
          </div>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-sm text-xs font-medium">
              {syncStatus === 'saving' && <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Đang lưu...</span>}
              {syncStatus === 'saved' && <span className="flex items-center gap-1">✓ Đã lưu tự động</span>}
              {syncStatus === 'error' && <span className="flex items-center gap-1 text-red-200">⚠ Lỗi khi lưu</span>}
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
