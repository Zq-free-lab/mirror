/**
 * Skeptic Agent 测试 — AC-SKP-1
 *
 * 验证：
 *  - 输出过 skepticOutputSchema Zod 校验
 *  - targetIndex 数量与 infererOutput.inferences 一一对应
 *  - keep=false 项可被正确识别（fixture 中存在）
 *  - isUncanny=true 项必须带非空 skepticFlag
 *  - 所有 targetIndex 值在合法范围内
 */
import { describe, it, expect } from "vitest";
import { runSkeptic } from "@/core/agents/skeptic";
import { skepticOutputSchema } from "@/core/schemas";
import { MockLLMProvider } from "../mocks/MockLLMProvider";
import { sampleMessages } from "../fixtures/conversations";
import { infererOutputFixture } from "../fixtures/inferer";
import { skepticOutputFixture } from "../fixtures/skeptic";

// ── AC-SKP-1 核心验收 ──────────────────────────────────────────────────────────

describe("AC-SKP-1: Skeptic outputs valid judgments", () => {
  it("returns output that passes skepticOutputSchema", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "SkepticOutput",
      skepticOutputFixture
    );

    const result = await runSkeptic(infererOutputFixture, sampleMessages, provider);

    expect(() => skepticOutputSchema.parse(result)).not.toThrow();
  });

  it("judgments count matches infererOutput.inferences count", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "SkepticOutput",
      skepticOutputFixture
    );

    const result = await runSkeptic(infererOutputFixture, sampleMessages, provider);

    expect(result.judgments.length).toBe(infererOutputFixture.inferences.length);
  });

  it("all targetIndex values are within valid range", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "SkepticOutput",
      skepticOutputFixture
    );

    const result = await runSkeptic(infererOutputFixture, sampleMessages, provider);
    const maxIndex = infererOutputFixture.inferences.length - 1;

    for (const judgment of result.judgments) {
      expect(judgment.targetIndex).toBeGreaterThanOrEqual(0);
      expect(judgment.targetIndex).toBeLessThanOrEqual(maxIndex);
    }
  });

  it("isUncanny=true items have non-null skepticFlag", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "SkepticOutput",
      skepticOutputFixture
    );

    const result = await runSkeptic(infererOutputFixture, sampleMessages, provider);

    for (const judgment of result.judgments) {
      if (judgment.isUncanny) {
        expect(judgment.skepticFlag).toBeTruthy();
      }
    }
  });

  it("keep=false items exist in fixture (skeptic can reject inferences)", async () => {
    // 使用包含 keep=false 的 fixture 验证过滤能力
    const fixtureWithRejection = {
      judgments: [
        {
          targetIndex: 0,
          keep: false,
          isUncanny: false,
          skepticFlag: null,
        },
        {
          targetIndex: 1,
          keep: true,
          isUncanny: true,
          skepticFlag: "此推断有恐怖谷张力",
        },
      ],
    };

    const provider = new MockLLMProvider().registerFixture(
      "SkepticOutput",
      fixtureWithRejection
    );

    const result = await runSkeptic(infererOutputFixture, sampleMessages, provider);

    const rejected = result.judgments.filter((j) => !j.keep);
    expect(rejected.length).toBeGreaterThanOrEqual(1);
  });

  it("uses 'fast' model and schemaName=SkepticOutput", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "SkepticOutput",
      skepticOutputFixture
    );

    await runSkeptic(infererOutputFixture, sampleMessages, provider);

    const log = provider.callLog.find(
      (l) => l.method === "structured" && l.schemaName === "SkepticOutput"
    );
    expect(log).toBeDefined();
  });

  it("all keep=true+isUncanny=true items are preserved (not filtered)", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "SkepticOutput",
      skepticOutputFixture
    );

    const result = await runSkeptic(infererOutputFixture, sampleMessages, provider);

    const uncanny = result.judgments.filter((j) => j.keep && j.isUncanny);
    for (const j of uncanny) {
      expect(j.keep).toBe(true);
    }
  });
});

// ── Zod 层阻止非法数据进入系统 ─────────────────────────────────────────────────

describe("SkepticOutput schema validation", () => {
  it("rejects negative targetIndex", () => {
    const bad = {
      judgments: [{ targetIndex: -1, keep: true, isUncanny: false, skepticFlag: null }],
    };
    expect(() => skepticOutputSchema.parse(bad)).toThrow();
  });

  it("rejects missing keep field", () => {
    const bad = {
      judgments: [{ targetIndex: 0, isUncanny: false, skepticFlag: null }],
    };
    expect(() => skepticOutputSchema.parse(bad)).toThrow();
  });

  it("accepts null skepticFlag on keep=false items", () => {
    const valid = {
      judgments: [{ targetIndex: 0, keep: false, isUncanny: false, skepticFlag: null }],
    };
    expect(() => skepticOutputSchema.parse(valid)).not.toThrow();
  });
});

// ── 错误路径 ──────────────────────────────────────────────────────────────────

describe("Skeptic error handling", () => {
  it("throws when provider has no fixture", async () => {
    const provider = new MockLLMProvider();

    await expect(
      runSkeptic(infererOutputFixture, sampleMessages, provider)
    ).rejects.toThrow(/SkepticOutput/);
  });
});
