/**
 * Mirror / 镜 —— LLM Provider 抽象层（可配置核心）
 *
 * 业务层（五 Agent / 对质）只依赖本接口，**禁止 import 任何具体厂商 SDK**。
 * 具体厂商以 adapter 实现：
 *   - openai-compatible.ts  → DeepSeek（默认）/ Qwen / 豆包 / OpenAI
 *   - anthropic.ts          → Claude
 * factory.ts 按环境变量 LLM_PROVIDER 选择并注入。
 *
 * 模型档位（ModelTier）是语义概念，由 adapter 映射到具体模型：
 *   - 'fast'      → LLM_MODEL_FAST      （抽取/推断/怀疑/调和，默认 deepseek-chat）
 *   - 'reasoning' → LLM_MODEL_REASONING （对质审议，思考态可视化，默认 deepseek-reasoner）
 */
import type { ZodType } from 'zod';

export type Role = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: Role;
  content: string;
}

export type ModelTier = 'fast' | 'reasoning';

export interface ChatRequest {
  system: string;
  messages: LLMMessage[];
  temperature?: number;
  /** 模型档位，默认 'fast' */
  model?: ModelTier;
}

export interface ChatResult {
  text: string;
  /** 推理模型（如 deepseek-reasoner）的思考过程；非推理模型为 undefined。 */
  reasoning?: string;
}

export interface ChatStreamChunk {
  /** 正文增量 */
  delta: string;
  /** 思考过程增量（推理模型）。用于对质审议的实时「思考态」可视化。 */
  reasoningDelta?: string;
}

export interface StructuredRequest<T> {
  system: string;
  messages: LLMMessage[];
  /** 期望输出的 Zod schema（来自 core/schemas.ts 的某个 Draft schema）。 */
  schema: ZodType<T>;
  /** schema 名称，用于 prompt 提示与错误信息。 */
  schemaName: string;
  temperature?: number;
  model?: ModelTier;
  /** JSON 解析 / Zod 校验失败时的最大重试次数，默认 2。 */
  maxRetries?: number;
}

/**
 * LLM Provider 统一接口。
 *
 * 实现约定：
 *  - `structured()` 内部负责：① 引导模型输出 JSON ② JSON.parse ③ schema.parse 校验
 *    ④ 失败时把校验错误回灌重试（≤ maxRetries）。对外只返回已校验的 T，或在耗尽重试后抛错。
 *  - `chatStream()` 用于对质（/api/confront），需透传 reasoningDelta。
 */
export interface LLMProvider {
  /** provider 标识，如 'deepseek' / 'anthropic'，用于日志与遥测。 */
  readonly id: string;

  chat(req: ChatRequest): Promise<ChatResult>;

  chatStream(req: ChatRequest): AsyncIterable<ChatStreamChunk>;

  structured<T>(req: StructuredRequest<T>): Promise<T>;
}
