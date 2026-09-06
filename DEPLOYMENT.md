# 🚀 ReachInbox Email Scheduler — Deployment Guide

This guide covers deploying the entire ReachInbox stack into production with high availability, database persistence, and background queue workers.

---

## 🌟 Recommended Production Architecture (Free & Easy)

| Component | Platform | Free Tier | Why |
| :--- | :--- | :--- | :--- |
| **Frontend** | [Vercel](https://vercel.com) | ✅ Free | Edge CDN, instant builds, automatic SSL |
| **Backend & Worker** | [Render](https://render.com) | ✅ Free | Node.js web service running Express + BullMQ worker |
| **PostgreSQL** | [Neon](https://neon.tech) or [Supabase](https://supabase.com) | ✅ Free | Serverless PostgreSQL with pooling & SSL |
| **Redis Queue** | [Upstash](https://upstash.com) or [Render Redis](https://render.com) | ✅ Free | Redis instance for BullMQ delayed queues & atomic locks |

---

## 📦 Step 1: Set Up Cloud Databases (PostgreSQL & Redis)

### A. PostgreSQL (Neon.tech or Supabase)
1. Sign up at [neon.tech](https://neon.tech).
2. Create a new project: `reachinbox`.
3. Copy the `DATABASE_URL` (Connection Details $\rightarrow$ `postgres://...sslmode=require`).

### B. Redis (Upstash or Redis Cloud)
1. Sign up at [upstash.com](https://upstash.com) or [redis.io/try-free](https://redis.io/try-free).
2. Create a standard Redis database: `reachinbox-redis`.
3. Copy the `REDIS_URL` (`rediss://default:xxxx@xxx.upstash.io:6379`).

---

## ⚙️ Step 2: Deploy Backend & Worker (Render.com)

1. Sign in to [Render](https://render.com) and click **New +** $\rightarrow$ **Web Service**.
2. Connect your GitHub repository: `lakshmeesh0309/reachinbox-scheduler`.
3. Configure the service:
   - **Name**: `reachinbox-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**:
     ```bash
     npm install && npm run build
     ```
   - **Start Command**:
     ```bash
     npm run db:push && npm start
     ```
4. Add **Environment Variables**:

| Variable | Value / Description |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | Your Neon/Supabase connection string (`postgres://...`) |
| `REDIS_URL` | Your Upstash/Redis connection string (`rediss://...`) |
| `JWT_SECRET` | Generate a 32+ character random string |
| `FRONTEND_URL` | Your Vercel frontend URL (e.g., `https://reachinbox-scheduler.vercel.app`) |
| `WORKER_CONCURRENCY` | `5` |
| `MIN_EMAIL_DELAY_MS` | `2000` |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `100` |
| `GOOGLE_CLIENT_ID` | *(Optional for OAuth)* Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | *(Optional for OAuth)* Google OAuth Client Secret |
| `GOOGLE_CALLBACK_URL` | `https://<YOUR-RENDER-BACKEND>.onrender.com/api/auth/google/callback` |
| `SLACK_CLIENT_ID` | *(Optional for Slack)* Slack Client ID |
| `SLACK_CLIENT_SECRET` | *(Optional for Slack)* Slack Client Secret |
| `SLACK_REDIRECT_URI` | `https://<YOUR-RENDER-BACKEND>.onrender.com/api/slack/callback` |

5. Click **Create Web Service**.
   - Render will build the backend, push the database schema (`db:push`), and launch both the Express API and BullMQ background worker.
   - Your API will be live at `https://<YOUR-BACKEND>.onrender.com`.
   - Your Bull Board queue dashboard will be live at `https://<YOUR-BACKEND>.onrender.com/admin/queues`.

---

## 🎨 Step 3: Deploy Frontend Dashboard (Vercel)

1. Sign in to [Vercel](https://vercel.com) and click **Add New...** $\rightarrow$ **Project**.
2. Import `lakshmeesh0309/reachinbox-scheduler`.
3. In **Project Settings**:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click `Edit` and select `frontend`.
4. Under **Environment Variables**, add:

| Name | Value |
| :--- | :--- |
| `VITE_API_URL` | `https://<YOUR-RENDER-BACKEND>.onrender.com` |

5. Click **Deploy**.
   - Vercel will bundle the React SPA and deploy it globally with automatic SSL.
   - The provided `frontend/vercel.json` ensures client-side routing (`/dashboard`, `/login`) works without 404 errors on page reload.

---

## 🔄 Step 4: Final Linkage

1. Copy your Vercel production URL (e.g. `https://reachinbox-scheduler.vercel.app`).
2. Open Render $\rightarrow$ `reachinbox-backend` $\rightarrow$ **Environment**.
3. Update `FRONTEND_URL` with your Vercel domain.
4. If using Google OAuth, add your Render callback URL (`https://<YOUR-BACKEND>.onrender.com/api/auth/google/callback`) to **Authorized Redirect URIs** in Google Cloud Console.

---

## 🛡️ Verification After Deployment

Once deployed:
1. Visit `https://<YOUR-BACKEND>.onrender.com/api/health` — Should return status `200 OK`.
2. Visit `https://<YOUR-BACKEND>.onrender.com/admin/queues` — View real-time BullMQ queues.
3. Open your Vercel URL — Compose and schedule delayed cold emails with real-time UI tracking.
