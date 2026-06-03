"use client";
/**
 * Mirror / 镜 —— 对质状态机（R2.6 升级：深空全息审议仪）
 *
 * 五阶段体验设计（"后背发凉"）：
 *   retrieving   → 节点被锁定，等待你的质疑
 *   plasticizing → 核心在液化中（橙色警示脉动）
 *   deliberating → 审议流式思考（等宽字体打字机）
 *   restructuring→ 结构重组（红色紧张态）
 *   settled      → 记忆已沉积（青色平静）
 *
 * AC-UI-CONFRONT（测试方案）。
 */
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMirrorStore, type ConfrontationPhase } from "@/store/useMirrorStore";
import { HOLO, FONT, HUD, SYSTEM_COLORS } from "@/viz/theme";
import { SYSTEM_META } from "@/core/types";
import type { CognitiveNode } from "@/core/types";

// ─── Phase 配置 ───────────────────────────────────────────────────────────────

interface PhaseConfig {
  label: string;
  color: string;
  desc: string;
}

const PHASE_CONFIG: Record<ConfrontationPhase, PhaseConfig> = {
  idle:          { label: "待命",     color: "rgba(255,255,255,0.2)", desc: "" },
  retrieving:    { label: "锁定记忆", color: HOLO.line,               desc: "目标节点已被锁定，等待你的质疑" },
  plasticizing:  { label: "软化中",   color: "#FFB74D",               desc: "认知边界正在松动…" },
  deliberating:  { label: "审议中",   color: HOLO.warmCore,           desc: "怀疑者 · 调和者 正在联合审议" },
  restructuring: { label: "重组结构", color: HOLO.tension,            desc: "旧结构崩解，新理解成形" },
  settled:       { label: "已沉积",   color: HOLO.line,               desc: "记忆重固化完成" },
};

const PHASE_ORDER: ConfrontationPhase[] = [
  "retrieving", "plasticizing", "deliberating", "restructuring", "settled",
];

// ─── 五阶段进度条 ─────────────────────────────────────────────────────────────

function PhaseIndicator({ phase }: { phase: ConfrontationPhase }) {
  const currentIdx = PHASE_ORDER.indexOf(phase);
  const cfg = PHASE_CONFIG[phase];

  return (
    <div className="mb-3">
      <div className="flex items-center gap-1 mb-2">
        {PHASE_ORDER.map((p, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const pCfg = PHASE_CONFIG[p];
          return (
            <div key={p} className="flex items-center gap-1 flex-1">
              <div
                style={{
                  width: active ? 8 : 6,
                  height: active ? 8 : 6,
                  borderRadius: "50%",
                  background: done ? pCfg.color : active ? pCfg.color : "rgba(255,255,255,0.1)",
                  boxShadow: active ? `0 0 8px ${pCfg.color}` : undefined,
                  transition: "all 0.4s ease",
                  flexShrink: 0,
                }}
              />
              {i < PHASE_ORDER.length - 1 && (
                <div style={{ flex: 1, height: 1, background: done ? `${PHASE_CONFIG[PHASE_ORDER[i]].color}60` : "rgba(255,255,255,0.08)", transition: "background 0.6s" }} />
              )}
            </div>
          );
        })}
      </div>
      {phase !== "idle" && (
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: FONT.mono, fontSize: 10, color: cfg.color, letterSpacing: "0.06em" }}>{cfg.label}</span>
          <span style={{ fontFamily: FONT.sans, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{cfg.desc}</span>
        </div>
      )}
    </div>
  );
}

// ─── 目标节点卡片 ─────────────────────────────────────────────────────────────

function TargetNodeCard({ node, phase }: { node: CognitiveNode; phase: ConfrontationPhase }) {
  const meta = SYSTEM_META[node.system];
  const sysCol = SYSTEM_COLORS[node.system];
  const isLiquid = phase === "plasticizing";
  const isDestroyed = phase === "restructuring";

  return (
    <motion.div
      className="mb-4 p-3 rounded-xl"
      animate={isLiquid ? { borderColor: [`${sysCol.base}33`, `${HOLO.tension}44`, `${sysCol.base}33`] } : {}}
      transition={{ duration: 1.4, repeat: Infinity }}
      style={{
        background: isDestroyed ? `${HOLO.tension}08` : `${sysCol.base}08`,
        border: `1px solid ${isDestroyed ? HOLO.tension + "44" : sysCol.base + "30"}`,
        boxShadow: isLiquid ? `0 0 16px ${HOLO.tension}18` : undefined,
        transition: "all 0.5s ease",
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: sysCol.base, boxShadow: `0 0 6px ${sysCol.glow}`, display: "block", flexShrink: 0 }} />
        <span style={{ fontFamily: FONT.mono, fontSize: 9, color: sysCol.base }}>{meta.poeticName}</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 9, color: "rgba(255,255,255,0.25)" }}>conf {(node.confidence * 100).toFixed(0)}%</span>
      </div>
      <p style={{ fontFamily: FONT.sans, fontSize: 11, color: isDestroyed ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.75)", lineHeight: 1.5, textDecoration: isDestroyed ? "line-through" : undefined }}>
        {node.statement.length > 80 ? node.statement.slice(0, 80) + "…" : node.statement}
      </p>
    </motion.div>
  );
}

// ─── 审议流 ──────────────────────────────────────────────────────────────────

function DeliberationStream({ text, phase }: { text: string; phase: ConfrontationPhase }) {
  const ref = useRef<HTMLDivElement>(null);
  const isActive = phase === "deliberating";

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);

  const phaseMessages: Partial<Record<ConfrontationPhase, string>> = {
    retrieving:    "等待你的质疑…",
    plasticizing:  "节点正在软化，认知边界松动中…",
    restructuring: "旧结构已崩解，正在重建理解矩阵…",
    settled:       "认知重固化完成。新的理解已沉积。",
  };

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto px-4 py-3"
      style={{ scrollbarWidth: "none", minHeight: 0 }}
    >
      {text ? (
        <p
          className="whitespace-pre-wrap leading-relaxed"
          style={{ fontFamily: FONT.mono, fontSize: 11, color: isActive ? HOLO.warmCore : "rgba(255,255,255,0.55)" }}
        >
          {text}
          {isActive && (
            <motion.span
              style={{ display: "inline-block", width: 7, height: 13, background: HOLO.warmCore, marginLeft: 2, verticalAlign: "middle", borderRadius: 1 }}
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ duration: 0.7, repeat: Infinity }}
            />
          )}
        </p>
      ) : (
        <p style={{ fontFamily: FONT.mono, fontSize: 10, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
          {phaseMessages[phase] ?? "…"}
        </p>
      )}
    </div>
  );
}

// ─── 对质输入 ─────────────────────────────────────────────────────────────────

interface ConfrontInputProps {
  targetNode: CognitiveNode | null;
  onSubmit: (reason: string) => void;
  disabled: boolean;
}

function ConfrontInput({ targetNode, onSubmit, disabled }: ConfrontInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (!input.trim() || disabled) return;
    onSubmit(input.trim());
    setInput("");
  };

  return (
    <div className="p-4" style={{ borderTop: `1px solid ${HOLO.line}15` }}>
      {targetNode && (
        <p style={{ fontFamily: FONT.sans, fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
          说出你的质疑：
        </p>
      )}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
          }}
          placeholder="这条判断错了，因为…（Enter 发送）"
          disabled={disabled}
          rows={3}
          style={{
            flex: 1,
            background: `${HOLO.line}06`,
            border: `1px solid ${HOLO.line}25`,
            borderRadius: 10,
            padding: "8px 12px",
            color: "rgba(255,255,255,0.8)",
            fontFamily: FONT.sans,
            fontSize: 12,
            resize: "none",
            outline: "none",
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          style={{
            padding: "8px 14px",
            background: disabled || !input.trim() ? "transparent" : `${HOLO.line}18`,
            border: `1px solid ${HOLO.line}44`,
            borderRadius: 10,
            color: disabled || !input.trim() ? "rgba(255,255,255,0.2)" : HOLO.line,
            fontFamily: FONT.mono,
            fontSize: 11,
            alignSelf: "flex-end",
            cursor: disabled || !input.trim() ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
        >
          对质
        </button>
      </div>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

interface ConfrontationProps {
  onConfront: (nodeId: string, reason: string) => Promise<void>;
}

export function Confrontation({ onConfront }: ConfrontationProps) {
  const {
    confrontationPhase,
    confrontationNodeId,
    confrontationReasoning,
    nodes,
    setConfrontationPhase,
  } = useMirrorStore();

  const targetNode = nodes.find((n) => n.id === confrontationNodeId) ?? null;
  const isActive = confrontationPhase !== "idle";
  const isSettled = confrontationPhase === "settled";
  const isDeliberating = confrontationPhase === "deliberating" || confrontationPhase === "restructuring";
  const phaseColor = PHASE_CONFIG[confrontationPhase].color;

  const handleSubmit = async (reason: string) => {
    if (!confrontationNodeId) return;
    await onConfront(confrontationNodeId, reason);
  };

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ x: "-100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "-100%", opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 220 }}
          className="fixed left-0 top-0 h-full w-80 z-50 flex flex-col"
          style={{
            background: HUD.glass.bg,
            backdropFilter: `blur(${HUD.glass.blur})`,
            WebkitBackdropFilter: `blur(${HUD.glass.blur})`,
            borderRight: `1px solid ${phaseColor}30`,
            boxShadow: `inset 0 0 40px ${phaseColor}08, 8px 0 40px rgba(0,0,0,0.5)`,
            transition: "border-color 0.5s, box-shadow 0.5s",
          }}
        >
          {/* 顶部系统色条 */}
          <div style={{ height: 2, background: `linear-gradient(to right, transparent, ${phaseColor}80, transparent)`, transition: "background 0.5s" }} />

          {/* 头部 */}
          <div className="p-4 pb-3" style={{ borderBottom: `1px solid ${HOLO.line}12` }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span style={{ fontFamily: FONT.mono, fontSize: 10, color: HOLO.line, letterSpacing: "0.12em" }}>认知重固化</span>
                <p style={{ fontFamily: FONT.sans, fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>Cognitive Reconsolidation</p>
              </div>
              <button
                onClick={() => setConfrontationPhase("idle")}
                style={{ color: "rgba(255,255,255,0.25)", fontFamily: FONT.mono, fontSize: 14 }}
              >
                ×
              </button>
            </div>
            <PhaseIndicator phase={confrontationPhase} />
          </div>

          {/* 目标节点 */}
          {targetNode && (
            <div className="px-4 pt-3">
              <TargetNodeCard node={targetNode} phase={confrontationPhase} />
            </div>
          )}

          {/* 审议流 */}
          <div className="px-0 flex-1 flex flex-col min-h-0" style={{ borderBottom: `1px solid ${HOLO.line}10` }}>
            <div className="px-4 pt-1 pb-1">
              <span style={{ fontFamily: FONT.mono, fontSize: 9, color: `${phaseColor}88`, letterSpacing: "0.1em" }}>
                {confrontationPhase === "deliberating" ? "怀疑者 · 调和者" : confrontationPhase === "restructuring" ? "重建矩阵" : "审议流"}
              </span>
            </div>
            <DeliberationStream text={confrontationReasoning} phase={confrontationPhase} />
          </div>

          {/* 操作区 */}
          {confrontationPhase === "retrieving" && (
            <ConfrontInput targetNode={targetNode} onSubmit={handleSubmit} disabled={false} />
          )}
          {isSettled && (
            <div className="p-4">
              <motion.button
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setConfrontationPhase("idle")}
                className="w-full py-2.5 rounded-xl text-xs transition-all"
                style={{
                  background: `${HOLO.line}12`,
                  border: `1px solid ${HOLO.line}40`,
                  color: HOLO.line,
                  fontFamily: FONT.mono,
                  letterSpacing: "0.06em",
                }}
              >
                ✓ 重固化完成 · 关闭
              </motion.button>
            </div>
          )}
          {isDeliberating && (
            <div className="p-4">
              <div className="flex items-center gap-2 justify-center">
                <motion.span
                  style={{ width: 5, height: 5, borderRadius: "50%", background: phaseColor, display: "block" }}
                  animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.0, repeat: Infinity, delay: 0 }}
                />
                <motion.span
                  style={{ width: 5, height: 5, borderRadius: "50%", background: phaseColor, display: "block" }}
                  animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.0, repeat: Infinity, delay: 0.22 }}
                />
                <motion.span
                  style={{ width: 5, height: 5, borderRadius: "50%", background: phaseColor, display: "block" }}
                  animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.0, repeat: Infinity, delay: 0.44 }}
                />
              </div>
            </div>
          )}

          {/* 底部色条 */}
          <div style={{ height: 2, background: `linear-gradient(to right, transparent, ${phaseColor}40, transparent)` }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
