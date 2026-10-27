import { useState, useEffect } from 'react';
import Landing from './components/Landing';
import Gallery from './components/Gallery';
import LocalFilter from './components/LocalFilter';
import AdminDashboard from './components/AdminDashboard';
import CreditTopupModal from './components/CreditTopupModal';
import VIPAccessModal, { VIPModalStep } from './components/VIPAccessModal';
import { auth, UserProfile, db, syncUserCreditsWithServer } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

export default function App() {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [initialFileList, setInitialFileList] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      localStorage.removeItem('photobook_custom_firebase_config');
      localStorage.removeItem('photobook_saved_accounts');
    } catch (e) {}

    const saved = localStorage.getItem('photobook_local_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed?.uid || typeof parsed !== 'object') {
          localStorage.removeItem('photobook_local_user');
          return null;
        }
        if (parsed.email === 'huyitcom@gmail.com' || parsed.email?.includes('huyitcom')) {
          parsed.role = 'admin';
        }
        if (typeof parsed.credits !== 'number') {
          parsed.credits = parsed.role === 'admin' ? 25 : 3;
        }
        return parsed;
      } catch (e) {
        localStorage.removeItem('photobook_local_user');
        return null;
      }
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

  // Sync existing user with server on initial load and when modals close/open
  useEffect(() => {
    if (userProfile?.uid) {
      syncUserCreditsWithServer(userProfile).then((synced) => {
        updateUserProfile(synced);
      });
    }
  }, [userProfile?.uid, showTopupModal, showAdmin]);

  // Real-time Firestore listener on current user document (only when authenticated with Firebase Auth)
  useEffect(() => {
    if (!db || !userProfile?.uid) return;
    // Only attach direct Firestore listener if Firebase Auth session matches the UID
    if (!auth?.currentUser || auth.currentUser.uid !== userProfile.uid) return;

    try {
      const unsub = onSnapshot(
        doc(db, 'users', userProfile.uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (typeof data.credits === 'number' || data.role) {
              setUserProfile((prev) => {
                if (!prev) return prev;
                const next: UserProfile = {
                  ...prev,
                  credits: typeof data.credits === 'number' ? data.credits : prev.credits,
                  renderCount: typeof data.renderCount === 'number' ? data.renderCount : prev.renderCount,
                  role:
                    prev.email === 'huyitcom@gmail.com' || prev.email?.includes('huyitcom')
                      ? 'admin'
                      : data.role || prev.role,
                };
                localStorage.setItem('photobook_local_user', JSON.stringify(next));
                return next;
              });
            }
          }
        },
        () => {
          // Silently ignore permission-denied errors; server API sync handles credit state
        }
      );
      return () => unsub();
    } catch {}
  }, [userProfile?.uid]);

  useEffect(() => {
    if (!auth) return;

    try {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          try {
            const isOwnerAdmin =
              user.email === 'huyitcom@gmail.com' || Boolean(user.email?.includes('huyitcom'));
            let role: 'user' | 'vip' | 'admin' = isOwnerAdmin ? 'admin' : 'user';

            let profile: UserProfile = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || user.email?.split('@')[0] || 'Tài khoản Google',
              photoURL: user.photoURL,
              role,
              credits: isOwnerAdmin ? 25 : 3,
              renderCount: 0,
            };

            if (db) {
              const userDoc = await getDoc(doc(db, 'users', user.uid));
              if (userDoc.exists()) {
                const data = userDoc.data();
                profile = {
                  ...profile,
                  ...data,
                  uid: user.uid,
                  email: user.email,
                  displayName: user.displayName || data.displayName,
                  photoURL: user.photoURL || data.photoURL,
                  role: isOwnerAdmin ? 'admin' : (data.role || role),
                  credits: typeof data.credits === 'number' ? data.credits : profile.credits,
                  renderCount: typeof data.renderCount === 'number' ? data.renderCount : 0,
                } as UserProfile;
              }
            }
            profile = await syncUserCreditsWithServer(profile);
            updateUserProfile(profile);
          } catch (error) {
            console.warn("Could not fetch user profile from Firestore:", error);
          }
        } else {
          const currentLocal = localStorage.getItem('photobook_local_user');
          if (currentLocal) {
            try {
              const parsed = JSON.parse(currentLocal);
              if (parsed?.uid && !parsed.uid.startsWith('usr_')) {
                updateUserProfile(null);
              }
            } catch (e) {}
          }
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
    const topup = params.get('topup');

    if (admin === 'true' || admin === '1' || params.has('admin')) {
      setShowAdmin(true);
    }
    if (topup === 'success' || topup === 'open') {
      setShowTopupModal(true);
    }
    if (folder) {
      setFolderId(folder);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const admin = params.get('admin');
      if (admin === 'true' || admin === '1' || params.has('admin')) {
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
      {showFilter ? (
        <LocalFilter onBack={handleCloseFilter} initialFileList={initialFileList} />
      ) : folderId ? (
        <Gallery 
          folderId={folderId} 
          onBack={handleBack} 
          onOpenFilter={handleRequestOpenFilter}
          userProfile={userProfile}
          setUserProfile={updateUserProfile}
          onOpenVIPModal={() => {
            if (!userProfile) {
              setVipModalStep('login_required');
            } else {
              setShowTopupModal(true);
            }
          }}
          onOpenTopupModal={() => setShowTopupModal(true)}
          onOpenAdmin={() => setShowAdmin(true)}
        />
      ) : (
        <Landing 
          onStart={handleStart} 
          onOpenFilter={() => handleRequestOpenFilter('')} 
          userProfile={userProfile}
          setUserProfile={updateUserProfile}
          onOpenTopupModal={() => setShowTopupModal(true)}
          onOpenAdmin={() => setShowAdmin(true)}
        />
      )}

      {/* PayOS VietQR Credit Top-up Modal */}
      <CreditTopupModal
        isOpen={showTopupModal}
        onClose={() => setShowTopupModal(false)}
        userProfile={userProfile}
        onUpdateUserProfile={updateUserProfile}
        onOpenAuthModal={() => setVipModalStep('login_required')}
      />

      {/* Admin Dashboard Modal */}
      {showAdmin && (
        <AdminDashboard
          onBack={() => {
            setShowAdmin(false);
            const params = new URLSearchParams(window.location.search);
            if (params.get('admin') === 'true') {
              params.delete('admin');
              const qs = params.toString();
              window.history.pushState({}, '', qs ? `?${qs}` : '/');
            }
          }}
          currentUser={userProfile}
          onUpdateCurrentUser={updateUserProfile}
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

