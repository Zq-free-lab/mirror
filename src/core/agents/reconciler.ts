/**
 * Mirror / 镜 —— Reconciler Agent
 *
 * 职责：矛盾检测 + 信念修正（类真值维护系统 TMS）。
 * 输出：ReconcilerOutput —— contradictions（哪两个节点相互拉扯）
 *       + revisions（应对哪些已有节点做信念更新）。
 *
 * 预测加工框架中的位置：当新证据与旧信念产生「预测误差」时，
 * Reconciler 决定是修正旧信念（revised）、重新固化（reconsolidated）、
 * 强化旧信念（reinforced）还是驳回（denied）。
 *
 * 关键约束（AC-REC-1）：
 *  - contradictions 中的 nodeIdA/nodeIdB 必须是现有图中节点的真实 id
 *  - pipeline 据 contradictions 在对应节点的 contradicts[] 互填 id
 *  - revisions 产出的 eventType 必须是合法枚举值之一
 *
 * 可测试性：provider 是第三个参数，可注入 MockLLMProvider。
 */
import type { LLMProvider } from "../llm/provider";
import type {
  CognitiveNode,
  InferredNodeDraft,
  ReconcilerOutput,
} from "../types";
import { reconcilerOutputSchema } from "../schemas";

const SYSTEM_PROMPT = `你是 Mirror 认知系统的「调和者（Reconciler）」。

你的职责：
1. 检测现有认知节点与新推断之间（以及现有节点之间）的**内在矛盾**。
2. 对存在新证据的已有节点提出**信念修正建议**。

这是预测加工框架中的「预测误差处理」层——当新感知与旧模型不符，
你决定如何更新内部模型，而不是两边都保留造成自我矛盾。

## 工作逻辑

### 第一步：矛盾检测
在以下两类节点之间寻找逻辑矛盾：
- 已有节点（existing nodes，有真实 id）
- 新推断（new inferences，用 [new-N] 标记，但矛盾检测用它们的语义内容）

**矛盾的标准**（不是主题相关，而是真正的逻辑张力）：
- A 声称"你回避求助"，B 声称"你积极寻求外部支持" → 矛盾
- A 声称"你重视独处"，B 声称"你渴望融入" → 矛盾
- A/B 只是「不同方面」则不算矛盾

**只报告已有节点之间或已有节点与新推断之间的矛盾。**
contradictions.nodeIdA 和 nodeIdB 都必须是已有节点（existing nodes）的真实 id，
因为只有已有节点有真实 id 可供 UI 绘制张力线。

### 第二步：信念修正
当新推断提供了与某已有节点相关的新证据时，提议修正：
- **reinforced**：新证据与旧节点一致，旧节点被强化（不改内容，confidence 上升）
- **revised**：新证据与旧节点矛盾，旧节点语义需要修改（newStatement 必填）
- **reconsolidated**：旧信念在对质/多轮强化后重新固化（信念更稳固，不改内容）
- **denied**：新证据推翻旧节点，旧节点应该被标记为失效

**只提议有充分理由的修正**，不要为了修正而修正。
若新推断与已有节点完全无关，不产出 revision。

## 输出格式（严格 JSON）
{
  "contradictions": [
    {
      "nodeIdA": "已有节点的真实id",
      "nodeIdB": "另一个已有节点的真实id",
      "explanation": "简短说明拉扯在哪里"
    }
  ],
  "revisions": [
    {
      "nodeId": "已有节点的真实id",
      "eventType": "reinforced",
      "newStatement": null,
      "newConfidence": 0.75,
      "reason": "新消息进一步印证了..."
    }
  ]
}

若无矛盾或无修正，返回空数组：{ "contradictions": [], "revisions": [] }`;

function buildUserMessage(
  newInferences: InferredNodeDraft[],
  existingNodes: CognitiveNode[]
): string {
  const existingBlock =
    existingNodes.length > 0
      ? `## 已有认知节点（有真实 id，可被引用于 contradictions/revisions）\n` +
        existingNodes
          .map(
            (n) =>
              `[${n.id}] (${n.system}) confidence=${n.confidence.toFixed(2)} | ${n.statement}`
          )
          .join("\n")
      : `## 已有认知节点\n（图中尚无节点——无需矛盾检测，也无需修正，返回空数组即可）`;

  const newBlock =
    newInferences.length > 0
      ? `\n\n## 新推断（本轮 Inferer 输出，待与已有节点对照）\n` +
        newInferences
          .map(
            (inf, i) =>
              `[new-${i}] (${inf.system}) rawConf=${inf.rawConfidence} | ${inf.statement}\n` +
              `  evidence: ${inf.evidence.map((e) => `${e.sourceMessageId}: "${e.quote}"`).join(", ")}`
          )
          .join("\n")
      : `\n\n## 新推断\n（无新推断通过 Skeptic，无需处理）`;

  return existingBlock + newBlock;
}

/**
 * 运行 Reconciler Agent。
 *
 * @param newInferences   本轮通过 Skeptic 的推断草稿（已过滤 keep=false）
 * @param existingNodes   当前图中所有已有节点（供矛盾检测和信念修正引用）
 * @param provider        LLMProvider（可注入 MockLLMProvider 进行测试）
 */
export async function runReconciler(
  newInferences: InferredNodeDraft[],
  existingNodes: CognitiveNode[],
  provider: LLMProvider
): Promise<ReconcilerOutput> {
  return provider.structured<ReconcilerOutput>({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage(newInferences, existingNodes),
      },
    ],
    schema: reconcilerOutputSchema,
    schemaName: "ReconcilerOutput",
    temperature: 0.2,
    model: "fast",
  });
}
