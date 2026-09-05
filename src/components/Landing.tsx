import { useState, FormEvent } from 'react';
import { Camera, Link as LinkIcon, FolderSync } from 'lucide-react';

export default function Landing({ onStart, onOpenFilter }: { onStart: (folderId: string) => void, onOpenFilter: () => void }) {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  const extractFolderId = (url: string) => {
    // Handle drive.google.com/drive/folders/ID
    const match1 = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (match1) return match1[1];
    
    // Handle drive.google.com/open?id=ID
    const match2 = url.match(/id=([a-zA-Z0-9-_]+)/);
    if (match2) return match2[1];

    // If it's just the ID
    if (/^[a-zA-Z0-9-_]+$/.test(url)) return url; 

    return null;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!link.trim()) {
      setError('Vui lòng nhập link.');
      return;
    }
    const id = extractFolderId(link);
    if (id) {
      setError('');
      onStart(id);
    } else {
      setError('Link không hợp lệ. Vui lòng nhập link thư mục Google Drive.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 bg-sky-50 p-4 font-sans relative">
      <div className="absolute top-4 right-4">
        <button 
          onClick={() => onOpenFilter()}
          className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow hover:bg-slate-50 transition font-bold text-sky-500 text-sm"
        >
          <FolderSync className="w-5 h-5" />
          Lọc ảnh máy tính
        </button>
      </div>

      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-12 h-12 bg-sky-500 rounded-xl flex items-center justify-center shadow-lg transform rotate-3">
            <Camera className="w-7 h-7 text-white fill-current" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tight">
            SMART <span className="text-sky-500">PIX</span>
          </h1>
        </div>
        <p className="text-sky-400 text-sm md:text-base font-medium">Lọc ảnh nhanh từ Google Drive</p>
      </div>

      <div className="bg-white rounded-3xl shadow-xl w-full max-w-xl p-2 border-2 border-sky-100">
        <form onSubmit={handleSubmit} className="p-4 md:p-6 flex flex-col gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
              Link thư mục Google Drive
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-4 text-slate-400">
                <LinkIcon className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full pl-12 pr-4 py-3 bg-slate-100 border-2 border-transparent focus:border-sky-400 rounded-full text-sm text-slate-600 font-medium outline-none transition-colors"
              />
            </div>
            {error && <p className="text-sky-500 text-xs mt-2 font-bold pl-2">{error}</p>}
            <p className="text-xs text-slate-500 mt-3 font-medium px-2 leading-relaxed opacity-80">
              * Hoạt động mượt mà với thư mục chứa tới 2000 ảnh.
              <br />
              * Hãy chắc chắn thư mục đã được chia sẻ <strong>"Bất kỳ ai có liên kết"</strong>.
            </p>
          </div>

          <div className="mt-2">
             <button
              type="submit"
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3.5 rounded-full transition-all shadow-md flex items-center justify-center gap-2 text-lg"
            >
              Tạo trang
            </button>
          </div>
        </form>
      </div>

      <div className="absolute bottom-6 text-slate-400 text-sm font-medium tracking-wide">
        Một sản phẩm của Photobook Vietnam
      </div>
    </div>
  );
}
