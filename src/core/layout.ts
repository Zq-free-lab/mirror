/**
 * Mirror / 镜 —— UMAP 布局 + 星团引力偏移
 *
 * 职责：把 embedding 向量降维到 3D 语义坐标，
 * 再叠加星团引力（anchor）偏移，使同系统节点自然聚拢。
 *
 * 公式：pos = umapPos * w + anchor * (1-w)，默认 w=0.6
 *   → 60% 语义结构 + 40% 星团引力 = 既保留语义距离又形成星团
 *
 * 红线（AC-RL-1 视觉语义为真）：position 来自语义 embedding，不是随机/装饰。
 *
 * AC-LAY-1：同系统节点质心比随机更靠近其 SYSTEM_META.anchor。
 * AC-LAY-2：输入不变时布局可复现（固定 UMAP 随机种子）。
 *
 * 注意：umap-js 在 Node.js / jsdom 下可直接运行（无 DOM 依赖）。
 * 测试层使用 MockEmbeddingProvider（确定性 8 维向量），全程不加载真实模型。
 */
import { UMAP } from "umap-js";
import type { CognitiveSystemId } from "./types";
import { SYSTEM_META } from "./types";

export type Position3D = [number, number, number];

export interface LayoutNode {
  id: string;
  system: CognitiveSystemId;
  embedding: number[];
}

export interface LayoutResult {
  id: string;
  position: Position3D;
}

/** 引力权重：w=0.6 → 60% 语义 + 40% 星团引力。 */
const GRAVITY_WEIGHT = 0.6;

/** 默认 UMAP 随机种子（固定 → 布局可复现，AC-LAY-2）。 */
const DEFAULT_SEED = 42;

/**
 * 对节点 embedding 做 UMAP 3D 降维并叠加星团引力。
 *
 * @param nodes   待布局节点（必须有 embedding）
 * @param seed    UMAP 随机种子（默认 42，固定保证可复现）
 * @param w       引力权重（0=纯引力，1=纯语义，默认 0.6）
 */
export function computeLayout(
  nodes: LayoutNode[],
  seed = DEFAULT_SEED,
  w = GRAVITY_WEIGHT
): LayoutResult[] {
  if (nodes.length === 0) return [];

  // UMAP 需要至少 2 个样本；不足时退回到引力中心
  if (nodes.length < 2) {
    return nodes.map((n) => ({
      id: n.id,
      position: SYSTEM_META[n.system].anchor,
    }));
  }

  const dim = nodes[0].embedding.length;
  const nComponents = Math.min(3, dim) as 3; // 降到 3D，dim 不足时降到 dim

  const umap = new UMAP({
    nComponents,
    nNeighbors: Math.min(15, nodes.length - 1), // 邻居数不超过节点数-1
    random: mulberry32(seed), // 固定随机种子
  });

  const embeddings = nodes.map((n) => n.embedding);
  const rawPositions = umap.fit(embeddings);

  // 归一化 UMAP 坐标到 [-1, 1]
  const normalized = normalizePositions(rawPositions, nComponents);

  // 叠加星团引力偏移
  return nodes.map((n, i) => {
    const umapPos = normalized[i] as Position3D;
    const anchor = SYSTEM_META[n.system].anchor;
    const position: Position3D = [
      umapPos[0] * w + anchor[0] * (1 - w),
      umapPos[1] * w + anchor[1] * (1 - w),
      (umapPos[2] ?? 0) * w + anchor[2] * (1 - w),
    ];
    return { id: n.id, position };
  });
}

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

/** 把 UMAP 原始坐标归一化到 [-1, 1]。 */
function normalizePositions(
  raw: number[][],
  nComponents: number
): number[][] {
  const mins = Array(nComponents).fill(Infinity);
  const maxs = Array(nComponents).fill(-Infinity);

  for (const row of raw) {
    for (let d = 0; d < nComponents; d++) {
      const v = row[d] ?? 0;
      if (v < mins[d]) mins[d] = v;
      if (v > maxs[d]) maxs[d] = v;
    }
  }

  return raw.map((row) =>
    Array.from({ length: nComponents }, (_, d) => {
      const v = row[d] ?? 0;
      const range = maxs[d] - mins[d];
      return range === 0 ? 0 : ((v - mins[d]) / range) * 2 - 1;
    })
  );
}

/** Mulberry32 PRNG（给 UMAP 提供固定随机种子，保证可复现）。 */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
