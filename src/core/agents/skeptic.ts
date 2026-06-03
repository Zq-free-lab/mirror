/**
 * Mirror / 镜 —— Skeptic Agent
 *
 * 职责：对 Inferer 的每条推断做「红队审查」。
 * 输出：SkepticOutput（judgments[]），按 targetIndex 与 Inferer 输出一一对应。
 *
 * 预测加工框架中的位置：Skeptic 计算「预测误差」——
 * 判断 Inferer 的假设是否有足够证据支撑，是否越界冒犯，是否准得发毛（恐怖谷）。
 *
 * 裁决逻辑：
 *  - keep=false：证据不足 / 单薄过拟合 / 侵犯性推断 → 在 pipeline 中过滤掉
 *  - isUncanny=true：准得发毛 → 保留，但 UI 要显示"怀疑者正在盯着这条"
 *  - skepticFlag：对 keep=true 但有疑虑的项给出质疑文本
 *
 * 可测试性：第一个参数是 provider（可注入 MockLLMProvider），无隐式全局依赖。
 */
import type { LLMProvider } from "../llm/provider";
import type { RawMessage, InfererOutput, SkepticOutput } from "../types";
import { skepticOutputSchema } from "../schemas";

const SYSTEM_PROMPT = `你是 Mirror 认知系统的「怀疑者（Skeptic）」。

你的职责：对「推断者（Inferer）」的每条推断做红队审查，逐条裁决。

这是预测加工框架中的「预测误差计算」层——你检查 Inferer 的假设是否有真实证据支撑，
是否过拟合单次对话，是否侵入了恐怖谷，是否冒犯了用户隐私。

## 裁决规则

### keep=false（过滤）
以下情况果断判 keep=false：
- 推断完全缺乏证据，或证据与推断内容跨度太大
- 明显越界：涉及健康诊断、贬低人格等冒犯性推断
- 基于单次对话一句话做出的过度概括（比 rawConfidence>0.6 还要泛化）
- 推断内容在逻辑上无法从给出的行为信号导出

### keep=true + isUncanny=true（保留，标记恐怖谷）
- 推断准确到让人后背发凉——这正是 Mirror 的核心震撼
- 必须有真实证据，不能是巧合
- 保留，但 skepticFlag 要写清楚"为什么这条准得发毛"

### keep=true + skepticFlag 非空（保留，附质疑文本）
- 推断有价值但有明显不确定性：仅单证据、首次出现、可能有文化偏差等
- 给出简短质疑，让用户知道 AI 自己也在怀疑这条

### keep=true + skepticFlag=null
- 推断有多个独立证据，逻辑链清晰，不过分，保留无疑

## 输出格式（严格 JSON）
{
  "judgments": [
    {
      "targetIndex": 0,
      "keep": true,
      "isUncanny": false,
      "skepticFlag": "仅基于1次对话，建议多轮强化"
    },
    {
      "targetIndex": 1,
      "keep": true,
      "isUncanny": true,
      "skepticFlag": "此推断指向了用户未曾明说的内隐焦虑"
    }
  ]
}

## 注意
- judgments 数量必须与输入 inferences 数量相同
- targetIndex 从 0 开始，按序对应 Inferer 的 inferences 数组
- 不要遗漏任何一条，不要添加 targetIndex 超出范围的项
- skepticFlag 对 keep=false 的项可以是 null（失败原因已隐含在 keep 里）`;

function buildUserMessage(
  infererOutput: InfererOutput,
  newMessages: RawMessage[]
): string {
  const inferencesBlock = infererOutput.inferences
    .map(
      (inf, i) =>
        `[${i}] system=${inf.system} | rawConfidence=${inf.rawConfidence} | salience=${inf.salience}\n` +
        `    statement: ${inf.statement}\n` +
        `    evidence(${inf.evidence.length}): ${inf.evidence
          .map((e) => `${e.sourceMessageId}: "${e.quote}"`)
          .join(", ")}`
    )
    .join("\n\n");

  const messagesBlock = newMessages
    .map((m) => `[${m.id}] ${m.role}: ${m.content}`)
    .join("\n");

  return (
    `## Inferer 的 ${infererOutput.inferences.length} 条推断（逐条裁决）\n\n` +
    inferencesBlock +
    `\n\n## 原始对话（供核查证据真实性）\n` +
    messagesBlock
  );
}

/**
 * 运行 Skeptic Agent。
 *
 * @param infererOutput   Inferer 的输出（待审查的推断列表）
 * @param newMessages     本轮原始对话（供核查证据真实性）
 * @param provider        LLMProvider（可注入 MockLLMProvider 进行测试）
 */
export async function runSkeptic(
  infererOutput: InfererOutput,
  newMessages: RawMessage[],
  provider: LLMProvider
): Promise<SkepticOutput> {
  return provider.structured<SkepticOutput>({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage(infererOutput, newMessages),
      },
    ],
    schema: skepticOutputSchema,
    schemaName: "SkepticOutput",
    temperature: 0.2,
    model: "fast",
  });
}
