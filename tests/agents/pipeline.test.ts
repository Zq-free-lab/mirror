/**
 * Pipeline 集成测试
 *
 * AC-PIPE-1：输入对话 + 现有图 → 输出合法 PipelineResult（新节点+事件+问题）
 * AC-INF-2：pipeline 把 Inferer draft 补全为 Full 节点（id/createdAt/layer/status/userVerdict/confidence≠rawConfidence）
 * AC-SKP-1（pipeline 部分）：keep=false 被过滤；isUncanny/skepticFlag 正确传入节点
 * AC-REC-1（pipeline 部分）：contradictions 出现在返回值中
 * AC-PIPE-2：某步 Agent 失败 → pipeline 不崩，仍返回部分结果，warnings 非空
 */
import { describe, it, expect } from "vitest";
import { runPipeline } from "@/core/agents/pipeline";
import { MockLLMProvider } from "../mocks/MockLLMProvider";
import { sampleMessages } from "../fixtures/conversations";
import { observerOutputFixture } from "../fixtures/observer";
import { infererOutputFixture } from "../fixtures/inferer";
import { skepticOutputFixture } from "../fixtures/skeptic";
import { reconcilerOutputFixture } from "../fixtures/reconciler";
import { reflectorOutputFixture } from "../fixtures/reflector";
import { seedGraphFixture } from "../fixtures/seed-graph";

/** 注册所有 Agent fixture 的 provider（完整流水线） */
function makeFullProvider() {
  return new MockLLMProvider()
    .registerFixture("ObserverOutput", observerOutputFixture)
    .registerFixture("InfererOutput", infererOutputFixture)
    .registerFixture("SkepticOutput", skepticOutputFixture)
    .registerFixture("ReconcilerOutput", reconcilerOutputFixture)
    .registerFixture("ReflectorOutput", reflectorOutputFixture);
}

// ── AC-PIPE-1：端到端输出合法结果 ───────────────────────────────────────────

describe("AC-PIPE-1: Pipeline produces valid PipelineResult", () => {
  it("returns newNodes, newEvents, questions arrays", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    expect(Array.isArray(result.newNodes)).toBe(true);
    expect(Array.isArray(result.newEvents)).toBe(true);
    expect(Array.isArray(result.questions)).toBe(true);
  });

  it("newEvents count equals newNodes count (one 'created' event per node)", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    expect(result.newEvents.length).toBe(result.newNodes.length);
  });

  it("all newEvents have type 'created' and valid nodeId", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    const nodeIds = new Set(result.newNodes.map((n) => n.id));
    for (const evt of result.newEvents) {
      expect(evt.type).toBe("created");
      expect(nodeIds).toContain(evt.nodeId);
    }
  });

  it("questions have required fields", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    for (const q of result.questions) {
      expect(q.id).toBeTruthy();
      expect(q.question).toBeTruthy();
      expect(q.targetSystem).toBeTruthy();
    }
  });

  it("returns contradictions and revisions from Reconciler", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    expect(Array.isArray(result.contradictions)).toBe(true);
    expect(Array.isArray(result.revisions)).toBe(true);
  });

  it("reflectorOutput is present and has globalNotes", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    expect(result.reflectorOutput).not.toBeNull();
    expect(result.reflectorOutput?.globalNotes).toBeTruthy();
  });

  it("warnings is empty on full success", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    expect(result.warnings).toHaveLength(0);
  });
});

// ── AC-INF-2：draft → Full Node 补全正确 ────────────────────────────────────

describe("AC-INF-2: Pipeline hydrates InferredNodeDraft to full CognitiveNode", () => {
  it("each newNode has a non-empty id", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    for (const node of result.newNodes) {
      expect(node.id).toBeTruthy();
    }
  });

  it("each newNode has layer='inference'", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    for (const node of result.newNodes) {
      expect(node.layer).toBe("inference");
    }
  });

  it("each newNode has status='active'", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    for (const node of result.newNodes) {
      expect(node.status).toBe("active");
    }
  });

  it("each newNode has userVerdict=null", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    for (const node of result.newNodes) {
      expect(node.userVerdict).toBeNull();
    }
  });

  it("confidence is calibrated (≤ rawConfidence cap, ≠ rawConfidence for single-evidence)", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    for (const node of result.newNodes) {
      // confidence 必须在 [0,1] 内
      expect(node.confidence).toBeGreaterThanOrEqual(0);
      expect(node.confidence).toBeLessThanOrEqual(1);
      // 单证据节点：confidence ≤ 0.6（先验规则）
      if (node.evidence.length === 1) {
        expect(node.confidence).toBeLessThanOrEqual(0.6);
      }
      // confidence ≤ rawConfidence（只能被压低，不能被拉高）
      expect(node.confidence).toBeLessThanOrEqual(node.rawConfidence + 1e-9);
    }
  });

  it("each newNode has valid createdAt ISO string", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    for (const node of result.newNodes) {
      expect(() => new Date(node.createdAt)).not.toThrow();
      expect(isNaN(new Date(node.createdAt).getTime())).toBe(false);
    }
  });

  it("evidence items have hydrated id and timestamp", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    for (const node of result.newNodes) {
      for (const ev of node.evidence) {
        expect(ev.id).toBeTruthy();
        expect(ev.timestamp).toBeTruthy();
        expect(ev.sourceMessageId).toBeTruthy();
      }
    }
  });
});

// ── AC-SKP-1（pipeline 部分）：Skeptic 过滤与标记正确传入 ────────────────────

describe("AC-SKP-1 (pipeline): Skeptic keep=false filtered, isUncanny propagated", () => {
  it("nodes marked keep=false by Skeptic are not in newNodes", async () => {
    const fixtureWithRejection = {
      judgments: [
        { targetIndex: 0, keep: false, isUncanny: false, skepticFlag: null },
        { targetIndex: 1, keep: true, isUncanny: true, skepticFlag: "恐怖谷" },
      ],
    };
    const provider = new MockLLMProvider()
      .registerFixture("ObserverOutput", observerOutputFixture)
      .registerFixture("InfererOutput", infererOutputFixture)
      .registerFixture("SkepticOutput", fixtureWithRejection)
      .registerFixture("ReconcilerOutput", reconcilerOutputFixture)
      .registerFixture("ReflectorOutput", reflectorOutputFixture);

    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    // infererOutputFixture 有 2 条，1 条被过滤后剩 1 条
    expect(result.newNodes.length).toBe(1);
  });

  it("isUncanny=true from Skeptic is set on corresponding node", async () => {
    const fixtureAllUncanny = {
      judgments: [
        { targetIndex: 0, keep: true, isUncanny: true, skepticFlag: "恐怖谷A" },
        { targetIndex: 1, keep: true, isUncanny: false, skepticFlag: null },
      ],
    };
    const provider = new MockLLMProvider()
      .registerFixture("ObserverOutput", observerOutputFixture)
      .registerFixture("InfererOutput", infererOutputFixture)
      .registerFixture("SkepticOutput", fixtureAllUncanny)
      .registerFixture("ReconcilerOutput", reconcilerOutputFixture)
      .registerFixture("ReflectorOutput", reflectorOutputFixture);

    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    expect(result.newNodes[0].isUncanny).toBe(true);
    expect(result.newNodes[0].skepticFlag).toBe("恐怖谷A");
    expect(result.newNodes[1].isUncanny).toBe(false);
  });
});

// ── AC-REC-1（pipeline 部分）：Reconciler contradictions 出现在返回值 ─────────

describe("AC-REC-1 (pipeline): Reconciler contradictions returned", () => {
  it("contradictions from Reconciler are in PipelineResult", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    // reconcilerOutputFixture 有 1 条 contradiction
    expect(result.contradictions.length).toBeGreaterThanOrEqual(1);
    expect(result.contradictions[0].nodeIdA).toBeTruthy();
    expect(result.contradictions[0].nodeIdB).toBeTruthy();
  });
});

// ── AC-PIPE-2：Agent 失败不崩 pipeline ─────────────────────────────────────

describe("AC-PIPE-2: Agent failure does not crash pipeline", () => {
  it("Observer failure: pipeline continues with empty observer output", async () => {
    const provider = new MockLLMProvider()
      // 不注册 ObserverOutput → Observer 会抛出
      .registerFixture("InfererOutput", infererOutputFixture)
      .registerFixture("SkepticOutput", skepticOutputFixture)
      .registerFixture("ReconcilerOutput", reconcilerOutputFixture)
      .registerFixture("ReflectorOutput", reflectorOutputFixture);

    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((w) => w.includes("Observer"))).toBe(true);
  });

  it("Inferer failure: pipeline returns empty newNodes without crashing", async () => {
    const provider = new MockLLMProvider()
      .registerFixture("ObserverOutput", observerOutputFixture);
      // Inferer, Skeptic, Reconciler, Reflector 都未注册 → 都会失败

    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    expect(result.newNodes).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("Reflector failure: pipeline still returns newNodes and events", async () => {
    const provider = new MockLLMProvider()
      .registerFixture("ObserverOutput", observerOutputFixture)
      .registerFixture("InfererOutput", infererOutputFixture)
      .registerFixture("SkepticOutput", skepticOutputFixture)
      .registerFixture("ReconcilerOutput", reconcilerOutputFixture);
      // 不注册 ReflectorOutput → Reflector 失败

    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    expect(result.newNodes.length).toBeGreaterThan(0);
    expect(result.reflectorOutput).toBeNull();
    expect(result.warnings.some((w) => w.includes("Reflector"))).toBe(true);
  });

  it("all agents fail: pipeline returns empty result with warnings, no throw", async () => {
    const provider = new MockLLMProvider(); // 无任何 fixture

    const result = await runPipeline(sampleMessages, seedGraphFixture, provider);

    expect(result.newNodes).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });
});

// ── 空图时 pipeline 也能正常运行 ─────────────────────────────────────────────

describe("Pipeline with empty currentGraph", () => {
  it("works with empty nodes array", async () => {
    const provider = makeFullProvider();
    const result = await runPipeline(sampleMessages, { nodes: [] }, provider);

    expect(Array.isArray(result.newNodes)).toBe(true);
    expect(Array.isArray(result.questions)).toBe(true);
  });
});
