# ◈ TradeTrack Pro

Glassware & Ceramics outlet management app — built with React + Vite.

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Deploy to GitHub + Vercel (Recommended — Free)

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/tradetrack-pro.git
git push -u origin main
```

### Step 2: Deploy on Vercel
1. Go to https://vercel.com and sign in with GitHub
2. Click **"Add New Project"**
3. Import your `tradetrack-pro` repo
4. Leave all settings as default (Vite is auto-detected)
5. Click **Deploy** — your app will be live in ~1 minute!

## Deploy to GitHub Pages (Alternative)

Add this to `vite.config.js`:
```js
export default defineConfig({
  base: '/tradetrack-pro/',   // your repo name
  plugins: [react()],
})
```

Then run:
```bash
npm install --save-dev gh-pages
npm run build
npx gh-pages -d dist
```

## Notes
- Data is stored in **localStorage** — it stays on the user's browser
- To share data across devices, a backend/database would be needed
- The app is fully offline-capable once loaded
