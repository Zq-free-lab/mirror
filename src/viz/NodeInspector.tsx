"use client";
/**
 * Mirror / 镜 —— 节点详情/证据链/否决权（R2.7 升级：玻璃拟态 HUD 信息卡）
 *
 * 点击星云粒子 → 右侧滑出 NodeInspector 面板：
 *  - 玻璃拟态背景（backdrop-blur + 全息青描边 + 内发光）
 *  - 诗意名（大字）+ 真实脑区（等宽小字）
 *  - 置信度环形仪表（SVG 圆弧）
 *  - 怀疑者质疑 / 恐怖谷警示
 *  - 证据链溯源
 *  - 否决权（确认 / 否认 / 别瞎猜）
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CognitiveNode } from "@/core/types";
import { SYSTEM_META } from "@/core/types";
import { useMirrorStore } from "@/store/useMirrorStore";
import { HOLO, FONT, HUD, SYSTEM_COLORS, confidenceColor } from "@/viz/theme";

interface NodeInspectorProps {
  node: CognitiveNode | null;
  messages: { id: string; content: string }[];
}

// ─── 环形置信度仪表 ───────────────────────────────────────────────────────────

function ConfidenceArc({ value, color }: { value: number; color: string }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - value);
  return (
    <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
      <svg width={44} height={44} viewBox="0 0 44 44" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={22} cy={22} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3} />
        <circle
          cx={22} cy={22} r={r} fill="none"
          stroke={color} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: FONT.mono, fontSize: 10,
          color: color,
        }}
      >
        {(value * 100).toFixed(0)}
      </div>
    </div>
  );
}

// ─── 细数值条 ─────────────────────────────────────────────────────────────────

function MiniBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between mb-0.5" style={{ fontFamily: FONT.mono, fontSize: 9 }}>
        <span style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
        <span style={{ color }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div style={{ height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 1 }}>
        <div style={{ height: "100%", width: `${value * 100}%`, background: color, borderRadius: 1, boxShadow: `0 0 4px ${color}55`, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

export function NodeInspector({ node, messages }: NodeInspectorProps) {
  const { updateNodeVerdict, closeInspector, selectNode } = useMirrorStore();
  const [showBrainRegion, setShowBrainRegion] = useState(false);

  if (!node) return null;

  const meta = SYSTEM_META[node.system];
  const sysCol = SYSTEM_COLORS[node.system];
  const msgMap = new Map(messages.map((m) => [m.id, m.content]));
  const confColor = confidenceColor(node.confidence);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 220 }}
        className="fixed right-0 top-0 h-full w-80 z-50 overflow-y-auto"
        style={{
          background: HUD.glass.bg,
          backdropFilter: `blur(${HUD.glass.blur})`,
          WebkitBackdropFilter: `blur(${HUD.glass.blur})`,
          borderLeft: `1px solid ${HUD.glass.border}`,
          boxShadow: `inset 0 0 40px ${HUD.glass.innerGlow}, -8px 0 40px rgba(0,0,0,0.5)`,
          scrollbarWidth: "none",
        }}
      >
        {/* 顶部：系统色引导线 */}
        <div style={{ height: 2, background: `linear-gradient(to right, transparent, ${sysCol.base}, transparent)` }} />

        {/* 关闭按钮（R4-T03：命中区放大，p-3 确保 44×44 可触区） */}
        <button
          onClick={() => { closeInspector(); selectNode(null); }}
          className="absolute top-2 right-2 p-3 rounded-lg transition-colors hover:bg-white/5 active:bg-white/10"
          style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontFamily: FONT.mono, lineHeight: 1 }}
          aria-label="关闭"
        >
          ×
        </button>

        <div className="p-5 pt-6">
          {/* 顶部：系统 + 置信度仪表 */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 mr-3">
              {/* 诗意名 */}
              <button
                className="text-base font-light mb-0.5 text-left"
                style={{ color: sysCol.base, fontFamily: FONT.sans, textShadow: `0 0 12px ${sysCol.glow}` }}
                onMouseEnter={() => setShowBrainRegion(true)}
                onMouseLeave={() => setShowBrainRegion(false)}
              >
                {showBrainRegion ? meta.brainRegion : meta.poeticName}
              </button>
              {/* 脑区等宽小字 */}
              <div style={{ fontFamily: FONT.mono, fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
                {showBrainRegion ? meta.poeticName : meta.brainRegion}
              </div>
            </div>
            {/* 置信度圆弧仪表 */}
            <ConfidenceArc value={node.confidence} color={confColor} />
          </div>

          {/* Statement */}
          <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.85)", fontFamily: FONT.sans, fontWeight: 300 }}>
            {node.statement}
          </p>

          {/* 恐怖谷警示 */}
          {node.isUncanny && (
            <div className="mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(138,107,255,0.12)", border: "1px solid rgba(138,107,255,0.3)" }}>
              <span style={{ color: "#A68FFF", fontSize: 10, fontFamily: FONT.mono }}>⚠ 恐怖谷节点 · 反常信号</span>
            </div>
          )}

          {/* 怀疑者质疑 */}
          {node.skepticFlag && (
            <div className="mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(255,90,60,0.08)", border: `1px solid ${HOLO.tension}33` }}>
              <p style={{ color: `${HOLO.tension}AA`, fontSize: 9, fontFamily: FONT.mono, marginBottom: 3 }}>怀疑者：</p>
              <p style={{ color: "rgba(255,200,180,0.8)", fontSize: 11, fontFamily: FONT.sans, lineHeight: 1.5 }}>{node.skepticFlag}</p>
            </div>
          )}

          {/* 数值指标 */}
          <div className="mb-4">
            <MiniBar value={node.rawConfidence} label="AI 原始自评" color={confColor} />
            <MiniBar value={node.salience} label="情绪显著性" color={HOLO.tension} />
          </div>

          {/* 层级/状态标签 */}
          <div className="flex gap-2 mb-4">
            {[node.layer === "fact" ? "事实层" : "推断层", node.status].map((label) => (
              <span key={label} style={{ fontFamily: FONT.mono, fontSize: 9, color: `${HOLO.line}88`, background: `${HOLO.line}0D`, border: `1px solid ${HOLO.line}22`, padding: "2px 8px", borderRadius: 4 }}>
                {label}
              </span>
            ))}
          </div>

          {/* 证据链（AC-RL-3） */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span style={{ fontFamily: FONT.mono, fontSize: 9, color: `${HOLO.line}66`, letterSpacing: "0.1em" }}>证据链</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 9, color: `${HOLO.line}44` }}>{node.evidence.length} 条</span>
            </div>
            <div className="flex flex-col gap-2">
              {node.evidence.map((ev) => {
                const context = msgMap.get(ev.sourceMessageId);
                return (
                  <div key={ev.id} className="p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${HOLO.line}15` }}>
                    <p style={{ fontFamily: FONT.mono, fontSize: 8, color: `${HOLO.line}55`, marginBottom: 4 }}>
                      src: {ev.sourceMessageId.slice(0, 16)}…
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.6)", fontFamily: FONT.sans }}>
                      {context ? (
                        <>
                          {context.slice(0, context.indexOf(ev.quote) >= 0 ? context.indexOf(ev.quote) : 0)}
                          <mark style={{ background: `${sysCol.base}40`, color: sysCol.core, padding: "0 2px", borderRadius: 2 }}>
                            {ev.quote}
                          </mark>
                          {context.slice(context.indexOf(ev.quote) >= 0 ? context.indexOf(ev.quote) + ev.quote.length : 0)}
                        </>
                      ) : (
                        <span style={{ color: sysCol.core }}>「{ev.quote}」</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 否决权（AC-RL-6） */}
          <div>
            <div style={{ fontFamily: FONT.mono, fontSize: 9, color: `${HOLO.line}66`, letterSpacing: "0.1em", marginBottom: 8 }}>你的裁决</div>
            <div className="flex flex-col gap-2">
              {[
                { verdict: "confirmed" as const, label: "✓ 这条准确", activeStyle: { background: "rgba(56,242,200,0.1)", borderColor: "rgba(56,242,200,0.5)", color: "#38F2C8" } },
                { verdict: "denied" as const, label: "✗ 这条判断错了", activeStyle: { background: "rgba(255,61,138,0.1)", borderColor: "rgba(255,61,138,0.5)", color: "#FF3D8A" } },
                { verdict: "dont_guess" as const, label: "○ 这条别瞎猜", activeStyle: { background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.6)" } },
              ].map(({ verdict, label, activeStyle }) => {
                const isActive = node.userVerdict === verdict;
                return (
                  <button
                    key={verdict}
                    onClick={() => updateNodeVerdict(node.id, isActive ? null : verdict)}
                    className="py-2 px-3 text-xs rounded-lg border transition-all text-left"
                    style={isActive ? { ...activeStyle, fontFamily: FONT.sans } : { background: "transparent", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontFamily: FONT.sans }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 底部系统色渐变 */}
        <div style={{ height: 2, background: `linear-gradient(to right, transparent, ${sysCol.base}66, transparent)`, marginTop: 8 }} />
      </motion.div>
    </AnimatePresence>
  );
}
