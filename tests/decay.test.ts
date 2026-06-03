/**
 * 衰减模块测试 — AC-DEC-1 / AC-DEC-2
 *
 * AC-DEC-1：lastReinforced 越久 → opacity 越低（单调）；高 salience 衰减更慢。
 * AC-DEC-2：超过阈值的节点 shouldPrune=true（status 应变 'pruned'）。
 */
import { describe, it, expect } from "vitest";
import {
  computeDecayFactor,
  computeOpacity,
  computeSinkAmount,
  applyDecay,
  DEFAULT_HALF_LIFE_MS,
  PRUNE_THRESHOLD,
} from "@/core/decay";

const NOW = new Date("2026-06-01T00:00:00.000Z");

/** 构造一个 ago 天前的 lastReinforced ISO 字符串。 */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

const BASE_NODE = {
  id: "test-node",
  confidence: 0.7,
  salience: 0.5,
  lastReinforced: daysAgo(0),
  status: "active" as const,
};

// ── AC-DEC-1：单调性 + salience 保护 ────────────────────────────────────────

describe("AC-DEC-1: Opacity decreases monotonically with time; salience slows decay", () => {
  it("opacity is 1.0 when just reinforced (delta=0)", () => {
    const node = { ...BASE_NODE, confidence: 1.0, lastReinforced: NOW.toISOString() };
    const opacity = computeOpacity(node, NOW);
    expect(opacity).toBeCloseTo(1.0, 3);
  });

  it("opacity decreases as lastReinforced gets older (monotonic)", () => {
    const opacities = [0, 7, 30, 90, 180].map((days) => {
      const node = { ...BASE_NODE, lastReinforced: daysAgo(days) };
      return computeOpacity(node, NOW);
    });

    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeLessThan(opacities[i - 1]);
    }
  });

  it("higher salience → higher opacity at same age (slower decay)", () => {
    const age = daysAgo(60);
    const lowSalience = computeOpacity(
      { ...BASE_NODE, salience: 0.1, lastReinforced: age },
      NOW
    );
    const highSalience = computeOpacity(
      { ...BASE_NODE, salience: 0.9, lastReinforced: age },
      NOW
    );
    expect(highSalience).toBeGreaterThan(lowSalience);
  });

  it("lower confidence → lower opacity (confidence scales brightness)", () => {
    const age = daysAgo(30);
    const lowConf = computeOpacity(
      { ...BASE_NODE, confidence: 0.3, lastReinforced: age },
      NOW
    );
    const highConf = computeOpacity(
      { ...BASE_NODE, confidence: 0.9, lastReinforced: age },
      NOW
    );
    expect(highConf).toBeGreaterThan(lowConf);
  });

  it("opacity is in [0, 1] for all realistic inputs", () => {
    const cases = [
      { days: 0, confidence: 1.0, salience: 0.5 },
      { days: 30, confidence: 0.5, salience: 0.3 },
      { days: 365, confidence: 0.3, salience: 0.1 },
      { days: 1000, confidence: 0.2, salience: 0.0 },
    ];
    for (const { days, confidence, salience } of cases) {
      const node = { ...BASE_NODE, confidence, salience, lastReinforced: daysAgo(days) };
      const opacity = computeOpacity(node, NOW);
      expect(opacity).toBeGreaterThanOrEqual(0);
      expect(opacity).toBeLessThanOrEqual(1);
    }
  });

  it("pruned node always returns opacity=0", () => {
    const node = { ...BASE_NODE, status: "pruned" as const, lastReinforced: daysAgo(0) };
    const opacity = computeOpacity(node, NOW);
    expect(opacity).toBe(0);
  });

  it("computeDecayFactor returns 0.5 at exactly one half-life", () => {
    const factor = computeDecayFactor(DEFAULT_HALF_LIFE_MS, 0); // salience=0 → salienceBoost=1
    expect(factor).toBeCloseTo(0.5, 3);
  });

  it("high salience at half-life → decay factor > 0.5 (salience extends half-life)", () => {
    const factor = computeDecayFactor(DEFAULT_HALF_LIFE_MS, 1.0); // max salience
    expect(factor).toBeGreaterThan(0.5);
  });
});

// ── AC-DEC-2：剪枝阈值 ───────────────────────────────────────────────────────

describe("AC-DEC-2: Nodes below prune threshold are marked for pruning", () => {
  it("shouldPrune=true when opacity < PRUNE_THRESHOLD", () => {
    // 极长时间未强化，低置信度
    const node = {
      ...BASE_NODE,
      confidence: 0.1,
      salience: 0.0,
      lastReinforced: daysAgo(1000),
    };
    const [result] = applyDecay([node], NOW);
    expect(result.opacity).toBeLessThan(PRUNE_THRESHOLD);
    expect(result.shouldPrune).toBe(true);
  });

  it("shouldPrune=false for recently reinforced high-confidence node", () => {
    const [result] = applyDecay([{ ...BASE_NODE, lastReinforced: daysAgo(1) }], NOW);
    expect(result.shouldPrune).toBe(false);
  });

  it("already-pruned node has shouldPrune=false (don't double-prune)", () => {
    const node = { ...BASE_NODE, status: "pruned" as const, lastReinforced: daysAgo(1000) };
    const [result] = applyDecay([node], NOW);
    expect(result.opacity).toBe(0);
    expect(result.shouldPrune).toBe(false);
  });
});

// ── 下沉量 ───────────────────────────────────────────────────────────────────

describe("computeSinkAmount", () => {
  it("opacity=1.0 → sinkY=0 (fully bright, no sinking)", () => {
    expect(computeSinkAmount(1.0)).toBe(0);
  });

  it("opacity=0.0 → sinkY=maxSink (completely dark, maximum sinking)", () => {
    expect(computeSinkAmount(0.0)).toBe(0.5);
  });

  it("sinkY increases as opacity decreases (monotonic)", () => {
    const opacities = [1.0, 0.8, 0.5, 0.2, 0.0];
    const sinks = opacities.map(computeSinkAmount);
    for (let i = 1; i < sinks.length; i++) {
      expect(sinks[i]).toBeGreaterThanOrEqual(sinks[i - 1]);
    }
  });
});

// ── applyDecay 批量 ──────────────────────────────────────────────────────────

describe("applyDecay batch", () => {
  it("returns result for each input node", () => {
    const nodes = [
      { ...BASE_NODE, id: "n1", lastReinforced: daysAgo(5) },
      { ...BASE_NODE, id: "n2", lastReinforced: daysAgo(60) },
      { ...BASE_NODE, id: "n3", lastReinforced: daysAgo(365) },
    ];
    const results = applyDecay(nodes, NOW);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("results are ordered by decreasing opacity (older → darker)", () => {
    const nodes = [
      { ...BASE_NODE, id: "fresh", lastReinforced: daysAgo(1) },
      { ...BASE_NODE, id: "old", lastReinforced: daysAgo(365) },
    ];
    const results = applyDecay(nodes, NOW);
    const fresh = results.find((r) => r.id === "fresh")!;
    const old = results.find((r) => r.id === "old")!;
    expect(fresh.opacity).toBeGreaterThan(old.opacity);
  });
});
