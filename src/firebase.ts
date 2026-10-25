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
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';

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

