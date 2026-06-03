/**
 * Layout 测试 — AC-LAY-1 / AC-LAY-2
 *
 * AC-LAY-1：layout 输出每节点 3D 坐标；同一 system 的节点质心比随机更靠近其 anchor。
 * AC-LAY-2：输入不变时布局可复现（固定随机种子）。
 */
import { describe, it, expect } from "vitest";
import { computeLayout, type LayoutNode } from "@/core/layout";
import { MockEmbeddingProvider } from "./mocks/MockEmbeddingProvider";
import { SYSTEM_META } from "@/core/types";

// 用 MockEmbeddingProvider 生成确定性 embedding
const provider = new MockEmbeddingProvider(8); // 8 维，节省 UMAP 计算

async function makeNodes(
  count: number,
  system: "narrative" | "affect" | "valence" | "social" | "rhythm",
  prefix = "node"
): Promise<LayoutNode[]> {
  const texts = Array.from({ length: count }, (_, i) => `${prefix}-${system}-${i}`);
  const embeddings = await provider.embed(texts);
  return texts.map((_, i) => ({
    id: `${prefix}-${system}-${i}`,
    system,
    embedding: embeddings[i],
  }));
}

// ── AC-LAY-1：3D 坐标输出 + 星团引力 ───────────────────────────────────────

describe("AC-LAY-1: Layout outputs 3D positions with cluster gravity", () => {
  it("returns one result per input node", async () => {
    const nodes = [
      ...(await makeNodes(3, "narrative")),
      ...(await makeNodes(3, "affect")),
    ];

    const result = computeLayout(nodes);

    expect(result).toHaveLength(nodes.length);
  });

  it("each result has a position tuple of length 3", async () => {
    const nodes = await makeNodes(5, "narrative");
    const result = computeLayout(nodes);

    for (const r of result) {
      expect(r.position).toHaveLength(3);
      expect(typeof r.position[0]).toBe("number");
      expect(typeof r.position[1]).toBe("number");
      expect(typeof r.position[2]).toBe("number");
    }
  });

  it("result node ids match input node ids", async () => {
    const nodes = await makeNodes(4, "social");
    const result = computeLayout(nodes);
    const inputIds = new Set(nodes.map((n) => n.id));
    for (const r of result) {
      expect(inputIds).toContain(r.id);
    }
  });

  it("positions are finite numbers (no NaN or Infinity)", async () => {
    const nodes = [
      ...(await makeNodes(4, "narrative")),
      ...(await makeNodes(3, "affect")),
      ...(await makeNodes(2, "valence")),
    ];
    const result = computeLayout(nodes);

    for (const r of result) {
      for (const v of r.position) {
        expect(isFinite(v)).toBe(true);
      }
    }
  });

  it("gravity pulls same-system centroid toward anchor (AC-LAY-1 core)", async () => {
    // 创建两个系统的节点：narrative（anchor=[0, 0.6, 0]）和 affect（anchor=[0.9, 0.1, 0.2]）
    const narrativeNodes = await makeNodes(6, "narrative", "n");
    const affectNodes = await makeNodes(6, "affect", "a");
    const allNodes = [...narrativeNodes, ...affectNodes];

    const result = computeLayout(allNodes);

    const narrativePositions = result.filter((r) =>
      narrativeNodes.some((n) => n.id === r.id)
    );
    const affectPositions = result.filter((r) =>
      affectNodes.some((n) => n.id === r.id)
    );

    // 计算各系统质心
    const narrativeCentroid = centroid(narrativePositions.map((r) => r.position));
    const affectCentroid = centroid(affectPositions.map((r) => r.position));

    const narrativeAnchor = SYSTEM_META.narrative.anchor;
    const affectAnchor = SYSTEM_META.affect.anchor;

    // 各系统质心到自己 anchor 的距离，应小于到对方 anchor 的距离（引力生效）
    const dNarrativeToOwn = dist3d(narrativeCentroid, narrativeAnchor);
    const dNarrativeToOther = dist3d(narrativeCentroid, affectAnchor);
    expect(dNarrativeToOwn).toBeLessThan(dNarrativeToOther);

    const dAffectToOwn = dist3d(affectCentroid, affectAnchor);
    const dAffectToOther = dist3d(affectCentroid, narrativeAnchor);
    expect(dAffectToOwn).toBeLessThan(dAffectToOther);
  });

  it("single node returns anchor position (no UMAP needed)", async () => {
    const [node] = await makeNodes(1, "rhythm");
    const result = computeLayout([node]);

    expect(result).toHaveLength(1);
    expect(result[0].position).toEqual(SYSTEM_META.rhythm.anchor);
  });

  it("empty input returns empty result", () => {
    const result = computeLayout([]);
    expect(result).toHaveLength(0);
  });
});

// ── AC-LAY-2：可复现性 ────────────────────────────────────────────────────────

describe("AC-LAY-2: Layout is reproducible with fixed seed", () => {
  it("same nodes + same seed → identical positions", async () => {
    const nodes = [
      ...(await makeNodes(5, "narrative")),
      ...(await makeNodes(5, "affect")),
    ];

    const result1 = computeLayout(nodes, 42);
    const result2 = computeLayout(nodes, 42);

    expect(result1).toEqual(result2);
  });

  it("different seed → potentially different positions", async () => {
    const nodes = [
      ...(await makeNodes(5, "narrative")),
      ...(await makeNodes(5, "affect")),
    ];

    const result1 = computeLayout(nodes, 42);
    const result2 = computeLayout(nodes, 999);

    // 不同种子通常产生不同结果（不严格，可能碰巧相等，但实践上不会）
    const pos1 = result1[0].position;
    const pos2 = result2[0].position;
    // 至少有一个坐标不同（极小概率全同）
    const allSame = pos1.every((v, i) => Math.abs(v - pos2[i]) < 1e-10);
    // 注：若此处偶尔失败，可放宽为 "只是记录" 而非断言
    // 因为这取决于 UMAP 内部实现，非强硬约束
    expect(allSame).toBe(false);
  });
});

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

function centroid(positions: [number, number, number][]): [number, number, number] {
  const n = positions.length;
  const sum = positions.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

function dist3d(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
