/**
 * Mirror / 镜 —— Observer Agent
 *
 * 职责：从对话流中抽取信号——**只抽取，不推断**。
 * 输出：已明说的事实（facts）+ 行为信号（signals：回避/犹豫/强调/情绪等）。
 * 每条证据必须带 sourceMessageId，指回原始消息，供证据链溯源。
 *
 * 预测加工框架中的位置：Observer 是感知层，提供给 Inferer 的「感觉证据」。
 * 它的输出质量直接决定推断层的证据可溯源性（红线 AC-RL-3）。
 *
 * 可测试性：第一个参数是 provider（可注入 MockLLMProvider），无隐式全局依赖。
 */
import type { LLMProvider } from "../llm/provider";
import type { RawMessage, ObserverOutput } from "../types";
import { observerOutputSchema } from "../schemas";

const SYSTEM_PROMPT = `你是 Mirror 认知系统的「观察者（Observer）」。

你的唯一职责：从用户对话中**抽取**信号，**绝不推断**。

## 输出两类内容

### 1. facts（事实）
用户**明确说出**的可验证事实。
- 示例：居住城市、职业、明说的偏好（"我不吃肉"）、当前感受（"我很烦"）。
- **不算**：你的判断、用户暗示但未说的内容。

### 2. signals（行为信号）
对话**行为层面**的观察，而非内容本身。种类：
- avoidance（回避）：转移话题、拒绝展开、"不想说"。
- hesitation（犹豫）："我也不知道"、停顿、多次重组表述。
- emphasis（强调）：重复某词、语气强烈、感叹号/破折号。
- emotion（情绪）：情绪词汇、情感强度词。
- contradiction（自相矛盾）：同一段话中的逻辑矛盾。
- repetition（重复）：跨消息的主题/词汇反复出现。
- other（其他）：值得注意但不属于以上的行为特征。

## 硬性约束
1. **每条 evidence 必须带 sourceMessageId**，值必须是输入消息列表中的 id。
2. 不要输出推断或解释，只描述观察到的**行为事实**。
3. 如果某类信号不存在，对应数组输出空数组（不要捏造）。
4. description 字段用中文，简洁（≤60字）。

## 输出格式（严格 JSON）
{
  "facts": [
    {
      "statement": "用户明说的事实内容",
      "system": "affect|narrative|valence|social|rhythm",
      "evidence": [{ "sourceMessageId": "msg-xxx", "quote": "原文片段" }]
    }
  ],
  "signals": [
    {
      "kind": "avoidance|hesitation|emphasis|emotion|contradiction|repetition|other",
      "description": "行为观察描述",
      "evidence": [{ "sourceMessageId": "msg-xxx", "quote": "触发该信号的原文" }],
      "hintedSystem": "可选：最可能关联的认知系统"
    }
  ]
}`;

function buildUserMessage(
  newMessages: RawMessage[],
  recentContext: RawMessage[]
): string {
  const contextBlock =
    recentContext.length > 0
      ? `## 近期上下文（参考，不在本次分析范围内）\n${recentContext
          .map((m) => `[${m.id}] ${m.role}: ${m.content}`)
          .join("\n")}\n\n`
      : "";

  const newBlock = `## 需要分析的新消息\n${newMessages
    .map((m) => `[${m.id}] ${m.role}: ${m.content}`)
    .join("\n")}`;

  return contextBlock + newBlock;
}

/**
 * 运行 Observer Agent。
 *
 * @param newMessages   本轮需要分析的新消息（至少 1 条）
 * @param recentContext 近期上下文（最近 N 条，仅供参考，不单独抽取）
 * @param provider      LLMProvider（可注入 MockLLMProvider 进行测试）
 */
export async function runObserver(
  newMessages: RawMessage[],
  recentContext: RawMessage[],
  provider: LLMProvider
): Promise<ObserverOutput> {
  return provider.structured<ObserverOutput>({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage(newMessages, recentContext),
      },
    ],
    schema: observerOutputSchema,
    schemaName: "ObserverOutput",
    temperature: 0,
    model: "fast",
  });
}
