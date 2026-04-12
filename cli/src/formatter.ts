import chalk from "chalk";
import Table from "cli-table3";

import type {
  BehaviorAnalysis,
  MaintainerRisk,
  ScanResult,
  TyposquatResult,
  VulnerabilityResult,
} from "./types.js";

type FindingRow = {
  category: string;
  packageName: string;
  severity: "critical" | "high";
  detail: string;
};

const severityPriority: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function getTerminalWidth(): number {
  return process.stdout.columns ?? 120;
}

export function truncateToWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return "";
  }

  if (text.length <= maxWidth) {
    return text;
  }

  if (maxWidth <= 3) {
    return text.slice(0, maxWidth);
  }

  return `${text.slice(0, maxWidth - 3)}...`;
}

export function colorSeverity(severity: string, value?: string): string {
  const label = value ?? severity.toUpperCase();
  const normalized = severity.trim().toLowerCase();

  switch (normalized) {
    case "critical":
      return chalk.redBright(label);
    case "high":
      return chalk.yellowBright(label);
    case "medium":
      return chalk.cyan(label);
    default:
      return chalk.white(label);
  }
}

function getOverallRiskColor(score: number): (text: string) => string {
  if (score <= 3) {
    return chalk.greenBright;
  }

  if (score <= 6) {
    return chalk.yellowBright;
  }

  return chalk.redBright;
}

function getRiskLabel(score: number): string {
  if (score <= 3) {
    return "Low Risk";
  }

  if (score <= 6) {
    return "Moderate Risk";
  }

  if (score <= 8) {
    return "High Risk";
  }

  return "Critical Risk";
}

function collectFindingRows(scanResult: ScanResult): FindingRow[] {
  const vulnerabilityRows = scanResult.vulnerabilities
    .filter((finding) => severityPriority[finding.severity.toLowerCase()] >= 3)
    .map((finding): FindingRow => ({
      category: "Vulnerability",
      packageName: finding.package_name,
      severity:
        finding.severity.toLowerCase() === "critical" ? "critical" : "high",
      detail: `${finding.cve_id}: ${finding.summary}`,
    }));

  const maintainerRows = scanResult.maintainer_risks
    .filter((finding) => severityPriority[finding.risk_level] >= 3)
    .map((finding): FindingRow => ({
      category: "Maintainer",
      packageName: finding.package_name,
      severity: finding.risk_level === "critical" ? "critical" : "high",
      detail: finding.reason,
    }));

  const typosquatRows = scanResult.typosquat_results
    .filter((finding) => finding.is_suspicious)
    .map((finding): FindingRow => ({
      category: "Typosquat",
      packageName: finding.package_name,
      severity: "high",
      detail: `Looks similar to ${finding.similar_to} (${Math.round(
        finding.similarity_score * 100,
      )}% match)`,
    }));

  const behaviorRows = scanResult.behavior_analyses
    .filter((finding) => finding.risk_score >= 7)
    .map((finding): FindingRow => ({
      category: "Behavior",
      packageName: finding.package_name,
      severity: finding.risk_score >= 9 ? "critical" : "high",
      detail: finding.flags.length > 0 ? finding.flags.join(", ") : finding.ai_summary,
    }));

  return [
    ...vulnerabilityRows,
    ...maintainerRows,
    ...typosquatRows,
    ...behaviorRows,
  ].sort((left, right) => {
    const severityDiff =
      severityPriority[right.severity] - severityPriority[left.severity];

    if (severityDiff !== 0) {
      return severityDiff;
    }

    return left.packageName.localeCompare(right.packageName);
  });
}

export function formatRiskScore(score: number): string {
  const color = getOverallRiskColor(score);
  return color(`${score.toFixed(1)}/10 (${getRiskLabel(score)})`);
}

export function formatSummary(scanResult: ScanResult): string {
  return `Scanned ${scanResult.packages.length} packages. Found ${scanResult.vulnerabilities.length} vulnerabilities, ${scanResult.maintainer_risks.length} maintainer risks, ${scanResult.typosquat_results.length} typosquats.`;
}

export function formatFindingsTable(scanResult: ScanResult): string | null {
  const rows = collectFindingRows(scanResult);

  if (rows.length === 0) {
    return null;
  }

  const terminalWidth = getTerminalWidth();
  const detailsWidth = Math.max(28, terminalWidth - 56);
  const table = new Table({
    head: ["Category", "Package", "Severity", "Details"],
    colWidths: [15, 20, 12, detailsWidth],
    style: {
      head: ["white"],
      border: ["gray"],
    },
    wordWrap: false,
  });

  for (const row of rows) {
    table.push([
      truncateToWidth(row.category, 13),
      truncateToWidth(row.packageName, 18),
      colorSeverity(row.severity),
      truncateToWidth(row.detail, detailsWidth - 2),
    ]);
  }

  return table.toString();
}

export function formatBehaviorCount(analyses: BehaviorAnalysis[]): string {
  return `${analyses.filter((analysis) => analysis.risk_score >= 7).length}`;
}

export function formatTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatFindingHeadline(scanResult: ScanResult): string {
  const highVulns = scanResult.vulnerabilities.filter(
    (finding: VulnerabilityResult) =>
      severityPriority[finding.severity.toLowerCase()] >= 3,
  ).length;
  const highMaintainers = scanResult.maintainer_risks.filter(
    (finding: MaintainerRisk) => severityPriority[finding.risk_level] >= 3,
  ).length;
  const suspiciousTyposquats = scanResult.typosquat_results.filter(
    (finding: TyposquatResult) => finding.is_suspicious,
  ).length;
  const riskyBehaviors = scanResult.behavior_analyses.filter(
    (finding: BehaviorAnalysis) => finding.risk_score >= 7,
  ).length;

  return `${highVulns + highMaintainers + suspiciousTyposquats + riskyBehaviors} critical/high findings`;
}
