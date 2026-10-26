import { useState, FormEvent } from 'react';
import { Camera, Link as LinkIcon, FolderSync, LogIn, LogOut, Crown, Sparkles, Shield, QrCode } from 'lucide-react';
import { logOut, UserProfile, signInWithGoogle, recordLinkCreation } from '../firebase';
import AuthModal from './AuthModal';
import UserProfileModal from './UserProfileModal';
import FeatureAnnouncementBanner from './FeatureAnnouncementBanner';
import AdBanners from './AdBanners';

export default function Landing({
  onStart,
  onOpenFilter,
  userProfile,
  setUserProfile,
  onOpenTopupModal,
  onOpenAdmin,
}: { 
  onStart: (folderId: string) => void, 
  onOpenFilter: () => void,
  userProfile: UserProfile | null,
  setUserProfile: (profile: UserProfile | null) => void,
  onOpenTopupModal?: () => void,
  onOpenAdmin?: () => void,
}) {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleDirectGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const profile = await signInWithGoogle();
      setUserProfile(profile);
    } catch (err: any) {
      console.warn("Direct Google sign-in:", err);
      if (err?.code === 'auth/popup-closed-by-user') {
        // User closed the popup, do nothing
      } else {
        setShowAuthModal(true);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogout = async () => {
    await logOut();
    setUserProfile(null);
  };

  const handleVIPFilterClick = () => {
    onOpenFilter();
  };

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
      // Ghi lại lịch sử tạo link của thành viên
      recordLinkCreation({
        folderId: id,
        driveUrl: link.trim().startsWith('http') ? link.trim() : `https://drive.google.com/drive/folders/${id}`,
        creator: userProfile,
      });
      onStart(id);
    } else {
      setError('Link không hợp lệ. Vui lòng nhập link thư mục Google Drive.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-sky-50 p-4 pt-20 pb-12 font-sans relative overflow-y-auto w-full">
      {/* Top Left: User profile or Login button */}
      <div className="absolute top-4 left-4 z-20">
        {userProfile ? (
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100 hover:shadow-md transition">
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-2.5 text-left cursor-pointer group"
              title="Xem thông tin tài khoản & Nâng cấp VIP"
            >
              {userProfile.photoURL ? (
                <img src={userProfile.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-sky-400" />
              ) : (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                  userProfile.role === 'admin' 
                    ? 'bg-rose-500 text-white' 
                    : userProfile.role === 'vip' 
                      ? 'bg-amber-500 text-white' 
                      : 'bg-sky-100 text-sky-600'
                }`}>
                  {userProfile.displayName?.charAt(0)?.toUpperCase() || userProfile.email?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800 group-hover:text-sky-600 transition truncate max-w-[130px] sm:max-w-[180px]">
                  {userProfile.displayName || userProfile.email}
                </span>
                <span className={`text-[10px] font-bold uppercase flex items-center gap-1 ${
                  userProfile.role === 'vip' 
                    ? 'text-amber-600' 
                    : userProfile.role === 'admin' 
                      ? 'text-rose-600' 
                      : 'text-sky-500'
                }`}>
                  {userProfile.role === 'vip' && <Crown className="w-3 h-3 text-amber-500" />}
                  {userProfile.role === 'admin' && <Crown className="w-3 h-3 text-rose-500" />}
                  {userProfile.role}
                </span>
              </div>
            </button>
            
            {userProfile.role === 'admin' && (
              <button 
                type="button"
                onClick={() => onOpenAdmin ? onOpenAdmin() : window.history.pushState({}, '', '?admin=true')}
                className="ml-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-full text-xs font-black transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                title="Mở Hệ Thống Quản Trị Lượt Render AI"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Quản trị AI</span>
              </button>
            )}

            <button 
              onClick={handleLogout} 
              className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors ml-1" 
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button 
              onClick={handleDirectGoogleLogin}
              disabled={googleLoading}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm hover:shadow hover:bg-slate-50 transition font-bold text-slate-700 hover:text-sky-600 text-sm border border-slate-200 cursor-pointer disabled:opacity-75 active:scale-98"
            >
              {googleLoading ? (
                <div className="w-4 h-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              )}
              <span>{googleLoading ? 'Đang mở Google...' : 'Đăng nhập Google'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Top Right: PC Filter shortcut */}
      <div className="absolute top-4 right-4 z-20">
        <button 
          onClick={handleVIPFilterClick}
          className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow hover:bg-slate-50 transition font-bold text-sky-500 text-sm border border-slate-100 cursor-pointer"
        >
          <FolderSync className="w-4 h-4 text-sky-500" />
          <span>Lọc ảnh máy tính</span>
        </button>
      </div>

      <div className="text-center mb-6 md:mb-8">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-12 bg-sky-500 rounded-xl flex items-center justify-center shadow-lg transform rotate-3">
            <Camera className="w-7 h-7 text-white fill-current" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tight">
            SMART <span className="text-sky-500">PIX</span>
          </h1>
        </div>
        <p className="text-sky-400 text-sm md:text-base font-medium">Lọc ảnh nhanh từ Google Drive</p>
      </div>

      <div className="bg-white rounded-3xl shadow-xl w-full max-w-xl p-2 border-2 border-sky-100 mb-6">
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
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3.5 rounded-full transition-all shadow-md flex items-center justify-center gap-2 text-lg cursor-pointer"
            >
              Tạo trang
            </button>
          </div>
        </form>
      </div>

      {/* Prominent New Feature Banner: Region Marking & Annotations (Placed below main card) */}
      <FeatureAnnouncementBanner onOpenFilter={handleVIPFilterClick} />

      {/* 2 Advertisement Banners (Designed with dual smart placement: Bottom cards + Desktop skyscrapers) */}
      <AdBanners onOpenTopupModal={onOpenTopupModal} />

      <div className="mt-6 text-slate-400 text-sm font-medium tracking-wide">
        Một sản phẩm của Photobook Vietnam
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLoginSuccess={(profile) => {
          setUserProfile(profile);
        }}
      />

      {/* User Profile / VIP Management Modal */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        userProfile={userProfile}
        setUserProfile={setUserProfile}
        onOpenAuthModal={() => setShowAuthModal(true)}
        onOpenTopupModal={onOpenTopupModal}
        onOpenAdmin={onOpenAdmin}
      />
    </div>
  );
}
