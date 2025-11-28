/**
 * Google Drive API service for uploading images
 */

const GOOGLE_DRIVE_FOLDER_ID = '1jHWaqo50qd68ko8fMoWtDbp7LQfG_0pA';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';

// Google Drive API scopes
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

/**
 * Load Google API client library
 */
const loadGoogleAPI = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).gapi) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      (window as any).gapi.load('client:auth2', () => {
        resolve();
      });
      script.onerror = reject;
    };
    document.head.appendChild(script);
  });
};

/**
 * Initialize Google API client
 */
const initGoogleClient = async (): Promise<void> => {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google Client IDが設定されていません。環境変数VITE_GOOGLE_CLIENT_IDを設定してください。');
  }

  await (window as any).gapi.client.init({
    apiKey: GOOGLE_API_KEY,
    clientId: GOOGLE_CLIENT_ID,
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    scope: SCOPES
  });
};

/**
 * Sign in to Google
 */
export const signInToGoogle = async (): Promise<boolean> => {
  try {
    await loadGoogleAPI();
    
    // クライアントIDが設定されていない場合はエラー
    if (!GOOGLE_CLIENT_ID) {
      throw new Error('Google Client IDが設定されていません。環境変数VITE_GOOGLE_CLIENT_IDを設定してください。');
    }
    
    await initGoogleClient();
    
    const authInstance = (window as any).gapi.auth2.getAuthInstance();
    const isSignedIn = authInstance.isSignedIn.get();
    
    if (!isSignedIn) {
      await authInstance.signIn();
    }
    
    return authInstance.isSignedIn.get();
  } catch (error: any) {
    console.error('Google sign-in error:', error);
    if (error.error === 'popup_closed_by_user') {
      throw new Error('ログインがキャンセルされました');
    }
    throw error;
  }
};

/**
 * Check if user is signed in
 */
export const isSignedIn = async (): Promise<boolean> => {
  try {
    await loadGoogleAPI();
    if (!(window as any).gapi.auth2) {
      return false;
    }
    const authInstance = (window as any).gapi.auth2.getAuthInstance();
    return authInstance.isSignedIn.get();
  } catch {
    return false;
  }
};

/**
 * Convert base64 data URL to blob
 */
const base64ToBlob = (dataUrl: string): Blob => {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

/**
 * Upload image to Google Drive
 */
export const uploadImageToDrive = async (
  imageDataUrl: string,
  fileName: string
): Promise<string> => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      throw new Error('Google Client IDが設定されていません。環境変数VITE_GOOGLE_CLIENT_IDを設定してください。');
    }

    await loadGoogleAPI();
    await initGoogleClient();
    
    const authInstance = (window as any).gapi.auth2.getAuthInstance();
    if (!authInstance.isSignedIn.get()) {
      await signInToGoogle();
    }

    const blob = base64ToBlob(imageDataUrl);
    const metadata = {
      name: fileName,
      parents: [GOOGLE_DRIVE_FOLDER_ID]
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const accessToken = authInstance.currentUser.get().getAuthResponse().access_token;
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: form
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'アップロードに失敗しました' } }));
      throw new Error(error.error?.message || 'アップロードに失敗しました');
    }

    const result = await response.json();
    return `https://drive.google.com/file/d/${result.id}/view`;
  } catch (error: any) {
    console.error('Upload error:', error);
    if (error.message) {
      throw error;
    }
    throw new Error('アップロードに失敗しました: ' + (error.toString() || '不明なエラー'));
  }
};

/**
 * Upload multiple images to Google Drive
 */
export const uploadImagesToDrive = async (
  images: Array<{ url: string; name: string }>
): Promise<string[]> => {
  const results: string[] = [];
  
  for (const image of images) {
    try {
      const fileUrl = await uploadImageToDrive(image.url, image.name);
      results.push(fileUrl);
    } catch (error) {
      console.error(`Failed to upload ${image.name}:`, error);
      throw error;
    }
  }
  
  return results;
};

