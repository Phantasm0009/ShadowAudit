create extension if not exists pgcrypto;

create table if not exists public.scans (
    id uuid primary key default gen_random_uuid(),
    project_name text,
    file_type text not null check (file_type in ('package.json', 'requirements.txt')),
    file_content text not null,
    overall_risk_score double precision not null default 0,
    created_at timestamptz not null default now(),
    dependency_graph jsonb not null default '{}'::jsonb
);

create table if not exists public.scan_packages (
    id uuid primary key default gen_random_uuid(),
    scan_id uuid not null references public.scans(id) on delete cascade,
    name text not null,
    version text not null,
    ecosystem text not null check (ecosystem in ('npm', 'pypi'))
);

create table if not exists public.vulnerabilities (
    id uuid primary key default gen_random_uuid(),
    scan_id uuid not null references public.scans(id) on delete cascade,
    package_name text not null,
    cve_id text not null,
    severity text not null,
    summary text not null,
    affected_versions jsonb not null default '[]'::jsonb
);

create table if not exists public.maintainer_risks (
    id uuid primary key default gen_random_uuid(),
    scan_id uuid not null references public.scans(id) on delete cascade,
    package_name text not null,
    risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
    reason text not null,
    last_owner_change timestamptz not null
);

create table if not exists public.typosquat_results (
    id uuid primary key default gen_random_uuid(),
    scan_id uuid not null references public.scans(id) on delete cascade,
    package_name text not null,
    similar_to text not null,
    similarity_score double precision not null,
    is_suspicious boolean not null default false
);

create table if not exists public.behavior_analyses (
    id uuid primary key default gen_random_uuid(),
    scan_id uuid not null references public.scans(id) on delete cascade,
    package_name text not null,
    risk_score double precision not null,
    flags jsonb not null default '[]'::jsonb,
    ai_summary text not null
);

create index if not exists idx_scans_created_at on public.scans (created_at desc);
create index if not exists idx_scan_packages_scan_id on public.scan_packages (scan_id);
create index if not exists idx_vulnerabilities_scan_id on public.vulnerabilities (scan_id);
create index if not exists idx_maintainer_risks_scan_id on public.maintainer_risks (scan_id);
create index if not exists idx_typosquat_results_scan_id on public.typosquat_results (scan_id);
create index if not exists idx_behavior_analyses_scan_id on public.behavior_analyses (scan_id);
