"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Boxes,
  Gauge,
  PackageSearch,
  ShieldAlert,
} from "lucide-react";

import { ScanHistoryTable } from "@/components/dashboard/ScanHistoryTable";
import { ErrorAlert } from "@/components/shared/ErrorAlert";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { api } from "@/lib/api";
import { buildDashboardTrends } from "@/lib/dashboardUtils";
import { normalizeError } from "@/lib/errors";
import { DashboardStats, RecentScanSummary } from "@/lib/types";

interface DashboardPayload {
  scans: RecentScanSummary[];
  stats: DashboardStats;
}

function DashboardLoadingSkeleton() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-12">
      <div className="animate-pulse space-y-8">
        <div className="space-y-3">
          <div className="h-4 w-44 rounded-full bg-white/10" />
          <div className="h-12 max-w-3xl rounded-full bg-white/10" />
          <div className="h-5 max-w-2xl rounded-full bg-white/5" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-40 rounded-3xl border border-white/10 bg-slate-950/70"
            />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.65fr_0.95fr]">
          <div className="h-[540px] rounded-3xl border border-white/10 bg-slate-950/70" />
          <div className="space-y-6">
            <div className="h-64 rounded-3xl border border-white/10 bg-slate-950/70" />
            <div className="h-64 rounded-3xl border border-white/10 bg-slate-950/70" />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { isOnline, hasMounted } = useNetworkStatus();
  const isOffline = hasMounted && !isOnline;
  const { data, error, isPending, refetch } = useQuery<DashboardPayload, Error>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [scansResponse, statsResponse] = await Promise.all([
        api.get<RecentScanSummary[]>("/api/v1/scans"),
        api.get<DashboardStats>("/api/v1/stats"),
      ]);

      return {
        scans: scansResponse.data,
        stats: statsResponse.data,
      };
    },
  });

  if (isPending) {
    return <DashboardLoadingSkeleton />;
  }

  const normalizedError = error
    ? normalizeError(error, "ShadowAudit could not load dashboard data.")
    : null;

  if (normalizedError && isOffline && !data) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-16">
        <ErrorAlert
          title="Offline"
          message="Reconnect to load scan history and aggregate analytics."
        />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-16">
        <ErrorAlert
          title={
            normalizedError?.type === "network_offline"
              ? "Offline"
              : "Unable to load dashboard"
          }
          message={
            normalizedError?.type === "network_offline"
              ? "Reconnect to load scan history and aggregate analytics."
              : normalizedError?.message ??
                "ShadowAudit could not load scan history or aggregate statistics."
          }
          retryLabel="Retry"
          onRetry={() => {
            void refetch();
          }}
        />
      </section>
    );
  }

  const { scans, stats } = data;
  const trends = buildDashboardTrends(
    scans,
    stats.critical_findings_count,
    stats.packages_analyzed,
  );

  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-12">
      <div className="space-y-8">
        <div className="space-y-5">
          <Badge className="border-sky-500/25 bg-sky-500/10 font-mono text-sky-100 hover:bg-sky-500/10">
            <Activity className="mr-1.5 size-3.5" />
            Security telemetry
          </Badge>

          <div className="space-y-3">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              See scan history, platform-wide drift, and the packages that keep
              surfacing at the top of your risk queue.
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-slate-400">
              The dashboard rolls up recent ShadowAudit activity into a compact
              analyst view so you can watch risk scores trend over time instead
              of reviewing scans one by one.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            icon={Gauge}
            label="Total Scans"
            value={stats.total_scans.toLocaleString("en-US")}
            trend={trends.totalScans}
          />
          <StatsCard
            icon={ShieldAlert}
            label="Average Risk Score"
            value={stats.avg_risk_score.toFixed(2)}
            trend={trends.avgRisk}
          />
          <StatsCard
            icon={AlertTriangle}
            label="Critical Findings"
            value={stats.critical_findings_count.toLocaleString("en-US")}
            trend={trends.criticalFindings}
          />
          <StatsCard
            icon={Boxes}
            label="Packages Analyzed"
            value={stats.packages_analyzed.toLocaleString("en-US")}
            trend={trends.packagesAnalyzed}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.65fr_0.95fr]">
          <ScanHistoryTable scans={scans} />

          <div className="space-y-6">
            <Card className="border border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-white">
                  Most Vulnerable Packages
                </CardTitle>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Packages appearing most often in the riskiest scans across the
                  recent dataset.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.most_risky_packages.length > 0 ? (
                  stats.most_risky_packages.map((pkg, index) => (
                    <div
                      key={pkg.package_name}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-white">
                          {index + 1}. {pkg.package_name}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          Seen in {pkg.scan_count} scans
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-rose-500/30 bg-rose-500/10 text-rose-100"
                      >
                        {pkg.avg_risk_score.toFixed(2)}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-8 text-center text-sm text-slate-400">
                    No risky package patterns yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <PackageSearch className="size-5 text-sky-300" />
                  Common CVEs
                </CardTitle>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  The most frequently detected vulnerabilities across your recent scans.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.most_common_vulns.length > 0 ? (
                  stats.most_common_vulns.map((item) => (
                    <a
                      key={item.cve_id}
                      href={`https://nvd.nist.gov/vuln/detail/${item.cve_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 transition hover:border-sky-400/30 hover:bg-slate-900"
                    >
                      <div>
                        <p className="font-mono text-sm text-sky-200">
                          {item.cve_id}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          Detected in {item.count} scans
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-white/10 bg-white/5 text-slate-200"
                      >
                        {item.count}x
                      </Badge>
                    </a>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-8 text-center text-sm text-slate-400">
                    No recurring CVEs recorded yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
