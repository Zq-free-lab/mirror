"use client";
/**
 * Mirror / 镜 —— HUD 框架（R2.7 逼格关键）
 *
 * 四角 L 形角标 + 顶部细刻度尺 + 实时读数行（节点数/平均置信度/演变事件数）
 * 让画面像高端认知监测仪器，而非普通深色网页。
 *
 * 读数数据来自真实 store（AC-RL-1：HUD 数字是真实内部量）。
 */
import { useMemo } from "react";
import { useMirrorStore } from "@/store/useMirrorStore";
import { HOLO, FONT, HUD } from "@/viz/theme";

// ─── L 形角标（四角） ─────────────────────────────────────────────────────────

interface CornerBracketProps {
  position: "tl" | "tr" | "bl" | "br";
}

function CornerBracket({ position }: CornerBracketProps) {
  const { size: s, thickness: t, color, opacity } = HUD.cornerBracket;
  const isTL = position === "tl";
  const isTR = position === "tr";
  const isBL = position === "bl";

  const posStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 30,
    pointerEvents: "none",
    ...(isTL || position === "tr" ? { top: 12 } : { bottom: 12 }),
    ...(isTL || isBL ? { left: 12 } : { right: 12 }),
  };

  const hFlip = isTR || position === "br";
  const vFlip = !isTL && !isTR;

  return (
    <div style={posStyle}>
      <svg
        width={s}
        height={s}
        viewBox={`0 0 ${s} ${s}`}
        fill="none"
        style={{
          transform: `scale(${hFlip ? -1 : 1}, ${vFlip ? -1 : 1})`,
          opacity,
        }}
      >
        {/* 竖线 */}
        <line x1={t / 2} y1={0} x2={t / 2} y2={s} stroke={color} strokeWidth={t} />
        {/* 横线 */}
        <line x1={0} y1={t / 2} x2={s} y2={t / 2} stroke={color} strokeWidth={t} />
      </svg>
    </div>
  );
}

// ─── 顶部细刻度尺 ─────────────────────────────────────────────────────────────

function TopRuler() {
  const ticks = useMemo(() => {
    const result: number[] = [];
    for (let i = 0; i <= 20; i++) result.push(i);
    return result;
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-30 pointer-events-none flex items-start justify-center"
      style={{ height: 10, paddingTop: 1 }}
    >
      <div className="flex items-start gap-0" style={{ width: "60%", opacity: 0.3 }}>
        {ticks.map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: i % 5 === 0 ? 7 : 4,
              borderLeft: `1px solid ${HOLO.line}`,
              marginTop: "auto",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── 实时读数行（节点数 / 平均置信度 / 演变事件数）───────────────────────────

function LiveReadout() {
  const { nodes, events } = useMirrorStore();

  const avgConf = useMemo(() => {
    if (nodes.length === 0) return 0;
    return nodes.reduce((sum, n) => sum + n.confidence, 0) / nodes.length;
  }, [nodes]);

  return (
    <div
      className="fixed top-2 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex items-center gap-4"
      style={{ top: 14 }}
    >
      <ReadoutItem label="NODES" value={String(nodes.length).padStart(3, "0")} />
      <div style={{ width: 1, height: 10, background: `${HOLO.line}30` }} />
      <ReadoutItem label="CONF" value={`${(avgConf * 100).toFixed(0)}%`} />
      <div style={{ width: 1, height: 10, background: `${HOLO.line}30` }} />
      <ReadoutItem label="EVENTS" value={String(events.length).padStart(3, "0")} />
    </div>
  );
}

function ReadoutItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: `${HOLO.line}55`, fontFamily: FONT.mono, fontSize: 8, letterSpacing: "0.12em" }}>
        {label}
      </span>
      <span style={{ color: HOLO.line, fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.08em" }}>
        {value}
      </span>
    </div>
  );
}

// ─── 主导出 ───────────────────────────────────────────────────────────────────

export function HUDFrame() {
  return (
    <>
      <CornerBracket position="tl" />
      <CornerBracket position="tr" />
      <CornerBracket position="bl" />
      <CornerBracket position="br" />
      <TopRuler />
      <LiveReadout />
    </>
  );
}
