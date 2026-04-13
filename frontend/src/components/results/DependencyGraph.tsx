"use client";

import * as d3 from "d3";
import {
  Focus,
  GitBranchPlus,
  Network,
  Orbit,
  RefreshCcw,
  Route,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calculateBlastRadius,
  GraphLink,
  GraphNode,
  transformToGraphData,
} from "@/lib/graphUtils";
import { ScanResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type InteractionMode = "dependencies" | "blast";

type SimulationNode = GraphNode & d3.SimulationNodeDatum;
type SimulationLink = GraphLink & d3.SimulationLinkDatum<SimulationNode>;

type TooltipState = {
  visible: boolean;
  x: number;
  y: number;
  node: GraphNode | null;
};

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 680;

function getNodeColor(node: GraphNode): string {
  switch (node.riskBand) {
    case "low":
      return "#FACC15";
    case "medium":
      return "#FB923C";
    case "high":
      return "#F87171";
    default:
      return "#34D399";
  }
}

function getNodeRadius(node: GraphNode): number {
  if (node.isRoot) {
    return 30;
  }

  return Math.min(11 + node.dependentCount * 3 + Math.min(node.issueCount, 2), 22);
}

function collectForwardDependencies(nodeId: string, links: GraphLink[]): string[] {
  const adjacency = new Map<string, string[]>();

  for (const link of links) {
    const source = String(link.source);
    const targets = adjacency.get(source) ?? [];
    targets.push(String(link.target));
    adjacency.set(source, targets);
  }

  const visited = new Set<string>([nodeId]);
  const queue = [...(adjacency.get(nodeId) ?? [])];
  const results: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    results.push(current);

    for (const dependency of adjacency.get(current) ?? []) {
      if (!visited.has(dependency)) {
        queue.push(dependency);
      }
    }
  }

  return results;
}

function buildHighlightedLinkKeys(
  selectedNodeId: string,
  links: GraphLink[],
  mode: InteractionMode,
): Set<string> {
  const adjacency = new Map<string, GraphLink[]>();

  for (const link of links) {
    const source = String(link.source);
    const target = String(link.target);
    const key = mode === "blast" ? target : source;
    const values = adjacency.get(key) ?? [];
    values.push({
      source,
      target,
      isDevDependency: link.isDevDependency,
    });
    adjacency.set(key, values);
  }

  const visited = new Set<string>([selectedNodeId]);
  const queue = [selectedNodeId];
  const highlightedLinks = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const link of adjacency.get(current) ?? []) {
      const nextNodeId =
        mode === "blast" ? String(link.source) : String(link.target);
      const linkKey = `${String(link.source)}->${String(link.target)}`;

      highlightedLinks.add(linkKey);

      if (!visited.has(nextNodeId)) {
        visited.add(nextNodeId);
        queue.push(nextNodeId);
      }
    }
  }

  return highlightedLinks;
}

export function DependencyGraph({ scanResult }: { scanResult: ScanResult }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("dependencies");

  const graphData = useMemo(() => transformToGraphData(scanResult), [scanResult]);

  const highlightedNodes = useMemo(() => {
    if (!selectedNodeId) {
      return new Set<string>();
    }

    const relatedNodes =
      interactionMode === "blast"
        ? calculateBlastRadius(selectedNodeId, graphData.links)
        : collectForwardDependencies(selectedNodeId, graphData.links);

    return new Set<string>([selectedNodeId, ...relatedNodes]);
  }, [graphData.links, interactionMode, selectedNodeId]);

  const highlightedLinks = useMemo(() => {
    if (!selectedNodeId) {
      return new Set<string>();
    }

    return buildHighlightedLinkKeys(selectedNodeId, graphData.links, interactionMode);
  }, [graphData.links, interactionMode, selectedNodeId]);

  useEffect(() => {
    const svgElement = svgRef.current;

    if (!svgElement || graphData.nodes.length === 0) {
      return;
    }

    const svg = d3.select(svgElement);
    svg.selectAll("*").remove();
    svg
      .attr("viewBox", `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`)
      .attr("data-zoom-transform", d3.zoomIdentity.toString())
      .attr("role", "img")
      .attr(
        "aria-label",
        "Interactive dependency graph showing package relationships and risk levels",
      );

    const defs = svg.append("defs");

    defs
      .append("marker")
      .attr("id", "dependency-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "rgba(148, 163, 184, 0.45)");

    defs
      .append("marker")
      .attr("id", "highlight-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", interactionMode === "blast" ? "#fb7185" : "#38bdf8");

    const viewport = svg.append("g").attr("class", "graph-viewport");
    const linkLayer = viewport.append("g");
    const nodeLayer = viewport.append("g");

    const simulationNodes = graphData.nodes.map((node, index) => ({
      ...node,
      x: VIEWBOX_WIDTH / 2 + Math.cos(index) * 160,
      y: VIEWBOX_HEIGHT / 2 + Math.sin(index) * 160,
    })) as SimulationNode[];

    const simulationLinks = graphData.links.map((link) => ({
      ...link,
    })) as SimulationLink[];

    const highlightColor =
      interactionMode === "blast" ? "#fb7185" : "#38bdf8";

    const linkSelection = linkLayer
      .selectAll<SVGLineElement, SimulationLink>("line")
      .data(simulationLinks)
      .join("line")
      .attr("data-testid", "graph-link")
      .attr(
        "data-link-id",
        (link) => `${String(link.source)}->${String(link.target)}`,
      )
      .attr("stroke", (link) =>
        highlightedLinks.has(`${String(link.source)}->${String(link.target)}`)
          ? highlightColor
          : "rgba(148, 163, 184, 0.32)",
      )
      .attr("stroke-width", (link) =>
        highlightedLinks.has(`${String(link.source)}->${String(link.target)}`) ? 2.4 : 1.3,
      )
      .attr("stroke-dasharray", (link) => (link.isDevDependency ? "7 5" : null))
      .attr("marker-end", (link) =>
        highlightedLinks.has(`${String(link.source)}->${String(link.target)}`)
          ? "url(#highlight-arrow)"
          : "url(#dependency-arrow)",
      );

    const nodeSelection = nodeLayer
      .selectAll<SVGGElement, SimulationNode>("g")
      .data(simulationNodes)
      .join("g")
      .style("cursor", "pointer");

    nodeSelection
      .append("circle")
      .attr("data-testid", "graph-node")
      .attr("data-node-id", (node) => node.id)
      .attr("data-highlighted", (node) =>
        highlightedNodes.has(node.id) ? "true" : "false",
      )
      .attr("r", (node) => getNodeRadius(node))
      .attr("fill", (node) => getNodeColor(node))
      .attr("stroke", (node) => {
        if (!selectedNodeId) {
          return node.isRoot ? "#e2e8f0" : "rgba(15, 23, 42, 0.85)";
        }

        if (node.id === selectedNodeId) {
          return "#f8fafc";
        }

        return highlightedNodes.has(node.id)
          ? highlightColor
          : "rgba(15, 23, 42, 0.85)";
      })
      .attr("stroke-width", (node) => {
        if (node.id === selectedNodeId) {
          return 4;
        }

        if (highlightedNodes.has(node.id)) {
          return 2.5;
        }

        return node.isRoot ? 3 : 1.5;
      })
      .attr("opacity", (node) =>
        selectedNodeId && !highlightedNodes.has(node.id) ? 0.55 : 1,
      )
      .on("mouseenter", (event, node) => {
        const bounds = svgElement.getBoundingClientRect();
        setTooltip({
          visible: true,
          x: event.clientX - bounds.left + 14,
          y: event.clientY - bounds.top + 14,
          node,
        });
      })
      .on("mousemove", (event, node) => {
        const bounds = svgElement.getBoundingClientRect();
        setTooltip({
          visible: true,
          x: event.clientX - bounds.left + 14,
          y: event.clientY - bounds.top + 14,
          node,
        });
      })
      .on("mouseleave", () => {
        setTooltip((current) => ({ ...current, visible: false }));
      })
      .on("click", (event, node) => {
        event.stopPropagation();
        setSelectedNodeId((current) => (current === node.id ? null : node.id));
      });

    nodeSelection
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", (node) => getNodeRadius(node) + 16)
      .attr("fill", "#e2e8f0")
      .attr("font-size", 12)
      .attr("font-family", "var(--font-jetbrains-mono)")
      .text((node) => (node.id.length > 20 ? `${node.id.slice(0, 19)}...` : node.id));

    const simulation = d3
      .forceSimulation(simulationNodes)
      .force(
        "link",
        d3
          .forceLink(simulationLinks)
          .id((node) => (node as SimulationNode).id)
          .distance((link) => (link.isDevDependency ? 148 : 112)),
      )
      .force("charge", d3.forceManyBody().strength(-560))
      .force("center", d3.forceCenter(VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2))
      .force("collision", d3.forceCollide<SimulationNode>().radius((node) => getNodeRadius(node) + 20))
      .force("x", d3.forceX(VIEWBOX_WIDTH / 2).strength(0.05))
      .force("y", d3.forceY(VIEWBOX_HEIGHT / 2).strength(0.05))
      .on("tick", () => {
        linkSelection
          .attr("x1", (link) => (link.source as SimulationNode).x ?? 0)
          .attr("y1", (link) => (link.source as SimulationNode).y ?? 0)
          .attr("x2", (link) => (link.target as SimulationNode).x ?? 0)
          .attr("y2", (link) => (link.target as SimulationNode).y ?? 0);

        nodeSelection.attr(
          "transform",
          (node) => `translate(${node.x ?? 0}, ${node.y ?? 0})`,
        );
      });

    const dragBehavior = d3
      .drag<SVGGElement, SimulationNode>()
      .on("start", (event, node) => {
        if (!event.active) {
          simulation.alphaTarget(0.28).restart();
        }
        node.fx = node.x;
        node.fy = node.y;
      })
      .on("drag", (_event, node) => {
        node.fx = _event.x;
        node.fy = _event.y;
      })
      .on("end", (event, node) => {
        if (!event.active) {
          simulation.alphaTarget(0);
        }
        node.fx = null;
        node.fy = null;
      });

    nodeSelection.call(dragBehavior);

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 2.8])
      .on("zoom", (event) => {
        viewport.attr("transform", event.transform.toString());
        svg.attr("data-zoom-transform", event.transform.toString());
      });

    zoomRef.current = zoomBehavior;
    svg.call(zoomBehavior).on("dblclick.zoom", null);
    svg.on("click", () => setSelectedNodeId(null));
    svg.on("dblclick", (event) => {
      event.preventDefault();
      svg.transition().duration(280).call(zoomBehavior.transform, d3.zoomIdentity);
    });

    return () => {
      simulation.stop();
      svg.on(".zoom", null);
    };
  }, [
    graphData.links,
    graphData.nodes,
    highlightedLinks,
    highlightedNodes,
    interactionMode,
    selectedNodeId,
  ]);

  if (graphData.nodes.length === 0) {
    return (
      <Card className="border border-white/10 bg-slate-950/70">
        <CardContent className="px-6 py-12 text-center text-slate-300">
          No dependency graph data was available for this scan.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-white/10 bg-slate-950/70">
      <CardHeader className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-white">
            <Network className="size-5 text-sky-300" />
            Dependency Graph
          </CardTitle>
          <p className="max-w-3xl text-sm leading-7 text-slate-400">
            Explore how packages connect, which nodes carry the most downstream
            weight, and how risk signals propagate through the dependency tree.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-sky-500/20 bg-sky-500/10 font-mono text-sky-100 hover:bg-sky-500/10">
            {graphData.nodes.length} nodes
          </Badge>
          <Badge
            variant="outline"
            className="border-white/10 bg-white/5 font-mono text-slate-300"
          >
            {graphData.links.length} links
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={interactionMode === "dependencies" ? "default" : "outline"}
              className={cn(
                "rounded-full",
                interactionMode === "dependencies"
                  ? "bg-sky-500 text-slate-950 hover:bg-sky-400"
                  : "border-white/10 bg-slate-900/80 text-slate-200 hover:bg-white/5",
              )}
              data-testid="dependency-mode-toggle"
              onClick={() => setInteractionMode("dependencies")}
            >
              <Route className="size-4" />
              Dependency Path
            </Button>

            <Button
              type="button"
              size="sm"
              variant={interactionMode === "blast" ? "default" : "outline"}
              className={cn(
                "rounded-full",
                interactionMode === "blast"
                  ? "bg-rose-500 text-white hover:bg-rose-400"
                  : "border-white/10 bg-slate-900/80 text-slate-200 hover:bg-white/5",
              )}
              data-testid="blast-mode-toggle"
              onClick={() => setInteractionMode("blast")}
            >
              <GitBranchPlus className="size-4" />
              Blast Radius
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full border-white/10 bg-slate-900/80 text-slate-200 hover:bg-white/5"
              onClick={() => {
                if (svgRef.current && zoomRef.current) {
                  d3.select(svgRef.current)
                    .transition()
                    .duration(280)
                    .call(zoomRef.current.transform, d3.zoomIdentity);
                }
                setSelectedNodeId(null);
              }}
            >
              <RefreshCcw className="size-4" />
              Reset View
            </Button>
          </div>

          <p className="text-sm leading-7 text-slate-400">
            Click a node to inspect{" "}
            {interactionMode === "blast" ? "downstream blast radius" : "its dependency path"}.
            Drag to pan, scroll to zoom, or double-click the canvas to reset.
          </p>
        </div>

        <div
          className="grid gap-4 xl:grid-cols-[1fr_260px]"
          data-highlight-mode={interactionMode}
          data-selected-node={selectedNodeId ?? ""}
        >
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_30%),linear-gradient(180deg,_rgba(15,23,42,0.96)_0%,_rgba(2,6,23,0.92)_100%)]">
            <svg
              ref={svgRef}
              data-testid="dependency-graph-svg"
              className="h-[640px] w-full"
            />

            {tooltip.visible && tooltip.node ? (
              <div
                data-testid="dependency-graph-tooltip"
                className="pointer-events-none absolute z-20 min-w-[220px] rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 shadow-2xl"
                style={{
                  left: Math.min(tooltip.x, VIEWBOX_WIDTH - 240),
                  top: Math.min(tooltip.y, VIEWBOX_HEIGHT - 140),
                }}
              >
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                  {tooltip.node.isRoot ? "Project root" : tooltip.node.ecosystem}
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {tooltip.node.name}
                </p>
                <p className="mt-1 font-mono text-sm text-slate-300">
                  v{tooltip.node.version || "unknown"}
                </p>
                <div className="mt-3 grid gap-2 text-sm text-slate-300">
                  <p>Risk score: {tooltip.node.riskScore.toFixed(1)}</p>
                  <p>Vulnerabilities: {tooltip.node.vulnerabilityCount}</p>
                  <p>Dependents: {tooltip.node.dependentCount}</p>
                </div>
              </div>
            ) : null}
          </div>

          <div
            data-testid="dependency-graph-legend"
            className="rounded-3xl border border-white/10 bg-slate-900/70 p-4"
          >
            <p className="font-mono text-xs uppercase tracking-[0.26em] text-slate-500">
              Legend
            </p>

            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-center gap-3">
                <span className="size-3 rounded-full bg-emerald-400" />
                <span>No issues detected</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="size-3 rounded-full bg-yellow-400" />
                <span>Low risk</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="size-3 rounded-full bg-orange-400" />
                <span>Medium risk</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="size-3 rounded-full bg-rose-400" />
                <span>High or critical risk</span>
              </div>
            </div>

            <div className="mt-6 space-y-3 text-sm text-slate-300">
              <div className="flex items-center gap-3">
                <span className="h-[2px] w-10 bg-slate-400" />
                <span>Runtime dependency</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-[2px] w-10 border-t-2 border-dashed border-slate-400" />
                <span>Dev dependency</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex size-4 items-center justify-center rounded-full border-2 border-slate-200 bg-slate-400/20" />
                <span>Root project node</span>
              </div>
            </div>

            <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-300">
              <div className="flex items-center gap-2 text-slate-100">
                {interactionMode === "blast" ? (
                  <Orbit className="size-4 text-rose-300" />
                ) : (
                  <Focus className="size-4 text-sky-300" />
                )}
                <span className="font-medium">
                  {interactionMode === "blast"
                    ? "Blast Radius mode"
                    : "Dependency Path mode"}
                </span>
              </div>
              <p className="leading-7 text-slate-400">
                {interactionMode === "blast"
                  ? "Highlights every package that would be affected if the selected node were compromised."
                  : "Highlights the packages the selected node pulls into your install graph."}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
