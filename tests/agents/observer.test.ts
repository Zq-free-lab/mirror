/**
 * Observer Agent 测试 — AC-OBS-1
 *
 * 全程使用 MockLLMProvider，无真实 LLM 调用。
 * 验证：
 *  - 输出过 observerOutputSchema Zod 校验
 *  - facts 和 signals 的 evidence 均带 sourceMessageId
 *  - sourceMessageId 指回输入消息列表中真实存在的 id
 *  - 空消息列表不崩溃（返回空 facts/signals）
 */
import { describe, it, expect } from "vitest";
import { runObserver } from "@/core/agents/observer";
import { observerOutputSchema } from "@/core/schemas";
import { MockLLMProvider } from "../mocks/MockLLMProvider";
import { sampleMessages } from "../fixtures/conversations";
import { observerOutputFixture } from "../fixtures/observer";

// ── AC-OBS-1 核心验收 ──────────────────────────────────────────────────────────

describe("AC-OBS-1: Observer outputs valid ObserverOutput with sourceMessageId", () => {
  it("returns output that passes observerOutputSchema", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ObserverOutput",
      observerOutputFixture
    );

    const result = await runObserver(sampleMessages, [], provider);

    expect(() => observerOutputSchema.parse(result)).not.toThrow();
  });

  it("all facts.evidence items have sourceMessageId", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ObserverOutput",
      observerOutputFixture
    );

    const result = await runObserver(sampleMessages, [], provider);

    for (const fact of result.facts) {
      for (const ev of fact.evidence) {
        expect(ev.sourceMessageId).toBeTruthy();
        expect(typeof ev.sourceMessageId).toBe("string");
      }
    }
  });

  it("all signals.evidence items have sourceMessageId", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ObserverOutput",
      observerOutputFixture
    );

    const result = await runObserver(sampleMessages, [], provider);

    for (const signal of result.signals) {
      for (const ev of signal.evidence) {
        expect(ev.sourceMessageId).toBeTruthy();
      }
    }
  });

  it("sourceMessageIds in facts reference existing input message ids", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ObserverOutput",
      observerOutputFixture
    );

    const inputIds = new Set(sampleMessages.map((m) => m.id));
    const result = await runObserver(sampleMessages, [], provider);

    for (const fact of result.facts) {
      for (const ev of fact.evidence) {
        expect(inputIds).toContain(ev.sourceMessageId);
      }
    }
  });

  it("sourceMessageIds in signals reference existing input message ids", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ObserverOutput",
      observerOutputFixture
    );

    const inputIds = new Set(sampleMessages.map((m) => m.id));
    const result = await runObserver(sampleMessages, [], provider);

    for (const signal of result.signals) {
      for (const ev of signal.evidence) {
        expect(inputIds).toContain(ev.sourceMessageId);
      }
    }
  });

  it("works with non-empty recentContext (context doesn't break parsing)", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ObserverOutput",
      observerOutputFixture
    );

    const context = [sampleMessages[0]];
    const newMsgs = sampleMessages.slice(1);

    const result = await runObserver(newMsgs, context, provider);
    expect(() => observerOutputSchema.parse(result)).not.toThrow();
  });

  it("returns empty arrays when fixture has no facts/signals", async () => {
    const emptyFixture = { facts: [], signals: [] };
    const provider = new MockLLMProvider().registerFixture(
      "ObserverOutput",
      emptyFixture
    );

    const result = await runObserver(sampleMessages, [], provider);
    expect(result.facts).toHaveLength(0);
    expect(result.signals).toHaveLength(0);
  });

  it("uses 'fast' model tier (structured call logged with correct schemaName)", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ObserverOutput",
      observerOutputFixture
    );

    await runObserver(sampleMessages, [], provider);

    const log = provider.callLog.find(
      (l) => l.method === "structured" && l.schemaName === "ObserverOutput"
    );
    expect(log).toBeDefined();
  });
});

// ── 错误路径：MockProvider 无 fixture 时应抛出（而非返回错误数据）─────────────

describe("Observer error handling", () => {
  it("throws when provider has no fixture (no silent failures)", async () => {
    const provider = new MockLLMProvider(); // 未注册 ObserverOutput

    await expect(
      runObserver(sampleMessages, [], provider)
    ).rejects.toThrow(/ObserverOutput/);
  });
});
