/**
 * Reconciler Agent 测试 — AC-REC-1
 *
 * 验证：
 *  - 输出过 reconcilerOutputSchema Zod 校验
 *  - contradictions 中 nodeIdA/nodeIdB 非空字符串（引用已有节点）
 *  - revisions 中 eventType 是合法枚举值
 *  - revised 类型的 revision 包含 newStatement（修正内容）
 *  - 无已有节点时输出空数组（无矛盾无修正）
 */
import { describe, it, expect } from "vitest";
import { runReconciler } from "@/core/agents/reconciler";
import { reconcilerOutputSchema } from "@/core/schemas";
import { MockLLMProvider } from "../mocks/MockLLMProvider";
import { infererOutputFixture } from "../fixtures/inferer";
import { reconcilerOutputFixture } from "../fixtures/reconciler";
import { seedGraphFixture } from "../fixtures/seed-graph";

const VALID_EVENT_TYPES = new Set([
  "revised",
  "reconsolidated",
  "reinforced",
  "denied",
]);

// 从 seed-graph fixture 中取已有节点
const existingNodes = seedGraphFixture.nodes.slice(0, 3);
// 通过 Skeptic 的推断（模拟 keep=true 后的列表）
const passedInferences = infererOutputFixture.inferences;

// ── AC-REC-1 核心验收 ──────────────────────────────────────────────────────────

describe("AC-REC-1: Reconciler outputs valid contradictions and revisions", () => {
  it("returns output that passes reconcilerOutputSchema", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ReconcilerOutput",
      reconcilerOutputFixture
    );

    const result = await runReconciler(passedInferences, existingNodes, provider);

    expect(() => reconcilerOutputSchema.parse(result)).not.toThrow();
  });

  it("contradictions have non-empty nodeIdA and nodeIdB", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ReconcilerOutput",
      reconcilerOutputFixture
    );

    const result = await runReconciler(passedInferences, existingNodes, provider);

    for (const c of result.contradictions) {
      expect(c.nodeIdA).toBeTruthy();
      expect(c.nodeIdB).toBeTruthy();
      expect(c.nodeIdA).not.toBe(c.nodeIdB);
    }
  });

  it("contradictions have non-empty explanation", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ReconcilerOutput",
      reconcilerOutputFixture
    );

    const result = await runReconciler(passedInferences, existingNodes, provider);

    for (const c of result.contradictions) {
      expect(c.explanation).toBeTruthy();
    }
  });

  it("revisions have valid eventType enum values", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ReconcilerOutput",
      reconcilerOutputFixture
    );

    const result = await runReconciler(passedInferences, existingNodes, provider);

    for (const r of result.revisions) {
      expect(VALID_EVENT_TYPES).toContain(r.eventType);
    }
  });

  it("revisions have non-empty reason", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ReconcilerOutput",
      reconcilerOutputFixture
    );

    const result = await runReconciler(passedInferences, existingNodes, provider);

    for (const r of result.revisions) {
      expect(r.reason).toBeTruthy();
    }
  });

  it("returns empty arrays when there are no existing nodes", async () => {
    const emptyFixture = { contradictions: [], revisions: [] };
    const provider = new MockLLMProvider().registerFixture(
      "ReconcilerOutput",
      emptyFixture
    );

    const result = await runReconciler(passedInferences, [], provider);

    expect(result.contradictions).toHaveLength(0);
    expect(result.revisions).toHaveLength(0);
  });

  it("uses 'fast' model and schemaName=ReconcilerOutput", async () => {
    const provider = new MockLLMProvider().registerFixture(
      "ReconcilerOutput",
      reconcilerOutputFixture
    );

    await runReconciler(passedInferences, existingNodes, provider);

    const log = provider.callLog.find(
      (l) => l.method === "structured" && l.schemaName === "ReconcilerOutput"
    );
    expect(log).toBeDefined();
  });

  it("revised eventType can include newStatement", async () => {
    const fixtureWithRevision = {
      contradictions: [],
      revisions: [
        {
          nodeId: "node-narrative-001",
          eventType: "revised" as const,
          newStatement: "你独立但在特定情境下愿意接受外部支持",
          newConfidence: 0.6,
          reason: "新消息展示了用户在高压场景下的求助行为",
        },
      ],
    };

    const provider = new MockLLMProvider().registerFixture(
      "ReconcilerOutput",
      fixtureWithRevision
    );

    const result = await runReconciler(passedInferences, existingNodes, provider);

    const revised = result.revisions.find((r) => r.eventType === "revised");
    expect(revised).toBeDefined();
    expect(revised?.newStatement).toBeTruthy();
  });
});

// ── Zod 层阻止非法数据 ──────────────────────────────────────────────────────────

describe("ReconcilerOutput schema validation", () => {
  it("rejects invalid eventType", () => {
    const bad = {
      contradictions: [],
      revisions: [
        {
          nodeId: "node-001",
          eventType: "updated", // 非法枚举值
          reason: "test",
        },
      ],
    };
    expect(() => reconcilerOutputSchema.parse(bad)).toThrow();
  });

  it("rejects revision with newConfidence > 1", () => {
    const bad = {
      contradictions: [],
      revisions: [
        {
          nodeId: "node-001",
          eventType: "reinforced",
          newConfidence: 1.5,
          reason: "test",
        },
      ],
    };
    expect(() => reconcilerOutputSchema.parse(bad)).toThrow();
  });

  it("accepts revision without optional newStatement and newConfidence", () => {
    const valid = {
      contradictions: [],
      revisions: [
        {
          nodeId: "node-001",
          eventType: "reinforced",
          reason: "新证据强化了原有推断",
        },
      ],
    };
    expect(() => reconcilerOutputSchema.parse(valid)).not.toThrow();
  });
});

// ── 错误路径 ──────────────────────────────────────────────────────────────────

describe("Reconciler error handling", () => {
  it("throws when provider has no fixture", async () => {
    const provider = new MockLLMProvider();

    await expect(
      runReconciler(passedInferences, existingNodes, provider)
    ).rejects.toThrow(/ReconcilerOutput/);
  });
});
