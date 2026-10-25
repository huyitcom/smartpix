// src/services/googleAuth.ts
import { UserProfile, validateAccessCode, hasValidFirebaseConfig } from '../firebase';

declare global {
  interface Window {
    google?: any;
  }
}

const STORAGE_KEY_CLIENT_ID = 'photobook_google_client_id';

export const getStoredGoogleClientId = (): string => {
  return (
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    localStorage.getItem(STORAGE_KEY_CLIENT_ID) ||
    ''
  );
};

export const setStoredGoogleClientId = (clientId: string) => {
  if (clientId.trim()) {
    localStorage.setItem(STORAGE_KEY_CLIENT_ID, clientId.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_CLIENT_ID);
  }
};

export interface GoogleUserInfo {
  sub: string;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email: string;
  email_verified?: boolean;
}

/**
 * Triggers authentic Google OAuth popup using Google Identity Services (GIS).
 * Requires a valid Google OAuth Client ID (e.g. from Google Cloud project gen-lang-client-0144443927).
 */
export const requestGoogleOAuthSignIn = async (
  clientId?: string,
  vipCode?: string
): Promise<UserProfile> => {
  const effectiveClientId = (clientId || getStoredGoogleClientId()).trim();

  if (!effectiveClientId) {
    throw new Error('Chưa có Google Client ID. Vui lòng nhập Client ID từ Google Cloud Console để mở popup đăng nhập chính thức.');
  }

  // Ensure GIS library is available
  if (!window.google?.accounts?.oauth2) {
    // Wait up to 3 seconds for GIS script to load
    await new Promise<void>((resolve, reject) => {
      let tries = 0;
      const interval = setInterval(() => {
        tries++;
        if (window.google?.accounts?.oauth2) {
          clearInterval(interval);
          resolve();
        } else if (tries > 30) {
          clearInterval(interval);
          reject(new Error('Thư viện Google Identity Services chưa tải xong. Vui lòng thử lại.'));
        }
      }, 100);
    });
  }

  return new Promise<UserProfile>((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: effectiveClientId,
        scope: 'openid email profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            console.error('Google OAuth token error:', tokenResponse);
            reject(new Error(tokenResponse.error_description || tokenResponse.error || 'Đăng nhập Google thất bại.'));
            return;
          }

          try {
            // Fetch real user info from official Google endpoint
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: {
                Authorization: `Bearer ${tokenResponse.access_token}`,
              },
            });

            if (!res.ok) {
              throw new Error('Không thể lấy thông tin tài khoản từ Google.');
            }

            const userInfo: GoogleUserInfo = await res.json();

            let role: 'user' | 'vip' | 'admin' = 'user';
            if (vipCode) {
              const codeCheck = validateAccessCode(vipCode);
              if (codeCheck.valid && codeCheck.role) {
                role = codeCheck.role;
              }
            }

            // Save active client ID for future logins
            setStoredGoogleClientId(effectiveClientId);

            const profile: UserProfile = {
              uid: 'google_' + userInfo.sub,
              email: userInfo.email,
              displayName: userInfo.name || userInfo.email.split('@')[0],
              photoURL: userInfo.picture || null,
              role,
              vipActivatedAt: role === 'vip' ? new Date().toISOString() : undefined,
              vipCodeUsed: vipCode,
            };

            resolve(profile);
          } catch (err: any) {
            reject(err);
          }
        },
      });

      // Open authentic Google account picker popup
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (err: any) {
      reject(err);
    }
  });
};
