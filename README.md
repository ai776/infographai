<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Reb6hIlNdax0yXckZhrSu8WNcf7eLhPL

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `VITE_GEMINI_API_KEY` environment variable:
   - Create a `.env.local` file in the root directory
   - Add: `VITE_GEMINI_API_KEY=your_gemini_api_key_here`
   - Get your API key from: https://ai.google.dev/gemini-api/docs/billing
3. Run the app:
   `npm run dev`

## Deploy to Vercel

1. Push your code to GitHub
2. Import your repository to Vercel
3. In Vercel project settings, add the environment variable:
   - **Name**: `VITE_GEMINI_API_KEY`
   - **Value**: Your Gemini API key
   - **Environment**: Production, Preview, Development (as needed)
4. Redeploy your application

The app will automatically use the environment variable if it's set in Vercel.

## Google Drive保存機能（オプション）

プレゼンテーション資料をGoogleドライブに直接保存する機能を使用するには、Google Cloud Consoleで設定が必要です。

### セットアップ手順

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
2. Google Drive APIを有効化
3. OAuth同意画面を設定
4. OAuth 2.0クライアントIDを作成（Webアプリケーション）
5. 承認済みのリダイレクトURIに以下を追加：
   - `http://localhost:3000` (ローカル開発用)
   - `https://your-vercel-domain.vercel.app` (本番環境用)
6. 環境変数を設定：
   - `VITE_GOOGLE_CLIENT_ID`: OAuth 2.0クライアントID
   - `VITE_GOOGLE_API_KEY`: APIキー（オプション、制限を設定する場合）

### 使用方法

1. プレゼンテーション資料を生成
2. 「Googleドライブに保存」ボタンをクリック
3. 初回はGoogleアカウントでログインを求められます
4. 保存先フォルダ: https://drive.google.com/drive/folders/1jHWaqo50qd68ko8fMoWtDbp7LQfG_0pA
