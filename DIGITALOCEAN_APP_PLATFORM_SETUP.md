# Deploying ShadowAudit on DigitalOcean App Platform

This guide shows how to deploy **ShadowAudit** on **DigitalOcean App Platform** using the current repository layout.

ShadowAudit is a monorepo with:

- `backend/` for the FastAPI API
- `frontend/` for the Next.js app

Because the app is not stored at the repo root, **auto-detect may show "No components detected"**. That is expected. The fix is to either:

1. deploy with the included `digitalocean-app.yaml` app spec, or
2. create the backend and frontend services manually and set their source directories.

## Recommended Option: Use the Included App Spec

The repository already includes:

- `digitalocean-app.yaml`

That file is set up for:

- backend service name: `backend`
- frontend service name: `frontend`
- backend route prefix: `/api`
- internal frontend-to-backend routing with `http://backend:8000`

## Before You Start

Make sure the latest code is pushed to GitHub:

```bash
git add .
git commit -m "Prepare DigitalOcean deployment"
git push origin main
```

Make sure your repo is:

- `Phantasm0009/ShadowAudit`
- branch: `main`

## Required Environment Variables

### Backend

Set these on the backend service:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `OPENAI_API_KEY`
- `OSV_API_URL`

Recommended value:

```text
OSV_API_URL=https://api.osv.dev/v1/query
```

### Frontend

Set these on the frontend service:

- `NEXT_PUBLIC_API_URL`
- `BACKEND_INTERNAL_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Recommended values:

```text
NEXT_PUBLIC_API_URL=/api
BACKEND_INTERNAL_URL=http://backend:8000
```

## Option A: Deploy with `digitalocean-app.yaml`

### Step 1. Open App Platform

In DigitalOcean:

1. Go to **Apps**
2. Click **Create App**
3. Choose **GitHub**
4. Select:
   - Repository: `Phantasm0009/ShadowAudit`
   - Branch: `main`

### Step 2. Use the App Spec

When App Platform asks how to configure the app, choose the option to **upload or edit an App Spec** and use the repository file:

```text
digitalocean-app.yaml
```

If the UI does not automatically load the file, copy the contents of `digitalocean-app.yaml` into the spec editor.

### Step 3. Replace Placeholder Secrets

In the generated app config, replace placeholder values with your real credentials:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Do not leave placeholder values in place.

### Step 4. Review Components

You should end up with:

- `backend`
  - source directory: `backend`
  - dockerfile: `backend/Dockerfile`
  - public HTTP port: `8000`
  - health check path: `/health`
- `frontend`
  - source directory: `frontend`
  - dockerfile: `frontend/Dockerfile`
  - public HTTP port: `3000`

### Step 5. Deploy

Click **Create Resources** or **Deploy**.

After deployment:

- the frontend should be publicly accessible
- `/api/*` requests should route to the backend
- the frontend should call the backend through `/api`

## Option B: Manual App Platform Setup

Use this if you do not want to use the app spec.

### Step 1. Create the Backend Service

Create a **Web Service** with:

- Repository: `Phantasm0009/ShadowAudit`
- Branch: `main`
- Source directory: `backend`
- Dockerfile path: `backend/Dockerfile`

If DigitalOcean treats Dockerfile paths as relative to the source directory, use:

```text
Dockerfile
```

Backend settings:

- HTTP Port: `8000`
- Health check path: `/health`

Backend environment variables:

```text
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
OPENAI_API_KEY=your-openai-api-key
OSV_API_URL=https://api.osv.dev/v1/query
```

### Step 2. Create the Frontend Service

Add a second **Web Service** with:

- Repository: `Phantasm0009/ShadowAudit`
- Branch: `main`
- Source directory: `frontend`
- Dockerfile path: `frontend/Dockerfile`

If Dockerfile paths are relative to the source directory, use:

```text
Dockerfile
```

Frontend settings:

- HTTP Port: `3000`

Frontend environment variables:

```text
NEXT_PUBLIC_API_URL=/api
BACKEND_INTERNAL_URL=http://backend:8000
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Step 3. Configure Routing

Make sure:

- the frontend is publicly reachable at `/`
- `/api` routes are sent to the backend

If the App Platform UI supports route rules, configure:

- `/api` -> backend
- `/` -> frontend

If you use the included app spec, this routing is already defined.

## Custom Domain

After deployment:

1. Open the app in DigitalOcean
2. Go to **Settings** or **Domains**
3. Add your domain or subdomain
4. Point the DNS record to the App Platform target DigitalOcean gives you

DigitalOcean will provision HTTPS automatically after the domain is verified.

## Updating the App

If **Autodeploy** is enabled:

- every push to `main` will trigger a redeploy

If it is disabled:

- push your code
- open the app in DigitalOcean
- trigger a redeploy manually

## Troubleshooting

### "No components detected"

This usually means App Platform is scanning the repo root and not finding build files there.

Use:

- source directory `backend` for the API
- source directory `frontend` for the web app

### Frontend loads, but API calls fail

Check:

- `NEXT_PUBLIC_API_URL=/api`
- `BACKEND_INTERNAL_URL=http://backend:8000`
- `/api` is routed to the backend
- backend service name is exactly `backend`

### Backend deploys, but health checks fail

Check:

- backend HTTP port is `8000`
- health check path is `/health`
- `backend/Dockerfile` starts `uvicorn` on `0.0.0.0:8000`

### Build succeeds, but frontend cannot reach backend

Confirm the frontend service can call the backend over DigitalOcean internal networking:

```text
http://backend:8000
```

This works because App Platform services can communicate internally by service name.

## Files Used by This Deployment

- `digitalocean-app.yaml`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `backend/.env.example`
- `frontend/.env.example`

## Useful References

- App Platform App Spec:
  - https://docs.digitalocean.com/products/app-platform/reference/app-spec/
- Internal service routing:
  - https://docs.digitalocean.com/products/app-platform/how-to/manage-internal-routing/

