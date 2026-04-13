import { getRiskBand } from "@/lib/resultUtils";
import { RecentScanSummary } from "@/lib/types";

export interface TrendIndicator {
  direction: "up" | "down";
  value: string;
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getRiskBadgeClass(score: number): string {
  switch (getRiskBand(score)) {
    case "low":
      return "border-emerald-500/35 bg-emerald-500/15 text-emerald-100";
    case "moderate":
      return "border-yellow-500/35 bg-yellow-400/15 text-yellow-100";
    case "high":
      return "border-orange-500/35 bg-orange-500/15 text-orange-100";
    default:
      return "border-rose-500/35 bg-rose-500/15 text-rose-100";
  }
}

export function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, "day");
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return rtf.format(diffMonths, "month");
  }

  const diffYears = Math.round(diffMonths / 12);
  return rtf.format(diffYears, "year");
}

export function buildTrendIndicator(currentValue: number, previousValue: number): TrendIndicator | null {
  if (previousValue === 0 && currentValue === 0) {
    return null;
  }

  if (previousValue === 0) {
    return {
      direction: "up",
      value: "+100%",
    };
  }

  if (currentValue === previousValue) {
    return {
      direction: "up",
      value: "0%",
    };
  }

  const delta = ((currentValue - previousValue) / previousValue) * 100;

  return {
    direction: delta >= 0 ? "up" : "down",
    value: `${delta >= 0 ? "+" : ""}${roundToSingleDecimal(delta)}%`,
  };
}

export function buildDashboardTrends(
  scans: RecentScanSummary[],
  criticalFindingsCount: number,
  packagesAnalyzed: number,
) {
  const midpoint = Math.ceil(scans.length / 2);
  const currentWindow = scans.slice(0, midpoint);
  const previousWindow = scans.slice(midpoint);

  const currentAvgRisk = average(currentWindow.map((scan) => scan.overall_risk_score));
  const previousAvgRisk = average(previousWindow.map((scan) => scan.overall_risk_score));

  const currentPackages = currentWindow.reduce((sum, scan) => sum + scan.package_count, 0);
  const previousPackages = previousWindow.reduce((sum, scan) => sum + scan.package_count, 0);

  const currentHighRiskScans = currentWindow.filter(
    (scan) => scan.overall_risk_score >= 7,
  ).length;
  const previousHighRiskScans = previousWindow.filter(
    (scan) => scan.overall_risk_score >= 7,
  ).length;

  return {
    totalScans: buildTrendIndicator(currentWindow.length, previousWindow.length),
    avgRisk: buildTrendIndicator(currentAvgRisk, previousAvgRisk),
    criticalFindings:
      criticalFindingsCount > 0 || previousHighRiskScans > 0
        ? buildTrendIndicator(currentHighRiskScans, previousHighRiskScans)
        : null,
    packagesAnalyzed:
      packagesAnalyzed > 0 || previousPackages > 0
        ? buildTrendIndicator(currentPackages, previousPackages)
        : null,
  };
}
