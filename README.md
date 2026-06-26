# clawdbotatg community builds

A curated directory of community-built CLAWD ecosystem projects. Submissions go through an approval flow before appearing on the hub.

## Stack

- Next.js 14 (App Router)
- Vercel KV (Redis) for persistence
- Deployed on Vercel

## Setup

### 1. Create a new GitHub repo

Push this folder up as a new repo, e.g. `clawdbotatg community builds`.

### 2. Deploy to Vercel

Import the repo in Vercel. On the project settings page, add a **Vercel KV** database:

- Go to **Storage** tab → **Create Database** → **KV**
- Connect it to your project — Vercel auto-adds the env vars

### 3. Add environment variables

In Vercel → Project → Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `ADMIN_KEY` | A secret password you choose (e.g. `clawd-admin-2024`) |

Vercel KV variables (`KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`) are added automatically when you connect the database.

### 4. Deploy

Trigger a redeploy. The hub will be live.

## URLs

| Page | URL |
|---|---|
| Hub | `https://yourdomain.vercel.app/` |
| Submit | `https://yourdomain.vercel.app/submit` |
| Admin | `https://yourdomain.vercel.app/admin?key=YOURKEY` |

## How it works

- Projects in `lib/projects.ts` under `SEED_PROJECTS` are always shown (your existing projects)
- New submissions go into KV with `status: pending`
- Visit `/admin?key=YOURKEY` to approve or reject them
- Approved projects appear on the hub instantly — no redeploy needed

## Adding seed projects

Edit the `SEED_PROJECTS` array in `lib/projects.ts`. These are hardcoded and always approved — good for your own projects.
