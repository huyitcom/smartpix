// src/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// HƯỚNG DẪN DÀNH CHO BẠN (NGƯỜI DÙNG):
// Vì tính năng thiết lập tự động gặp lỗi phân quyền, bạn cần tự điền thông tin Firebase của mình vào đây.
// 1. Vào https://console.firebase.google.com/
// 2. Tạo Project mới (hoặc dùng project cũ) -> Bật Authentication (chọn Google) & Firestore Database
// 3. Vào Project Settings -> General -> Your apps -> Thêm web app (</>)
// 4. Copy đoạn firebaseConfig ở đó và dán đè vào biến firebaseConfig dưới đây:

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "dummy-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dummy-auth-domain",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dummy-project-id",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "dummy-storage-bucket",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "dummy-sender-id",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "dummy-app-id"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'admin' | 'vip' | 'user';
}

export const signInWithGoogle = async (): Promise<UserProfile | null> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user exists in Firestore
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    let userProfile: UserProfile;
    
    if (!userSnap.exists()) {
      // Create new user profile with default 'user' role
      userProfile = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: 'user', // Default role. Change this in Firestore console to 'vip' manually for VIPs
      };
      
      await setDoc(userRef, {
        ...userProfile,
        createdAt: serverTimestamp(),
      });
    } else {
      userProfile = { uid: user.uid, ...userSnap.data() } as UserProfile;
    }
    
    return userProfile;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};
