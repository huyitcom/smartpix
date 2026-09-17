import { useState, useEffect } from 'react';
import Landing from './components/Landing';
import Gallery from './components/Gallery';
import LocalFilter from './components/LocalFilter';
import AdminDashboard from './components/AdminDashboard';
import VIPAccessModal, { VIPModalStep } from './components/VIPAccessModal';
import { auth, UserProfile, db, hasValidFirebaseConfig } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function App() {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [initialFileList, setInitialFileList] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('photobook_local_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });
  const [pendingFileList, setPendingFileList] = useState('');
  const [vipModalStep, setVipModalStep] = useState<VIPModalStep>('closed');

  const updateUserProfile = (profile: UserProfile | null) => {
    setUserProfile(profile);
    if (profile) {
      localStorage.setItem('photobook_local_user', JSON.stringify(profile));
    } else {
      localStorage.removeItem('photobook_local_user');
    }
  };

  useEffect(() => {
    if (!hasValidFirebaseConfig) return;

    // Listen for auth state changes when valid Firebase config is provided
    try {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
              updateUserProfile({ uid: user.uid, ...userDoc.data() } as UserProfile);
            } else {
              updateUserProfile({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                role: 'user'
              });
            }
          } catch (error) {
            console.warn("Could not fetch user profile from Firestore:", error);
          }
        } else {
          updateUserProfile(null);
        }
      });

      return () => unsubscribe();
    } catch (e) {
      console.warn("Auth state listener error:", e);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const folder = params.get('folder');
    const admin = params.get('admin');
    
    if (admin === 'true') {
      setShowAdmin(true);
    } else {
      setShowAdmin(false);
    }

    if (folder) {
      setFolderId(folder);
    }
  }, []);

  // Listen for popstate (back button) to sync state with URL
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const admin = params.get('admin');
      if (admin === 'true') {
        setShowAdmin(true);
      } else {
        setShowAdmin(false);
        const folder = params.get('folder');
        setFolderId(folder || null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleStart = (id: string) => {
    window.history.pushState({}, '', `?folder=${id}`);
    setFolderId(id);
  };

  const handleBack = () => {
    window.history.pushState({}, '', '/');
    setFolderId(null);
    setShowFilter(false);
    setShowAdmin(false);
  };

  const handleOpenFilter = (fileList = '') => {
    setInitialFileList(fileList);
    setShowFilter(true);
  };

  const handleRequestOpenFilter = (fileList = '') => {
    setPendingFileList(fileList);
    if (!userProfile) {
      setVipModalStep('login_required');
      return;
    }
    if (userProfile.role === 'vip' || userProfile.role === 'admin') {
      handleOpenFilter(fileList);
      return;
    }
    // Logged in user without VIP role
    setVipModalStep('customer_check');
  };

  const handleGrantAccess = () => {
    handleOpenFilter(pendingFileList);
  };

  const handleCloseFilter = () => {
    setShowFilter(false);
  };

  return (
    <div className="min-h-screen bg-sky-50 font-sans text-slate-900 flex flex-col">
      {showAdmin && userProfile?.role === 'admin' ? (
        <AdminDashboard onBack={handleBack} currentUser={userProfile} />
      ) : showFilter ? (
        <LocalFilter onBack={handleCloseFilter} initialFileList={initialFileList} />
      ) : folderId ? (
        <Gallery folderId={folderId} onBack={handleBack} onOpenFilter={handleRequestOpenFilter} />
      ) : (
        <Landing 
          onStart={handleStart} 
          onOpenFilter={() => handleRequestOpenFilter('')} 
          userProfile={userProfile}
          setUserProfile={updateUserProfile}
        />
      )}

      <VIPAccessModal
        step={vipModalStep}
        onClose={() => setVipModalStep('closed')}
        userProfile={userProfile}
        setUserProfile={updateUserProfile}
        onGrantAccess={handleGrantAccess}
      />
    </div>
  );
}
