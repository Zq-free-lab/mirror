/**
 * Mirror / 镜 —— Embedding Provider 抽象层（可配置，与 LLMProvider 对称）
 *
 * 业务层（layout.ts）只依赖本接口，**禁止 import 具体实现**。
 * 具体实现以 adapter 提供：
 *   - local-minilm.ts  → 浏览器本地 @xenova/transformers（默认，零 key，数据不出本机）
 *   - cloud-openai.ts  → 云端 embedding（可选，经 serverless /api/embed 藏 key）
 * factory.ts 按环境变量 NEXT_PUBLIC_EMBEDDING_PROVIDER 选择。
 *
 * 注意：不同 provider 的向量维度（dim）不同。切换 provider 若 dim 变化，
 * 必须重算全部 embedding（layout 依赖维度一致），缓存键应包含 provider id。
 */
export interface EmbeddingProvider {
  /** provider 标识，如 'local-minilm' / 'cloud-openai'。用作向量缓存键前缀。 */
  readonly id: string;

  /** 向量维度（如 MiniLM = 384）。 */
  readonly dim: number;

  /**
   * 批量把文本编码为向量。
   * 实现约定：保证返回顺序与入参一致；内部可分批；调用方负责按 statement hash 缓存。
   */
  embed(texts: string[]): Promise<number[][]>;
}
