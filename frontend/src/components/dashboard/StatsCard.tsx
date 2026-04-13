"use client";

import { ArrowDownRight, ArrowUpRight, LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { TrendIndicator } from "@/lib/dashboardUtils";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: TrendIndicator | null;
}

export function StatsCard({ icon: Icon, label, value, trend }: StatsCardProps) {
  return (
    <Card className="border border-white/10 bg-slate-950/70">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3 text-sky-200">
            <Icon className="size-5" />
          </div>
          {trend ? (
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-xs",
                trend.direction === "up"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-100",
              )}
            >
              {trend.direction === "up" ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {trend.value}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500">
            {label}
          </p>
          <p className="text-3xl font-semibold tracking-tight text-white">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
