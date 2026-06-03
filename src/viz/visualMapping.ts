/**
 * Mirror / 镜 —— 视觉映射（红线 AC-RL-1：每个视觉量 = 真实内部量）
 *
 * 此文件是视觉语义真实性的核心：
 *  - 每个视觉属性必须来自节点的内部量
 *  - 禁止纯装饰：没有与内部量无关的动效
 *
 * 映射表（与技术方案 7.2 节保持一致）：
 *  ┌─────────────────┬─────────────────────────────────────────────────────┐
 *  │ 视觉属性        │ 来源                                                │
 *  ├─────────────────┼─────────────────────────────────────────────────────┤
 *  │ position        │ n.position（UMAP + 引力偏移，来自 layout.ts）        │
 *  │ color           │ SYSTEM_META[n.system].color（五星团语义颜色）         │
 *  │ size            │ lerp(0.5, 1.5, n.confidence)（置信度）               │
 *  │ opacity         │ n.confidence × decayFactor（置信度 × 衰减）          │
 *  │ pulse           │ n.salience（情绪显著性）                              │
 *  │ jitter          │ n.skepticFlag ? 0.4 : 0（怀疑者质疑）                │
 *  │ hasTension      │ n.contradicts.length > 0（矛盾→张力线）              │
 *  │ layerDepth      │ n.layer（核心/外围/底层）                             │
 *  │ uncannyFlicker  │ n.isUncanny（恐怖谷→幽暗闪烁）                       │
 *  └─────────────────┴─────────────────────────────────────────────────────┘
 */
import type { CognitiveNode } from "@/core/types";
import { SYSTEM_META } from "@/core/types";
import { computeOpacity } from "@/core/decay";

// ─── 输出类型 ────────────────────────────────────────────────────────────────

export interface VisualAttributes {
  /** 3D 坐标（世界空间）。来自 UMAP + 引力偏移。 */
  position: [number, number, number];
  /** 所属系统颜色（hex）。来自 SYSTEM_META。 */
  color: string;
  /** 粒子大小（0.5~1.5）。置信度越高越大。 */
  size: number;
  /** 不透明度（0~1）。置信度 × 衰减因子。 */
  opacity: number;
  /** 呼吸脉动频率（0~1）。情绪显著性越高越明显。 */
  pulse: number;
  /** 抖动幅度（0~1）。怀疑者质疑时抖动；无质疑时为 0。 */
  jitter: number;
  /** 是否有矛盾张力线。`true` → 绘制张力线到 contradicts 节点。 */
  hasTension: boolean;
  /** 层深度（影响节点在星云中的径向位置）。fact=核心, inference=外围, evolution=底层沉积。 */
  layerDepth: number;
  /** 是否恐怖谷闪烁。isUncanny=true → 幽暗不规则闪烁。 */
  uncannyFlicker: boolean;
  /** 状态 sink（pruned=下沉到深空，decaying=轻微下沉）。 */
  sinkY: number;
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/** 线性插值。 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/** 节点层 → 层深度（影响星云中的径向位置）。 */
function layerToDepth(layer: CognitiveNode["layer"]): number {
  switch (layer) {
    case "fact":      return 0.1; // 事实层=内核（稳定，靠近中心）
    case "inference": return 0.6; // 推断层=外围流动气体
    default:          return 1.0; // evolution（底层沉积，实际上是事件不是节点）
  }
}

// ─── 主映射函数 ──────────────────────────────────────────────────────────────

/**
 * 将 CognitiveNode 转换为视觉属性。
 *
 * 红线：此函数的每一行输出都必须映射到节点的真实内部量。
 * 任何"为了好看而加"的属性都违反 AC-RL-1。
 *
 * @param node   完整认知节点
 * @param now    当前时间（用于衰减计算，默认 new Date()）
 */
export function nodeToVisual(
  node: CognitiveNode,
  now: Date = new Date()
): VisualAttributes {
  const opacity = computeOpacity(node, now);

  // size = 置信度越高越大：confidence ∈ [0,1] → size ∈ [0.5, 1.5]
  const size = lerp(0.5, 1.5, node.confidence);

  // pulse = 情绪显著性：salience ∈ [0,1]（直接映射，不缩放）
  const pulse = node.salience;

  // jitter = 怀疑者正在质疑：有 skepticFlag → 0.4，否则 0
  const jitter = node.skepticFlag ? 0.4 : 0;

  // sinkY: pruned 下沉 0.5，decaying 轻微下沉 0.15，active 不下沉
  let sinkY = 0;
  if (node.status === "pruned") sinkY = 0.5;
  else if (node.status === "decaying") sinkY = 0.15 * (1 - opacity);

  return {
    position: node.position ?? [0, 0, 0],
    color: SYSTEM_META[node.system].color,
    size,
    opacity,
    pulse,
    jitter,
    hasTension: node.contradicts.length > 0,
    layerDepth: layerToDepth(node.layer),
    uncannyFlicker: node.isUncanny,
    sinkY,
  };
}

/**
 * 批量映射：对整张图的节点批量计算视觉属性。
 */
export function graphToVisuals(
  nodes: CognitiveNode[],
  now: Date = new Date()
): Map<string, VisualAttributes> {
  const result = new Map<string, VisualAttributes>();
  for (const node of nodes) {
    result.set(node.id, nodeToVisual(node, now));
  }
  return result;
}
