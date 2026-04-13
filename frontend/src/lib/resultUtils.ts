import { MaintainerRisk, VulnerabilityResult } from "@/lib/types";

export type RiskBand = "low" | "moderate" | "high" | "critical";
export type VulnerabilitySortKey = "package_name" | "severity" | "cve_id";
export type SortDirection = "asc" | "desc";

const severityWeights: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const maintainerWeights: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function normalizeSeverity(severity: string): string {
  return severity.trim().toLowerCase();
}

export function severityRank(severity: string): number {
  return severityWeights[normalizeSeverity(severity)] ?? 0;
}

export function maintainerRiskRank(level: MaintainerRisk["risk_level"]): number {
  return maintainerWeights[level] ?? 0;
}

export function getRiskBand(score: number): RiskBand {
  if (score <= 3) {
    return "low";
  }

  if (score <= 6) {
    return "moderate";
  }

  if (score <= 8) {
    return "high";
  }

  return "critical";
}

export function getRiskLabel(score: number): string {
  switch (getRiskBand(score)) {
    case "low":
      return "Low Risk";
    case "moderate":
      return "Moderate Risk";
    case "high":
      return "High Risk";
    default:
      return "Critical Risk";
  }
}

export function getRiskPalette(score: number) {
  const band = getRiskBand(score);

  switch (band) {
    case "low":
      return {
        band,
        stroke: "#34D399",
        surface:
          "from-emerald-500/20 via-emerald-500/8 to-slate-950",
        glow: "shadow-[0_0_80px_rgba(16,185,129,0.18)]",
        text: "text-emerald-300",
      };
    case "moderate":
      return {
        band,
        stroke: "#FACC15",
        surface: "from-yellow-400/20 via-yellow-400/8 to-slate-950",
        glow: "shadow-[0_0_80px_rgba(250,204,21,0.16)]",
        text: "text-yellow-200",
      };
    case "high":
      return {
        band,
        stroke: "#FB923C",
        surface: "from-orange-500/20 via-orange-500/8 to-slate-950",
        glow: "shadow-[0_0_80px_rgba(249,115,22,0.18)]",
        text: "text-orange-200",
      };
    default:
      return {
        band,
        stroke: "#F87171",
        surface: "from-rose-500/24 via-rose-500/10 to-slate-950",
        glow: "shadow-[0_0_80px_rgba(239,68,68,0.18)]",
        text: "text-rose-200",
      };
  }
}

export function formatScanTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown scan time";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function getSeverityBadgeClass(severity: string): string {
  switch (normalizeSeverity(severity)) {
    case "critical":
      return "border-rose-500/40 bg-rose-500/15 text-rose-100";
    case "high":
      return "border-orange-500/40 bg-orange-500/15 text-orange-100";
    case "medium":
      return "border-yellow-500/40 bg-yellow-400/15 text-yellow-100";
    default:
      return "border-slate-700 bg-slate-800/80 text-slate-200";
  }
}

export function getRiskLevelBadgeClass(level: MaintainerRisk["risk_level"]): string {
  switch (level) {
    case "critical":
      return "border-rose-500/40 bg-rose-500/15 text-rose-100";
    case "high":
      return "border-orange-500/40 bg-orange-500/15 text-orange-100";
    case "medium":
      return "border-yellow-500/40 bg-yellow-400/15 text-yellow-100";
    default:
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-100";
  }
}

export function getFlagBadgeClass(flag: string): string {
  const normalized = flag.toLowerCase();

  if (
    normalized.includes("critical") ||
    normalized.includes("reverse shell") ||
    normalized.includes("crypto") ||
    normalized.includes("exfil")
  ) {
    return "border-rose-500/35 bg-rose-500/15 text-rose-100";
  }

  if (
    normalized.includes("obfus") ||
    normalized.includes("network") ||
    normalized.includes("environment") ||
    normalized.includes("postinstall")
  ) {
    return "border-orange-500/35 bg-orange-500/15 text-orange-100";
  }

  if (
    normalized.includes("encoded") ||
    normalized.includes("install") ||
    normalized.includes("script")
  ) {
    return "border-yellow-500/35 bg-yellow-400/15 text-yellow-100";
  }

  return "border-slate-700 bg-slate-800/80 text-slate-200";
}

export function sortVulnerabilities(
  vulnerabilities: VulnerabilityResult[],
  sortKey: VulnerabilitySortKey,
  direction: SortDirection,
): VulnerabilityResult[] {
  const sorted = [...vulnerabilities].sort((left, right) => {
    if (sortKey === "severity") {
      return severityRank(left.severity) - severityRank(right.severity);
    }

    return left[sortKey].localeCompare(right[sortKey]);
  });

  return direction === "desc" ? sorted.reverse() : sorted;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
