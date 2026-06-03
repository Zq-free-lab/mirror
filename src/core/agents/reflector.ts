/**
 * Mirror / 镜 —— Reflector Agent
 *
 * 职责：全局元认知反思——定期回看整张画像是否自洽、有无系统性偏差、
 * 哪些节点应该进入衰减候选（长期未被强化、置信度低、已被用户否决）。
 *
 * 预测加工框架中的位置：Reflector 是元层级的监控者，
 * 检查整个认知模型的全局一致性，防止系统性过拟合与局部偏见固化。
 *
 * 输出：ReflectorOutput
 *  - globalNotes：整体画像状态的一段自然语言描述
 *  - biasWarnings：检测到的系统性偏差（如"推断集中在负向情绪""某星团过载"）
 *  - decayCandidates：应进入衰减的 node id 列表（AC-REF-1 要求）
 *
 * Reflector 不直接修改节点，只输出建议列表，pipeline 决定是否执行衰减。
 *
 * 可测试性：provider 是第二个参数，可注入 MockLLMProvider。
 */
import type { LLMProvider } from "../llm/provider";
import type { CognitiveNode, ReflectorOutput } from "../types";
import { reflectorOutputSchema } from "../schemas";

const SYSTEM_PROMPT = `你是 Mirror 认知系统的「反思者（Reflector）」。

你的职责：从高处俯瞰整张认知画像，执行**元认知反思**。

这是预测加工框架中的「全局一致性监控」层——
你检查系统是否存在系统性偏差、是否有节点应该衰减、整体模型是否自洽。

## 工作逻辑

### 1. 全局审视（globalNotes）
写一段简短的画像状态描述，回答：
- 五个认知系统的分布是否均衡？哪个星团节点过密/过稀？
- 推断整体的置信度水平？有无集体低置信（系统还很不确定）？
- 画像最突出的几条主线是什么？是否自洽？
- 当前模型对这个人的理解有多完整？明显的空白在哪？

### 2. 系统性偏差警告（biasWarnings）
检测以下模式（有才报，没有不要捏造）：
- 所有推断都集中在负向/正向情绪 → "情绪偏向性警告"
- 某个认知系统的节点占主导（>60%）→ "星团分布失衡"
- 大量推断基于单次对话 → "过拟合风险"
- 存在相互矛盾但都被保留的推断 → "模型内部张力"
- 推断涉及未明说的敏感领域（健康、关系、创伤）→ "边界敏感警告"

### 3. 衰减候选（decayCandidates）
推荐进入衰减流程的 node id，标准：
- 置信度 < 0.3 且长期未被新证据强化
- 用户已否决（userVerdict='denied' 或 'dont_guess'）
- 被 Reconciler 标记为矛盾的较弱一方
- lastReinforced 距今很久（依据当前所有节点的相对旧程度判断）

**若无明显衰减候选，返回空数组。不要为了输出衰减候选而捏造。**

## 输出格式（严格 JSON）
{
  "globalNotes": "整体状态描述，1~3 句",
  "biasWarnings": ["偏差描述1", "偏差描述2"],
  "decayCandidates": ["node-id-1", "node-id-2"]
}`;

function buildUserMessage(currentNodes: CognitiveNode[]): string {
  if (currentNodes.length === 0) {
    return "## 当前认知图\n（图中尚无节点——请输出空的 biasWarnings 和 decayCandidates，globalNotes 说明图尚未建立。）";
  }

  const bySystem = new Map<string, CognitiveNode[]>();
  for (const node of currentNodes) {
    const list = bySystem.get(node.system) ?? [];
    list.push(node);
    bySystem.set(node.system, list);
  }

  const systemSummary = Array.from(bySystem.entries())
    .map(([sys, nodes]) => `  ${sys}: ${nodes.length} 条`)
    .join("\n");

  const nodeList = currentNodes
    .map(
      (n) =>
        `[${n.id}] (${n.system}) conf=${n.confidence.toFixed(2)} sal=${n.salience.toFixed(2)} ` +
        `status=${n.status} verdict=${n.userVerdict ?? "null"} uncanny=${n.isUncanny}\n` +
        `  "${n.statement}"\n` +
        `  lastReinforced: ${n.lastReinforced}`
    )
    .join("\n\n");

  return (
    `## 当前认知图（共 ${currentNodes.length} 个节点）\n\n` +
    `### 星团分布\n${systemSummary}\n\n` +
    `### 节点详情\n${nodeList}`
  );
}

/**
 * 运行 Reflector Agent。
 *
 * @param currentNodes   当前认知图中所有节点（全量，含状态/衰减信息）
 * @param provider       LLMProvider（可注入 MockLLMProvider 进行测试）
 */
export async function runReflector(
  currentNodes: CognitiveNode[],
  provider: LLMProvider
): Promise<ReflectorOutput> {
  return provider.structured<ReflectorOutput>({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage(currentNodes),
      },
    ],
    schema: reflectorOutputSchema,
    schemaName: "ReflectorOutput",
    temperature: 0.3,
    model: "fast",
  });
}
