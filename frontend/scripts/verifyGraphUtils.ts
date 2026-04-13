import assert from "node:assert/strict";

import mockScanResult from "../src/lib/mocks/mock-scan-result.json";
import {
  calculateBlastRadius,
  transformToGraphData,
} from "../src/lib/graphUtils";
import type { ScanResult } from "../src/lib/types";

const scanResult = mockScanResult as ScanResult;
const graphData = transformToGraphData(scanResult);

assert.equal(graphData.nodes.length, 20, "Expected 20 nodes including root and transitive packages");
assert.equal(graphData.links.length, 19, "Expected 19 dependency links");

const rootNode = graphData.nodes.find((node) => node.isRoot);
assert.ok(rootNode, "Expected a root node");
assert.equal(rootNode?.id, "shadowaudit-demo");
assert.equal(rootNode?.riskBand, "high");

const expresssNode = graphData.nodes.find((node) => node.id === "expresss");
assert.ok(expresssNode, "Expected typosquat node to exist");
assert.equal(expresssNode?.riskBand, "high");

const reactBlastRadius = calculateBlastRadius("react", graphData.links);
assert.deepEqual(
  reactBlastRadius,
  ["next", "shadowaudit-demo"],
  "Blast radius should walk dependents back to the root",
);

const linearBlastRadius = calculateBlastRadius("C", [
  { source: "A", target: "B", isDevDependency: false },
  { source: "B", target: "C", isDevDependency: false },
]);
assert.deepEqual(linearBlastRadius, ["B", "A"]);

const isolatedBlastRadius = calculateBlastRadius("scheduler", [
  { source: "next", target: "react", isDevDependency: false },
  { source: "react-dom", target: "scheduler", isDevDependency: false },
]);
assert.deepEqual(
  isolatedBlastRadius,
  ["react-dom"],
  "Only direct dependents should be returned when there is no higher ancestor",
);

const noDependents = calculateBlastRadius("lonely", [
  { source: "A", target: "B", isDevDependency: false },
]);
assert.deepEqual(noDependents, []);

console.log("Graph utility verification passed.");
