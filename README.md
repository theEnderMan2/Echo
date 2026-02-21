# Echo. — PWA

Live call transcription with on-device AI summaries.
No app store. No API key. Completely free.

---

## What's in this folder

```
echo-pwa/
├── index.html       ← App shell (3-tab mobile UI)
├── app.css          ← Mobile-first styles with iOS safe areas
├── app.js           ← All logic + Transformers.js summarization
├── sw.js            ← Service worker (offline support)
├── manifest.json    ← PWA manifest (icons, name, display mode)
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-180.png ← Used by iOS for home screen icon
    ├── icon-167.png
    └── icon-152.png
```

---

## How to deploy (free, 2 minutes)

### Option A — Netlify Drop (easiest)

1. Go to **https://app.netlify.com/drop**
2. Drag the entire `echo-pwa` folder onto the page
3. Netlify gives you a free `https://xxxx.netlify.app` URL instantly
4. Done — share that URL with anyone

### Option B — GitHub Pages

1. Create a new GitHub repo (can be private)
2. Push all files to the `main` branch
3. Go to Settings → Pages → Source: main branch / root
4. Your app is live at `https://yourusername.github.io/your-repo-name`

### Option C — Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` inside the `echo-pwa` folder
3. Follow the prompts — free HTTPS URL in ~30 seconds

---

## Installing on iPhone

1. Open the deployed URL in **Safari** (must be Safari, not Chrome)
2. Tap the **Share** button (box with arrow pointing up)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **Add**
5. Echo appears on your home screen with the blue icon
6. Tap it — it opens full screen, no browser UI

---

## First-time AI model download

The first time you tap **Summarize**, Echo downloads the AI model
(Xenova/distilbart-cnn-12-6, ~50 MB) from the internet.
A progress bar shows the download. After that it's cached — works offline.

---

## Permissions Echo needs

- **Microphone** — for recording. iOS will show a standard permission dialog.
  If denied: Settings → Safari → Microphone → Allow.

---

## Known iOS limitations

| Limitation | Workaround |
|---|---|
| Mic pauses when screen locks | Set Auto-Lock to "Never" during calls |
| Speech recognition needs internet | Use Wi-Fi or cellular during recording |
| AI summarization needs internet on first run | After first download, works offline |

---

## Running locally (optional)

You need a local HTTPS server — `file://` won't work for PWAs.

```bash
# If you have Python:
cd echo-pwa
python3 -m http.server 8080
# Open http://localhost:8080 in browser
# Note: PWA install only works on real HTTPS (Netlify/GitHub Pages)
```

---

## Tech stack

- Vanilla HTML / CSS / JavaScript — zero dependencies, zero build step
- Web Speech API (Safari's speech-to-text, powered by Apple's engine)
- Transformers.js — runs `Xenova/distilbart-cnn-12-6` in the browser via WASM
- Service Worker — caches app shell for offline use
- localStorage — stores sessions on device

---

Built with Echo. by Claude.
