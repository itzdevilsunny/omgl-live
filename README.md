# StrangerLink — WebRTC Video Chat App

An Omegle-style random video chat app built with Next.js, WebRTC, and Pusher for signaling. Deploy to Vercel in minutes.

## Features

- 🎥 **Random video matching** — connects you with a random stranger instantly
- 💬 **Live text chat** with typing indicators
- 🔇 **Mute / camera toggle** controls
- ⟳ **Skip** to next stranger without reloading
- 📱 **Responsive** — works on mobile and desktop
- 🔒 **No accounts** — fully anonymous, session-based IDs

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 + React |
| Video/Audio | WebRTC (browser native) |
| Signaling | Pusher Channels (free tier) |
| Hosting | Vercel |

---

## Setup Instructions

### 1. Get Pusher Credentials (Free)

1. Go to [pusher.com](https://pusher.com) and create a free account
2. Create a new **Channels** app
3. In app settings, note your: **App ID**, **Key**, **Secret**, **Cluster**
4. In the app's **App Settings**, enable **Client Events** ← important!

### 2. Local Development

```bash
# Clone / download project
cd omegle-webrtc

# Install dependencies
npm install

# Create environment file
cp .env.local.example .env.local
```

Edit `.env.local` with your Pusher credentials:

```env
PUSHER_APP_ID=1234567
PUSHER_SECRET=your_secret_here
NEXT_PUBLIC_PUSHER_KEY=your_key_here
NEXT_PUBLIC_PUSHER_CLUSTER=us2
```

```bash
# Run locally
npm run dev
# Open http://localhost:3000
```

### 3. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts, then add environment variables:
vercel env add PUSHER_APP_ID
vercel env add PUSHER_SECRET
vercel env add NEXT_PUBLIC_PUSHER_KEY
vercel env add NEXT_PUBLIC_PUSHER_CLUSTER

# Redeploy with env vars
vercel --prod
```

**Or use the Vercel Dashboard:**
1. Push code to GitHub
2. Import repo at [vercel.com/new](https://vercel.com/new)
3. Add the 4 environment variables in Project Settings → Environment Variables
4. Deploy!

---

## Architecture

```
User A (Browser)          Vercel Serverless          User B (Browser)
     |                         |                          |
     |── POST /api/join ──────>|                          |
     |                         |── POST /api/join ──────<─|
     |                         |                          |
     |         Pusher "matched" event to both users       |
     |<────────────────────────|──────────────────────────|
     |                         |                          |
     |── POST /api/room-hello ─|── Pusher "peer-hello" ──>|
     |<── Pusher "peer-hello" ─|                          |
     |                         |                          |
     |── POST /api/signal ─────|── Pusher "signal" ──────>| (offer)
     |<── Pusher "signal" ─────|── POST /api/signal ──────| (answer)
     |                         |                          |
     |<════════ Direct WebRTC P2P Connection ════════════>|
     |              (video/audio/chat)                    |
```

---

## Limitations & Scaling Notes

- **In-memory queue**: The matching queue is stored in memory in the serverless function. This works for demos but on Vercel, cold starts and multiple instances can cause missed matches. For production, replace with **Upstash Redis** or **Vercel KV**.
- **STUN only**: Uses Google's free STUN servers. For users behind symmetric NATs, add a **TURN server** (e.g. Twilio's free tier, Metered.ca, or self-host coturn).
- **Pusher free tier**: 200k messages/day, 100 concurrent connections — plenty for a side project.

### Adding Upstash Redis (for reliable matching at scale)

```bash
npm install @upstash/redis
```

Replace the in-memory `waitingUser` in `/api/join.js` with:

```js
import { Redis } from '@upstash/redis'
const redis = Redis.fromEnv()

// In handler:
const waiting = await redis.get('waiting-user')
if (waiting && waiting !== userId) {
  await redis.del('waiting-user')
  // ... match logic
} else {
  await redis.set('waiting-user', userId, { ex: 30 }) // 30s expiry
}
```

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| `PUSHER_APP_ID` | Pusher App ID (server-side only) |
| `PUSHER_SECRET` | Pusher Secret (server-side only) |
| `NEXT_PUBLIC_PUSHER_KEY` | Pusher Key (exposed to browser) |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Pusher cluster e.g. `us2`, `eu`, `ap2` |
