# Running locally

The app is **two pieces**. You run them in **two terminals**:

| Terminal | What | Needed for |
|----------|------|-----------|
| 1 | `web/` — the Vite/React editor | always |
| 2 | `service/` — the Python ezdxf service | only for **DXF** upload/export |

The editor, drag/drop, and **PDF / PNG / SVG** exports work with **just Terminal 1**.

---

## Run it

### Terminal 1 — the editor (always)
```powershell
cd C:\dev\cabinet-layout-generator\web
npm run dev
```
Open **http://localhost:5173**.

### Terminal 2 — the ezdxf service (only for DXF)
```powershell
cd C:\dev\cabinet-layout-generator\service
.\.venv\Scripts\python.exe -m uvicorn app:app --port 8000
```
Leave it running. The frontend talks to it at `127.0.0.1:8000` by default — no config needed locally.

Stop either server with **Ctrl + C**.

---

## First-time setup
Only needed on a fresh clone (when `node_modules` / `.venv` don't exist yet).

```powershell
# web
cd C:\dev\cabinet-layout-generator\web
npm install

# service
cd C:\dev\cabinet-layout-generator\service
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Requirements: **Node 18+** (tested on 22) and **Python 3.11+** (tested on 3.14, via the `py` launcher).

---

## Useful commands (from `web/`)
```powershell
npm test          # run the unit tests (vitest)
npm run typecheck # tsc type-check, no emit
npm run build     # production build into web/dist
npm run preview   # serve the production build locally
```

---

## Troubleshooting

**"Port already in use" / the dev server won't start**
A previous run is still holding the port. Close that terminal, or kill it:
```powershell
# web (5173)
Get-NetTCPConnection -LocalPort 5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
# service (8000)
Get-NetTCPConnection -LocalPort 8000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**"Export DXF" fails with "Failed to fetch"**
Terminal 2 (the service) isn't running, or isn't on port 8000. Start it and check
**http://127.0.0.1:8000/health** returns `{"status":"ok",...}`.

**Uploaded parts disappear after restarting the service**
Expected for now — uploaded blocks are kept on the service's local disk (`service/_blocks/`,
git-ignored) and aren't persisted long-term. Re-upload after a restart. (Phase 2 moves this to Supabase.)
