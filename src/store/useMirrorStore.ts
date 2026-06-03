"use client";
/**
 * Mirror / 镜 —— 全局状态管理（Zustand）
 *
 * 单一 store 管理整个应用的认知图状态、UI 状态和动效状态。
 *
 * 状态分区：
 *  graph      → 认知图数据（nodes / events / questions / rawMessages）
 *  ui         → 选中节点、侧栏状态、对质状态机 phase
 *  animation  → 生长动画队列、对质动效触发
 */
import { create } from "zustand";
import type {
  CognitiveNode,
  EvolutionEvent,
  ActiveQuestion,
  RawMessage,
  Contradiction,
  Revision,
} from "@/core/types";

// ─── 对质状态机 phases ──────────────────────────────────────────────────────

export type ConfrontationPhase =
  | "idle"           // 无对质
  | "retrieving"     // 点亮目标节点 + 调取证据
  | "plasticizing"   // 目标节点液化（粒子扩散软化）
  | "deliberating"   // 侧栏流式显示 reasoning（思考态）
  | "restructuring"  // 节点迁移/重连/暗灭动画
  | "settled";       // 写入 EvolutionEvent，沉积

// ─── Store 类型 ──────────────────────────────────────────────────────────────

interface GraphState {
  nodes: CognitiveNode[];
  events: EvolutionEvent[];
  questions: ActiveQuestion[];
  rawMessages: RawMessage[];
}

interface UIState {
  selectedNodeId: string | null;
  inspectorOpen: boolean;
  hoveredNodeId: string | null;   // R4-T02：当前 hover 的节点 id
  confrontationPhase: ConfrontationPhase;
  confrontationNodeId: string | null;
  confrontationReasoning: string; // 流式 reasoning 文本
  isProcessing: boolean;          // pipeline 运行中
  warnings: string[];             // 最新一次 pipeline 警告
  pendingSubmit: string | null;   // onboarding 起手句触发的待提交消息
}

interface AnimationState {
  /** 刚加入图的节点 id（触发出生动画） */
  newNodeIds: Set<string>;
  /** 需要重组动画的节点 id 集合 */
  restructuringNodeIds: Set<string>;
}

interface MirrorStore extends GraphState, UIState, AnimationState {
  // ── Graph mutations ──────────────────────────────────────────────────────
  setGraph(graph: Partial<GraphState>): void;
  mergeNodes(newNodes: CognitiveNode[]): void;
  mergeEvents(newEvents: EvolutionEvent[]): void;
  mergeRawMessages(messages: RawMessage[]): void;
  setQuestions(questions: ActiveQuestion[]): void;
  applyContradictions(contradictions: Contradiction[]): void;
  applyRevisions(revisions: Revision[]): void;
  updateNodeVerdict(nodeId: string, verdict: CognitiveNode["userVerdict"]): void;

  // ── UI mutations ─────────────────────────────────────────────────────────
  selectNode(id: string | null): void;
  openInspector(): void;
  closeInspector(): void;
  setHoveredNode(id: string | null): void;
  setConfrontationPhase(phase: ConfrontationPhase, nodeId?: string): void;
  appendReasoning(delta: string): void;
  clearReasoning(): void;
  setProcessing(flag: boolean): void;
  setWarnings(warnings: string[]): void;
  setPendingSubmit(text: string | null): void;

  // ── Animation mutations ──────────────────────────────────────────────────
  markNodesNew(ids: string[]): void;
  clearNewNode(id: string): void;
  markRestructuring(ids: string[]): void;
  clearRestructuring(id: string): void;
}

// ─── Store 实现 ──────────────────────────────────────────────────────────────

export const useMirrorStore = create<MirrorStore>((set, get) => ({
  // ── 初始状态 ──────────────────────────────────────────────────────────────
  nodes: [],
  events: [],
  questions: [],
  rawMessages: [],

  selectedNodeId: null,
  inspectorOpen: false,
  hoveredNodeId: null,
  confrontationPhase: "idle",
  confrontationNodeId: null,
  confrontationReasoning: "",
  isProcessing: false,
  warnings: [],
  pendingSubmit: null,

  newNodeIds: new Set(),
  restructuringNodeIds: new Set(),

  // ── Graph mutations ────────────────────────────────────────────────────────

  setGraph(graph) {
    set((s) => ({ ...s, ...graph }));
  },

  mergeNodes(newNodes) {
    set((s) => {
      const existingMap = new Map(s.nodes.map((n) => [n.id, n]));
      for (const node of newNodes) {
        existingMap.set(node.id, node);
      }
      return { nodes: Array.from(existingMap.values()) };
    });
  },

  mergeEvents(newEvents) {
    set((s) => {
      const existingMap = new Map(s.events.map((e) => [e.id, e]));
      for (const event of newEvents) {
        existingMap.set(event.id, event);
      }
      const sorted = Array.from(existingMap.values()).sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      return { events: sorted };
    });
  },

  mergeRawMessages(messages) {
    set((s) => {
      const existingMap = new Map(s.rawMessages.map((m) => [m.id, m]));
      for (const msg of messages) {
        existingMap.set(msg.id, msg);
      }
      const sorted = Array.from(existingMap.values()).sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      return { rawMessages: sorted };
    });
  },

  setQuestions(questions) {
    set({ questions });
  },

  applyContradictions(contradictions) {
    set((s) => {
      const nodeMap = new Map(s.nodes.map((n) => [n.id, { ...n, contradicts: [...n.contradicts] }]));
      for (const c of contradictions) {
        const nodeA = nodeMap.get(c.nodeIdA);
        const nodeB = nodeMap.get(c.nodeIdB);
        if (nodeA && !nodeA.contradicts.includes(c.nodeIdB)) {
          nodeA.contradicts.push(c.nodeIdB);
        }
        if (nodeB && !nodeB.contradicts.includes(c.nodeIdA)) {
          nodeB.contradicts.push(c.nodeIdA);
        }
      }
      return { nodes: Array.from(nodeMap.values()) };
    });
  },

  applyRevisions(revisions) {
    set((s) => {
      const nodeMap = new Map(s.nodes.map((n) => [n.id, { ...n }]));
      for (const rev of revisions) {
        const node = nodeMap.get(rev.nodeId);
        if (!node) continue;
        if (rev.newStatement) node.statement = rev.newStatement;
        if (rev.newConfidence !== undefined) {
          node.confidence = rev.newConfidence;
          node.rawConfidence = rev.newConfidence;
        }
        node.lastReinforced = new Date().toISOString();
      }
      return { nodes: Array.from(nodeMap.values()) };
    });
  },

  updateNodeVerdict(nodeId, verdict) {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, userVerdict: verdict } : n
      ),
    }));
  },

  // ── UI mutations ───────────────────────────────────────────────────────────

  selectNode(id) {
    set({ selectedNodeId: id, inspectorOpen: id !== null });
  },

  openInspector() {
    set({ inspectorOpen: true });
  },

  closeInspector() {
    set({ inspectorOpen: false, selectedNodeId: null });
  },

  setHoveredNode(id) {
    set({ hoveredNodeId: id });
  },

  setConfrontationPhase(phase, nodeId) {
    set((s) => ({
      confrontationPhase: phase,
      confrontationNodeId: nodeId ?? s.confrontationNodeId,
      confrontationReasoning: phase === "idle" ? "" : s.confrontationReasoning,
    }));
  },

  appendReasoning(delta) {
    set((s) => ({ confrontationReasoning: s.confrontationReasoning + delta }));
  },

  clearReasoning() {
    set({ confrontationReasoning: "" });
  },

  setProcessing(flag) {
    set({ isProcessing: flag });
  },

  setWarnings(warnings) {
    set({ warnings });
  },

  setPendingSubmit(text) {
    set({ pendingSubmit: text });
  },

  // ── Animation mutations ────────────────────────────────────────────────────

  markNodesNew(ids) {
    set((s) => ({
      newNodeIds: new Set([...s.newNodeIds, ...ids]),
    }));
  },

  clearNewNode(id) {
    set((s) => {
      const next = new Set(s.newNodeIds);
      next.delete(id);
      return { newNodeIds: next };
    });
  },

  markRestructuring(ids) {
    set((s) => ({
      restructuringNodeIds: new Set([...s.restructuringNodeIds, ...ids]),
    }));
  },

  clearRestructuring(id) {
    set((s) => {
      const next = new Set(s.restructuringNodeIds);
      next.delete(id);
      return { restructuringNodeIds: next };
    });
  },
}));

// ─── 便捷 selectors ─────────────────────────────────────────────────────────

export const selectSelectedNode = (s: MirrorStore) =>
  s.nodes.find((n) => n.id === s.selectedNodeId) ?? null;

export const selectConfrontationNode = (s: MirrorStore) =>
  s.nodes.find((n) => n.id === s.confrontationNodeId) ?? null;
