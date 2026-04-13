# ShadowAudit

ShadowAudit is a supply chain security scanner for npm and PyPI projects. It combines CVE checks, maintainer-risk heuristics, typosquat detection, AI-assisted package review, a dependency graph, a web dashboard, and a terminal CLI.

## Stack

- Backend: FastAPI, Python 3.11, Supabase
- Frontend: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, D3
- CLI: Node.js, TypeScript

## Core Capabilities

- Manifest parsing for `package.json` and `requirements.txt`
- Dependency tree resolution with package metadata
- Vulnerability scanning through OSV
- Maintainer change detection for npm and PyPI packages
- Typosquat detection against popular package lists
- AI behavior analysis for higher-risk packages
- Dashboard, scan history, and interactive dependency graph
- CLI access for terminal-based scans

## Repository Layout

```text
backend/   FastAPI API, scanners, tests, database layer
frontend/  Next.js app, dashboard, results UI, graph
cli/       Terminal scanner
```

## Environment Files

- `backend/.env.example`
- `frontend/.env.example`

Create local `.env` files from those examples before running or deploying the app. Do not commit real secrets.

Reference:

- https://docs.digitalocean.com/products/app-platform/reference/app-spec/

## License

MIT
