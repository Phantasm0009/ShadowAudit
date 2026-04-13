"use client";

import { CheckCircle2, Siren } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TyposquatResult } from "@/lib/types";

interface TyposquatPanelProps {
  typosquats: TyposquatResult[];
}

export function TyposquatPanel({ typosquats }: TyposquatPanelProps) {
  const rows = [...typosquats].sort((left, right) => {
    if (left.is_suspicious !== right.is_suspicious) {
      return left.is_suspicious ? -1 : 1;
    }

    return right.similarity_score - left.similarity_score;
  });

  if (rows.length === 0) {
    return (
      <Card className="border border-white/10 bg-slate-950/70">
        <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 p-4">
            <CheckCircle2 className="size-8 text-emerald-300" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">
              No typosquat matches surfaced
            </h3>
            <p className="max-w-xl text-sm leading-7 text-slate-400">
              Submitted package names did not materially resemble the high-traffic
              packages ShadowAudit tracks for impersonation.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-white">Typosquat detection</CardTitle>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Similar package names are scored against popular ecosystem packages and
            highlighted when the pattern looks suspicious.
          </p>
        </div>
        <Badge className="border-rose-500/20 bg-rose-500/10 font-mono text-rose-100 hover:bg-rose-500/10">
          <Siren className="mr-1.5 size-3.5" />
          {rows.filter((row) => row.is_suspicious).length} suspicious
        </Badge>
      </CardHeader>

      <CardContent className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 text-slate-400">
            <tr>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Similar to</th>
              <th className="px-4 py-3">Similarity</th>
              <th className="px-4 py-3">Suspicious</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.package_name}-${row.similar_to}`}
                className={row.is_suspicious ? "bg-rose-500/[0.06]" : ""}
              >
                <td className="px-4 py-4 font-medium text-white">{row.package_name}</td>
                <td className="px-4 py-4 text-slate-300">{row.similar_to}</td>
                <td className="px-4 py-4 font-mono text-slate-200">
                  {(row.similarity_score * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-4">
                  <Badge
                    variant="outline"
                    className={
                      row.is_suspicious
                        ? "border-rose-500/35 bg-rose-500/15 text-rose-100"
                        : "border-emerald-500/35 bg-emerald-500/15 text-emerald-100"
                    }
                  >
                    {row.is_suspicious ? "Yes" : "No"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
