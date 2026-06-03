/**
 * Embedding Provider 测试 — AC-EMB-1 / AC-EMB-2
 *
 * 使用 MockEmbeddingProvider（不依赖真实模型），测试接口契约：
 * AC-EMB-1：同一文本两次 embed 结果完全一致；callCount 追踪调用次数（模拟缓存验证）。
 * AC-EMB-2：返回向量维度等于 provider.dim；provider id 可区分不同实例（缓存键隔离）。
 */
import { describe, it, expect } from "vitest";
import { MockEmbeddingProvider } from "./mocks/MockEmbeddingProvider";

// ── AC-EMB-1：一致性和调用计数 ───────────────────────────────────────────────

describe("AC-EMB-1: EmbeddingProvider consistency", () => {
  it("same text produces identical vector on repeated calls", async () => {
    const provider = new MockEmbeddingProvider(384);
    const text = "你倾向于把困难内化，用独自扛着来维持自我叙事";

    const [result1] = await provider.embed([text]);
    const [result2] = await provider.embed([text]);

    expect(result1).toEqual(result2);
  });

  it("different texts produce different vectors", async () => {
    const provider = new MockEmbeddingProvider(384);
    const [v1] = await provider.embed(["情动潮汐：当下情绪高度紧张"]);
    const [v2] = await provider.embed(["叙事核：自我认同稳定持久"]);

    expect(v1).not.toEqual(v2);
  });

  it("callCount increments with each embed() call (not per text)", async () => {
    const provider = new MockEmbeddingProvider();
    expect(provider.callCount).toBe(0);

    await provider.embed(["a", "b", "c"]);
    expect(provider.callCount).toBe(1);

    await provider.embed(["d"]);
    expect(provider.callCount).toBe(2);
  });

  it("empty texts array returns empty result without error", async () => {
    const provider = new MockEmbeddingProvider(384);
    const result = await provider.embed([]);
    expect(result).toHaveLength(0);
  });

  it("batch embed returns same results as individual embeds", async () => {
    const provider = new MockEmbeddingProvider(384);
    const texts = ["文本甲", "文本乙", "文本丙"];

    const batch = await provider.embed(texts);
    const individual = await Promise.all(texts.map((t) => provider.embed([t]).then((r) => r[0])));

    expect(batch).toEqual(individual);
  });
});

// ── AC-EMB-2：维度和 id 隔离 ─────────────────────────────────────────────────

describe("AC-EMB-2: Dimension and provider id isolation", () => {
  it("vector length equals provider.dim (dim=8 default)", async () => {
    const provider = new MockEmbeddingProvider(); // default dim=8
    const [vec] = await provider.embed(["test text"]);
    expect(vec).toHaveLength(provider.dim);
    expect(vec).toHaveLength(8);
  });

  it("vector length equals provider.dim (dim=384 MiniLM-like)", async () => {
    const provider = new MockEmbeddingProvider(384);
    const [vec] = await provider.embed(["test text"]);
    expect(vec).toHaveLength(provider.dim);
    expect(vec).toHaveLength(384);
  });

  it("different dim providers produce vectors of their respective dimensions", async () => {
    const p8 = new MockEmbeddingProvider(8);
    const p384 = new MockEmbeddingProvider(384);

    const [v8] = await p8.embed(["same text"]);
    const [v384] = await p384.embed(["same text"]);

    expect(v8).toHaveLength(8);
    expect(v384).toHaveLength(384);
    // Different dims → different vectors (can't be equal due to length mismatch)
    expect(v8).not.toEqual(v384);
  });

  it("provider id is 'mock' for MockEmbeddingProvider", () => {
    const provider = new MockEmbeddingProvider();
    expect(provider.id).toBe("mock");
  });

  it("all vector components are in [-1, 1] range (normalized)", async () => {
    const provider = new MockEmbeddingProvider(64);
    const [vec] = await provider.embed(["正则化测试文本"]);
    for (const v of vec) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

// ── EmbeddingProvider 接口契约 ──────────────────────────────────────────────

describe("EmbeddingProvider interface contract", () => {
  it("embed() returns array with same length as input", async () => {
    const provider = new MockEmbeddingProvider(384);
    const texts = ["a", "b", "c", "d", "e"];
    const results = await provider.embed(texts);
    expect(results).toHaveLength(texts.length);
  });

  it("each result vector has consistent length", async () => {
    const provider = new MockEmbeddingProvider(16);
    const results = await provider.embed(["text1", "text2", "text3"]);
    for (const vec of results) {
      expect(vec).toHaveLength(16);
    }
  });
});
