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

## DigitalOcean

For a hackathon demo, the simplest DigitalOcean path is a single Droplet with Docker Compose:

1. Create an Ubuntu Droplet.
2. Install Docker Engine and the Docker Compose plugin.
3. Clone this repository onto the Droplet.
4. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`, then fill in your real values.
5. Run `docker compose up -d --build`.
6. Point your domain or subdomain at the Droplet IP.

If you prefer App Platform, this repo also includes `digitalocean-app.yaml` as a starting point for a two-service deployment using the existing Dockerfiles. Replace the placeholder GitHub repo and environment values before applying it.

Reference:

- https://docs.digitalocean.com/products/app-platform/reference/app-spec/

## License

MIT
