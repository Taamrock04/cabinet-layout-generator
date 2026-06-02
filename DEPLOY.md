# Deploying (Phase 1)

Two pieces:
- **`web/`** — Vite/React frontend → **Vercel** (static). Editor + PDF/PNG/SVG work with no backend.
- **`service/`** — Python ezdxf service → **Render** (free). Needed only for **DXF** upload/export.

Deploy the frontend first; only DXF is gated on the service. Order: **Vercel → Render → link them**.

---

## 0. Push to GitHub (one-time)
Already done for this repo (public): https://github.com/Taamrock04/cabinet-layout-generator
For a fresh copy:
```powershell
git branch -M main
gh repo create cabinet-layout-generator --public --source=. --remote=origin --push
```

## 1. Frontend → Vercel
1. **vercel.com** → log in with **GitHub**.
2. **Add New… → Project** → import **`cabinet-layout-generator`**.
3. ⚠️ **Critical setting:** **Root Directory** → **Edit** → choose **`web`**.
   Framework auto-detects **Vite** (build `npm run build`, output `dist`).
4. **Deploy** → you get `https://<app>.vercel.app`. The editor + **PDF/PNG/SVG** work right away.
   (DXF errors until step 2 — expected.) **Copy this URL.**

> ⚠ **Vercel Hobby is non-commercial.** Fine for a prototype/test; for company use move the
> frontend to **Cloudflare Pages** (free + commercial-OK) at Phase 2.

## 2. Service → Render (enables DXF)
1. **render.com** → log in with GitHub.
2. **New + → Blueprint** → pick the repo (reads `service/render.yaml`).
   *(Or **New + → Web Service** → Root Directory `service`, Build `pip install -r requirements.txt`,
   Start `uvicorn app:app --host 0.0.0.0 --port $PORT`.)*
3. Set env var **`ALLOWED_ORIGINS`** = your Vercel URL (e.g. `https://<app>.vercel.app`, no trailing slash).
4. **Create** → wait ~2–4 min → you get `https://<svc>.onrender.com`.
5. Verify: open **`https://<svc>.onrender.com/health`** → `{"status":"ok","ezdxf":"1.4.4"}`.
   *If the build fails on a dependency, add env var `PYTHON_VERSION = 3.13` and redeploy.*

## 3. Link them (in Vercel)
1. Vercel → project → **Settings → Environment Variables** → add
   **`VITE_DXF_SERVICE_URL`** = `https://<svc>.onrender.com`.
2. **Deployments** → ⋯ on the latest → **Redeploy** (env vars only apply to new builds).

## 4. Verify the live app
- Place parts → **PDF/PNG/SVG** download.
- **Export DXF** → first call wakes Render (~10–30 s) → `.dxf` downloads, opens in GstarCAD.
- **Upload equipment DXF** → confirm modal → part joins the library.

---

## Known Phase-1 limitations (resolved in Phase 2)
- **Render free sleeps** after ~15 min idle → the first DXF op is slow ("waking service"). In-browser exports unaffected.
- **Uploaded blocks live on the service's local disk**, which is **ephemeral** on Render — uploaded-part geometry is lost on restart/redeploy (re-upload needed). Phase 2 moves the store to Supabase Storage.
- **No auth/persistence yet** — projects live in the browser session; save your work via the SVG/PNG/PDF/DXF exports. Phase 2 adds Supabase auth + saved projects.
- Settle the final **domain before wiring OAuth** in Phase 2 (callbacks are per-domain).

See **RUNNING.md** for local development.
