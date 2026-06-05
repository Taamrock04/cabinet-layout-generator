# Contributing

Thanks for working on the Cabinet Layout Generator. Before you start, read **[SKILL.md](SKILL.md)**
(architecture) and **[CLAUDE.md](CLAUDE.md)** (the non-negotiable rules). The single most important one:

> The tool never invents geometry, connectivity, or part data. Deterministic code draws; a human reviews in CAD.

If a change makes the output depend on a guess instead of validated input, it's wrong — flag the unknown
for confirmation instead.

## Prerequisites

- **Node.js 22+** (Vite 8 needs 20.19+/22.12+) and npm
- **Python 3.12+** (only for the DXF service)

## Setup

```bash
# editor — everything except DXF works with no backend
cd web
npm install
npm run dev            # → http://localhost:5180

# optional: the DXF upload/export service
cd service
python -m venv .venv
.venv\Scripts\activate          # Windows  ·  source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
uvicorn app:app --port 8000
```

See **[RUNNING.md](RUNNING.md)** for more detail and **[DEPLOY.md](DEPLOY.md)** for hosting.

## Checks (run before every PR)

From `web/`:

```bash
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm test              # vitest (the pure model/render core)
npm run build         # tsc -b && vite build
```

CI runs all four on every push and PR (see `.github/workflows/ci.yml`). Keep the build green.

The Python service has a manual verification harness, `service/test_build.py`, that assembles a DXF and
audits placement (it needs a sample equipment DXF locally — it is not part of CI).

## Coding conventions (from CLAUDE.md §5)

- **The JSON model is the source of truth.** Fabric.js is a view binding only — never read geometry back
  out of the canvas for export.
- **One renderer: `model → SVG`** feeds the preview *and* the PDF/PNG/SVG exports. DXF is the separate
  deterministic assembler. Don't add a second drawing path.
- **Keep the core pure and tested.** Re-flow, packing, bbox/rotation math and the coordinate transform
  live in `web/src/model/` with no Fabric/DOM dependency and have unit tests. New risky logic goes there.
- **Convert the coordinate origin in exactly one place** (editor top-left ↔ DXF bottom-left).
- **Validate, never silently coerce.** Bad input is flagged with a human-readable message.
- **Match the surrounding code** — naming, comment density, and idiom follow the file you're editing.

A feature is *done* only when it meets the checklist in **CLAUDE.md §7**.

## Commits & PRs

- **Conventional Commits**: `feat: …`, `fix: …`, `docs: …`, `refactor: …`, `test: …`, `chore: …`,
  with an optional scope, e.g. `feat(ducts): snap ducts to plate borders`.
- Keep commits scoped and logically separated.
- Branch off `main`; open a PR; make sure CI is green and the PR description explains the change and how
  you verified it.
- If you pair with an AI assistant, keep the co-author trailer on the commit:

  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

## Reporting bugs / requesting features

Use the issue templates. For anything security-related, follow **[SECURITY.md](SECURITY.md)** instead of
opening a public issue.
