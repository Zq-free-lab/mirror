/**
 * Reflector Agent 测试 — AC-REF-1
 *
 * 验证：
 *  - 输出过 reflectorOutputSchema Zod 校验
 *  - globalNotes 是非空字符串
 *  - decayCandidates 是字符串数组（可被 decay 逻辑消费）
 *  - biasWarnings 是字符串数组
 *  - 空图时输出合法（空 biasWarnings/decayCandidates）
 */
import { describe, it, expect } from "vitest";
import { runReflector } from "@/core/agents/reflector";
import { reflectorOutputSchema } from "@/core/schemas";
import { MockLLMProvider } from "../mocks/MockLLMProvider";
import { reflectorOutputFixture } from "../fixtures/reflector";
import { seedGraphFixture } from "../fixtures/seed-graph";

const currentNodes = seedGraphFixture.nodes;

// ── AC-REF-1 核心验收 ──────────────────────────────────────────────────────────

describe("AC-REF-1: Reflector outputs valid global notes and decay candidates", () => {
  it("returns output that passes reflectorOutputSchema", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ReflectorOutput",
      reflectorOutputFixture
    );

    const result = await runReflector(currentNodes, provider);

    expect(() => reflectorOutputSchema.parse(result)).not.toThrow();
  });

  it("globalNotes is a non-empty string", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ReflectorOutput",
      reflectorOutputFixture
    );

    const result = await runReflector(currentNodes, provider);

    expect(typeof result.globalNotes).toBe("string");
    expect(result.globalNotes.length).toBeGreaterThan(0);
  });

  it("biasWarnings is an array of strings", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ReflectorOutput",
      reflectorOutputFixture
    );

    const result = await runReflector(currentNodes, provider);

    expect(Array.isArray(result.biasWarnings)).toBe(true);
    for (const w of result.biasWarnings) {
      expect(typeof w).toBe("string");
    }
  });

  it("decayCandidates is an array of strings (AC-REF-1: consumed by decay logic)", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ReflectorOutput",
      reflectorOutputFixture
    );

    const result = await runReflector(currentNodes, provider);

    expect(Array.isArray(result.decayCandidates)).toBe(true);
    for (const id of result.decayCandidates) {
      expect(typeof id).toBe("string");
    }
  });

  it("empty graph returns valid output with empty arrays", async () => {
    const emptyFixture = {
      globalNotes: "图中尚无节点，认知模型尚未建立。",
      biasWarnings: [],
      decayCandidates: [],
    };
    const provider = new MockLLMProvider().registerFixture(
      "ReflectorOutput",
      emptyFixture
    );

    const result = await runReflector([], provider);

    expect(result.biasWarnings).toHaveLength(0);
    expect(result.decayCandidates).toHaveLength(0);
    expect(result.globalNotes).toBeTruthy();
  });

  it("uses 'fast' model and schemaName=ReflectorOutput", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ReflectorOutput",
      reflectorOutputFixture
    );

    await runReflector(currentNodes, provider);

    const log = provider.callLog.find(
      (l) => l.method === "structured" && l.schemaName === "ReflectorOutput"
    );
    expect(log).toBeDefined();
  });

  it("decayCandidates from fixture are accepted without error", async () => {
    const fixtureWithDecay = {
      globalNotes: "检测到低置信度节点，推荐衰减。",
      biasWarnings: ["当前推断集中在负向情绪"],
      decayCandidates: ["node-001", "node-002"],
    };
    const provider = new MockLLMProvider().registerFixture(
      "ReflectorOutput",
      fixtureWithDecay
    );

    const result = await runReflector(currentNodes, provider);

    expect(result.decayCandidates).toContain("node-001");
    expect(result.decayCandidates).toContain("node-002");
  });
});

// ── Zod 层阻止非法数据 ──────────────────────────────────────────────────────────

describe("ReflectorOutput schema validation", () => {
  it("rejects missing globalNotes", () => {
    const bad = {
      biasWarnings: [],
      decayCandidates: [],
    };
    expect(() => reflectorOutputSchema.parse(bad)).toThrow();
  });

  it("rejects non-string items in biasWarnings", () => {
    const bad = {
      globalNotes: "test",
      biasWarnings: [123],
      decayCandidates: [],
    };
    expect(() => reflectorOutputSchema.parse(bad)).toThrow();
  });

  it("accepts empty biasWarnings and decayCandidates", () => {
    const valid = {
      globalNotes: "画像正常，无偏差",
      biasWarnings: [],
      decayCandidates: [],
    };
    expect(() => reflectorOutputSchema.parse(valid)).not.toThrow();
  });
});

// ── 错误路径 ──────────────────────────────────────────────────────────────────

describe("Reflector error handling", () => {
  it("throws when provider has no fixture", async () => {
    const provider = new MockLLMProvider();

    await expect(
      runReflector(currentNodes, provider)
    ).rejects.toThrow(/ReflectorOutput/);
  });
});
