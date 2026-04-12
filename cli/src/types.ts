export type FileType = "package.json" | "requirements.txt";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ScanRequest {
  file_content: string;
  file_type: FileType;
  project_name?: string;
}

export interface PackageInfo {
  name: string;
  version: string;
  ecosystem: "npm" | "pypi";
}

export interface VulnerabilityResult {
  package_name: string;
  cve_id: string;
  severity: string;
  summary: string;
  affected_versions: string[];
}

export interface MaintainerRisk {
  package_name: string;
  risk_level: RiskLevel;
  reason: string;
  last_owner_change: string;
}

export interface TyposquatResult {
  package_name: string;
  similar_to: string;
  similarity_score: number;
  is_suspicious: boolean;
}

export interface BehaviorAnalysis {
  package_name: string;
  risk_score: number;
  flags: string[];
  ai_summary: string;
}

export interface ScanResult {
  scan_id: string;
  project_name?: string | null;
  timestamp: string;
  packages: PackageInfo[];
  vulnerabilities: VulnerabilityResult[];
  maintainer_risks: MaintainerRisk[];
  typosquat_results: TyposquatResult[];
  behavior_analyses: BehaviorAnalysis[];
  overall_risk_score: number;
  dependency_graph: Record<string, unknown>;
}
