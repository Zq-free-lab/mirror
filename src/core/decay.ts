/**
 * Mirror / 镜 —— 记忆衰减 / 显著性模型
 *
 * 公式（来自技术方案 5.5）：
 *   opacity = clamp(base * salience * decayFactor(now - lastReinforced), 0, 1)
 *   decayFactor(Δt) = exp(-λ * Δt / halfLife)
 *
 * 视觉语义（红线 AC-RL-1）：
 *   - 亮度/不透明度 = confidence × decayFactor（越旧越暗）
 *   - y 轴下沉 = 衰减量（越暗越沉入深空）
 *   - status='pruned'：opacity 超阈值 → 节点被标为剪枝（AC-DEC-2）
 *
 * 高 salience 节点（情绪显著性高）衰减更慢，模拟"情绪记忆更难忘"。
 *
 * AC-DEC-1：lastReinforced 越久 → opacity 越低（单调）；高 salience 衰减更慢。
 * AC-DEC-2：超过阈值的节点 status 变 'pruned'。
 */
import type { CognitiveNode } from "./types";

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 默认半衰期：30 天（ms）。30天后 opacity 降到 base 的 50%。 */
export const DEFAULT_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/** opacity 低于此阈值 → 标 'pruned'（AC-DEC-2）。 */
export const PRUNE_THRESHOLD = 0.1;

/** base opacity：满置信度的节点的初始亮度。 */
const BASE_OPACITY = 1.0;

// ─── 衰减因子 ────────────────────────────────────────────────────────────────

/**
 * 计算衰减因子（0~1）。
 *
 * decayFactor = exp(-ln(2) * Δt / (halfLife * salienceBoost))
 * salienceBoost：高 salience 节点半衰期延长（最多 2x）
 *
 * @param deltaMs    距上次强化的毫秒数
 * @param salience   情绪显著性（0~1），越高衰减越慢
 * @param halfLifeMs 基准半衰期（ms）
 */
export function computeDecayFactor(
  deltaMs: number,
  salience: number,
  halfLifeMs = DEFAULT_HALF_LIFE_MS
): number {
  // 高 salience → 半衰期延长，最多 2 倍
  const salienceBoost = 1 + salience; // [1, 2]
  const effectiveHalfLife = halfLifeMs * salienceBoost;
  return Math.exp((-Math.LN2 * deltaMs) / effectiveHalfLife);
}

// ─── 节点 opacity ────────────────────────────────────────────────────────────

/**
 * 计算节点当前 opacity（视觉亮度）。
 *
 * opacity = clamp(base * confidence * decayFactor(Δt, salience), 0, 1)
 *
 * @param node  完整认知节点
 * @param now   当前时间戳（ISO 字符串或 Date）
 * @param halfLifeMs 基准半衰期
 */
export function computeOpacity(
  node: Pick<CognitiveNode, "confidence" | "salience" | "lastReinforced" | "status">,
  now: Date | string = new Date(),
  halfLifeMs = DEFAULT_HALF_LIFE_MS
): number {
  if (node.status === "pruned") return 0;

  const nowMs = typeof now === "string" ? new Date(now).getTime() : now.getTime();
  const lastMs = new Date(node.lastReinforced).getTime();
  const deltaMs = Math.max(0, nowMs - lastMs);

  const decayFactor = computeDecayFactor(deltaMs, node.salience, halfLifeMs);
  const raw = BASE_OPACITY * node.confidence * decayFactor;
  return Math.max(0, Math.min(1, raw));
}

// ─── y 轴下沉量 ──────────────────────────────────────────────────────────────

/**
 * 计算 y 轴下沉量（视觉上"向深空坠落"）。
 *
 * sinkAmount = (1 - opacity) * maxSink
 *
 * @param opacity    节点当前 opacity
 * @param maxSink    最大下沉量（世界坐标，默认 0.5）
 */
export function computeSinkAmount(opacity: number, maxSink = 0.5): number {
  return (1 - Math.max(0, Math.min(1, opacity))) * maxSink;
}

// ─── 批量衰减应用 ────────────────────────────────────────────────────────────

export interface DecayResult {
  id: string;
  opacity: number;
  sinkY: number;
  /** 若为 true，status 应变为 'pruned'（AC-DEC-2）。 */
  shouldPrune: boolean;
}

/**
 * 对节点列表批量计算衰减结果。
 *
 * 不直接修改节点（纯函数）；调用层决定是否写入 IndexedDB。
 *
 * @param nodes      待计算的节点列表
 * @param now        当前时间（ISO 或 Date）
 * @param halfLifeMs 基准半衰期
 */
export function applyDecay(
  nodes: Pick<CognitiveNode, "id" | "confidence" | "salience" | "lastReinforced" | "status">[],
  now: Date | string = new Date(),
  halfLifeMs = DEFAULT_HALF_LIFE_MS
): DecayResult[] {
  return nodes.map((node) => {
    const opacity = computeOpacity(node, now, halfLifeMs);
    const sinkY = computeSinkAmount(opacity);
    const shouldPrune = opacity < PRUNE_THRESHOLD && node.status !== "pruned";
    return { id: node.id, opacity, sinkY, shouldPrune };
  });
}
