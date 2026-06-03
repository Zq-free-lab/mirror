/**
 * Mirror / 镜 —— 本地 Embedding（@xenova/transformers + 浏览器本地推理）
 *
 * 默认实现：Xenova/all-MiniLM-L6-v2，dim=384，零 key，数据不出本机。
 * 红线（AC-RL-5）：本地模式下 embed() 不发任何网络请求（模型首次加载由 WebStorage 缓存）。
 *
 * 架构说明：
 * - 浏览器端：pipeline 在 Web Worker 中运行（transformers.js env.allowLocalModels 设置），
 *   避免阻塞主线程。
 * - Node/SSR：动态 import @xenova/transformers，直接运行（用于 CI 集成验证，模型会下载）。
 * - 缓存：按 text hash 缓存向量，保证同一文本不重复计算（AC-EMB-1）。
 *
 * 注意：此文件不需要单元测试，测试层用 MockEmbeddingProvider。
 * 真实集成（模型加载）通过 Playwright E2E 验证（AC-RL-5）。
 */
import type { EmbeddingProvider } from "./provider";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const VECTOR_DIM = 384;

/** 简单的文本 hash（用于缓存键，非加密）。 */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/**
 * 本地 MiniLM Embedding Provider。
 *
 * 调用 `LocalMiniLMProvider.create()` 异步初始化（延迟加载模型）。
 * 同步调用 `new LocalMiniLMProvider()` 也可以——模型在第一次 embed() 时加载。
 */
export class LocalMiniLMProvider implements EmbeddingProvider {
  readonly id = "local-minilm";
  readonly dim = VECTOR_DIM;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipeline: any = null;
  private readonly cache = new Map<string, number[]>();

  private async getPipeline() {
    if (this.pipeline) return this.pipeline;

    const { pipeline, env } = await import("@xenova/transformers");
    // 浏览器端：允许本地缓存，避免反复下载
    env.allowLocalModels = true;
    env.useBrowserCache = true;

    this.pipeline = await pipeline("feature-extraction", MODEL_NAME, {
      quantized: true, // 量化模型更小更快（dim 不变）
    });
    return this.pipeline;
  }

  /**
   * 批量文本 → 向量。命中内存缓存时不重算。
   */
  async embed(texts: string[]): Promise<number[][]> {
    const pipe = await this.getPipeline();
    const results: number[][] = [];

    for (const text of texts) {
      const key = simpleHash(text);
      if (this.cache.has(key)) {
        results.push(this.cache.get(key)!);
        continue;
      }

      // 运行模型，取 [CLS] token 向量（mean pooling）
      const output = await pipe(text, { pooling: "mean", normalize: true });
      const vec = Array.from(output.data) as number[];
      this.cache.set(key, vec);
      results.push(vec);
    }

    return results;
  }
}
