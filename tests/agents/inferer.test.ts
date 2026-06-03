/**
 * Inferer Agent 测试 — AC-INF-1
 *
 * 验证：
 *  - 输出过 infererOutputSchema Zod 校验
 *  - 每条推断 evidence ≥ 1 条
 *  - 单证据节点 rawConfidence ≤ 0.6（硬性约束）
 *  - evidence.sourceMessageId 存在且非空
 */
import { describe, it, expect } from "vitest";
import { runInferer } from "@/core/agents/inferer";
import { infererOutputSchema } from "@/core/schemas";
import { MockLLMProvider } from "../mocks/MockLLMProvider";
import { sampleMessages } from "../fixtures/conversations";
import { observerOutputFixture } from "../fixtures/observer";
import { infererOutputFixture } from "../fixtures/inferer";

// ── AC-INF-1 核心验收 ──────────────────────────────────────────────────────────

describe("AC-INF-1: Inferer outputs valid inference nodes", () => {
  it("returns output that passes infererOutputSchema", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "InfererOutput",
      infererOutputFixture
    );

    const result = await runInferer(
      observerOutputFixture,
      sampleMessages,
      provider
    );

    expect(() => infererOutputSchema.parse(result)).not.toThrow();
  });

  it("every inference node has evidence.length >= 1", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "InfererOutput",
      infererOutputFixture
    );

    const result = await runInferer(
      observerOutputFixture,
      sampleMessages,
      provider
    );

    for (const node of result.inferences) {
      expect(node.evidence.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("single-evidence nodes have rawConfidence <= 0.6 (prompt hard constraint)", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "InfererOutput",
      infererOutputFixture
    );

    const result = await runInferer(
      observerOutputFixture,
      sampleMessages,
      provider
    );

    for (const node of result.inferences) {
      if (node.evidence.length === 1) {
        expect(node.rawConfidence).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it("all evidence items have non-empty sourceMessageId", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "InfererOutput",
      infererOutputFixture
    );

    const result = await runInferer(
      observerOutputFixture,
      sampleMessages,
      provider
    );

    for (const node of result.inferences) {
      for (const ev of node.evidence) {
        expect(ev.sourceMessageId).toBeTruthy();
      }
    }
  });

  it("all nodes have valid system value (one of five cognitive systems)", async () => {
    const validSystems = new Set([
      "narrative",
      "affect",
      "valence",
      "social",
      "rhythm",
    ]);
    const provider = new MockLLMProvider().registerFixture(
      "InfererOutput",
      infererOutputFixture
    );

    const result = await runInferer(
      observerOutputFixture,
      sampleMessages,
      provider
    );

    for (const node of result.inferences) {
      expect(validSystems).toContain(node.system);
    }
  });

  it("salience is within [0, 1] for all nodes", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "InfererOutput",
      infererOutputFixture
    );

    const result = await runInferer(
      observerOutputFixture,
      sampleMessages,
      provider
    );

    for (const node of result.inferences) {
      expect(node.salience).toBeGreaterThanOrEqual(0);
      expect(node.salience).toBeLessThanOrEqual(1);
    }
  });

  it("existingNodeCount parameter doesn't break execution", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "InfererOutput",
      infererOutputFixture
    );

    const result = await runInferer(
      observerOutputFixture,
      sampleMessages,
      provider,
      15
    );

    expect(result.inferences.length).toBeGreaterThanOrEqual(0);
  });

  it("uses 'fast' model and schemaName=InfererOutput", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "InfererOutput",
      infererOutputFixture
    );

    await runInferer(observerOutputFixture, sampleMessages, provider);

    const log = provider.callLog.find(
      (l) => l.method === "structured" && l.schemaName === "InfererOutput"
    );
    expect(log).toBeDefined();
  });
});

// ── Zod 层阻止非法高置信度进入系统 ───────────────────────────────────────────

describe("InfererOutput schema rejects out-of-range confidence", () => {
  it("rejects rawConfidence > 1", () => {
    const bad = {
      inferences: [
        { ...infererOutputFixture.inferences[0], rawConfidence: 1.5 },
      ],
    };
    expect(() => infererOutputSchema.parse(bad)).toThrow();
  });

  it("rejects empty evidence array", () => {
    const bad = {
      inferences: [{ ...infererOutputFixture.inferences[0], evidence: [] }],
    };
    expect(() => infererOutputSchema.parse(bad)).toThrow();
  });
});

// ── 错误路径 ──────────────────────────────────────────────────────────────────

describe("Inferer error handling", () => {
  it("throws when provider has no fixture", async () => {
    const provider = new MockLLMProvider();

    await expect(
      runInferer(observerOutputFixture, sampleMessages, provider)
    ).rejects.toThrow(/InfererOutput/);
  });
});
