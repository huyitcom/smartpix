// src/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';

// Real Firebase Web App credentials (reads VITE_FIREBASE_* from Vercel/env with fallback to project defaults)
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDVETbsjjgEX8D_Nc_8aoF-MP8a4vIwz5E",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "photo-picker-507413.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "photo-picker-507413",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "photo-picker-507413.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "261494985322",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:261494985322:web:64f6b771f63d217184b013"
};

// Clear any stale local overrides so official config is always used
try {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('photobook_custom_firebase_config');
  }
} catch (e) {
  // ignore
}

let app: any = null;
let auth: any = null;
let db: any = null;
const googleProvider = new GoogleAuthProvider();

try {
  googleProvider.setCustomParameters({
    prompt: 'select_account'
  });
} catch (e) {
  // ignore
}

try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (err) {
  console.warn("Firebase initialization error:", err);
  auth = null;
  db = null;
}

export const hasValidFirebaseConfig = Boolean(auth);
export { app, auth, db, googleProvider };

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'admin' | 'vip' | 'user';
  credits?: number;
  renderCount?: number;
  trialUsed?: boolean;
  vipActivatedAt?: string;
  vipCodeUsed?: string;
  createdAt?: string;
  lastLoginAt?: string;
}

export const VALID_VIP_CODES = ['PHOTOBOOKVIP', 'VIP2025', 'VIP', 'PHOTOBOOK', 'VIPPHOTOBOOK', '0938023079'];

export const validateAccessCode = (code: string): { valid: boolean; role?: 'vip'; message: string } => {
  const normalized = code.trim().toUpperCase();
  if (VALID_VIP_CODES.includes(normalized) || code.trim() === '0938023079') {
    return { valid: true, role: 'vip', message: 'Mã kích hoạt VIP hợp lệ!' };
  }
  return { valid: false, message: 'Mã kích hoạt không đúng. Vui lòng liên hệ Hotline 0938023079 để nhận mã VIP.' };
};

export const syncUserCreditsWithServer = async (profile: UserProfile): Promise<UserProfile> => {
  try {
    const res = await fetch('/api/credits/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: profile.uid,
        email: profile.email,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        role: profile.role,
        credits: profile.credits,
        renderCount: profile.renderCount,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.user) {
        const synced: UserProfile = {
          ...profile,
          ...data.user,
          credits: typeof data.user.credits === 'number' ? data.user.credits : (profile.credits ?? 3),
          renderCount: typeof data.user.renderCount === 'number' ? data.user.renderCount : (profile.renderCount ?? 0),
        };
        if (db && synced.uid && !synced.uid.startsWith('usr_')) {
          try {
            await setDoc(
              doc(db, 'users', synced.uid),
              {
                uid: synced.uid,
                email: synced.email,
                displayName: synced.displayName,
                photoURL: synced.photoURL || null,
                role: synced.role,
                credits: synced.credits,
                renderCount: synced.renderCount,
              },
              { merge: true }
            );
          } catch {}
        }
        return synced;
      }
    }
  } catch (err) {
    console.warn('Could not sync credits with server:', err);
  }
  return {
    ...profile,
    credits: typeof profile.credits === 'number' ? profile.credits : 3,
    renderCount: typeof profile.renderCount === 'number' ? profile.renderCount : 0,
  };
};

export interface FetchUsersResult {
  users: UserProfile[];
  error?: string | null;
  permissionDenied?: boolean;
}

export const fetchAllFirestoreUsersResult = async (): Promise<FetchUsersResult> => {
  if (!db) return { users: [], error: 'Firestore chưa được kết nối' };
  try {
    if (auth && typeof (auth as any).authStateReady === 'function') {
      try {
        await (auth as any).authStateReady();
      } catch {}
    }

    const usersCol = collection(db, 'users');
    const snap = await getDocs(usersCol);
    const list: UserProfile[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      const uid = d.uid || docSnap.id;
      const email = d.email || null;
      const isOwnerAdmin =
        email?.toLowerCase() === 'huyitcom@gmail.com' ||
        Boolean(email?.toLowerCase().includes('huyitcom'));
      const role: 'admin' | 'vip' | 'user' = isOwnerAdmin
        ? 'admin'
        : d.role === 'admin' || d.role === 'vip'
        ? d.role
        : 'user';
      const defaultCredits = isOwnerAdmin ? 25 : 3;

      let createdAtStr: string | undefined = undefined;
      if (typeof d.createdAt === 'string') {
        createdAtStr = d.createdAt;
      } else if (d.createdAt?.toDate) {
        createdAtStr = d.createdAt.toDate().toISOString();
      }

      let lastLoginAtStr: string | undefined = undefined;
      if (typeof d.lastLoginAt === 'string') {
        lastLoginAtStr = d.lastLoginAt;
      } else if (d.lastLoginAt?.toDate) {
        lastLoginAtStr = d.lastLoginAt.toDate().toISOString();
      }

      list.push({
        uid,
        email,
        displayName: d.displayName || (email ? email.split('@')[0] : 'Khách hàng'),
        photoURL: d.photoURL || null,
        role,
        credits: typeof d.credits === 'number' ? d.credits : defaultCredits,
        renderCount: typeof d.renderCount === 'number' ? d.renderCount : 0,
        createdAt: createdAtStr,
        lastLoginAt: lastLoginAtStr,
      });
    });
    return { users: list, error: null, permissionDenied: false };
  } catch (err: any) {
    const isPermissionDenied =
      err?.code === 'permission-denied' ||
      String(err?.message || '').toLowerCase().includes('permission-denied') ||
      String(err?.message || '').toLowerCase().includes('insufficient permissions');
    console.warn('Could not fetch all users from Firestore client:', err);
    return {
      users: [],
      error: err?.message || 'Lỗi truy vấn Firestore',
      permissionDenied: isPermissionDenied,
    };
  }
};

export const fetchAllFirestoreUsers = async (): Promise<UserProfile[]> => {
  const res = await fetchAllFirestoreUsersResult();
  return res.users;
};

export const updateFirestoreUser = async (
  uid: string,
  updates: Partial<{
    credits: number;
    renderCount: number;
    role: 'admin' | 'vip' | 'user';
    displayName: string;
    email: string;
  }>
): Promise<void> => {
  if (!db || !uid) return;
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(
      userRef,
      {
        ...updates,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Could not update user in Firestore client:', err);
  }
};

export const markTrialAsUsed = async (uid: string) => {
  try {
    if (hasValidFirebaseConfig && db && auth?.currentUser?.uid === uid) {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { trialUsed: true }, { merge: true });
    }
  } catch {
    // Server/local state handles trial persistence when client Firestore rules restrict unauthenticated access
  }
};

export const signInWithGoogle = async (): Promise<UserProfile> => {
  if (!auth) {
    throw new Error("Hệ thống Firebase Auth chưa sẵn sàng. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại.");
  }

  try {
    // Open authentic Firebase Google Sign-In popup with prompt: 'select_account'
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    const isOwnerAdmin = user.email === 'huyitcom@gmail.com' || Boolean(user.email?.includes('huyitcom'));
    let role: 'user' | 'vip' | 'admin' = isOwnerAdmin ? 'admin' : 'user';

    let userProfile: UserProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email?.split('@')[0] || 'Tài khoản Google',
      photoURL: user.photoURL,
      role,
      credits: isOwnerAdmin ? 25 : 3,
      renderCount: 0,
    };

    if (db) {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          userProfile = {
            ...userProfile,
            ...data,
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || data.displayName,
            photoURL: user.photoURL || data.photoURL,
            role: isOwnerAdmin ? 'admin' : (data.role || role),
            credits: typeof data.credits === 'number' ? data.credits : (isOwnerAdmin ? 25 : 3),
            renderCount: typeof data.renderCount === 'number' ? data.renderCount : 0,
          } as UserProfile;
        } else {
          await setDoc(userRef, {
            ...userProfile,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp()
          }, { merge: true });
        }
      } catch (dbErr) {
        console.warn("Could not sync user to Firestore:", dbErr);
      }
    }
    
    userProfile = await syncUserCreditsWithServer(userProfile);
    return userProfile;
  } catch (error: any) {
    console.warn("Firebase Google popup error:", error);
    throw error;
  }
};

export const signInOrSignUpWithEmail = async (
  email: string,
  password?: string,
  displayName?: string,
  vipCode?: string
): Promise<UserProfile> => {
  const cleanEmail = email.trim().toLowerCase();
  const isOwnerAdmin = cleanEmail === 'huyitcom@gmail.com' || cleanEmail.includes('huyitcom');
  let role: 'user' | 'vip' | 'admin' = isOwnerAdmin ? 'admin' : 'user';
  if (vipCode) {
    const codeCheck = validateAccessCode(vipCode);
    if (codeCheck.valid && codeCheck.role) {
      role = codeCheck.role;
    }
  }

  if (hasValidFirebaseConfig && auth && password && password.length >= 6) {
    try {
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      } catch (signInErr: any) {
        if (
          signInErr.code === 'auth/user-not-found' ||
          signInErr.code === 'auth/invalid-credential' ||
          signInErr.code === 'auth/wrong-password'
        ) {
          try {
            userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            if (displayName && userCredential.user) {
              await updateProfile(userCredential.user, { displayName });
            }
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              throw new Error('Mật khẩu không đúng cho tài khoản này. Vui lòng kiểm tra lại.');
            }
            throw createErr;
          }
        } else {
          throw signInErr;
        }
      }

      const user = userCredential.user;
      let userProfile: UserProfile = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || displayName || cleanEmail.split('@')[0],
        photoURL: user.photoURL,
        role,
        credits: isOwnerAdmin ? 25 : 3,
        renderCount: 0,
        vipActivatedAt: (role === 'vip' || role === 'admin') ? new Date().toISOString() : undefined,
        vipCodeUsed: vipCode
      };

      if (db) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const existingSnap = await getDoc(userRef);
          if (existingSnap.exists()) {
            const existingData = existingSnap.data();
            userProfile.credits = typeof existingData.credits === 'number' ? existingData.credits : userProfile.credits;
            userProfile.renderCount = typeof existingData.renderCount === 'number' ? existingData.renderCount : 0;
            if (!vipCode && existingData.role) {
              userProfile.role = isOwnerAdmin ? 'admin' : existingData.role;
            }
          }
          await setDoc(userRef, {
            ...userProfile,
            lastLoginAt: serverTimestamp()
          }, { merge: true });
        } catch (e) {
          console.warn("Firestore sync error:", e);
        }
      }

      userProfile = await syncUserCreditsWithServer(userProfile);
      return userProfile;
    } catch (err: any) {
      console.warn("Firebase email auth error:", err);
      if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
        console.info("Domain not in Firebase authorizedDomains list. Gracefully falling back to local session.");
        return signInWithCustomCredentials(cleanEmail, displayName, role, vipCode);
      }
      throw err;
    }
  }

  // Fallback to custom credentials
  return signInWithCustomCredentials(cleanEmail, displayName, role, vipCode);
};

export const signInWithCustomCredentials = async (
  email: string,
  displayName?: string,
  role: 'admin' | 'vip' | 'user' = 'user',
  vipCode?: string
): Promise<UserProfile> => {
  const cleanEmail = email.trim().toLowerCase();
  const isOwnerAdmin = cleanEmail === 'huyitcom@gmail.com' || cleanEmail.includes('huyitcom');
  const name = displayName?.trim() || (isOwnerAdmin ? 'Lê Khắc Huy' : cleanEmail.split('@')[0]) || 'Khách hàng';
  const uid = 'usr_' + Math.abs(cleanEmail.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)).toString(36);

  let effectiveRole = role;
  if (isOwnerAdmin) {
    effectiveRole = 'admin';
  }

  let profile: UserProfile = {
    uid,
    email: cleanEmail,
    displayName: name,
    photoURL: null,
    role: effectiveRole,
    credits: isOwnerAdmin ? 25 : 3,
    renderCount: 0,
    trialUsed: false,
    vipActivatedAt: (effectiveRole === 'vip' || effectiveRole === 'admin') ? new Date().toISOString() : undefined,
    vipCodeUsed: vipCode
  };

  if (hasValidFirebaseConfig && db && auth?.currentUser?.uid === uid) {
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const d = snap.data();
        if (typeof d.credits === 'number') profile.credits = d.credits;
        if (typeof d.renderCount === 'number') profile.renderCount = d.renderCount;
        if (!vipCode && d.role) profile.role = isOwnerAdmin ? 'admin' : d.role;
      }
      await setDoc(userRef, {
        ...profile,
        lastLoginAt: serverTimestamp()
      }, { merge: true });
    } catch {
      // Handled by syncUserCreditsWithServer below
    }
  }

  profile = await syncUserCreditsWithServer(profile);
  return profile;
};

export const logOut = async () => {
  try {
    if (hasValidFirebaseConfig) {
      await signOut(auth);
    }
  } catch (error) {
    console.error("Error signing out", error);
  }
};

export interface LinkHistoryItem {
  id: string;
  folderId: string;
  driveUrl: string;
  shareUrl?: string;
  customTitle?: string;
  creatorUid?: string;
  creatorEmail: string;
  creatorName: string;
  creatorPhotoURL?: string | null;
  creatorRole: 'admin' | 'vip' | 'user' | 'guest';
  photoCount?: number;
  selectedCount?: number;
  annotatedCount?: number;
  createdAt: string;
  lastAccessedAt?: string;
}

const countAnnotatedFiles = (annotations: any): number => {
  if (!annotations || typeof annotations !== 'object') return 0;
  return Object.values(annotations).filter(
    (arr: any) => Array.isArray(arr) && arr.length > 0
  ).length;
};

export const fetchFolderSelectionStats = async (
  folderId: string
): Promise<{ selectedCount: number; annotatedCount: number }> => {
  let bestSelectedIds: string[] = [];
  let bestAnnotations: Record<string, any> = {};
  let bestUpdatedAt = 0;
  let foundRemoteAuthoritative = false;

  // 1. Check Server API (/api/albums/:folderId/selections)
  try {
    const res = await fetch(`/api/albums/${encodeURIComponent(folderId)}/selections?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      const sIds = Array.isArray(data?.selectedIds) ? data.selectedIds : [];
      const ann = data?.annotations && typeof data.annotations === 'object' ? data.annotations : {};
      if (sIds.length > 0 || Object.keys(ann).length > 0) {
        bestSelectedIds = sIds;
        bestAnnotations = ann;
        foundRemoteAuthoritative = true;
      }
    }
  } catch {
    // ignore
  }

  // 2. Check Client Firestore 'albums/{folderId}' directly
  if (db) {
    try {
      const albumSnap = await getDoc(doc(db, 'albums', folderId));
      if (albumSnap.exists()) {
        const d = albumSnap.data() || {};
        const fIds = Array.isArray(d.selectedIds) ? d.selectedIds : [];
        const fAnn = d.annotations && typeof d.annotations === 'object' ? d.annotations : {};
        const fTime =
          typeof d.updatedAtMs === 'number'
            ? d.updatedAtMs
            : d.updatedAt?.toMillis
            ? d.updatedAt.toMillis()
            : 0;
        if (fTime >= bestUpdatedAt && (fIds.length > 0 || Object.keys(fAnn).length > 0 || !foundRemoteAuthoritative)) {
          bestSelectedIds = fIds.length >= bestSelectedIds.length ? fIds : Array.from(new Set([...bestSelectedIds, ...fIds]));
          bestAnnotations = { ...bestAnnotations, ...fAnn };
          bestUpdatedAt = fTime;
          foundRemoteAuthoritative = true;
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Also check local browser cache (photobook_album_{folderId})
  try {
    const cachedStr = localStorage.getItem(`photobook_album_${folderId}`);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      const lIds = Array.isArray(cached?.selectedIds) ? cached.selectedIds : [];
      const lAnn = cached?.annotations && typeof cached.annotations === 'object' ? cached.annotations : {};
      const lTime = typeof cached?.updatedAt === 'number' ? cached.updatedAt : 0;

      if (!foundRemoteAuthoritative || lTime > bestUpdatedAt) {
        bestSelectedIds = Array.from(new Set([...bestSelectedIds, ...lIds]));
        bestAnnotations = { ...bestAnnotations, ...lAnn };
      }
    }
  } catch {
    // ignore
  }

  return {
    selectedCount: bestSelectedIds.length,
    annotatedCount: countAnnotatedFiles(bestAnnotations),
  };
};

export const enrichLinksWithSelectionStats = async (
  items: LinkHistoryItem[]
): Promise<LinkHistoryItem[]> => {
  if (!items || items.length === 0) return items;
  const enriched = await Promise.all(
    items.map(async (item) => {
      try {
        const stats = await fetchFolderSelectionStats(item.folderId);
        return {
          ...item,
          selectedCount: stats.selectedCount,
          annotatedCount: stats.annotatedCount,
        };
      } catch {
        return item;
      }
    })
  );
  return enriched;
};

const GUEST_CREATE_COUNT_KEY = 'smartpix_guest_create_count_v1';
const USER_LINKS_LOCAL_PREFIX = 'smartpix_user_links_v1_';

export const getGuestCreatedCount = (): number => {
  try {
    const val = Number(localStorage.getItem(GUEST_CREATE_COUNT_KEY) || '0');
    return Number.isNaN(val) ? 0 : val;
  } catch {
    return 0;
  }
};

export const incrementGuestCreatedCount = (): number => {
  try {
    const next = getGuestCreatedCount() + 1;
    localStorage.setItem(GUEST_CREATE_COUNT_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
};

const getLocalUserLinks = (uid: string): LinkHistoryItem[] => {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(`${USER_LINKS_LOCAL_PREFIX}${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
};

const saveLocalUserLinks = (uid: string, items: LinkHistoryItem[]) => {
  if (!uid) return;
  try {
    localStorage.setItem(`${USER_LINKS_LOCAL_PREFIX}${uid}`, JSON.stringify(items.slice(0, 100)));
  } catch {}
};

export const updateLinkStats = async (
  folderId: string,
  stats: {
    photoCount?: number;
    selectedCount?: number;
    annotatedCount?: number;
  }
): Promise<void> => {
  if (!folderId) return;
  try {
    // 1. Post stats update to server (isStatsUpdateOnly: true prevents overwriting creator)
    fetch('/api/links/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderId,
        photoCount: stats.photoCount,
        selectedCount: stats.selectedCount,
        annotatedCount: stats.annotatedCount,
        isStatsUpdateOnly: true,
      }),
    }).catch(() => {});

    // 2. Direct Firestore update - ONLY updates counts and access time, NEVER changes creator
    if (db) {
      try {
        const linkDocRef = doc(db, 'link_history', folderId);
        const updateData: Record<string, any> = {
          folderId,
          lastAccessedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (typeof stats.photoCount === 'number') updateData.photoCount = stats.photoCount;
        if (typeof stats.selectedCount === 'number') updateData.selectedCount = stats.selectedCount;
        if (typeof stats.annotatedCount === 'number') updateData.annotatedCount = stats.annotatedCount;

        await setDoc(linkDocRef, updateData, { merge: true });
      } catch (err) {
        console.warn('Firestore updateLinkStats warning:', err);
      }
    }
  } catch {}
};

export const recordLinkCreation = async (data: {
  folderId: string;
  driveUrl?: string;
  customTitle?: string;
  creator?: UserProfile | null;
  photoCount?: number;
  selectedCount?: number;
  annotatedCount?: number;
}): Promise<void> => {
  if (!data.folderId) return;
  try {
    // Resolve creator: if not provided or marked guest, check auth.currentUser and local storage
    let activeCreator: UserProfile | null = data.creator || null;
    if (!activeCreator || !activeCreator.uid || activeCreator.uid === 'guest') {
      if (auth?.currentUser) {
        const u = auth.currentUser;
        const isOwnerAdmin = u.email === 'huyitcom@gmail.com' || Boolean(u.email?.includes('huyitcom'));
        activeCreator = {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'Tài khoản Google'),
          photoURL: u.photoURL,
          role: isOwnerAdmin ? 'admin' : 'user',
          credits: isOwnerAdmin ? 25 : 3,
          renderCount: 0,
        };
      } else {
        try {
          const raw = localStorage.getItem('photobook_local_user');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.uid && parsed.uid !== 'guest') {
              activeCreator = parsed;
            }
          }
        } catch {}
      }
    }

    const hasRealCreator = Boolean(
      activeCreator && activeCreator.uid && activeCreator.uid !== 'guest' && activeCreator.email
    );
    const uid = hasRealCreator ? activeCreator!.uid : 'guest';
    const existingLocal = getLocalUserLinks(uid).find((i) => i.folderId === data.folderId);

    // Check if Firestore already has a real creator for this link
    let existingFirestoreData: any = null;
    if (db) {
      try {
        const linkDocRef = doc(db, 'link_history', data.folderId);
        const snap = await getDoc(linkDocRef);
        if (snap.exists()) {
          existingFirestoreData = snap.data();
        }
      } catch {}
    }

    const firestoreHasRealCreator = Boolean(
      existingFirestoreData?.creatorUid &&
        existingFirestoreData.creatorUid !== 'guest' &&
        existingFirestoreData?.creatorEmail &&
        existingFirestoreData.creatorEmail !== 'Chưa đăng nhập'
    );

    // If caller provided a real logged-in creator, use it. Otherwise, strictly preserve existing creator!
    const finalUid = hasRealCreator
      ? activeCreator!.uid
      : (firestoreHasRealCreator ? existingFirestoreData.creatorUid : (existingLocal?.creatorUid || undefined));
    const finalEmail = hasRealCreator
      ? (activeCreator!.email || 'Chưa đăng nhập')
      : (firestoreHasRealCreator ? existingFirestoreData.creatorEmail : (existingLocal?.creatorEmail || undefined));
    const finalName = hasRealCreator
      ? (activeCreator!.displayName || activeCreator!.email || 'Khách vãng lai')
      : (firestoreHasRealCreator ? existingFirestoreData.creatorName : (existingLocal?.creatorName || undefined));
    const finalRole = hasRealCreator
      ? ((activeCreator!.role as any) || 'user')
      : (firestoreHasRealCreator ? existingFirestoreData.creatorRole : ((existingLocal?.creatorRole as any) || undefined));
    const finalPhotoURL = hasRealCreator
      ? (activeCreator!.photoURL || null)
      : (firestoreHasRealCreator ? existingFirestoreData.creatorPhotoURL : (existingLocal?.creatorPhotoURL || null));

    let originalCreatedAt: string | undefined = undefined;
    if (existingFirestoreData?.createdAt) {
      if (typeof existingFirestoreData.createdAt === 'string') {
        originalCreatedAt = existingFirestoreData.createdAt;
      } else if (typeof existingFirestoreData.createdAt?.toDate === 'function') {
        originalCreatedAt = existingFirestoreData.createdAt.toDate().toISOString();
      }
    }
    if (!originalCreatedAt && existingLocal?.createdAt) {
      originalCreatedAt = existingLocal.createdAt;
    }

    const payload: LinkHistoryItem = {
      id: data.folderId,
      folderId: data.folderId,
      driveUrl: data.driveUrl || existingFirestoreData?.driveUrl || existingLocal?.driveUrl || `https://drive.google.com/drive/folders/${data.folderId}`,
      shareUrl: typeof window !== 'undefined' ? `${window.location.origin}/?folder=${data.folderId}` : `/?folder=${data.folderId}`,
      customTitle: data.customTitle ?? existingFirestoreData?.customTitle ?? existingLocal?.customTitle,
      creatorUid: finalUid || 'guest',
      creatorEmail: finalEmail || 'Chưa đăng nhập',
      creatorName: finalName || 'Khách vãng lai',
      creatorRole: (finalRole as any) || 'guest',
      creatorPhotoURL: finalPhotoURL,
      photoCount: data.photoCount ?? existingFirestoreData?.photoCount ?? existingLocal?.photoCount,
      selectedCount: data.selectedCount ?? existingFirestoreData?.selectedCount ?? existingLocal?.selectedCount,
      annotatedCount: data.annotatedCount ?? existingFirestoreData?.annotatedCount ?? existingLocal?.annotatedCount,
      createdAt: originalCreatedAt || new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
    };

    // 0. Save to local storage for the creator
    if (hasRealCreator) {
      const currentLocal = getLocalUserLinks(finalUid!).filter((i) => i.folderId !== data.folderId);
      saveLocalUserLinks(finalUid!, [payload, ...currentLocal]);
    }

    // 1. Post to backend server API with keepalive
    try {
      await fetch('/api/links/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch (e) {
      // ignore
    }

    // 2. Also write to Firestore collection 'link_history' if db is available
    if (db) {
      try {
        const linkDocRef = doc(db, 'link_history', data.folderId);
        const firestoreData: Record<string, any> = {
          folderId: payload.folderId,
          driveUrl: payload.driveUrl,
          shareUrl: payload.shareUrl,
          lastAccessedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (payload.customTitle !== undefined) firestoreData.customTitle = payload.customTitle;
        if (payload.photoCount !== undefined) firestoreData.photoCount = payload.photoCount;
        if (payload.selectedCount !== undefined) firestoreData.selectedCount = payload.selectedCount;
        if (payload.annotatedCount !== undefined) firestoreData.annotatedCount = payload.annotatedCount;

        // ONLY write creator fields if we have a real creator or if Firestore already had one
        if (hasRealCreator) {
          firestoreData.creatorUid = finalUid;
          firestoreData.creatorEmail = finalEmail;
          firestoreData.creatorName = finalName;
          firestoreData.creatorRole = finalRole;
          firestoreData.creatorPhotoURL = finalPhotoURL;
        } else if (firestoreHasRealCreator) {
          firestoreData.creatorUid = existingFirestoreData.creatorUid;
          firestoreData.creatorEmail = existingFirestoreData.creatorEmail;
          firestoreData.creatorName = existingFirestoreData.creatorName;
          firestoreData.creatorRole = existingFirestoreData.creatorRole;
          firestoreData.creatorPhotoURL = existingFirestoreData.creatorPhotoURL;
        }

        // Only set createdAt if the document doesn't have an existing creation timestamp
        if (!existingFirestoreData?.createdAt && !originalCreatedAt) {
          firestoreData.createdAt = serverTimestamp();
        }

        await setDoc(linkDocRef, firestoreData, { merge: true });
      } catch (err) {
        console.warn('Firestore link_history save warning:', err);
      }
    }
  } catch (err) {
    console.warn('Error recording link creation:', err);
  }
};

export const assignLinkCreator = async (
  folderId: string,
  user: {
    uid: string;
    email: string;
    displayName: string;
    role?: 'admin' | 'vip' | 'user';
    photoURL?: string | null;
  },
  originalCreatedAt?: string
): Promise<void> => {
  if (!folderId || !user.uid) return;
  const role = user.role || (user.email === 'huyitcom@gmail.com' ? 'admin' : 'user');

  try {
    // 1. Post to backend
    await fetch('/api/admin/links/assign-creator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderId,
        targetUid: user.uid,
        targetEmail: user.email,
        targetName: user.displayName || user.email,
        targetRole: role,
        targetPhotoURL: user.photoURL || null,
        originalCreatedAt,
      }),
    }).catch(() => {});

    // 2. Direct Firestore update - updates creator & updatedAt, preserves original createdAt
    if (db) {
      const linkDocRef = doc(db, 'link_history', folderId);
      const updateData: Record<string, any> = {
        creatorUid: user.uid,
        creatorEmail: user.email,
        creatorName: user.displayName || user.email,
        creatorRole: role,
        creatorPhotoURL: user.photoURL || null,
        updatedAt: serverTimestamp(),
      };
      if (originalCreatedAt) {
        updateData.createdAt = originalCreatedAt;
        updateData.createdAtStr = originalCreatedAt;
      }
      await setDoc(linkDocRef, updateData, { merge: true });
    }
  } catch (err) {
    console.warn('Could not assign link creator:', err);
  }
};

export const fetchAllLinkHistory = async (): Promise<LinkHistoryItem[]> => {
  let list: LinkHistoryItem[] = [];

  // 1. Try Firestore client first
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'link_history'));
      snap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        const createdAtStr =
          typeof d.createdAt === 'string'
            ? d.createdAt
            : typeof d.createdAt?.toDate === 'function'
            ? d.createdAt.toDate().toISOString()
            : typeof d.createdAtStr === 'string'
            ? d.createdAtStr
            : new Date().toISOString();
        const lastAccessedAtStr =
          typeof d.lastAccessedAt === 'string'
            ? d.lastAccessedAt
            : d.lastAccessedAt?.toDate
            ? d.lastAccessedAt.toDate().toISOString()
            : undefined;

        list.push({
          id: docSnap.id,
          folderId: d.folderId || docSnap.id,
          driveUrl: d.driveUrl || `https://drive.google.com/drive/folders/${d.folderId || docSnap.id}`,
          shareUrl: d.shareUrl || `/?folder=${d.folderId || docSnap.id}`,
          customTitle: d.customTitle || undefined,
          creatorUid: d.creatorUid,
          creatorEmail: d.creatorEmail || 'Chưa đăng nhập',
          creatorName: d.creatorName || 'Khách vãng lai',
          creatorRole: d.creatorRole || 'guest',
          creatorPhotoURL: d.creatorPhotoURL || null,
          photoCount: typeof d.photoCount === 'number' ? d.photoCount : undefined,
          selectedCount: typeof d.selectedCount === 'number' ? d.selectedCount : undefined,
          annotatedCount: typeof d.annotatedCount === 'number' ? d.annotatedCount : undefined,
          createdAt: createdAtStr,
          lastAccessedAt: lastAccessedAtStr,
        });
      });
    } catch (err) {
      console.warn('Could not fetch link history from Firestore:', err);
    }
  }

  // 2. Also fetch from backend server store
  try {
    const res = await fetch('/api/admin/links');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.links)) {
        const serverLinks: LinkHistoryItem[] = data.links;
        const map = new Map<string, LinkHistoryItem>();
        for (const l of [...list, ...serverLinks]) {
          const existing = map.get(l.folderId);
          if (!existing) {
            map.set(l.folderId, { ...l });
          } else {
            // Strictly preserve earliest createdAt
            const tExisting = new Date(existing.createdAt).getTime();
            const tNew = new Date(l.createdAt).getTime();
            const earliestCreatedAt =
              !Number.isNaN(tExisting) && !Number.isNaN(tNew)
                ? (tExisting <= tNew ? existing.createdAt : l.createdAt)
                : (existing.createdAt || l.createdAt);

            // Always prioritize non-guest real creator
            const hasExistingCreator = existing.creatorUid && existing.creatorUid !== 'guest';
            const hasNewCreator = l.creatorUid && l.creatorUid !== 'guest';

            let creatorUid = existing.creatorUid;
            let creatorName = existing.creatorName;
            let creatorEmail = existing.creatorEmail;
            let creatorRole = existing.creatorRole;
            let creatorPhotoURL = existing.creatorPhotoURL;

            if (hasNewCreator) {
              creatorUid = l.creatorUid;
              creatorName = l.creatorName;
              creatorEmail = l.creatorEmail;
              creatorRole = l.creatorRole;
              creatorPhotoURL = l.creatorPhotoURL;
            } else if (!hasExistingCreator && l.creatorUid) {
              creatorUid = l.creatorUid;
              creatorName = l.creatorName;
              creatorEmail = l.creatorEmail;
              creatorRole = l.creatorRole;
              creatorPhotoURL = l.creatorPhotoURL;
            }

            map.set(l.folderId, {
              ...existing,
              ...l,
              creatorUid,
              creatorName,
              creatorEmail,
              creatorRole,
              creatorPhotoURL,
              createdAt: earliestCreatedAt,
              customTitle: l.customTitle || existing.customTitle,
              photoCount: l.photoCount ?? existing.photoCount,
              selectedCount: l.selectedCount ?? existing.selectedCount,
              annotatedCount: l.annotatedCount ?? existing.annotatedCount,
            });
          }
        }
        list = Array.from(map.values());
      }
    }
  } catch (err) {
    console.warn('Could not fetch link history from server API:', err);
  }

  // Sort newest first
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return list;
};

export const fetchUserLinkHistory = async (user: UserProfile | null): Promise<LinkHistoryItem[]> => {
  if (!user) {
    const guestList = getLocalUserLinks('guest').sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return enrichLinksWithSelectionStats(guestList);
  }

  const guestItems = getLocalUserLinks('guest').map((item) => ({
    ...item,
    creatorUid: user.uid,
    creatorEmail: user.email || item.creatorEmail,
    creatorName: user.displayName || user.email || item.creatorName,
    creatorRole: (user.role as any) || 'user',
    creatorPhotoURL: user.photoURL || null,
  }));
  if (guestItems.length > 0) {
    saveLocalUserLinks('guest', []);
    for (const gItem of guestItems) {
      recordLinkCreation({
        folderId: gItem.folderId,
        driveUrl: gItem.driveUrl,
        customTitle: gItem.customTitle,
        creator: user,
        photoCount: gItem.photoCount,
      });
    }
  }

  const localItems = [...guestItems, ...getLocalUserLinks(user.uid)];
  const allRemote = await fetchAllLinkHistory();

  const cleanUserEmail = user.email?.trim().toLowerCase();
  const matchedRemote = allRemote.filter((item) => {
    if (item.creatorUid && item.creatorUid === user.uid) return true;
    if (cleanUserEmail && item.creatorEmail && item.creatorEmail.trim().toLowerCase() === cleanUserEmail) return true;
    return false;
  });

  const mergedMap = new Map<string, LinkHistoryItem>();
  for (const item of [...localItems, ...matchedRemote]) {
    const existing = mergedMap.get(item.folderId);
    if (!existing) {
      mergedMap.set(item.folderId, item);
    } else {
      mergedMap.set(item.folderId, {
        ...existing,
        ...item,
        customTitle: item.customTitle || existing.customTitle,
        photoCount: item.photoCount ?? existing.photoCount,
        selectedCount: item.selectedCount ?? existing.selectedCount,
        annotatedCount: item.annotatedCount ?? existing.annotatedCount,
      });
    }
  }

  const sortedItems = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const enrichedItems = await enrichLinksWithSelectionStats(sortedItems);
  saveLocalUserLinks(user.uid, enrichedItems);
  return enrichedItems;
};

export const updateLinkCustomTitle = async (
  folderId: string,
  customTitle: string,
  user?: UserProfile | null
): Promise<void> => {
  if (!folderId) return;
  const trimmed = customTitle.trim();

  const targetUid = user?.uid || 'guest';
  const local = getLocalUserLinks(targetUid).map((item) =>
    item.folderId === folderId ? { ...item, customTitle: trimmed } : item
  );
  saveLocalUserLinks(targetUid, local);

  try {
    await fetch('/api/links/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderId,
        customTitle: trimmed,
        creatorUid: user?.uid,
        creatorEmail: user?.email,
        creatorName: user?.displayName,
        creatorRole: user?.role,
      }),
    });
  } catch {}

  if (db) {
    try {
      await setDoc(
        doc(db, 'link_history', folderId),
        {
          customTitle: trimmed,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Could not update customTitle in Firestore:', err);
    }
  }
};

export const deleteUserLinkItem = async (
  folderId: string,
  user?: UserProfile | null
): Promise<void> => {
  if (!folderId) return;

  const targetUid = user?.uid || 'guest';
  const filtered = getLocalUserLinks(targetUid).filter((i) => i.folderId !== folderId);
  saveLocalUserLinks(targetUid, filtered);

  try {
    await fetch(`/api/links/${encodeURIComponent(folderId)}`, {
      method: 'DELETE',
    });
  } catch {}

  if (db) {
    try {
      await deleteDoc(doc(db, 'link_history', folderId));
    } catch (err) {
      console.warn('Could not delete link from Firestore:', err);
    }
  }
};


