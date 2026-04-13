"use client";

import { Bot, CheckCircle2, ChevronDown, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getFlagBadgeClass, getRiskBand } from "@/lib/resultUtils";
import { BehaviorAnalysis } from "@/lib/types";

interface BehaviorPanelProps {
  analyses: BehaviorAnalysis[];
}

function getProgressClass(score: number): string {
  switch (getRiskBand(score)) {
    case "low":
      return "[&_[data-slot=progress-indicator]]:bg-emerald-400";
    case "moderate":
      return "[&_[data-slot=progress-indicator]]:bg-yellow-400";
    case "high":
      return "[&_[data-slot=progress-indicator]]:bg-orange-400";
    default:
      return "[&_[data-slot=progress-indicator]]:bg-rose-400";
  }
}

export function BehaviorPanel({ analyses }: BehaviorPanelProps) {
  const sortedAnalyses = [...analyses].sort(
    (left, right) => right.risk_score - left.risk_score,
  );

  if (sortedAnalyses.length === 0) {
    return (
      <Card className="border border-white/10 bg-slate-950/70">
        <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 p-4">
            <CheckCircle2 className="size-8 text-emerald-300" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">
              No packages required AI behavior review
            </h3>
            <p className="max-w-xl text-sm leading-7 text-slate-400">
              The risk gates did not promote any packages into the GPT-backed code
              change analysis pass for this scan.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {sortedAnalyses.map((analysis) => (
        <Card
          key={analysis.package_name}
          className="border border-white/10 bg-slate-950/70"
        >
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-white">
                <Bot className="size-5 text-sky-300" />
                {analysis.package_name}
              </CardTitle>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                AI behavioral analysis synthesized install scripts, package diffs,
                and suspicious pattern matches.
              </p>
            </div>
            <Badge className="border-sky-500/20 bg-sky-500/10 font-mono text-sky-100 hover:bg-sky-500/10">
              <Sparkles className="mr-1.5 size-3.5" />
              Risk {analysis.risk_score.toFixed(1)}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Risk score</span>
                <span className="font-mono text-slate-100">
                  {(analysis.risk_score * 10).toFixed(0)}%
                </span>
              </div>
              <Progress
                value={analysis.risk_score * 10}
                className={`h-3 bg-white/8 ${getProgressClass(analysis.risk_score)}`}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {analysis.flags.length > 0 ? (
                analysis.flags.map((flag) => (
                  <Badge
                    key={`${analysis.package_name}-${flag}`}
                    variant="outline"
                    className={getFlagBadgeClass(flag)}
                  >
                    {flag}
                  </Badge>
                ))
              ) : (
                <Badge
                  variant="outline"
                  className="border-slate-700 bg-slate-800/80 text-slate-200"
                >
                  No flags
                </Badge>
              )}
            </div>

            <details className="group rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-100">
                Expand AI summary
                <ChevronDown className="size-4 transition group-open:rotate-180" />
              </summary>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                {analysis.ai_summary}
              </p>
            </details>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
