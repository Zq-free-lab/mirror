"use client";
/**
 * Mirror / 镜 —— 语义可读图例（R2.3）
 *
 * 可折叠面板，说明星云视觉语义：
 *   颜色  = 认知系统（五星团诗意名）
 *   亮度  = 置信度
 *   闪烁  = 存疑（怀疑者质疑）
 *   红线  = 矛盾张力
 *   下沉  = 记忆衰减
 *
 * AC-VIZ-LEGEND：外人靠图例能读懂画面。
 * 红线（AC-RL-1）：颜色来自真实认知系统，不做纯装饰。
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SYSTEM_COLORS, HOLO, FONT } from "@/viz/theme";
import { SYSTEM_META } from "@/core/types";
import type { CognitiveSystemId } from "@/core/types";

const SYSTEMS = Object.keys(SYSTEM_META) as CognitiveSystemId[];

const VISUAL_SEMANTICS = [
  { symbol: "glow", label: "亮度 = 置信度", desc: "越亮越确定" },
  { symbol: "flicker", label: "闪烁 = 存疑", desc: "怀疑者正在质疑" },
  { symbol: "tension", label: "红线 = 矛盾", desc: "两个推断互相冲突" },
  { symbol: "sink", label: "下沉 = 衰减", desc: "长期未被强化的记忆" },
];

export function Legend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 left-6 z-40">
      {/* 折叠按钮 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-md transition-all"
        style={{
          background: open ? `rgba(95,224,255,0.1)` : "rgba(8,14,26,0.72)",
          border: `1px solid ${open ? HOLO.line + "44" : "rgba(255,255,255,0.08)"}`,
          color: open ? HOLO.line : "rgba(255,255,255,0.35)",
          fontFamily: FONT.mono,
          fontSize: 10,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <circle cx="3" cy="5" r="1.5" opacity={0.4} />
          <circle cx="7" cy="3" r="1.5" opacity={0.7} />
          <circle cx="6" cy="7" r="1.5" opacity={0.6} />
        </svg>
        图例
      </button>

      {/* 展开面板 */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute bottom-12 left-0 w-56 rounded-2xl"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{
              background: "rgba(8,14,26,0.90)",
              border: `1px solid ${HOLO.line}18`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 24px ${HOLO.line}08`,
            }}
          >
            {/* 五系统色块 */}
            <div className="p-3 pb-2">
              <p style={{ color: `${HOLO.line}88`, fontSize: 9, fontFamily: FONT.mono, marginBottom: 6, letterSpacing: "0.1em" }}>
                颜色 = 认知系统
              </p>
              <div className="flex flex-col gap-1.5">
                {SYSTEMS.map((sys) => {
                  const col = SYSTEM_COLORS[sys];
                  const meta = SYSTEM_META[sys];
                  return (
                    <div key={sys} className="flex items-center gap-2">
                      {/* 能量体小图标：核+光环 */}
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: col.base,
                          boxShadow: `0 0 6px ${col.glow}, 0 0 2px ${col.core}`,
                          display: "block",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontFamily: FONT.sans, fontSize: 11, color: "rgba(255,255,255,0.7)", flex: 1 }}>
                        {meta.poeticName}
                      </span>
                      <span style={{ fontFamily: FONT.mono, fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
                        {meta.brainRegion}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 分隔线 */}
            <div style={{ height: 1, background: `${HOLO.line}10`, margin: "0 12px" }} />

            {/* 其他视觉语义 */}
            <div className="p-3 pt-2 flex flex-col gap-1.5">
              {VISUAL_SEMANTICS.map(({ symbol, label, desc }) => (
                <div key={symbol} className="flex items-center gap-2">
                  <LegendSymbol type={symbol} />
                  <div>
                    <span style={{ fontFamily: FONT.mono, fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
                      {label}
                    </span>
                    <span style={{ fontFamily: FONT.sans, fontSize: 9, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>
                      {desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LegendSymbol({ type }: { type: string }) {
  switch (type) {
    case "glow":
      return (
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, flexShrink: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.9)", boxShadow: "0 0 8px rgba(255,255,255,0.8)", display: "block" }} />
        </span>
      );
    case "flicker":
      return (
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, flexShrink: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.3)", boxShadow: "0 0 4px rgba(255,255,255,0.3)", display: "block", border: "1px dashed rgba(255,255,255,0.4)" }} />
        </span>
      );
    case "tension":
      return (
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, flexShrink: 0 }}>
          <span style={{ width: 12, height: 1, background: HOLO.tension, boxShadow: `0 0 4px ${HOLO.tension}`, display: "block" }} />
        </span>
      );
    case "sink":
      return (
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, flexShrink: 0 }}>
          <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: `6px solid rgba(255,255,255,0.3)`, display: "block" }} />
        </span>
      );
    default:
      return null;
  }
}
