/**
 * Mirror / 镜 —— Inferer Agent
 *
 * 职责：基于 Observer 输出的行为信号，生成关于用户的**预测/假设**（推断节点草稿）。
 * 输出：InferredNodeDraft[]，每条带 rawConfidence + evidence + system 归类 + salience。
 *
 * 预测加工框架中的位置：Inferer 是「生成预测」的层级，
 * 产出的假设是系统对用户的内部模型（先验）。Skeptic 负责计算预测误差。
 *
 * 关键约束（测试红线 AC-INF-1）：
 *  - 单一证据来源时 rawConfidence ≤ 0.6（prompt 强约束）
 *  - 每条推断 evidence ≥ 1 条，且 sourceMessageId 指回原始消息
 *  - 归入五认知系统之一（narrative/affect/valence/social/rhythm）
 *
 * 可测试性：第一个参数是 provider（可注入 MockLLMProvider）。
 */
import type { LLMProvider } from "../llm/provider";
import type { RawMessage, ObserverOutput, InfererOutput } from "../types";
import { infererOutputSchema } from "../schemas";

const SYSTEM_PROMPT = `你是 Mirror 认知系统的「推断者（Inferer）」。

你的职责：基于 Observer 抽取的行为信号，生成关于用户的**心理假设/预测**。

这是预测加工框架中的「生成预测」层——你在为用户建立一个内部模型（先验），
Skeptic 之后会用预测误差来审查你的每条假设。

## 推断方法

### 输入
- Observer 抽取的事实（facts）和行为信号（signals）
- 用户的近期对话原文（供引用证据）

### 输出每条推断必须包含
1. **system**：归入五个认知系统之一
   - narrative（叙事核/DMN）：自我认同、价值观、人生故事
   - affect（情动潮汐/杏仁核）：情绪、在乎什么、当下状态
   - valence（趋避场/OFC）：偏好、回避、奖赏/惩罚模式
   - social（他者之镜/TPJ）：人际关系、对他人的揣测与期待
   - rhythm（节律之根/基底节）：隐性习惯、行为节律、内隐模式

2. **statement**：对用户的一条推断（用"你……"开头，简洁、可证伪）

3. **rawConfidence**：你对这条推断的原始置信度 0~1
   - **⚠️ 硬性规则：单一证据来源时，rawConfidence 不得超过 0.6**
   - 跨 ≥2 个时间点的多证据可至 0.85
   - 要诚实，不要虚报高置信度

4. **salience**：情绪显著性 0~1（这条推断与用户的情绪/动机有多强的关联）

5. **evidence**：引用的证据（至少 1 条）
   - sourceMessageId：必须是输入消息的真实 id
   - quote：触发此推断的原文片段

## 风格指南
- 允许大胆推断，但必须可溯源到具体证据
- 用二阶效应思考（"这个行为暗示……更深层可能是……"）
- 推断要有心理深度，不要只是重述 Observer 的观察
- 每次输出 2~6 条推断（避免过拟合单次对话）

## 输出格式（严格 JSON）
{
  "inferences": [
    {
      "system": "narrative",
      "statement": "你……",
      "rawConfidence": 0.5,
      "salience": 0.7,
      "evidence": [{ "sourceMessageId": "msg-xxx", "quote": "原文片段" }]
    }
  ]
}`;

function buildUserMessage(
  observerOutput: ObserverOutput,
  newMessages: RawMessage[],
  existingNodeCount: number
): string {
  const factsBlock =
    observerOutput.facts.length > 0
      ? `## Observer 抽取的事实\n${observerOutput.facts
          .map(
            (f) =>
              `- [${f.system}] ${f.statement}（来源：${f.evidence.map((e) => `${e.sourceMessageId}: "${e.quote}"`).join(", ")}）`
          )
          .join("\n")}`
      : "## Observer 抽取的事实\n（无）";

  const signalsBlock =
    observerOutput.signals.length > 0
      ? `\n\n## Observer 抽取的行为信号\n${observerOutput.signals
          .map(
            (s) =>
              `- [${s.kind}${s.hintedSystem ? `→${s.hintedSystem}` : ""}] ${s.description}（来源：${s.evidence.map((e) => `${e.sourceMessageId}: "${e.quote}"`).join(", ")}）`
          )
          .join("\n")}`
      : "\n\n## Observer 抽取的行为信号\n（无）";

  const messagesBlock = `\n\n## 原始对话（供引用 sourceMessageId）\n${newMessages
    .map((m) => `[${m.id}] ${m.role}: ${m.content}`)
    .join("\n")}`;

  const contextNote =
    existingNodeCount > 0
      ? `\n\n## 注意：当前已有 ${existingNodeCount} 条推断节点在图中\n避免与已有推断完全重复，优先填充空白区域。`
      : "";

  return factsBlock + signalsBlock + messagesBlock + contextNote;
}

/**
 * 运行 Inferer Agent。
 *
 * @param observerOutput    Observer 的输出（事实 + 行为信号）
 * @param newMessages       本轮原始对话（供 evidence 引用）
 * @param provider          LLMProvider（可注入 MockLLMProvider 进行测试）
 * @param existingNodeCount 当前图中已有推断节点数（帮助模型避免重复）
 */
export async function runInferer(
  observerOutput: ObserverOutput,
  newMessages: RawMessage[],
  provider: LLMProvider,
  existingNodeCount = 0
): Promise<InfererOutput> {
  return provider.structured<InfererOutput>({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage(observerOutput, newMessages, existingNodeCount),
      },
    ],
    schema: infererOutputSchema,
    schemaName: "InfererOutput",
    temperature: 0.3,
    model: "fast",
  });
}
