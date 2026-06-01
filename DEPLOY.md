# Deploying (Phase 1)

Two pieces:
- **`web/`** — Vite/React frontend → **Vercel** (static). Editor + PDF/PNG/SVG work with no backend.
- **`service/`** — Python ezdxf service → **Render** (free). Needed only for **DXF upload/export**.

You can deploy the frontend first and add the service later; only DXF is gated on it.

---

## 1. Push to GitHub
(One-time. Done from `C:\dev\cabinet-layout-generator`.)
```
git branch -M main
gh repo create cabinet-layout-generator --private --source=. --remote=origin --push
```

## 2. Frontend → Vercel
1. https://vercel.com → **Add New… → Project** → import the GitHub repo.
2. **Root Directory: `web`** (click Edit, choose `web`). Framework auto-detects **Vite**.
   - Build command `npm run build`, Output `dist` (auto-filled).
3. (Optional now, required for DXF) add an Environment Variable:
   - `VITE_DXF_SERVICE_URL = https://<your-render-service>.onrender.com`
4. **Deploy.** You get `https://<app>.vercel.app`. The editor + PDF/PNG/SVG work immediately.

> ⚠ **Vercel Hobby is non-commercial.** Fine for a prototype; for company use move the
> frontend to **Cloudflare Pages** (free + commercial-OK) at Phase 2.

## 3. Service → Render (enables DXF)
1. https://render.com → **New + → Web Service** → connect the repo.
2. **Root Directory: `service`**, Runtime **Python 3**.
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app:app --host 0.0.0.0 --port $PORT`
   - (or use the provided `service/render.yaml` via **New + → Blueprint**.)
3. Add env var `ALLOWED_ORIGINS = https://<app>.vercel.app` (your Vercel URL).
4. Deploy → you get `https://<svc>.onrender.com`. Check `…/health` returns `{"status":"ok"}`.
5. Back in **Vercel**, set `VITE_DXF_SERVICE_URL` to that URL and **redeploy** the frontend.

## 4. Verify
- Open the Vercel URL → place parts → **PDF/PNG/SVG** download.
- **Export DXF** → first call wakes Render (a few seconds) → `.dxf` downloads, opens in GstarCAD.
- **Upload equipment DXF** → confirm modal → part joins the library.

---

## Known Phase-1 limitations (resolved in Phase 2)
- **Render free sleeps** after ~15 min idle → the first DXF op is slow ("waking service"). In-browser exports are unaffected.
- **Uploaded blocks are stored on the service's local disk**, which is **ephemeral** on Render — uploaded parts' geometry is lost on restart/redeploy (re-upload needed). Phase 2 moves the block store to Supabase Storage.
- **No auth/persistence yet** — projects live in the browser session (use SVG/PNG/PDF/DXF export to save your work). Phase 2 adds Supabase auth + saved projects.
- Settle the final **domain before wiring OAuth** in Phase 2 (callbacks are per-domain).
