import type { Ecosystem, RiskLevel, ScanResult } from "./types";

type DependencyNodeInput = {
  name?: string;
  version?: string;
  ecosystem?: Ecosystem;
  dependencies?: Record<string, DependencyNodeInput>;
  devDependencies?: Record<string, DependencyNodeInput>;
};

type DependencyGraphRoot = DependencyNodeInput & {
  name?: string;
};

export interface GraphNode {
  id: string;
  name: string;
  version: string;
  ecosystem: Ecosystem | "root";
  riskScore: number;
  vulnerabilityCount: number;
  dependentCount: number;
  issueCount: number;
  isRoot: boolean;
  riskBand: "none" | "low" | "medium" | "high";
}

export interface GraphLink {
  source: string;
  target: string;
  isDevDependency: boolean;
}

type RiskSummary = {
  riskScore: number;
  vulnerabilityCount: number;
  issueCount: number;
};

const vulnerabilityScores: Record<string, number> = {
  critical: 9.5,
  high: 8,
  medium: 5.5,
  low: 2.5,
};

const maintainerScores: Record<RiskLevel, number> = {
  critical: 9.5,
  high: 8,
  medium: 5.5,
  low: 2.5,
};

function toRiskBand(score: number): GraphNode["riskBand"] {
  if (score <= 0) {
    return "none";
  }

  if (score < 4) {
    return "low";
  }

  if (score < 7) {
    return "medium";
  }

  return "high";
}

function inferRootName(scanResult: ScanResult): string {
  if (scanResult.project_name?.trim()) {
    return scanResult.project_name.trim();
  }

  const graph = scanResult.dependency_graph as DependencyGraphRoot;
  if (
    graph &&
    typeof graph === "object" &&
    typeof graph.name === "string" &&
    graph.name.trim()
  ) {
    return graph.name.trim();
  }

  return "project-root";
}

function buildRiskIndex(scanResult: ScanResult): Map<string, RiskSummary> {
  const riskIndex = new Map<string, RiskSummary>();

  const ensureSummary = (packageName: string): RiskSummary => {
    const existing = riskIndex.get(packageName);

    if (existing) {
      return existing;
    }

    const nextSummary: RiskSummary = {
      riskScore: 0,
      vulnerabilityCount: 0,
      issueCount: 0,
    };

    riskIndex.set(packageName, nextSummary);
    return nextSummary;
  };

  for (const vulnerability of scanResult.vulnerabilities) {
    const summary = ensureSummary(vulnerability.package_name);
    summary.vulnerabilityCount += 1;
    summary.issueCount += 1;
    summary.riskScore = Math.max(
      summary.riskScore,
      vulnerabilityScores[vulnerability.severity.trim().toLowerCase()] ?? 0,
    );
  }

  for (const maintainerRisk of scanResult.maintainer_risks) {
    const summary = ensureSummary(maintainerRisk.package_name);
    summary.issueCount += 1;
    summary.riskScore = Math.max(
      summary.riskScore,
      maintainerScores[maintainerRisk.risk_level] ?? 0,
    );
  }

  for (const typosquat of scanResult.typosquat_results) {
    const summary = ensureSummary(typosquat.package_name);
    if (typosquat.is_suspicious) {
      summary.issueCount += 1;
      summary.riskScore = Math.max(summary.riskScore, 9.2);
    }
  }

  for (const analysis of scanResult.behavior_analyses) {
    const summary = ensureSummary(analysis.package_name);
    summary.issueCount += Math.max(analysis.flags.length, 1);
    summary.riskScore = Math.max(summary.riskScore, analysis.risk_score);
  }

  return riskIndex;
}

export function transformToGraphData(scanResult: ScanResult): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  const graph = (scanResult.dependency_graph ?? {}) as DependencyGraphRoot;
  const riskIndex = buildRiskIndex(scanResult);
  const packageIndex = new Map(scanResult.packages.map((pkg) => [pkg.name, pkg]));
  const nodesById = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const dependentCounts = new Map<string, number>();
  const rootId = inferRootName(scanResult);
  const usesRootContainerShape =
    graph &&
    typeof graph === "object" &&
    ("dependencies" in graph || "devDependencies" in graph);

  const upsertNode = (
    id: string,
    version: string,
    ecosystem: Ecosystem | "root",
    isRoot: boolean,
  ) => {
    if (nodesById.has(id)) {
      const existing = nodesById.get(id)!;
      if (!existing.version && version) {
        existing.version = version;
      }
      return existing;
    }

    const riskSummary = isRoot
      ? {
          riskScore: scanResult.overall_risk_score,
          vulnerabilityCount: scanResult.vulnerabilities.length,
          issueCount:
            scanResult.vulnerabilities.length +
            scanResult.maintainer_risks.length +
            scanResult.typosquat_results.length +
            scanResult.behavior_analyses.length,
        }
      : riskIndex.get(id) ?? {
          riskScore: 0,
          vulnerabilityCount: 0,
          issueCount: 0,
        };

    const node: GraphNode = {
      id,
      name: id,
      version,
      ecosystem,
      riskScore: riskSummary.riskScore,
      vulnerabilityCount: riskSummary.vulnerabilityCount,
      dependentCount: 0,
      issueCount: riskSummary.issueCount,
      isRoot,
      riskBand: toRiskBand(riskSummary.riskScore),
    };

    nodesById.set(id, node);
    return node;
  };

  const visitChildren = (
    parentId: string,
    dependencyMap: Record<string, DependencyNodeInput> | undefined,
    isDevDependency: boolean,
  ) => {
    if (!dependencyMap) {
      return;
    }

    for (const [childName, childValue] of Object.entries(dependencyMap)) {
      const packageInfo = packageIndex.get(childName);
      upsertNode(
        childName,
        childValue.version ?? packageInfo?.version ?? "unknown",
        childValue.ecosystem ?? packageInfo?.ecosystem ?? "npm",
        false,
      );

      links.push({
        source: parentId,
        target: childName,
        isDevDependency,
      });

      dependentCounts.set(
        childName,
        (dependentCounts.get(childName) ?? 0) + 1,
      );

      visitChildren(childName, childValue.dependencies, false);
      visitChildren(childName, childValue.devDependencies, true);
    }
  };

  upsertNode(rootId, graph.version ?? "workspace", "root", true);
  if (usesRootContainerShape) {
    visitChildren(rootId, graph.dependencies, false);
    visitChildren(rootId, graph.devDependencies, true);
  } else {
    visitChildren(rootId, graph as Record<string, DependencyNodeInput>, false);
  }

  const nodes = [...nodesById.values()].map((node) => ({
    ...node,
    dependentCount: node.isRoot ? 0 : dependentCounts.get(node.id) ?? 0,
  }));

  return {
    nodes,
    links,
  };
}

export function calculateBlastRadius(nodeId: string, links: GraphLink[]): string[] {
  const reverseAdjacency = new Map<string, string[]>();

  for (const link of links) {
    const source = String(link.source);
    const target = String(link.target);
    const dependents = reverseAdjacency.get(target) ?? [];
    dependents.push(source);
    reverseAdjacency.set(target, dependents);
  }

  const visited = new Set<string>([nodeId]);
  const queue = [...(reverseAdjacency.get(nodeId) ?? [])];
  const blastRadius: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    blastRadius.push(current);

    for (const dependent of reverseAdjacency.get(current) ?? []) {
      if (!visited.has(dependent)) {
        queue.push(dependent);
      }
    }
  }

  return blastRadius;
}
