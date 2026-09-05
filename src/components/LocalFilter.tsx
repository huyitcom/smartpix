import React, { useState, useEffect } from 'react';
import { ArrowLeft, Folder, Scissors, Copy, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface LocalFilterProps {
  onBack: () => void;
  initialFileList?: string;
}

export default function LocalFilter({ onBack, initialFileList = '' }: LocalFilterProps) {
  const [sourceHandle, setSourceHandle] = useState<any>(null);
  const [destHandle, setDestHandle] = useState<any>(null);
  const [fileListText, setFileListText] = useState(initialFileList);
  const [extension, setExtension] = useState('');
  
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');
  
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    if (!('showDirectoryPicker' in window)) {
      setIsSupported(false);
    }
  }, []);

  const parsedFiles = fileListText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);

  const handlePickSource = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
      setSourceHandle(dirHandle);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setMessage('Lỗi khi chọn thư mục nguồn: ' + e.message);
      }
    }
  };

  const handlePickDest = async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setDestHandle(dirHandle);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setMessage('Lỗi khi chọn thư mục đích: ' + e.message);
      }
    }
  };

  const processFiles = async (isMove: boolean) => {
    if (!sourceHandle || !destHandle) {
      setMessage('Vui lòng chọn cả thư mục nguồn và thư mục đích!');
      return;
    }
    if (parsedFiles.length === 0) {
      setMessage('Danh sách ảnh trống!');
      return;
    }

    setStatus('processing');
    setMessage('');
    setProgress(0);
    setTotal(parsedFiles.length);

    try {
      const nameSet = new Set(parsedFiles.map(n => n.toLowerCase()));
      const baseNameSet = new Set(parsedFiles.map(n => n.toLowerCase().replace(/\.[^/.]+$/, "")));
      
      let matchedCount = 0;

      for await (const entry of sourceHandle.values()) {
        if (entry.kind === 'file') {
          const fileNameLower = entry.name.toLowerCase();
          const baseName = fileNameLower.replace(/\.[^/.]+$/, "");
          
          if (extension && !fileNameLower.endsWith(extension.toLowerCase())) {
             continue;
          }

          if (nameSet.has(fileNameLower) || baseNameSet.has(baseName)) {
            matchedCount++;
            setProgress(matchedCount);
            
            try {
              const file = await entry.getFile();
              const newFileHandle = await destHandle.getFileHandle(entry.name, { create: true });
              const writable = await newFileHandle.createWritable();
              await writable.write(file);
              await writable.close();
              
              if (isMove) {
                await sourceHandle.removeEntry(entry.name);
              }
            } catch (err) {
              console.error(`Lỗi khi xử lý file ${entry.name}`, err);
            }
          }
        }
      }
      
      setStatus('done');
      setMessage(`Đã ${isMove ? 'chuyển' : 'chép'} thành công ${matchedCount} ảnh.`);
    } catch (error: any) {
      console.error(error);
      setStatus('error');
      setMessage('Có lỗi xảy ra: ' + error.message);
    }
  };

  if (!isSupported) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full p-8 text-center">
          <AlertCircle className="w-16 h-16 text-sky-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Trình duyệt không hỗ trợ</h2>
          <p className="text-slate-600 mb-6">
            Tính năng xử lý file local (File System Access API) không được hỗ trợ trên trình duyệt này (hoặc bạn đang mở trong iframe giới hạn). Vui lòng sử dụng Chrome, Edge hoặc Opera trên máy tính và mở ứng dụng ở một tab mới.
          </p>
          <button onClick={onBack} className="px-6 py-3 bg-sky-500 text-white rounded-xl font-bold">
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 py-8">
      <div className="w-full max-w-3xl absolute top-4 left-4">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow hover:bg-slate-50 transition font-medium"
        >
          <ArrowLeft className="w-5 h-5" />
          Quay lại
        </button>
      </div>

      <div className="bg-white rounded-[2rem] shadow-xl w-full max-w-3xl overflow-hidden mt-8 md:mt-0">
        <div className="bg-sky-400 text-white text-center py-4 font-black text-2xl tracking-wide uppercase">
          3 bước lọc ảnh
        </div>

        <div className="p-6 md:p-10 space-y-8">
          {/* Bước 1 */}
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4">
              <span className="w-6 h-6 rounded-full bg-sky-400 text-white flex items-center justify-center text-sm">1</span>
              Chọn thư mục
            </h3>
            
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="flex-1 w-full text-center">
                <div className="border-2 border-dashed border-sky-300 rounded-xl p-3 text-slate-400 font-medium mb-3 truncate bg-slate-50">
                  {sourceHandle ? sourceHandle.name : '<nguồn>'}
                </div>
                <button 
                  onClick={handlePickSource}
                  className="w-full flex items-center justify-center gap-2 bg-sky-400 hover:bg-sky-500 text-white py-3 rounded-xl font-bold transition shadow-md shadow-sky-200"
                >
                  <Folder className="w-5 h-5" /> Chọn Nguồn
                </button>
              </div>
              
              <div className="hidden md:block w-16 h-[2px] bg-sky-200 relative">
                <div className="absolute -right-1 -top-1.5 w-3 h-3 border-t-2 border-r-2 border-sky-200 rotate-45"></div>
              </div>
              
              <div className="flex-1 w-full text-center">
                <div className="border-2 border-dashed border-sky-300 rounded-xl p-3 text-slate-400 font-medium mb-3 truncate bg-slate-50">
                  {destHandle ? destHandle.name : '<đích>'}
                </div>
                <button 
                  onClick={handlePickDest}
                  className="w-full flex items-center justify-center gap-2 bg-sky-400 hover:bg-sky-500 text-white py-3 rounded-xl font-bold transition shadow-md shadow-sky-200"
                >
                  <Folder className="w-5 h-5" /> Chọn Đích
                </button>
              </div>
            </div>
          </div>

          {/* Bước 2 */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                <span className="w-6 h-6 rounded-full bg-sky-400 text-white flex items-center justify-center text-sm">2</span>
                Nhập danh sách ảnh cần lọc
              </h3>
              <span className="text-xs text-slate-500 font-medium">Có {parsedFiles.length} tên.</span>
            </div>
            
            <textarea 
              className="w-full h-32 p-4 border-2 border-slate-200 rounded-xl focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none resize-none transition text-sm font-medium text-slate-700 bg-slate-50"
              placeholder="anh1.jpg, Anh2.JPG, ANH3.jpg..."
              value={fileListText}
              onChange={e => setFileListText(e.target.value)}
            ></textarea>

            <div className="flex items-center gap-3 mt-4">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                Chọn đuôi ảnh cần lọc (không bắt buộc)
                <Info className="w-4 h-4 text-slate-400" />
              </label>
              <input 
                type="text" 
                placeholder="VD: .CR2" 
                className="border-2 border-slate-200 rounded-lg px-3 py-1.5 w-32 outline-none focus:border-sky-400 text-sm font-medium"
                value={extension}
                onChange={e => setExtension(e.target.value)}
              />
            </div>
          </div>

          {/* Bước 3 */}
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4">
              <span className="w-6 h-6 rounded-full bg-sky-400 text-white flex items-center justify-center text-sm">3</span>
              Chuyển hoặc chép ảnh lọc
            </h3>
            
            <div className="flex rounded-xl overflow-hidden shadow-sm border-2 border-slate-100 bg-slate-50 p-1">
              <button 
                onClick={() => processFiles(true)}
                disabled={status === 'processing'}
                className="flex-1 flex flex-col items-center justify-center py-4 hover:bg-white rounded-lg transition disabled:opacity-50 group"
              >
                <div className="flex items-center gap-2 text-orange-400 font-bold mb-1 group-hover:scale-105 transition">
                  <Scissors className="w-5 h-5" /> Chuyển
                </div>
                <span className="text-[10px] text-orange-300 font-medium">Ảnh gốc sẽ bị xoá khỏi thư mục nguồn</span>
              </button>
              
              <div className="w-[2px] bg-slate-100 my-2 mx-1"></div>
              
              <button 
                onClick={() => processFiles(false)}
                disabled={status === 'processing'}
                className="flex-1 flex flex-col items-center justify-center py-4 hover:bg-white rounded-lg transition disabled:opacity-50 group"
              >
                <div className="flex items-center gap-2 text-sky-400 font-bold mb-1 group-hover:scale-105 transition">
                  <Copy className="w-5 h-5" /> Chép
                </div>
                <span className="text-[10px] text-sky-300 font-medium">Giữ lại ảnh gốc ở thư mục nguồn</span>
              </button>
            </div>
          </div>
          
          {/* Progress / Status */}
          {(status !== 'idle' || message) && (
            <div className={`p-4 rounded-xl flex items-center gap-3 ${
              status === 'error' ? 'bg-sky-50 text-sky-600 border-2 border-sky-100' : 
              status === 'done' ? 'bg-green-50 text-green-600 border-2 border-green-100' : 
              'bg-sky-50 text-sky-600 border-2 border-sky-100'
            }`}>
              {status === 'processing' && (
                <div className="w-full">
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>Đang xử lý...</span>
                    <span>{progress} / {total || parsedFiles.length}</span>
                  </div>
                  <div className="w-full bg-sky-200 rounded-full h-2">
                    <div className="bg-sky-500 h-2 rounded-full transition-all duration-300" style={{ width: `${(progress / Math.max(1, total || parsedFiles.length)) * 100}%` }}></div>
                  </div>
                </div>
              )}
              {status === 'done' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
              {status === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
              {message && <span className="font-medium text-sm">{message}</span>}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
