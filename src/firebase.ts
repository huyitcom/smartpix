// src/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const isConfigValid = Boolean(
  envApiKey && 
  envApiKey !== 'dummy-api-key' && 
  envApiKey !== 'YOUR_FIREBASE_API_KEY' &&
  !envApiKey.includes('dummy') &&
  envApiKey.length > 10
);

const firebaseConfig = {
  apiKey: envApiKey || "dummy-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dummy-auth-domain.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dummy-project-id",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "dummy-storage-bucket.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const hasValidFirebaseConfig = isConfigValid;

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'admin' | 'vip' | 'user';
  trialUsed?: boolean;
}

export const markTrialAsUsed = async (uid: string) => {
  try {
    if (isConfigValid) {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { trialUsed: true }, { merge: true });
    }
  } catch (error) {
    console.warn("Could not sync trial to Firestore:", error);
  }
};

export const signInWithGoogle = async (): Promise<UserProfile | null> => {
  if (!isConfigValid) {
    // If Firebase API Key is not configured yet in .env, simulate demo login
    // so user is not blocked with raw "auth/api-key-not-valid" crash error
    const demoProfile: UserProfile = {
      uid: 'demo_user_' + Date.now(),
      email: 'khachhang@photobook.vn',
      displayName: 'Khách hàng dùng thử',
      photoURL: null,
      role: 'user',
      trialUsed: false
    };
    return demoProfile;
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user exists in Firestore
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    let userProfile: UserProfile;
    
    if (!userSnap.exists()) {
      userProfile = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: 'user',
      };
      
      await setDoc(userRef, {
        ...userProfile,
        createdAt: serverTimestamp(),
      });
    } else {
      userProfile = { uid: user.uid, ...userSnap.data() } as UserProfile;
    }
    
    return userProfile;
  } catch (error: any) {
    console.error("Error signing in with Google", error);
    if (error?.code === 'auth/api-key-not-valid' || error?.message?.includes('api-key-not-valid')) {
      // Graceful fallback: grant demo profile so user can proceed
      const demoProfile: UserProfile = {
        uid: 'demo_user_' + Date.now(),
        email: 'khachhang@photobook.vn',
        displayName: 'Khách hàng dùng thử',
        photoURL: null,
        role: 'user',
        trialUsed: false
      };
      return demoProfile;
    }
    throw error;
  }
};

export const logOut = async () => {
  try {
    if (isConfigValid) {
      await signOut(auth);
    }
  } catch (error) {
    console.error("Error signing out", error);
  }
};

