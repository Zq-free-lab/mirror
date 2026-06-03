import type { EmbeddingProvider } from "@/core/embedding/provider";

/**
 * Deterministic embedding mock for unit and integration tests.
 * Produces pseudo-vectors from a simple string hash — same input always
 * yields the same vector, so layout tests can be reproducible.
 * dim defaults to 8 (tiny, fast); set it to 384 to simulate MiniLM.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly id = "mock";
  readonly dim: number;

  public callCount = 0;

  constructor(dim = 8) {
    this.dim = dim;
  }

  async embed(texts: string[]): Promise<number[][]> {
    this.callCount += 1;
    return texts.map((t) => this.hashToVector(t));
  }

  private hashToVector(text: string): number[] {
    const vec: number[] = [];
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    }
    for (let i = 0; i < this.dim; i++) {
      // LCG step — deterministic, different per dimension
      seed = (seed * 1664525 + 1013904223) >>> 0;
      // Normalize to [-1, 1]
      vec.push((seed / 0xffffffff) * 2 - 1);
    }
    return vec;
  }
}
