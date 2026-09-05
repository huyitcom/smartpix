import { useState, useEffect } from 'react';
import Landing from './components/Landing';
import Gallery from './components/Gallery';
import LocalFilter from './components/LocalFilter';
import AdminDashboard from './components/AdminDashboard';
import { auth, UserProfile, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function App() {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [initialFileList, setInitialFileList] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserProfile({ uid: user.uid, ...userDoc.data() } as UserProfile);
          } else {
            // Fallback if document doesn't exist yet but user is authenticated
            setUserProfile({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              role: 'user'
            });
          }
        } catch (error) {
          console.error("Error fetching user profile", error);
        }
      } else {
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
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
        <Gallery folderId={folderId} onBack={handleBack} onOpenFilter={handleOpenFilter} />
      ) : (
        <Landing 
          onStart={handleStart} 
          onOpenFilter={handleOpenFilter} 
          userProfile={userProfile}
          setUserProfile={setUserProfile}
        />
      )}
    </div>
  );
}
