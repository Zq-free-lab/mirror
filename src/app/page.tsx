"use client";
/**
 * Mirror / 镜 —— 主页面（认知星云 + 交互层）
 *
 * 布局：
 *  - 全屏深空 Canvas（r3f）
 *  - 右侧：NodeInspector（点击节点滑出）
 *  - 左侧：Confrontation 面板（对质时展开）
 *  - 底部：现场补一句输入框
 *  - 顶部：标题 + 主动提问
 */
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { MotionConfig } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { motion, AnimatePresence } from "framer-motion";
import { useMirrorStore, selectSelectedNode } from "@/store/useMirrorStore";
import { NebulaCoreScene } from "@/viz/Nebula";
import { NodeInspector } from "@/viz/NodeInspector";
import { Confrontation } from "@/viz/Confrontation";
import { MemoryList } from "@/viz/MemoryList";
import { Legend } from "@/viz/Legend";
import { HUDFrame } from "@/viz/HUDFrame";
import { Onboarding } from "@/viz/Onboarding";
import { InsightReport } from "@/viz/InsightReport";
import { seedGraph, initSeedIfEmpty } from "@/data/seed";
import { putMessage } from "@/data/db";
import { HOLO, FONT, SYSTEM_COLORS, confidenceColor } from "@/viz/theme";
import { SYSTEM_META } from "@/core/types";
import type { CognitiveNode, RawMessage } from "@/core/types";

/** 给无 position 的节点分配基于系统 anchor 的初始散布位置（LCG 伪随机，可复现）。 */
function spreadPositions(nodes: CognitiveNode[]): CognitiveNode[] {
  let seed = 12345;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  return nodes.map((n) => {
    if (n.position) return n;
    const anchor = SYSTEM_META[n.system].anchor;
    const r = 0.35 + lcg() * 0.55; // 距 anchor 的随机半径
    const theta = lcg() * Math.PI * 2;
    const phi = lcg() * Math.PI;
    const pos: [number, number, number] = [
      anchor[0] + r * Math.sin(phi) * Math.cos(theta),
      anchor[1] + r * Math.sin(phi) * Math.sin(theta) * 0.6,
      anchor[2] + r * Math.cos(phi),
    ];
    return { ...n, position: pos };
  });
}

// ─── R4-T02 Hover Tooltip（跟随光标，诗意名 + 置信度）──────────────────────────

function NodeHoverTooltip() {
  const { nodes, hoveredNodeId } = useMirrorStore();
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const node = hoveredNodeId ? nodes.find((n) => n.id === hoveredNodeId) ?? null : null;

  useEffect(() => {
    const handler = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  if (!node) return null;
  const meta     = SYSTEM_META[node.system];
  const sysCol   = SYSTEM_COLORS[node.system];
  const confCol  = confidenceColor(node.confidence);

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: pos.x + 14, top: pos.y - 10 }}
    >
      <div
        className="px-3 py-2 rounded-xl backdrop-blur-md"
        style={{
          background: "rgba(8,14,26,0.88)",
          border: `1px solid ${sysCol.base}55`,
          boxShadow: `0 0 16px ${sysCol.glow}33`,
          minWidth: 120,
          maxWidth: 200,
        }}
      >
        {/* 诗意名 */}
        <div
          className="text-xs font-light leading-snug mb-1"
          style={{ color: sysCol.base, fontFamily: FONT.sans, textShadow: `0 0 8px ${sysCol.glow}` }}
        >
          {meta.poeticName}
        </div>
        {/* 脑区（等宽小字） */}
        <div style={{ fontFamily: FONT.mono, fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", marginBottom: 4 }}>
          {meta.brainRegion}
        </div>
        {/* 置信度 mini-bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.1)", borderRadius: 1 }}>
            <div style={{ height: "100%", width: `${node.confidence * 100}%`, background: confCol, borderRadius: 1, boxShadow: `0 0 4px ${confCol}88`, transition: "width 0.4s ease" }} />
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 9, color: confCol }}>
            {(node.confidence * 100).toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── 话浮入星云动画 ───────────────────────────────────────────────────────────

interface FloatingMsgProps {
  text: string;
  onArrive: () => void;
  onComplete: () => void;
}

function FloatingMessage({ text, onArrive, onComplete }: FloatingMsgProps) {
  useEffect(() => {
    // 约 600ms 后"到达"星云中心，触发脉动
    const t = setTimeout(onArrive, 620);
    return () => clearTimeout(t);
  }, [onArrive]);

  return (
    <motion.div
      className="fixed z-50 pointer-events-none left-1/2"
      style={{ bottom: 96 }}
      initial={{ x: "-50%", y: 0, opacity: 0.95, scale: 1 }}
      animate={{ x: "-50%", y: -260, opacity: 0, scale: 0.4 }}
      transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
      onAnimationComplete={onComplete}
    >
      <span
        className="text-xs px-3 py-1 rounded-full border"
        style={{
          color: HOLO.line,
          borderColor: `${HOLO.line}55`,
          background: "rgba(95,224,255,0.08)",
          fontFamily: FONT.mono,
          textShadow: `0 0 10px ${HOLO.line}`,
          boxShadow: `0 0 14px ${HOLO.line}33`,
          whiteSpace: "nowrap",
          maxWidth: 280,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "block",
        }}
      >
        {text}
      </span>
    </motion.div>
  );
}

// ─── 星云核心脉动光环（CSS overlay） ────────────────────────────────────────

function NebulaCorePulse({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="pulse"
          className="fixed inset-0 pointer-events-none z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.18, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          style={{
            background: `radial-gradient(circle at 50% 50%, ${HOLO.line}33 0%, transparent 55%)`,
          }}
        />
      )}
    </AnimatePresence>
  );
}

// ─── 思考时间线 ───────────────────────────────────────────────────────────────

const STAGE_ORDER = ["observer", "inferer", "skeptic", "reconciler", "reflector"] as const;
type StageId = (typeof STAGE_ORDER)[number];

const STAGE_LABELS: Record<StageId, string> = {
  observer: "观察者在读你的话",
  inferer: "推断者在形成假设",
  skeptic: "怀疑者在审查",
  reconciler: "调和者在比对旧认知",
  reflector: "镜在整合元认知",
};

function ThinkingTimeline({ current }: { current: StageId | null }) {
  if (!current) return null;
  const currentIdx = STAGE_ORDER.indexOf(current);

  return (
    <motion.div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className="flex flex-col gap-1.5 px-4 py-3 rounded-2xl backdrop-blur-md"
        style={{
          background: "rgba(8,14,26,0.82)",
          border: `1px solid ${HOLO.line}22`,
          boxShadow: `0 0 24px ${HOLO.line}0A`,
          minWidth: 220,
        }}
      >
        {STAGE_ORDER.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={s} className="flex items-center gap-2">
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: done
                    ? HOLO.line
                    : active
                    ? HOLO.warmCore
                    : "rgba(255,255,255,0.12)",
                  boxShadow: active ? `0 0 8px ${HOLO.warmCore}` : undefined,
                  flexShrink: 0,
                  display: "block",
                }}
              />
              <span
                className="text-xs"
                style={{
                  fontFamily: FONT.mono,
                  color: done
                    ? `${HOLO.line}99`
                    : active
                    ? HOLO.warmCore
                    : "rgba(255,255,255,0.2)",
                }}
              >
                {STAGE_LABELS[s]}
              </span>
              {active && (
                <motion.span
                  className="ml-0.5 text-xs"
                  style={{ color: HOLO.warmCore, fontFamily: FONT.mono }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity }}
                >
                  …
                </motion.span>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── 现场补一句 输入组件 ───────────────────────────────────────────────────────

function AddMessageInput() {
  const [input, setInput] = useState("");
  const [floatingText, setFloatingText] = useState<string | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const [currentStage, setCurrentStage] = useState<StageId | null>(null);
  const submitRef = useRef<((content: string) => Promise<void>) | null>(null);
  const {
    nodes,
    mergeNodes,
    mergeEvents,
    mergeRawMessages,
    setQuestions,
    applyContradictions,
    applyRevisions,
    markNodesNew,
    setProcessing,
    setWarnings,
    setPendingSubmit,
    pendingSubmit,
    isProcessing,
  } = useMirrorStore();

  const handleArrive = useCallback(() => {
    setPulsing(true);
    setTimeout(() => setPulsing(false), 950);
  }, []);

  const handleFloatComplete = useCallback(() => {
    setFloatingText(null);
  }, []);

  const submitContent = useCallback(async (content: string) => {
    if (!content || isProcessing) return;
    setInput("");
    setFloatingText(content);
    setProcessing(true);
    setCurrentStage(null);

    const newMsg: RawMessage = {
      id: `msg-live-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    mergeRawMessages([newMsg]);
    putMessage(newMsg).catch(console.error);

    try {
      const res = await fetch("/api/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [newMsg], graph: { nodes } }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let buffer = "";

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "stage") {
              if (STAGE_ORDER.includes(event.stage as StageId)) {
                setCurrentStage(event.stage as StageId);
              }
            } else if (event.type === "done") {
              const result = event.result;
              if (result.newNodes?.length > 0) {
                mergeNodes(result.newNodes);
                markNodesNew(result.newNodes.map((n: CognitiveNode) => n.id));
                // 新节点生长：触发星云核心脉动（AC-VIZ-GROW）
                setPulsing(true);
                setTimeout(() => setPulsing(false), 950);
              }
              if (result.newEvents?.length > 0) mergeEvents(result.newEvents);
              if (result.questions?.length > 0) setQuestions(result.questions);
              if (result.contradictions?.length > 0) applyContradictions(result.contradictions);
              if (result.revisions?.length > 0) applyRevisions(result.revisions);
              if (result.warnings?.length > 0) setWarnings(result.warnings);
            } else if (event.type === "error") {
              setWarnings([`Pipeline 错误：${event.message}`]);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      setWarnings([`API 调用失败：${String(err)}`]);
    } finally {
      setCurrentStage(null);
      setProcessing(false);
    }
  }, [isProcessing, nodes, mergeRawMessages, mergeNodes, mergeEvents, setQuestions, applyContradictions, applyRevisions, markNodesNew, setProcessing, setWarnings]);

  // 响应 onboarding 起手句
  useEffect(() => {
    if (pendingSubmit) {
      setPendingSubmit(null);
      submitContent(pendingSubmit);
    }
  }, [pendingSubmit, setPendingSubmit, submitContent]);

  const handleSubmit = () => submitContent(input.trim());

  return (
    <>
      {/* 话浮入动画 */}
      <AnimatePresence>
        {floatingText && (
          <FloatingMessage
            key={floatingText}
            text={floatingText}
            onArrive={handleArrive}
            onComplete={handleFloatComplete}
          />
        )}
      </AnimatePresence>

      {/* 星云核心脉动光环 */}
      <NebulaCorePulse active={pulsing} />

      {/* 思考时间线 */}
      <AnimatePresence>
        {isProcessing && <ThinkingTimeline current={currentStage} />}
      </AnimatePresence>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 z-40">
        <div className="bg-[#0a0f1a]/90 backdrop-blur-md border border-gray-700/60 rounded-2xl p-3 flex gap-3 shadow-2xl">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={isProcessing ? "星云正在感知……" : "补充一句，看星云生长……"}
            className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
            disabled={isProcessing}
          />
          <button
            onClick={handleSubmit}
            disabled={isProcessing || !input.trim()}
            className="px-4 py-1.5 bg-teal-800/60 text-teal-300 text-xs rounded-xl border border-teal-700/60 hover:bg-teal-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isProcessing ? "推断中…" : "发送"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── 错误 Toast 通知 ──────────────────────────────────────────────────────────

function WarningToast() {
  const { warnings, setWarnings } = useMirrorStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (warnings.length > 0) {
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setWarnings([]), 400);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [warnings, setWarnings]);

  if (warnings.length === 0) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed top-4 right-6 z-50 max-w-xs"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.25 }}
        >
          <div
            className="rounded-xl px-4 py-3 backdrop-blur-md"
            style={{
              background: "rgba(255,90,60,0.12)",
              border: `1px solid ${HOLO.tension}44`,
              boxShadow: `0 0 20px ${HOLO.tension}18`,
            }}
          >
            <div className="flex items-start gap-2">
              <span style={{ color: HOLO.tension, fontSize: 14, lineHeight: 1.2, flexShrink: 0 }}>⚠</span>
              <div>
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.7)", fontFamily: FONT.mono }}>
                    {w}
                  </p>
                ))}
              </div>
              <button
                onClick={() => { setVisible(false); setTimeout(() => setWarnings([]), 400); }}
                style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, lineHeight: 1, flexShrink: 0 }}
              >
                ×
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── 主动提问条 ───────────────────────────────────────────────────────────────

function ActiveQuestionBar() {
  const { questions } = useMirrorStore();
  const topQuestion = questions[0];

  if (!topQuestion) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40">
      <div className="bg-[#0a0f1a]/80 backdrop-blur-sm border border-gray-700/40 rounded-xl px-4 py-2 text-xs text-gray-400 max-w-sm text-center">
        <span className="text-teal-400 mr-1">镜问：</span>
        {topQuestion.question}
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function Home() {
  const {
    nodes,
    rawMessages,
    setGraph,
    selectNode,
    closeInspector,
    setHoveredNode,
    hoveredNodeId,
    setConfrontationPhase,
    appendReasoning,
    clearReasoning,
    mergeNodes,
    mergeEvents,
    setQuestions,
    applyContradictions,
    applyRevisions,
    inspectorOpen,
  } = useMirrorStore();

  const selectedNode = useMirrorStore(selectSelectedNode);

  // R4-T03：Esc 关闭 NodeInspector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && inspectorOpen) {
        closeInspector();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inspectorOpen, closeInspector]);

  // 初始化 seed 数据（给无 position 的节点分配初始散布位置）
  useEffect(() => {
    setGraph({
      nodes: spreadPositions(seedGraph.nodes),
      events: seedGraph.events,
      questions: seedGraph.questions,
      rawMessages: seedGraph.rawMessages,
    });
    initSeedIfEmpty().catch(console.error);
  }, [setGraph]);

  // 处理对质
  const handleConfront = async (nodeId: string, reason: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    setConfrontationPhase("plasticizing", nodeId);
    clearReasoning();

    await new Promise((r) => setTimeout(r, 600)); // 液化动画时间
    setConfrontationPhase("deliberating", nodeId);

    try {
      const res = await fetch("/api/confront", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId,
          reason,
          node,
          relatedMessages: rawMessages.filter((m) =>
            node.evidence.some((ev) => ev.sourceMessageId === m.id)
          ),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "reasoning" || event.type === "content") {
              appendReasoning(event.delta);
            }
            if (event.type === "done") {
              setConfrontationPhase("restructuring");
              await new Promise((r) => setTimeout(r, 1500));
              setConfrontationPhase("settled");
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      console.error("Confrontation failed:", err);
      setConfrontationPhase("settled");
    }
  };

  // R4-T09：prefers-reduced-motion 检测
  const prefersReduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  return (
    // MotionConfig：系统要求减少动效时，所有 framer-motion 动画瞬间完成
    <MotionConfig reducedMotion={prefersReduced ? "always" : "never"}>
    <div className="w-full h-screen bg-[#050a0f] overflow-hidden touch-none">
      {/* 深空 Canvas */}
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 60 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        dpr={[1, 2]}
        style={{ background: "#050a0f", cursor: hoveredNodeId ? "pointer" : "default" }}
        onPointerMissed={() => {
          // R4-T03：点击星云空白区域关闭 NodeInspector
          if (inspectorOpen) closeInspector();
        }}
      >
        <NebulaCoreScene
          nodes={nodes}
          selectedId={selectedNode?.id}
          onNodeClick={selectNode}
          onNodeHover={setHoveredNode}
        />
        {/* R4-T06：Bloom 收一档（threshold 0.2→0.36，intensity 1.8→1.1），避免过曝 */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.36}
            luminanceSmoothing={0.9}
            intensity={1.1}
            radius={0.8}
          />
        </EffectComposer>
      </Canvas>

      {/* Onboarding 引导（首次访问） */}
      <Onboarding onStarterClick={(text) => useMirrorStore.getState().setPendingSubmit(text)} />

      {/* HUD 框架（四角角标 + 刻度尺 + 实时读数） */}
      <HUDFrame />

      {/* 洞察报告 + 导出（右上角入口） */}
      <InsightReport />

      {/* 警告 Toast */}
      <WarningToast />

      {/* 顶部标题 */}
      <div className="fixed top-4 left-6 z-40">
        <h1 className="text-white/60 text-sm font-light tracking-[0.2em]">
          Mirror / 镜
        </h1>
        <p className="text-gray-600 text-xs mt-0.5">AI 眼中的你</p>
      </div>

      {/* 主动提问 */}
      <ActiveQuestionBar />

      {/* 节点详情（右侧） */}
      {inspectorOpen && selectedNode && (
        <NodeInspector
          node={selectedNode}
          messages={rawMessages.map((m) => ({ id: m.id, content: m.content }))}
        />
      )}

      {/* 对质面板（左侧） */}
      <Confrontation onConfront={handleConfront} />

      {/* 语义图例（左下角） */}
      <Legend />

      {/* 记忆来源总览（右下角） */}
      <MemoryList onSelectNode={selectNode} />

      {/* 现场补一句（底部） */}
      <AddMessageInput />

      {/* R4-T02：hover tooltip（跟随光标，诗意名 + 置信度） */}
      <NodeHoverTooltip />
    </div>
    </MotionConfig>
  );
}
