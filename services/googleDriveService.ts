/**
 * Google Drive API service for uploading images
 */

const GOOGLE_DRIVE_PARENT_FOLDER_ID = '1jHWaqo50qd68ko8fMoWtDbp7LQfG_0pA';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';

// Google Drive API scopes - drive scope needed for folder creation
const SCOPES = 'https://www.googleapis.com/auth/drive';

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
/**
 * Upload image to Google Drive (legacy - uses parent folder directly)
 */
export const uploadImageToDrive = async (
  imageDataUrl: string,
  fileName: string
): Promise<string> => {
  return uploadImageToDriveInFolder(imageDataUrl, fileName, GOOGLE_DRIVE_PARENT_FOLDER_ID);
};

/**
 * Create a folder in Google Drive
 */
export const createFolderInDrive = async (
  folderName: string,
  parentFolderId?: string
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

    const accessToken = authInstance.currentUser.get().getAuthResponse().access_token;
    
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentFolderId && { parents: [parentFolderId] })
    };

    const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(folderMetadata)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: { message: errorText || 'フォルダ作成に失敗しました' } };
      }
      console.error('Folder creation error response:', error);
      throw new Error(error.error?.message || `フォルダ作成に失敗しました (HTTP ${response.status})`);
    }

    const result = await response.json();
    return result.id;
  } catch (error: any) {
    console.error('Folder creation error:', error);
    if (error.message) {
      throw error;
    }
    throw new Error('フォルダ作成に失敗しました: ' + (error.toString() || '不明なエラー'));
  }
};

/**
 * Upload image to Google Drive (with folder support)
 */
export const uploadImageToDriveInFolder = async (
  imageDataUrl: string,
  fileName: string,
  folderId: string
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
      parents: [folderId]
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
      const errorText = await response.text();
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: { message: errorText || 'アップロードに失敗しました' } };
      }
      console.error('Upload error response:', error);
      throw new Error(error.error?.message || `アップロードに失敗しました (HTTP ${response.status})`);
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
 * Upload multiple images to Google Drive in a folder
 */
export const uploadImagesToDriveInFolder = async (
  images: Array<{ url: string; name: string }>,
  folderId: string
): Promise<string[]> => {
  const results: string[] = [];

  for (const image of images) {
    try {
      const fileUrl = await uploadImageToDriveInFolder(image.url, image.name, folderId);
      results.push(fileUrl);
    } catch (error) {
      console.error(`Failed to upload ${image.name}:`, error);
      throw error;
    }
  }

  return results;
};

/**
 * Upload multiple images to Google Drive (legacy - for backward compatibility)
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

