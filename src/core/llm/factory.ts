/**
 * Mirror / 镜 —— LLM Provider Factory
 *
 * 按环境变量 LLM_PROVIDER 返回对应 adapter 实例。
 * 业务层（五 Agent / pipeline）通过这里拿 provider，不直接 import adapter。
 */
import { OpenAICompatibleProvider } from "./openai-compatible";
import type { LLMProvider } from "./provider";

/**
 * 创建并返回配置好的 LLMProvider。
 * 在 serverless 路由（/api/infer, /api/confront）顶层调用一次，然后注入进 pipeline。
 */
export function createLLMProvider(): LLMProvider {
  const providerType = (process.env.LLM_PROVIDER ?? "deepseek").toLowerCase();

  if (providerType === "anthropic") {
    // Anthropic adapter 在 T1.1 之后实现（仅在 LLM_PROVIDER=anthropic 时需要）
    throw new Error(
      "Anthropic adapter not yet implemented. Set LLM_PROVIDER to deepseek, openai, qwen, or doubao."
    );
  }

  // 所有 OpenAI 兼容端点走同一 adapter
  return new OpenAICompatibleProvider({
    id: providerType,
    apiKey: process.env.LLM_API_KEY ?? "",
    baseURL: process.env.LLM_BASE_URL ?? "https://api.deepseek.com",
    fastModel: process.env.LLM_MODEL_FAST ?? "deepseek-chat",
    reasoningModel: process.env.LLM_MODEL_REASONING ?? "deepseek-reasoner",
  });
}
