"use client";

import { motion } from "framer-motion";
import { ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScanResult } from "@/lib/types";
import {
  formatScanTimestamp,
  getRiskLabel,
  getRiskPalette,
} from "@/lib/resultUtils";

interface RiskScoreHeaderProps {
  scanResult: ScanResult;
}

export function RiskScoreHeader({ scanResult }: RiskScoreHeaderProps) {
  const score = Number(scanResult.overall_risk_score.toFixed(1));
  const palette = getRiskPalette(score);
  const label = getRiskLabel(score);
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score / 10, 0), 1);
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <Card
      className={`overflow-hidden border border-white/10 bg-gradient-to-br ${palette.surface} ${palette.glow}`}
      data-risk-band={palette.band}
      data-risk-color={palette.stroke}
    >
      <CardContent className="grid gap-8 px-6 py-8 lg:grid-cols-[260px_1fr] lg:items-center">
        <div className="flex items-center justify-center">
          <div className="relative flex size-60 items-center justify-center rounded-full border border-white/10 bg-slate-950/70">
            <svg
              viewBox="0 0 220 220"
              className="absolute inset-0 size-full -rotate-90"
              aria-hidden="true"
            >
              <circle
                cx="110"
                cy="110"
                r={radius}
                fill="none"
                stroke="rgba(148, 163, 184, 0.18)"
                strokeWidth="14"
              />
              <motion.circle
                cx="110"
                cy="110"
                r={radius}
                fill="none"
                stroke={palette.stroke}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.1, ease: "easeOut" }}
              />
            </svg>

            <div className="space-y-2 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.32em] text-slate-500">
                Overall risk
              </p>
              <div className={`text-6xl font-semibold tracking-tight ${palette.text}`}>
                {score.toFixed(1)}
              </div>
              <Badge
                variant="outline"
                className={`border-white/10 bg-white/5 font-mono uppercase tracking-[0.22em] ${palette.text}`}
              >
                {label}
              </Badge>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="border-sky-500/30 bg-sky-500/10 font-mono text-sky-200 hover:bg-sky-500/10">
              {score >= 7 ? (
                <ShieldAlert className="mr-1.5 size-3.5" />
              ) : (
                <ShieldCheck className="mr-1.5 size-3.5" />
              )}
              Scan overview
            </Badge>
            {scanResult.project_name ? (
              <Badge
                variant="outline"
                className="border-white/10 bg-white/5 font-mono text-slate-300"
              >
                {scanResult.project_name}
              </Badge>
            ) : null}
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {label} across your dependency graph.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              ShadowAudit blended vulnerability intelligence, maintainer drift,
              typosquat matches, and AI behavior review into one package-level
              risk posture for this scan.
            </p>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 sm:text-sm">
              {scanResult.packages.length} packages scanned |{" "}
              {scanResult.vulnerabilities.length} vulnerabilities found |{" "}
              {formatScanTimestamp(scanResult.timestamp)}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                Packages scanned
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {scanResult.packages.length}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                Vulnerabilities found
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {scanResult.vulnerabilities.length}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                Scan timestamp
              </p>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-200">
                {formatScanTimestamp(scanResult.timestamp)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
