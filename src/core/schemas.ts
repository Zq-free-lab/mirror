/**
 * Mirror / 镜 —— 核心数据 Schema（Zod）
 *
 * 设计哲学（务必遵守）：
 *  - 本文件是整个系统的「数据形状唯一来源」(SSOT)。所有类型由 types.ts 用 z.infer 导出。
 *  - 严格区分两类 schema：
 *      ① **Draft（草稿）**：LLM 被允许输出的形状。只含「LLM 该负责的语义内容」
 *         （statement / rawConfidence / evidence 的 quote 等），
 *         **不含** id / 时间戳 / 校准后 confidence / embedding / position / 运行时状态。
 *      ② **Full（完整）**：运行时与持久化的形状。由 pipeline 代码在 draft 基础上补全
 *         id、createdAt、校准后的 confidence、skeptic/reconciler 标记，前端再补 embedding/position。
 *  - 红线：禁止让 LLM 直接产出 id / createdAt / 最终 confidence。校准必须由 calibration.ts 计算。
 *
 * 所有 LLM 输出必须经对应 schema.parse() 校验，失败按重试策略处理（见 llm/provider.ts）。
 */
import { z } from 'zod';

// ───────────────────────── 枚举 ─────────────────────────

/** 五个认知系统（星团）。对应「有机本体设计.md」第三节。 */
export const cognitiveSystemSchema = z.enum([
  'narrative', // 叙事核 · 默认模式网络 DMN
  'affect',    // 情动潮汐 · 杏仁核 / 边缘系统
  'valence',   // 趋避场 · 眶额皮层 OFC
  'social',    // 他者之镜 · 颞顶联合区 TPJ
  'rhythm',    // 节律之根 · 基底神经节
]);

/** 三层记忆。fact=语义记忆, inference=海马未固化预测, evolution=重固化沉积。 */
export const memoryLayerSchema = z.enum(['fact', 'inference', 'evolution']);

/** 节点生命状态。 */
export const nodeStatusSchema = z.enum(['active', 'decaying', 'pruned']);

/** 用户对一条推断的裁决（否决权）。null = 尚未裁决。 */
export const userVerdictSchema = z
  .enum(['confirmed', 'denied', 'dont_guess'])
  .nullable();

// ───────────────────────── 证据 ─────────────────────────

/** 证据（草稿）：LLM 输出时只需指回原句。 */
export const evidenceDraftSchema = z.object({
  sourceMessageId: z.string(), // 指回 RawMessage.id
  quote: z.string().min(1),    // 原文片段，供 UI 溯源高亮
});

/** 证据（完整）：代码补全 id 与 timestamp。 */
export const evidenceSchema = evidenceDraftSchema.extend({
  id: z.string(),
  timestamp: z.string(), // ISO
});

// ───────────────────────── 认知节点 ─────────────────────────

/** 认知节点（完整，运行时 / 持久化）。 */
export const cognitiveNodeSchema = z.object({
  id: z.string(),
  layer: z.enum(['fact', 'inference']), // evolution 不是节点，是事件流
  system: cognitiveSystemSchema,
  statement: z.string().min(1),
  /** 校准后的置信度（0~1），由 calibration.ts 产出，**不可由 LLM 直接给**。 */
  confidence: z.number().min(0).max(1),
  /** LLM 原始自评置信度（0~1），保留用于绘制校准曲线。 */
  rawConfidence: z.number().min(0).max(1),
  evidence: z.array(evidenceSchema), // 推断 ≥1；事实可为用户直述
  embedding: z.array(z.number()).optional(),                  // 前端 EmbeddingProvider 填充
  position: z.tuple([z.number(), z.number(), z.number()]).optional(), // 前端 layout.ts 填充
  salience: z.number().min(0).max(1), // 情绪显著性，影响亮度 / 抗衰减
  lastReinforced: z.string(),         // ISO，衰减计算
  createdAt: z.string(),              // ISO
  status: nodeStatusSchema,
  userVerdict: userVerdictSchema,
  isUncanny: z.boolean(),             // 恐怖谷标记（Skeptic 判定）
  skepticFlag: z.string().nullable(), // 怀疑者质疑文本
  contradicts: z.array(z.string()),   // 矛盾的 node id（张力线）
});

// ───────────────────────── 演变事件（演变层 = 事件溯源） ─────────────────────────

export const evolutionEventTypeSchema = z.enum([
  'created', 'reinforced', 'revised', 'denied', 'reconsolidated', 'decayed',
]);

export const evolutionTriggerSchema = z.enum([
  'observation', 'reconciliation', 'user_confrontation',
]);

export const evolutionEventSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  type: evolutionEventTypeSchema,
  fromStatement: z.string().optional(),
  toStatement: z.string().optional(),
  fromConfidence: z.number().min(0).max(1).optional(),
  toConfidence: z.number().min(0).max(1).optional(),
  reason: z.string(),
  triggeredBy: evolutionTriggerSchema,
  timestamp: z.string(),
});

// ───────────────────────── 主动提问（信息增益驱动） ─────────────────────────

/** 主动提问（草稿）：LLM 输出，无 id。 */
export const activeQuestionDraftSchema = z.object({
  question: z.string().min(1),
  targetSystem: cognitiveSystemSchema,
  reason: z.string(),
  expectedInfoGain: z.number().min(0).max(1),
});

/** 主动提问（完整）。 */
export const activeQuestionSchema = activeQuestionDraftSchema.extend({
  id: z.string(),
});

// ───────────────────────── 原始对话 & 整张图 ─────────────────────────

export const rawMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string(),
});

/** 引擎产出的标准结构。Layer 2（身体）只消费它。 */
export const cognitiveGraphSchema = z.object({
  nodes: z.array(cognitiveNodeSchema),
  events: z.array(evolutionEventSchema),
  questions: z.array(activeQuestionSchema),
  rawMessages: z.array(rawMessageSchema),
});

// ═════════════════════════ Agent I/O 契约 ═════════════════════════
// 以下是各 Agent 的 LLM 输出 schema（均为 Draft 形状）。pipeline 负责补全为 Full。

// ── Observer：只抽取，不推断 ──
export const factDraftSchema = z.object({
  statement: z.string().min(1),
  system: cognitiveSystemSchema,
  evidence: z.array(evidenceDraftSchema).min(1),
});

export const behavioralSignalSchema = z.object({
  /** 行为信号类型：回避 / 犹豫 / 强调 / 情绪 / 自相矛盾 / 重复 / 其他 */
  kind: z.enum(['avoidance', 'hesitation', 'emphasis', 'emotion', 'contradiction', 'repetition', 'other']),
  description: z.string().min(1),
  evidence: z.array(evidenceDraftSchema).min(1),
  hintedSystem: cognitiveSystemSchema.optional(), // 可能指向的系统
});

export const observerOutputSchema = z.object({
  facts: z.array(factDraftSchema),
  signals: z.array(behavioralSignalSchema),
});

// ── Inferer：生成预测/假设（推断节点草稿）──
export const inferredNodeDraftSchema = z.object({
  system: cognitiveSystemSchema,
  statement: z.string().min(1),
  rawConfidence: z.number().min(0).max(1), // 原始自评。单一证据应 ≤0.6（prompt 约束）
  salience: z.number().min(0).max(1),
  evidence: z.array(evidenceDraftSchema).min(1),
});

export const infererOutputSchema = z.object({
  inferences: z.array(inferredNodeDraftSchema),
});

// ── Skeptic：红队审查，按输入顺序逐条裁决 ──
export const skepticJudgmentSchema = z.object({
  targetIndex: z.number().int().min(0), // 对应 infererOutput.inferences 的下标
  keep: z.boolean(),                    // false=过滤掉（越界/无依据）
  isUncanny: z.boolean(),               // 准得发毛 → 保留但标记
  skepticFlag: z.string().nullable(),   // 质疑文本，如"仅基于1次对话，可能过拟合"
});

export const skepticOutputSchema = z.object({
  judgments: z.array(skepticJudgmentSchema),
});

// ── Reconciler：矛盾检测 + 信念修正 ──
export const contradictionSchema = z.object({
  nodeIdA: z.string(),
  nodeIdB: z.string(),
  explanation: z.string(),
});

export const revisionSchema = z.object({
  nodeId: z.string(),
  eventType: z.enum(['revised', 'reconsolidated', 'reinforced', 'denied']),
  newStatement: z.string().optional(),
  newConfidence: z.number().min(0).max(1).optional(),
  reason: z.string(),
});

export const reconcilerOutputSchema = z.object({
  contradictions: z.array(contradictionSchema),
  revisions: z.array(revisionSchema),
});

// ── Reflector：元认知，全局一致性 ──
export const reflectorOutputSchema = z.object({
  globalNotes: z.string(),
  biasWarnings: z.array(z.string()),
  decayCandidates: z.array(z.string()), // 应衰减的 node id
});
