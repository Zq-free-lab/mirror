/**
 * Mirror / 镜 —— 认知引擎编排 Pipeline
 *
 * 顺序：Observer → Inferer → Skeptic（过滤）→ Reconciler → Reflector
 * → 校准 + 补全节点 → 生成 EvolutionEvent → 派生主动提问
 *
 * 关键约束：
 *  - 每步 Agent 失败不阻断整条 pipeline，记 warning 后跳过（AC-PIPE-2）
 *  - confidence 必须经 calibration.ts 计算，不直接使用 rawConfidence（AC-RL-2）
 *  - 所有 LLM 依赖通过注入的 provider 参数，不硬编码厂商（AC-RL-5）
 *  - Skeptic keep=false 的推断被过滤，isUncanny/skepticFlag 被正确传入节点（AC-SKP-1）
 *  - Reconciler contradictions 填入返回值，由调用层应用到现有图（AC-REC-1）
 *
 * 返回 PipelineResult：增量（新节点+事件+问题）+ 矛盾+修订+反思+警告。
 * 调用层（/api/infer 或测试）负责将增量 merge 进持久化图。
 */
import { randomUUID } from "crypto";
import type { LLMProvider } from "../llm/provider";
import type {
  RawMessage,
  CognitiveNode,
  CognitiveGraph,
  EvolutionEvent,
  ActiveQuestion,
  InferredNodeDraft,
  Contradiction,
  Revision,
  ReflectorOutput,
  ObserverOutput,
} from "../types";
import { SYSTEM_META } from "../types";
import { calibrate, countUniqueSources } from "../calibration";
import { runObserver } from "./observer";
import { runInferer } from "./inferer";
import { runSkeptic } from "./skeptic";
import { runReconciler } from "./reconciler";
import { runReflector } from "./reflector";

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface PipelineResult {
  /** 本轮新建的推断节点（校准后完整形状，可直接 merge 进 IndexedDB） */
  newNodes: CognitiveNode[];
  /** 本轮产生的演变事件（'created' + Reconciler 修订事件） */
  newEvents: EvolutionEvent[];
  /** 信息增益驱动的主动提问（供 UI 展示） */
  questions: ActiveQuestion[];
  /** Reconciler 检测到的矛盾对（调用层负责在对应节点 contradicts[] 互填 id） */
  contradictions: Contradiction[];
  /** Reconciler 的信念修订建议（调用层负责执行修订并写入 EvolutionEvent） */
  revisions: Revision[];
  /** Reflector 的元认知反思（含 decayCandidates，供 decay.ts 使用） */
  reflectorOutput: ReflectorOutput | null;
  /** 某步骤失败时的警告列表（不影响结果，供日志/UI 提示） */
  warnings: string[];
}

// ── 辅助：InferredNodeDraft → CognitiveNode ──────────────────────────────────

function hydrateNode(
  draft: InferredNodeDraft,
  skepticFlag: string | null,
  isUncanny: boolean,
  now: string
): CognitiveNode {
  const uniqueSources = countUniqueSources(draft.evidence);
  const confidence = calibrate(
    draft.rawConfidence,
    draft.evidence.length,
    uniqueSources
  );

  return {
    id: `node-${draft.system}-${randomUUID().slice(0, 8)}`,
    layer: "inference",
    system: draft.system,
    statement: draft.statement,
    confidence,
    rawConfidence: draft.rawConfidence,
    evidence: draft.evidence.map((e) => ({
      id: `ev-${randomUUID().slice(0, 8)}`,
      sourceMessageId: e.sourceMessageId,
      quote: e.quote,
      timestamp: now,
    })),
    salience: draft.salience,
    lastReinforced: now,
    createdAt: now,
    status: "active",
    userVerdict: null,
    isUncanny,
    skepticFlag,
    contradicts: [],
  };
}

// ── 辅助：为节点生成 'created' EvolutionEvent ─────────────────────────────────

function makeCreatedEvent(node: CognitiveNode, now: string): EvolutionEvent {
  return {
    id: `evt-${randomUUID().slice(0, 8)}`,
    nodeId: node.id,
    type: "created",
    reason: `Inferer 推断，${node.evidence.length} 条证据，confidence=${node.confidence.toFixed(2)}`,
    triggeredBy: "observation",
    timestamp: now,
  };
}

// ── 辅助：信息增益驱动的主动提问 ──────────────────────────────────────────────

function deriveQuestions(
  existingNodes: CognitiveNode[],
  newNodes: CognitiveNode[]
): ActiveQuestion[] {
  const allNodes = [...existingNodes, ...newNodes];
  if (allNodes.length === 0) return [];

  // 统计各系统的平均置信度（缺失系统 → 不确定性最高）
  const systems = Object.keys(SYSTEM_META) as Array<keyof typeof SYSTEM_META>;
  const systemConfidence = new Map<string, number[]>();

  for (const node of allNodes) {
    const list = systemConfidence.get(node.system) ?? [];
    list.push(node.confidence);
    systemConfidence.set(node.system, list);
  }

  // 找出不确定性最高的系统（缺失 = 0 置信度，有节点 = 平均置信度，越低越需要问）
  let weakestSystem = systems[0];
  let lowestAvg = Infinity;

  for (const sys of systems) {
    const confs = systemConfidence.get(sys);
    const avg = confs ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
    if (avg < lowestAvg) {
      lowestAvg = avg;
      weakestSystem = sys;
    }
  }

  const meta = SYSTEM_META[weakestSystem];
  const question: ActiveQuestion = {
    id: `q-${randomUUID().slice(0, 8)}`,
    question: `关于「${meta.poeticName}」，你愿意多说说吗？`,
    targetSystem: weakestSystem,
    reason: `${meta.poeticName}（${meta.brainRegion}）目前信号最少，需要更多信息`,
    expectedInfoGain: Math.max(0, 1 - lowestAvg),
  };

  return [question];
}

// ── 主编排函数 ────────────────────────────────────────────────────────────────

/**
 * 运行完整的五 Agent 认知推断 pipeline。
 *
 * @param newMessages   本轮用户输入的原始对话
 * @param currentGraph  当前认知图（已持久化状态，可为空图）
 * @param provider      LLMProvider（可注入 MockLLMProvider 进行测试）
 * @param onStage       每个 Agent 完成时的回调（供 SSE 流式推送阶段进度）
 */
export async function runPipeline(
  newMessages: RawMessage[],
  currentGraph: Pick<CognitiveGraph, "nodes">,
  provider: LLMProvider,
  onStage?: (stage: string, label: string) => void
): Promise<PipelineResult> {
  const now = new Date().toISOString();
  const warnings: string[] = [];
  const existingNodes = currentGraph.nodes;

  // ── Step 1: Observer ──────────────────────────────────────────────────────
  onStage?.("observer", "观察者在读你的话");
  let observerOutput: ObserverOutput = { facts: [], signals: [] };
  try {
    observerOutput = await runObserver(newMessages, [], provider);
  } catch (err) {
    warnings.push(`Observer 失败，跳过：${String(err)}`);
  }

  // ── Step 2: Inferer ───────────────────────────────────────────────────────
  onStage?.("inferer", "推断者在形成假设");
  let infererOutput = { inferences: [] as InferredNodeDraft[] };
  try {
    infererOutput = await runInferer(
      observerOutput,
      newMessages,
      provider,
      existingNodes.length
    );
  } catch (err) {
    warnings.push(`Inferer 失败，跳过：${String(err)}`);
  }

  // ── Step 3: Skeptic（过滤 keep=false，附加 isUncanny/skepticFlag）─────────
  onStage?.("skeptic", "怀疑者在审查");
  let passedDrafts: Array<{ draft: InferredNodeDraft; isUncanny: boolean; skepticFlag: string | null }> = [];
  try {
    const skepticOutput = await runSkeptic(infererOutput, newMessages, provider);
    passedDrafts = skepticOutput.judgments
      .filter((j) => j.keep)
      .map((j) => ({
        draft: infererOutput.inferences[j.targetIndex],
        isUncanny: j.isUncanny,
        skepticFlag: j.skepticFlag,
      }))
      .filter((item) => item.draft !== undefined); // 防御越界
  } catch (err) {
    warnings.push(`Skeptic 失败，所有 Inferer 推断直接通过（无过滤）：${String(err)}`);
    passedDrafts = infererOutput.inferences.map((draft) => ({
      draft,
      isUncanny: false,
      skepticFlag: null,
    }));
  }

  // ── Step 4: 校准 + 补全节点 ───────────────────────────────────────────────
  const newNodes: CognitiveNode[] = passedDrafts.map(({ draft, isUncanny, skepticFlag }) =>
    hydrateNode(draft, skepticFlag, isUncanny, now)
  );

  const createdEvents: EvolutionEvent[] = newNodes.map((node) =>
    makeCreatedEvent(node, now)
  );

  // ── Step 5: Reconciler（跳过条件：无现有节点 → 没有东西可矛盾）────────────
  let contradictions: Contradiction[] = [];
  let revisions: Revision[] = [];
  if (existingNodes.length > 0 && passedDrafts.length > 0) {
    onStage?.("reconciler", "调和者在比对旧认知");
    try {
      const recon = await runReconciler(
        passedDrafts.map((p) => p.draft),
        existingNodes,
        provider
      );
      contradictions = recon.contradictions;
      revisions = recon.revisions;
    } catch (err) {
      warnings.push(`Reconciler 失败，跳过矛盾检测：${String(err)}`);
    }
  }

  // ── Step 6: Reflector（跳过条件：总节点数 < 5 → 画像太稀薄无意义反思）────
  let reflectorOutput: ReflectorOutput | null = null;
  const totalNodeCount = existingNodes.length + newNodes.length;
  if (totalNodeCount >= 5) {
    onStage?.("reflector", "镜在整合元认知");
    try {
      reflectorOutput = await runReflector([...existingNodes, ...newNodes], provider);
    } catch (err) {
      warnings.push(`Reflector 失败，跳过元认知反思：${String(err)}`);
    }
  }

  // ── Step 7: 派生主动提问 ─────────────────────────────────────────────────
  const questions: ActiveQuestion[] = deriveQuestions(existingNodes, newNodes);

  return {
    newNodes,
    newEvents: createdEvents,
    questions,
    contradictions,
    revisions,
    reflectorOutput,
    warnings,
  };
}
