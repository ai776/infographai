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
      console.log('Google API already loaded');
      resolve();
      return;
    }

    console.log('Loading Google API script...');
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      console.log('Google API script loaded, checking gapi object...');
      
      // gapiオブジェクトが正しく読み込まれたか確認
      if (!(window as any).gapi) {
        reject(new Error('Google APIオブジェクトが見つかりません。スクリプトの読み込みに失敗した可能性があります。'));
        return;
      }

      console.log('gapi object found, initializing client:auth2...');
      
      try {
        // gapi.loadの正しい使用方法：コールバック関数を直接渡す
        (window as any).gapi.load('client:auth2', (error: any) => {
          if (error) {
            console.error('Error in gapi.load callback:', error);
            reject(new Error('Google API client:auth2の読み込みに失敗しました: ' + (error?.message || '不明なエラー')));
            return;
          }
          console.log('Google API client:auth2 loaded successfully');
          resolve();
        });
      } catch (error: any) {
        console.error('Error in gapi.load:', error);
        reject(new Error('Google APIの初期化に失敗しました: ' + (error?.message || '不明なエラー')));
      }
    };

    script.onerror = (error) => {
      console.error('Error loading Google API script:', error);
      reject(new Error('Google APIスクリプトの読み込みに失敗しました。ネットワーク接続を確認してください。'));
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

  console.log('Initializing Google client with:', {
    hasClientId: !!GOOGLE_CLIENT_ID,
    clientIdLength: GOOGLE_CLIENT_ID.length,
    hasApiKey: !!GOOGLE_API_KEY,
    scopes: SCOPES
  });

  try {
    // gapi.clientが利用可能か確認
    if (!(window as any).gapi || !(window as any).gapi.client) {
      throw new Error('Google APIが正しく読み込まれていません。ページを再読み込みしてください。');
    }

    const initConfig: any = {
      clientId: GOOGLE_CLIENT_ID,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
      scope: SCOPES
    };

    // APIキーはオプション（設定されている場合のみ追加）
    if (GOOGLE_API_KEY) {
      initConfig.apiKey = GOOGLE_API_KEY;
    }

    console.log('Calling gapi.client.init with config:', {
      ...initConfig,
      clientId: initConfig.clientId.substring(0, 20) + '...' // セキュリティのため一部のみ表示
    });

    await (window as any).gapi.client.init(initConfig);
    console.log('Google client initialized successfully');
  } catch (error: any) {
    console.error('Google client initialization error details:', {
      error,
      message: error?.message,
      errorCode: error?.error,
      errorDetails: error?.details,
      stack: error?.stack,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    });

    // より詳細なエラーメッセージを提供
    let errorMessage = 'Google APIの初期化に失敗しました';
    
    if (error?.error) {
      errorMessage += `: ${error.error}`;
    } else if (error?.message) {
      errorMessage += `: ${error.message}`;
    } else {
      errorMessage += ': 不明なエラー';
    }

    // よくある問題に対する具体的なアドバイス
    if (error?.message?.includes('invalid_client') || error?.error === 'invalid_client') {
      errorMessage += '\n\n原因: Google Client IDが無効です。Vercelの環境変数VITE_GOOGLE_CLIENT_IDを確認してください。';
    } else if (error?.message?.includes('unauthorized_client') || error?.error === 'unauthorized_client') {
      errorMessage += '\n\n原因: OAuth同意画面が正しく設定されていません。Google Cloud ConsoleでOAuth同意画面を確認してください。';
    } else if (error?.message?.includes('redirect_uri_mismatch') || error?.error === 'redirect_uri_mismatch') {
      errorMessage += '\n\n原因: リダイレクトURIが一致しません。Google Cloud Consoleで承認済みのリダイレクトURIを確認してください。';
    }

    throw new Error(errorMessage);
  }
};

/**
 * Sign in to Google
 */
export const signInToGoogle = async (): Promise<boolean> => {
  try {
    console.log('Starting Google sign-in process...');

    if (!GOOGLE_CLIENT_ID) {
      const errorMsg = 'Google Client IDが設定されていません。環境変数VITE_GOOGLE_CLIENT_IDを設定してください。';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    console.log('Google Client ID found');

    await loadGoogleAPI();
    console.log('Google API loaded');

    await initGoogleClient();
    console.log('Google client initialized');

    const authInstance = (window as any).gapi.auth2.getAuthInstance();
    if (!authInstance) {
      throw new Error('認証インスタンスの取得に失敗しました。ページを再読み込みしてください。');
    }

    const isSignedIn = authInstance.isSignedIn.get();
    console.log('Current sign-in status:', isSignedIn);

    if (!isSignedIn) {
      console.log('Attempting to sign in...');
      try {
        const signInResult = await authInstance.signIn({
          prompt: 'consent' // 常に同意画面を表示
        });
        console.log('Sign-in completed:', signInResult);
      } catch (signInError: any) {
        console.error('Sign-in attempt error:', signInError);
        if (signInError?.error === 'popup_closed_by_user') {
          throw new Error('ログインポップアップが閉じられました。再度お試しください。');
        }
        if (signInError?.error === 'access_denied') {
          throw new Error('アクセスが拒否されました。権限を許可してください。');
        }
        throw signInError;
      }
    }

    const finalStatus = authInstance.isSignedIn.get();
    console.log('Final sign-in status:', finalStatus);
    return finalStatus;
  } catch (error: any) {
    console.error('Google sign-in error details:', {
      error,
      message: error?.message,
      errorCode: error?.error,
      errorDetails: error?.details,
      errorType: error?.type,
      fullError: JSON.stringify(error, null, 2)
    });

    // エラーの種類に応じたメッセージ
    if (error?.error === 'popup_closed_by_user') {
      throw new Error('ログインポップアップが閉じられました。再度お試しください。');
    }
    if (error?.error === 'access_denied') {
      throw new Error('アクセスが拒否されました。権限を許可してください。');
    }
    if (error?.error === 'idpiframe_initialization_failed') {
      throw new Error('Google認証の初期化に失敗しました。ブラウザのポップアップブロッカーを無効にしてください。');
    }
    if (error?.error === 'popup_blocked') {
      throw new Error('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
    }
    if (error?.message) {
      // より詳細なエラーメッセージを提供
      if (error.message.includes('400')) {
        throw new Error('OAuth設定に問題があります。Google Cloud Consoleで以下を確認してください：\n1. OAuth同意画面が公開されているか\n2. リダイレクトURIが正しく設定されているか\n3. テストユーザーに自分のアカウントが追加されているか');
      }
      throw error;
    }
    throw new Error(`ログインに失敗しました: ${error?.toString() || '不明なエラー'}\n\n詳細: ${JSON.stringify(error, null, 2)}`);
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
    console.log('Creating folder:', folderName, 'in parent:', parentFolderId);

    if (!GOOGLE_CLIENT_ID) {
      const errorMsg = 'Google Client IDが設定されていません。環境変数VITE_GOOGLE_CLIENT_IDを設定してください。';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    await loadGoogleAPI();
    await initGoogleClient();

    const authInstance = (window as any).gapi.auth2.getAuthInstance();
    if (!authInstance) {
      throw new Error('認証インスタンスの取得に失敗しました。');
    }

    if (!authInstance.isSignedIn.get()) {
      console.log('Not signed in, attempting sign-in...');
      await signInToGoogle();
    }

    const user = authInstance.currentUser.get();
    const authResponse = user.getAuthResponse();

    if (!authResponse || !authResponse.access_token) {
      throw new Error('アクセストークンの取得に失敗しました。再度ログインしてください。');
    }

    const accessToken = authResponse.access_token;
    console.log('Access token obtained');

    const folderMetadata: any = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };

    if (parentFolderId) {
      folderMetadata.parents = [parentFolderId];
    }

    console.log('Sending folder creation request:', folderMetadata);

    const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(folderMetadata)
    });

    console.log('Folder creation response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Folder creation error response text:', errorText);

      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: { message: errorText || 'フォルダ作成に失敗しました' } };
      }

      console.error('Folder creation error response:', error);

      if (response.status === 403) {
        throw new Error('フォルダ作成の権限がありません。Googleドライブのアクセス権限を確認してください。');
      }
      if (response.status === 401) {
        throw new Error('認証に失敗しました。再度ログインしてください。');
      }

      throw new Error(error.error?.message || `フォルダ作成に失敗しました (HTTP ${response.status})`);
    }

    const result = await response.json();
    console.log('Folder created successfully:', result);
    return result.id;
  } catch (error: any) {
    console.error('Folder creation error details:', {
      error,
      message: error?.message,
      stack: error?.stack
    });

    if (error.message) {
      throw error;
    }
    throw new Error('フォルダ作成に失敗しました: ' + (error?.toString() || '不明なエラー'));
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
    console.log('Uploading image:', fileName, 'to folder:', folderId);

    if (!GOOGLE_CLIENT_ID) {
      const errorMsg = 'Google Client IDが設定されていません。環境変数VITE_GOOGLE_CLIENT_IDを設定してください。';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    await loadGoogleAPI();
    await initGoogleClient();

    const authInstance = (window as any).gapi.auth2.getAuthInstance();
    if (!authInstance) {
      throw new Error('認証インスタンスの取得に失敗しました。');
    }

    if (!authInstance.isSignedIn.get()) {
      console.log('Not signed in, attempting sign-in...');
      await signInToGoogle();
    }

    const user = authInstance.currentUser.get();
    const authResponse = user.getAuthResponse();

    if (!authResponse || !authResponse.access_token) {
      throw new Error('アクセストークンの取得に失敗しました。再度ログインしてください。');
    }

    const accessToken = authResponse.access_token;
    console.log('Access token obtained for upload');

    const blob = base64ToBlob(imageDataUrl);
    console.log('Blob created, size:', blob.size);

    const metadata = {
      name: fileName,
      parents: [folderId]
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    console.log('Sending upload request...');
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: form
    });

    console.log('Upload response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload error response text:', errorText);

      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: { message: errorText || 'アップロードに失敗しました' } };
      }

      console.error('Upload error response:', error);

      if (response.status === 403) {
        throw new Error('アップロードの権限がありません。Googleドライブのアクセス権限を確認してください。');
      }
      if (response.status === 401) {
        throw new Error('認証に失敗しました。再度ログインしてください。');
      }
      if (response.status === 404) {
        throw new Error('フォルダが見つかりません。フォルダIDを確認してください。');
      }

      throw new Error(error.error?.message || `アップロードに失敗しました (HTTP ${response.status})`);
    }

    const result = await response.json();
    console.log('Upload successful:', result);
    return `https://drive.google.com/file/d/${result.id}/view`;
  } catch (error: any) {
    console.error('Upload error details:', {
      error,
      message: error?.message,
      stack: error?.stack,
      fileName
    });

    if (error.message) {
      throw error;
    }
    throw new Error('アップロードに失敗しました: ' + (error?.toString() || '不明なエラー'));
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

