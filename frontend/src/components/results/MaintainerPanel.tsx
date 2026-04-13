"use client";

import { AlertTriangle, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  clamp,
  formatScanTimestamp,
  getRiskLevelBadgeClass,
  maintainerRiskRank,
} from "@/lib/resultUtils";
import { MaintainerRisk } from "@/lib/types";

interface MaintainerPanelProps {
  maintainerRisks: MaintainerRisk[];
}

function getTimelinePosition(lastOwnerChange: string): number {
  const changeDate = new Date(lastOwnerChange);

  if (Number.isNaN(changeDate.getTime())) {
    return 0;
  }

  const ageMs = Date.now() - changeDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return clamp(100 - (Math.min(ageDays, 180) / 180) * 100, 0, 100);
}

export function MaintainerPanel({ maintainerRisks }: MaintainerPanelProps) {
  const findings = [...maintainerRisks].sort(
    (left, right) => maintainerRiskRank(right.risk_level) - maintainerRiskRank(left.risk_level),
  );

  if (findings.length === 0) {
    return (
      <Card className="border border-white/10 bg-slate-950/70">
        <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 p-4">
            <Clock3 className="size-8 text-emerald-300" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">
              No maintainer takeover signals
            </h3>
            <p className="max-w-xl text-sm leading-7 text-slate-400">
              ShadowAudit did not find recent ownership changes significant enough
              to elevate above the noise floor for this scan.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {findings.map((risk) => {
        const timelinePosition = getTimelinePosition(risk.last_owner_change);

        return (
          <Card
            key={`${risk.package_name}-${risk.last_owner_change}`}
            className="border border-white/10 bg-slate-950/70"
          >
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  <AlertTriangle className="size-5 text-orange-300" />
                  {risk.package_name}
                </CardTitle>
                <p className="mt-2 text-sm leading-7 text-slate-300">
                  {risk.reason}
                </p>
              </div>
              <Badge
                variant="outline"
                className={getRiskLevelBadgeClass(risk.risk_level)}
              >
                {risk.risk_level.toUpperCase()}
              </Badge>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-slate-500">
                  <span>180d ago</span>
                  <span>Now</span>
                </div>
                <div className="relative h-3 rounded-full bg-white/8">
                  <div
                    className="absolute top-1/2 size-5 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-orange-400 shadow-[0_0_30px_rgba(251,146,60,0.45)]"
                    style={{ left: `calc(${timelinePosition}% - 10px)` }}
                  />
                </div>
                <p className="mt-4 text-sm text-slate-300">
                  Last ownership change:{" "}
                  <span className="font-mono text-slate-100">
                    {formatScanTimestamp(risk.last_owner_change)}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
