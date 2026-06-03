/**
 * Mirror / 镜 —— Embedding Provider Factory
 *
 * 按环境变量 NEXT_PUBLIC_EMBEDDING_PROVIDER 选择 provider：
 *   - 'local'（默认）→ LocalMiniLMProvider（@xenova/transformers，浏览器本地）
 *   - 'mock'          → 测试/CI 专用，不应在生产使用
 *
 * 业务层（layout.ts 等）调用 `getEmbeddingProvider()` 获取单例。
 * 切换 provider 若 dim 变化，调用 `resetEmbeddingProvider()` 清除单例，
 * 并在重建时重算所有 embedding（layout 依赖维度一致）。
 */
import type { EmbeddingProvider } from "./provider";

let _instance: EmbeddingProvider | null = null;

/**
 * 获取（或懒创建）当前 EmbeddingProvider 单例。
 * Server Components / SSR 调用时返回 local 实现（Node.js 下也能运行）。
 */
export async function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (_instance) return _instance;

  const providerEnv =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_EMBEDDING_PROVIDER) ||
    "local";

  if (providerEnv === "local") {
    const { LocalMiniLMProvider } = await import("./local-minilm");
    _instance = new LocalMiniLMProvider();
  } else {
    // 未来可扩展 cloud-openai 等
    const { LocalMiniLMProvider } = await import("./local-minilm");
    _instance = new LocalMiniLMProvider();
  }

  return _instance;
}

/** 清除单例（测试 / provider 切换时使用）。 */
export function resetEmbeddingProvider(): void {
  _instance = null;
}
