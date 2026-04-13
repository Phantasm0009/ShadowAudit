"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";

import { ErrorAlert } from "@/components/shared/ErrorAlert";
import { BehaviorPanel } from "@/components/results/BehaviorPanel";
import { DependencyGraph } from "@/components/results/DependencyGraph";
import { MaintainerPanel } from "@/components/results/MaintainerPanel";
import { RiskScoreHeader } from "@/components/results/RiskScoreHeader";
import { TyposquatPanel } from "@/components/results/TyposquatPanel";
import { VulnerabilityPanel } from "@/components/results/VulnerabilityPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { api } from "@/lib/api";
import { normalizeError, isNotFoundError } from "@/lib/errors";
import { ScanResult } from "@/lib/types";

function ResultsLoadingSkeleton() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className="animate-pulse space-y-8" data-testid="results-loading-skeleton">
        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
          <div className="grid gap-8 lg:grid-cols-[260px_1fr] lg:items-center">
            <div className="mx-auto size-60 rounded-full border border-white/10 bg-white/5" />
            <div className="space-y-4">
              <div className="h-4 w-40 rounded-full bg-white/10" />
              <div className="h-10 max-w-2xl rounded-full bg-white/10" />
              <div className="h-5 max-w-3xl rounded-full bg-white/5" />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="h-24 rounded-2xl bg-white/5" />
                <div className="h-24 rounded-2xl bg-white/5" />
                <div className="h-24 rounded-2xl bg-white/5" />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
          <div className="mb-6 flex gap-3">
            <div className="h-11 w-40 rounded-full bg-white/10" />
            <div className="h-11 w-40 rounded-full bg-white/5" />
            <div className="h-11 w-40 rounded-full bg-white/5" />
            <div className="h-11 w-40 rounded-full bg-white/5" />
            <div className="h-11 w-40 rounded-full bg-white/5" />
          </div>
          <div className="h-[420px] rounded-3xl bg-white/[0.04]" />
        </div>
      </div>
    </section>
  );
}

export default function ScanResultPage() {
  const params = useParams<{ scanId: string }>();
  const scanId = Array.isArray(params.scanId) ? params.scanId[0] : params.scanId;
  const { isOnline, hasMounted } = useNetworkStatus();
  const isOffline = hasMounted && !isOnline;

  const { data, error, isPending, refetch } = useQuery<ScanResult, Error>({
    queryKey: ["scan-result", scanId],
    queryFn: async () => {
      const response = await api.get<ScanResult>(`/api/v1/scan/${scanId}`);
      return response.data;
    },
    enabled: Boolean(scanId),
  });

  if (isPending) {
    return <ResultsLoadingSkeleton />;
  }

  const normalizedError = error
    ? normalizeError(error, "The requested scan could not be loaded.")
    : null;

  if (normalizedError && isOffline && !data) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 py-16">
        <ErrorAlert
          title="Offline"
          message="Reconnect to load stored scan results from the ShadowAudit API."
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
              : isNotFoundError(error)
                ? "Scan not found"
                : "Unable to load scan results"
          }
          message={
            normalizedError?.type === "network_offline"
              ? "Reconnect to load stored scan results from the ShadowAudit API."
              : isNotFoundError(error)
              ? "No stored ShadowAudit scan matched that ID. It may have expired or never completed."
              : normalizedError?.message ??
                "The requested scan could not be loaded from the ShadowAudit API."
          }
          retryLabel="Try again"
          onRetry={() => {
            void refetch();
          }}
        />
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className="space-y-8">
        <RiskScoreHeader scanResult={data} />

        <Tabs defaultValue="vulnerabilities" className="space-y-6">
          <TabsList
            className="h-auto flex-wrap gap-2 rounded-3xl border border-white/10 bg-slate-950/70 p-2"
          >
            <TabsTrigger value="vulnerabilities" className="rounded-2xl px-4 py-2.5">
              Vulnerabilities
            </TabsTrigger>
            <TabsTrigger value="maintainers" className="rounded-2xl px-4 py-2.5">
              Maintainers
            </TabsTrigger>
            <TabsTrigger value="typosquats" className="rounded-2xl px-4 py-2.5">
              Typosquats
            </TabsTrigger>
            <TabsTrigger value="behavior" className="rounded-2xl px-4 py-2.5">
              Behavior Analysis
            </TabsTrigger>
            <TabsTrigger value="graph" className="rounded-2xl px-4 py-2.5">
              Dependency Graph
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vulnerabilities" className="mt-0">
            <VulnerabilityPanel vulnerabilities={data.vulnerabilities} />
          </TabsContent>

          <TabsContent value="maintainers" className="mt-0">
            <MaintainerPanel maintainerRisks={data.maintainer_risks} />
          </TabsContent>

          <TabsContent value="typosquats" className="mt-0">
            <TyposquatPanel typosquats={data.typosquat_results} />
          </TabsContent>

          <TabsContent value="behavior" className="mt-0">
            <BehaviorPanel analyses={data.behavior_analyses} />
          </TabsContent>

          <TabsContent value="graph" className="mt-0">
            <DependencyGraph scanResult={data} />
          </TabsContent>
        </Tabs>

        <div className="rounded-3xl border border-sky-500/15 bg-sky-500/[0.06] px-5 py-4 text-sm text-slate-300">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-4 text-sky-300" />
            <p className="leading-7">
              Scan result <span className="font-mono text-sky-200">{scanId}</span> is
              rendered from <span className="font-mono text-slate-100">GET /api/v1/scan/{scanId}</span>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
