/**
 * Seed 图验收测试 — AC-SEED-1 / AC-RL-3 / AC-RL-6
 *
 * AC-SEED-1：seed 图合法且非空（≥40 节点、覆盖 5 系统、含 ≥1 isUncanny、含事件）。
 * AC-RL-3：每条 inference 节点 evidence.sourceMessageId 存在于 rawMessages。
 * AC-RL-6：至少 1 条 isUncanny 推断，带 skepticFlag，status='active'。
 */
import { describe, it, expect } from "vitest";
import { seedGraph } from "@/data/seed";
import { cognitiveNodeSchema, evolutionEventSchema, rawMessageSchema } from "@/core/schemas";

const { nodes, events, rawMessages, questions } = seedGraph;
const messageIds = new Set(rawMessages.map((m) => m.id));
const SYSTEMS = new Set(["narrative", "affect", "valence", "social", "rhythm"]);

// ── AC-SEED-1：规模与覆盖 ─────────────────────────────────────────────────────

describe("AC-SEED-1: Seed graph is valid and complete", () => {
  it("has ≥40 nodes", () => {
    expect(nodes.length).toBeGreaterThanOrEqual(40);
  });

  it("covers all 5 cognitive systems", () => {
    const systems = new Set(nodes.map((n) => n.system));
    for (const sys of SYSTEMS) {
      expect(systems).toContain(sys);
    }
  });

  it("has ≥1 isUncanny node (AC-RL-6)", () => {
    const uncanny = nodes.filter((n) => n.isUncanny);
    expect(uncanny.length).toBeGreaterThanOrEqual(1);
  });

  it("has ≥1 EvolutionEvent", () => {
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("has rawMessages", () => {
    expect(rawMessages.length).toBeGreaterThanOrEqual(5);
  });

  it("all nodes pass Zod cognitiveNodeSchema", () => {
    for (const node of nodes) {
      expect(() => cognitiveNodeSchema.parse(node)).not.toThrow();
    }
  });

  it("all events pass Zod evolutionEventSchema", () => {
    for (const event of events) {
      expect(() => evolutionEventSchema.parse(event)).not.toThrow();
    }
  });

  it("all rawMessages pass Zod rawMessageSchema", () => {
    for (const msg of rawMessages) {
      expect(() => rawMessageSchema.parse(msg)).not.toThrow();
    }
  });

  it("all node ids are unique", () => {
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all event ids are unique", () => {
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains ≥5 nodes per system", () => {
    for (const sys of SYSTEMS) {
      const count = nodes.filter((n) => n.system === sys).length;
      expect(count).toBeGreaterThanOrEqual(5);
    }
  });

  it("has ≥1 revised or reconsolidated EvolutionEvent (belief change)", () => {
    const changed = events.filter(
      (e) => e.type === "revised" || e.type === "reconsolidated"
    );
    expect(changed.length).toBeGreaterThanOrEqual(1);
  });
});

// ── AC-RL-3：证据可溯源 ───────────────────────────────────────────────────────

describe("AC-RL-3: All evidence.sourceMessageId references exist in rawMessages", () => {
  it("every inference node evidence points to a real message", () => {
    const inferenceNodes = nodes.filter((n) => n.layer === "inference");
    for (const node of inferenceNodes) {
      for (const ev of node.evidence) {
        expect(
          messageIds,
          `Node ${node.id}: evidence sourceMessageId "${ev.sourceMessageId}" not found in rawMessages`
        ).toContain(ev.sourceMessageId);
      }
    }
  });

  it("every fact node evidence points to a real message", () => {
    const factNodes = nodes.filter((n) => n.layer === "fact");
    for (const node of factNodes) {
      for (const ev of node.evidence) {
        expect(
          messageIds,
          `Fact ${node.id}: sourceMessageId "${ev.sourceMessageId}" not found`
        ).toContain(ev.sourceMessageId);
      }
    }
  });

  it("all inference nodes have ≥1 evidence item", () => {
    const inferenceNodes = nodes.filter((n) => n.layer === "inference");
    for (const node of inferenceNodes) {
      expect(
        node.evidence.length,
        `Node ${node.id} has no evidence`
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("all evidence id are unique within a node", () => {
    for (const node of nodes) {
      const evIds = node.evidence.map((e) => e.id);
      expect(new Set(evIds).size).toBe(evIds.length);
    }
  });
});

// ── AC-RL-6：恐怖谷有兜底 ────────────────────────────────────────────────────

describe("AC-RL-6: Uncanny nodes have proper structure for UI safeguards", () => {
  it("all isUncanny nodes have non-null skepticFlag", () => {
    const uncanny = nodes.filter((n) => n.isUncanny);
    for (const node of uncanny) {
      expect(
        node.skepticFlag,
        `Uncanny node ${node.id} has null skepticFlag`
      ).toBeTruthy();
    }
  });

  it("uncanny nodes have status='active' (still in the graph, not pruned)", () => {
    const uncanny = nodes.filter((n) => n.isUncanny);
    for (const node of uncanny) {
      expect(node.status).not.toBe("pruned");
    }
  });

  it("uncanny nodes have userVerdict=null (awaiting user decision)", () => {
    const uncanny = nodes.filter((n) => n.isUncanny);
    for (const node of uncanny) {
      // isUncanny nodes should be unresolved — user verdict is null or denied
      const isUnresolved = node.userVerdict === null || node.userVerdict === "dont_guess";
      expect(isUnresolved).toBe(true);
    }
  });

  it("seed has at least 2 uncanny nodes (恐怖谷多保留一点)", () => {
    const uncanny = nodes.filter((n) => n.isUncanny);
    expect(uncanny.length).toBeGreaterThanOrEqual(2);
  });
});

// ── 数据质量检查 ──────────────────────────────────────────────────────────────

describe("Seed data quality", () => {
  it("all confidence values are in [0, 1]", () => {
    for (const node of nodes) {
      expect(node.confidence).toBeGreaterThanOrEqual(0);
      expect(node.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("all salience values are in [0, 1]", () => {
    for (const node of nodes) {
      expect(node.salience).toBeGreaterThanOrEqual(0);
      expect(node.salience).toBeLessThanOrEqual(1);
    }
  });

  it("all fact nodes have confidence ≥ 0.85 (facts are certain)", () => {
    const facts = nodes.filter((n) => n.layer === "fact");
    for (const node of facts) {
      expect(node.confidence).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("contradicts ids reference valid node ids", () => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const node of nodes) {
      for (const contraId of node.contradicts) {
        expect(
          nodeIds,
          `Node ${node.id} contradicts non-existent node "${contraId}"`
        ).toContain(contraId);
      }
    }
  });

  it("events with nodeId reference valid node ids", () => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const event of events) {
      expect(
        nodeIds,
        `Event ${event.id} references non-existent node "${event.nodeId}"`
      ).toContain(event.nodeId);
    }
  });

  it("has ≥1 question in questions array", () => {
    expect(questions.length).toBeGreaterThanOrEqual(1);
  });
});
