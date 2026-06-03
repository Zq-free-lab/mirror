/**
 * Mirror / 镜 —— 视觉主题（Art Direction SSOT）「深空全息神经场 / Cognitive Holodeck」
 *
 * R2.0：这是 viz 层所有取色 / 字体 / HUD / 后处理 / 动效常量的**唯一来源**。
 * 规则：viz 层禁止散落硬编码颜色与魔法数，一律从此文件 import。
 *
 * 与 core 的关系：
 *  - 系统主色（base）从 `core/types.ts` 的 `SYSTEM_META.color` 派生，保持"系统色单一来源"；
 *    此处仅补充每个系统的 core（亮核）/ glow（外层 halo）变体，以及其余主题量。
 *  - 红线（AC-RL-1）：颜色 = 真实认知系统、亮度 = 真实置信度。主题只定义"长什么样"，
 *    不得改变"语义为真"。本文件不引入任何与内部量无关的纯装饰色。
 *
 * 气质参考：《Oblivion》全息台 / Apple Vision Pro 空间 UI / 科幻片神经构建。
 * 关键词：克制冷色 + 精密细节 + 真实的光 + HUD 数据层。
 */
import type { CognitiveSystemId } from "@/core/types";
import { SYSTEM_META } from "@/core/types";

// ─── A. 基底 / 深空背景 ─────────────────────────────────────────────────────
export const BG = {
  /** 背景径向渐变：中心略亮、边缘极暗（非纯黑）。 */
  top: "#03060D",
  bottom: "#070C18",
  /** FogExp2 体积雾（景深）。 */
  fogColor: "#050A14",
  fogDensity: 0.085,
  /** 后处理暗角强度（0~1）。 */
  vignette: 0.45,
} as const;

// ─── 全息强调色（HUD 描边 / 引导线 / 参考网格 / 张力线 / 暖核）─────────────────
export const HOLO = {
  /** 统一全息青——HUD 描边、引导线、参考网格、读数高亮。 */
  line: "#5FE0FF",
  lineDim: "#2A4A5C",
  /** 暖核（与叙事核同源）：代表"自我"，全场唯一暖色锚点。 */
  warmCore: "#FFE7A8",
  /** 矛盾张力线专用警示色（仅张力线，禁止用作节点底色）。 */
  tension: "#FF5A3C",
} as const;

// ─── 系统色板（base 派生自 SYSTEM_META，补 core/glow 变体）───────────────────
export interface SystemColorSet {
  /** 主色 = SYSTEM_META.color（系统色单一来源）。 */
  base: string;
  /** 亮核色（更亮、偏白），用于能量体内核。 */
  core: string;
  /** 外层 halo 色（同色相、低亮），用于 additive 辉光 sprite。 */
  glow: string;
}

export const SYSTEM_COLORS: Record<CognitiveSystemId, SystemColorSet> = {
  narrative: { base: SYSTEM_META.narrative.color, core: "#FFF6DC", glow: "#FFD27A" }, // 暖白金
  affect:    { base: SYSTEM_META.affect.color,    core: "#FFAAD0", glow: "#FF1E6E" }, // 品红霓虹
  valence:   { base: SYSTEM_META.valence.color,   core: "#BFFFF0", glow: "#10D9A8" }, // 薄荷青
  social:    { base: SYSTEM_META.social.color,    core: "#BFE0FF", glow: "#2A8CFF" }, // 电光蓝
  rhythm:    { base: SYSTEM_META.rhythm.color,    core: "#CFC4FF", glow: "#6B47FF" }, // 靛紫
} as const;

export function systemColor(id: CognitiveSystemId): SystemColorSet {
  return SYSTEM_COLORS[id];
}

// ─── B. 节点 = 能量体（非实心球）渲染参数 ────────────────────────────────────
export const NODE = {
  /** 亮核占整体直径比例。 */
  coreSizeRatio: 0.35,
  /** 菲涅尔边缘光强度指数（越大边缘越锐）。 */
  fresnelPower: 2.5,
  /** halo sprite 相对核心的尺寸倍数。 */
  haloSizeRatio: 2.4,
  /** 置信度 → 节点尺寸范围（与 visualMapping 对齐，集中为常量）。 */
  sizeMin: 0.5,
  sizeMax: 1.5,
  /** 置信度 → 内核锐度（低置信=朦胧，高置信=锐亮）。 */
  coreSharpnessLow: 0.15,
  coreSharpnessHigh: 1.0,
  /** 内部等离子噪声扰动幅度。 */
  noiseAmp: 0.06,
} as const;

// ─── C. 后处理 ──────────────────────────────────────────────────────────────
export const POST = {
  bloomIntensity: 1.6,
  bloomThreshold: 0.18,
  bloomSmoothing: 0.9,
  /** 极轻色散，增电影/全息感（过大显廉价）。 */
  chromaticAberration: 0.0008,
} as const;

// ─── D. HUD 数据层（逼格关键）───────────────────────────────────────────────
export const HUD = {
  /** 玻璃拟态信息卡。 */
  glass: {
    bg: "rgba(8,14,26,0.62)",
    border: "rgba(95,224,255,0.35)",
    blur: "12px",
    innerGlow: "rgba(95,224,255,0.12)",
    radius: 14,
  },
  /** 屏幕四角 L 形角标。 */
  cornerBracket: { size: 26, thickness: 1.5, color: HOLO.line, opacity: 0.5 },
  /** hover 信息卡引导线。 */
  leaderLine: { color: HOLO.line, opacity: 0.6, width: 1 },
  /** 置信度环形仪表配色。 */
  gauge: {
    track: "rgba(255,255,255,0.12)",
    lowConf: "#FF5A3C",
    midConf: "#FFC24D",
    highConf: HOLO.line,
  },
} as const;

/** 置信度 → HUD 仪表颜色（低=红橙警示 / 中=琥珀 / 高=全息青）。语义为真：颜色映射真实置信度。 */
export function confidenceColor(conf: number): string {
  if (conf < 0.4) return HUD.gauge.lowConf;
  if (conf < 0.7) return HUD.gauge.midConf;
  return HUD.gauge.highConf;
}

// ─── E. 字体 ────────────────────────────────────────────────────────────────
export const FONT = {
  /** 标题 / 中文：细字重无衬线。 */
  sans: "'Noto Sans SC', system-ui, -apple-system, sans-serif",
  sansWeight: 300,
  /** 数字 / 脑区名 / HUD 读数：等宽（科技感来源）。 */
  mono: "'JetBrains Mono', 'Geist Mono', ui-monospace, SFMono-Regular, monospace",
} as const;

// ─── F. 动效语汇（统一时长，单位 ms）────────────────────────────────────────
export const MOTION = {
  /** 一切出现走"光"：淡入 + 辉光涨落。 */
  fadeInMs: 700,
  /** 初始化自下而上扫描光面（构建点亮星云）。 */
  scanlineMs: 2200,
  /** 节点呼吸基准周期（实际按 salience 缩放）。 */
  breathBaseMs: 4200,
  /** 相机缓慢轨道漂移速度。 */
  cameraDriftSpeed: 0.04,
  /** 新推断节点凝结生长时长。 */
  growMs: 1200,
} as const;
