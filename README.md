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
