/**
 * visualMapping.ts 测试 — AC-RL-1（视觉语义为真）
 *
 * 验证每个视觉属性都来自节点的真实内部量：
 *  - 亮度/opacity = confidence × decayFactor
 *  - 大小/size = confidence（越确信越大）
 *  - 脉动/pulse = salience
 *  - 抖动/jitter ← skepticFlag（有质疑才抖动）
 *  - 张力/hasTension ← contradicts（有矛盾才画张力线）
 *  - 闪烁/uncannyFlicker ← isUncanny（恐怖谷才闪烁）
 *  - 下沉/sinkY ← status（pruned 下沉）
 */
import { describe, it, expect } from "vitest";
import { nodeToVisual, graphToVisuals } from "@/viz/visualMapping";
import { SYSTEM_META } from "@/core/types";
import { seedGraph } from "@/data/seed";
import type { CognitiveNode } from "@/core/types";

const NOW = new Date("2026-05-30T15:00:00.000Z");

// 构造一个"刚强化"的基础节点（无衰减，便于测试属性映射）
const BASE_NODE: CognitiveNode = {
  id: "test-node",
  layer: "inference",
  system: "narrative",
  statement: "测试节点",
  confidence: 0.7,
  rawConfidence: 0.72,
  evidence: [{ id: "ev-001", sourceMessageId: "msg-001", quote: "原文", timestamp: NOW.toISOString() }],
  salience: 0.6,
  lastReinforced: NOW.toISOString(), // 刚强化，无衰减
  createdAt: NOW.toISOString(),
  status: "active",
  userVerdict: null,
  isUncanny: false,
  skepticFlag: null,
  contradicts: [],
  position: [0.5, 0.3, -0.1],
};

// ── AC-RL-1：视觉量 = 真实内部量 ─────────────────────────────────────────────

describe("AC-RL-1: Each visual attribute maps to a real internal quantity", () => {
  it("color comes from SYSTEM_META[node.system].color", () => {
    for (const system of Object.keys(SYSTEM_META) as Array<keyof typeof SYSTEM_META>) {
      const node = { ...BASE_NODE, system };
      const visual = nodeToVisual(node, NOW);
      expect(visual.color).toBe(SYSTEM_META[system].color);
    }
  });

  it("size = lerp(0.5, 1.5, confidence): higher confidence → larger size", () => {
    const lowConf = nodeToVisual({ ...BASE_NODE, confidence: 0.0 }, NOW);
    const highConf = nodeToVisual({ ...BASE_NODE, confidence: 1.0 }, NOW);
    expect(lowConf.size).toBe(0.5);
    expect(highConf.size).toBe(1.5);
    expect(lowConf.size).toBeLessThan(highConf.size);
  });

  it("opacity = confidence × decayFactor (recently reinforced node has high opacity)", () => {
    const visual = nodeToVisual(BASE_NODE, NOW);
    // 刚强化 → decayFactor ≈ 1 → opacity ≈ confidence = 0.7
    expect(visual.opacity).toBeCloseTo(0.7, 1);
  });

  it("opacity decreases for older nodes (decay works)", () => {
    const freshNode = { ...BASE_NODE, lastReinforced: NOW.toISOString() };
    const oldNode = {
      ...BASE_NODE,
      lastReinforced: new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const freshOpacity = nodeToVisual(freshNode, NOW).opacity;
    const oldOpacity = nodeToVisual(oldNode, NOW).opacity;
    expect(freshOpacity).toBeGreaterThan(oldOpacity);
  });

  it("pulse = salience (emotional significance → pulse frequency)", () => {
    const lowSal = nodeToVisual({ ...BASE_NODE, salience: 0.1 }, NOW);
    const highSal = nodeToVisual({ ...BASE_NODE, salience: 0.9 }, NOW);
    expect(lowSal.pulse).toBeCloseTo(0.1, 5);
    expect(highSal.pulse).toBeCloseTo(0.9, 5);
  });

  it("jitter=0 when skepticFlag=null (no jitter without skeptic doubt)", () => {
    const visual = nodeToVisual({ ...BASE_NODE, skepticFlag: null }, NOW);
    expect(visual.jitter).toBe(0);
  });

  it("jitter=0.4 when skepticFlag is non-null (skeptic doubt → jitter)", () => {
    const visual = nodeToVisual({ ...BASE_NODE, skepticFlag: "可能过拟合" }, NOW);
    expect(visual.jitter).toBe(0.4);
  });

  it("hasTension=false when contradicts is empty", () => {
    const visual = nodeToVisual({ ...BASE_NODE, contradicts: [] }, NOW);
    expect(visual.hasTension).toBe(false);
  });

  it("hasTension=true when contradicts has items (contradiction → tension line)", () => {
    const visual = nodeToVisual({ ...BASE_NODE, contradicts: ["other-node-id"] }, NOW);
    expect(visual.hasTension).toBe(true);
  });

  it("uncannyFlicker=false for normal nodes", () => {
    const visual = nodeToVisual({ ...BASE_NODE, isUncanny: false }, NOW);
    expect(visual.uncannyFlicker).toBe(false);
  });

  it("uncannyFlicker=true for isUncanny nodes (uncanny valley → eerie flicker)", () => {
    const visual = nodeToVisual({ ...BASE_NODE, isUncanny: true }, NOW);
    expect(visual.uncannyFlicker).toBe(true);
  });

  it("sinkY=0 for active node (not sinking)", () => {
    const visual = nodeToVisual({ ...BASE_NODE, status: "active" }, NOW);
    expect(visual.sinkY).toBe(0);
  });

  it("sinkY=0.5 for pruned node (maximum sink into deep space)", () => {
    const visual = nodeToVisual({ ...BASE_NODE, status: "pruned" }, NOW);
    expect(visual.sinkY).toBe(0.5);
  });

  it("layerDepth: fact=shallow(core), inference=mid(outer)", () => {
    const factNode = nodeToVisual({ ...BASE_NODE, layer: "fact" }, NOW);
    const inferenceNode = nodeToVisual({ ...BASE_NODE, layer: "inference" }, NOW);
    expect(factNode.layerDepth).toBeLessThan(inferenceNode.layerDepth);
  });

  it("position comes from node.position", () => {
    const pos: [number, number, number] = [0.3, -0.5, 0.7];
    const visual = nodeToVisual({ ...BASE_NODE, position: pos }, NOW);
    expect(visual.position).toEqual(pos);
  });

  it("position defaults to [0,0,0] when node has no position", () => {
    const node = { ...BASE_NODE };
    delete (node as Partial<CognitiveNode>).position;
    const visual = nodeToVisual(node, NOW);
    expect(visual.position).toEqual([0, 0, 0]);
  });
});

// ── 批量映射 ──────────────────────────────────────────────────────────────────

describe("graphToVisuals", () => {
  it("returns a Map with one entry per node", () => {
    const nodes = seedGraph.nodes.slice(0, 5);
    const visuals = graphToVisuals(nodes, NOW);
    expect(visuals.size).toBe(5);
    for (const node of nodes) {
      expect(visuals.has(node.id)).toBe(true);
    }
  });

  it("seed graph: all nodes map without error", () => {
    expect(() => graphToVisuals(seedGraph.nodes, NOW)).not.toThrow();
  });

  it("seed graph: uncanny nodes have uncannyFlicker=true", () => {
    const visuals = graphToVisuals(seedGraph.nodes, NOW);
    const uncannyNodes = seedGraph.nodes.filter((n) => n.isUncanny);
    expect(uncannyNodes.length).toBeGreaterThan(0);
    for (const node of uncannyNodes) {
      expect(visuals.get(node.id)?.uncannyFlicker).toBe(true);
    }
  });

  it("seed graph: nodes with skepticFlag have jitter > 0", () => {
    const visuals = graphToVisuals(seedGraph.nodes, NOW);
    const skepticNodes = seedGraph.nodes.filter((n) => n.skepticFlag);
    for (const node of skepticNodes) {
      expect(visuals.get(node.id)?.jitter).toBeGreaterThan(0);
    }
  });
});

// ── 对比测试：高置信 vs 低置信 视觉差异明显 ─────────────────────────────────

describe("High vs low confidence visual differentiation", () => {
  it("high confidence node is visually larger and more opaque", () => {
    const highConf = nodeToVisual({ ...BASE_NODE, confidence: 0.9 }, NOW);
    const lowConf = nodeToVisual({ ...BASE_NODE, confidence: 0.2 }, NOW);

    expect(highConf.size).toBeGreaterThan(lowConf.size);
    expect(highConf.opacity).toBeGreaterThan(lowConf.opacity);
  });
});
