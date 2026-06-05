# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, report privately via GitHub's
**[Report a vulnerability](https://github.com/Taamrock04/cabinet-layout-generator/security/advisories/new)**
(Security → Advisories), or email the maintainer at **nat.kati.04@gmail.com**.

Include enough detail to reproduce (affected component, steps, impact). You can expect an initial
response within a few days. Please give a reasonable window to fix before any public disclosure.

## Scope & threat model

This is a manual-first drawing tool. A few properties are security-relevant:

- **The ezdxf service is not an open endpoint.** It validates an auth token and restricts CORS to the
  configured origins (`ALLOWED_ORIGINS`). It is stateless and is touched only on DXF upload/export.
- **No secrets in the repo.** `.env` files are git-ignored; only `.env.example` is committed. Never
  commit API keys, service keys, or tokens. Configure `VITE_DXF_SERVICE_URL` (web) and
  `ALLOWED_ORIGINS` (service) through your host's environment settings.
- **Untrusted DXF uploads** are parsed server-side by ezdxf. Treat uploaded files as untrusted input;
  the service measures/normalizes geometry and does not execute file content.
- **AI is off.** When the AI socket is eventually enabled it must route through a server-side proxy with
  the key in an env var — never shipped to the browser (see `CLAUDE.md §1`).

## Supported versions

The project is pre-1.0; only the latest `main` is supported. Fixes land on `main`.
