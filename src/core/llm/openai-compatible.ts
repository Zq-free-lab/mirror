/**
 * Mirror / 镜 —— OpenAI 兼容 LLM Adapter
 *
 * 覆盖：DeepSeek（默认）/ Qwen（DashScope 兼容）/ 豆包 / OpenAI。
 * 业务层通过 LLMProvider 接口调用，不直接 import 本文件。
 *
 * 可测试性设计：构造函数接受可选 `client` 参数，测试时注入 mock client，
 * 避免真实网络请求。
 */
import OpenAI from "openai";
import type {
  LLMProvider,
  ChatRequest,
  ChatResult,
  ChatStreamChunk,
  StructuredRequest,
} from "./provider";

/** 底层 chat completion 响应（非流式） */
interface CompletionResponse {
  choices: Array<{
    message: { content: string | null; reasoning_content?: string };
  }>;
}

/** 流式 chunk */
interface StreamChunk {
  choices: Array<{
    delta: { content?: string | null; reasoning_content?: string };
  }>;
}

/**
 * 最小化 OpenAI client 接口，便于测试时注入 mock。
 * 注意：真实 OpenAI client 的 create() 是重载的（流/非流），
 * 这里用 unknown 统一，由调用侧自行断言。
 */
export interface OpenAIClientLike {
  chat: {
    completions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create(params: Record<string, unknown>): Promise<any>;
    };
  };
}

export interface OpenAICompatibleConfig {
  id?: string;
  apiKey: string;
  baseURL: string;
  fastModel: string;
  reasoningModel: string;
  /** 测试时注入 mock client，生产时省略（内部 new OpenAI()）。 */
  client?: OpenAIClientLike;
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string;
  private client: OpenAIClientLike;
  private fastModel: string;
  private reasoningModel: string;

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.id ?? "openai-compatible";
    this.fastModel = config.fastModel;
    this.reasoningModel = config.reasoningModel;
    this.client =
      config.client ??
      (new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL }) as unknown as OpenAIClientLike);
  }

  private modelName(tier: "fast" | "reasoning" | undefined): string {
    return tier === "reasoning" ? this.reasoningModel : this.fastModel;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const response = (await this.client.chat.completions.create({
      model: this.modelName(req.model),
      messages: [{ role: "system", content: req.system }, ...req.messages],
      temperature: req.temperature ?? 0.7,
    })) as CompletionResponse;

    const msg = response.choices[0]?.message;
    return {
      text: msg?.content ?? "",
      reasoning: msg?.reasoning_content,
    };
  }

  async *chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const stream = (await this.client.chat.completions.create({
      model: this.modelName(req.model),
      messages: [{ role: "system", content: req.system }, ...req.messages],
      temperature: req.temperature ?? 0.7,
      stream: true,
    })) as AsyncIterable<StreamChunk>;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      yield {
        delta: delta.content ?? "",
        reasoningDelta: delta.reasoning_content,
      };
    }
  }

  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    const maxRetries = req.maxRetries ?? 2;
    let lastError: Error | null = null;
    let validationHint = "";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const systemPrompt =
        attempt === 0
          ? req.system
          : `${req.system}\n\n[Previous attempt failed]\n${validationHint}\nFix the errors and return valid JSON.`;

      const userSuffix = `Output valid JSON strictly matching schema "${req.schemaName}". Return only the JSON object, no markdown fences.`;

      const response = (await this.client.chat.completions.create({
        model: this.modelName(req.model ?? "fast"),
        messages: [
          { role: "system", content: systemPrompt },
          ...req.messages,
          { role: "user", content: userSuffix },
        ],
        temperature: req.temperature ?? 0,
        response_format: { type: "json_object" },
      })) as CompletionResponse;

      const raw = response.choices[0]?.message?.content ?? "";

      try {
        const cleaned = raw
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
        const parsed = JSON.parse(cleaned);
        return req.schema.parse(parsed) as T;
      } catch (err) {
        lastError = err as Error;
        validationHint = lastError.message.slice(0, 800);
      }
    }

    throw new Error(
      `LLMProvider.structured: exhausted ${maxRetries + 1} attempts for schema "${req.schemaName}". Last error: ${lastError?.message}`
    );
  }
}
