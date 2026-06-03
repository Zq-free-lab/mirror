"use client";
/**
 * Mirror / 镜 —— 演变层时间机器（T5.1）
 *
 * 基于 EvolutionEvent 事件溯源，滑动时间轴回放认知理解的演变历史：
 *  "上个月以为X → 本周改判Y，因为……"
 *
 * 功能：
 *  - 时间轴 slider（基于 events 的 timestamp 序列）
 *  - 滑动 → 重建任意时刻的图状态（快照重建）
 *  - 每个事件节点可展开详情（fromStatement / toStatement / reason）
 *  - 事件类型颜色编码（created/reinforced/revised/denied/reconsolidated/decayed）
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { EvolutionEvent, CognitiveNode } from "@/core/types";

// ─── 事件颜色 ─────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<EvolutionEvent["type"], string> = {
  created:         "#5EE0C0",
  reinforced:      "#6FA8FF",
  revised:         "#F2D399",
  denied:          "#FF6B5E",
  reconsolidated:  "#B08D57",
  decayed:         "#555",
};

const EVENT_LABELS: Record<EvolutionEvent["type"], string> = {
  created:         "首次推断",
  reinforced:      "被强化",
  revised:         "信念修正",
  denied:          "被驳回",
  reconsolidated:  "重新固化",
  decayed:         "开始衰减",
};

// ─── 事件详情气泡 ─────────────────────────────────────────────────────────────

interface EventBubbleProps {
  event: EvolutionEvent;
  nodeName?: string;
  isSelected: boolean;
  onClick: () => void;
}

function EventBubble({ event, nodeName, isSelected, onClick }: EventBubbleProps) {
  const color = EVENT_COLORS[event.type];

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center group"
    >
      <div
        className={`w-3 h-3 rounded-full border-2 transition-all duration-200 ${
          isSelected ? "scale-150" : "group-hover:scale-125"
        }`}
        style={{
          backgroundColor: isSelected ? color : "transparent",
          borderColor: color,
        }}
      />
      <div
        className="w-px h-4 mt-0.5 opacity-30"
        style={{ backgroundColor: color }}
      />
    </button>
  );
}

// ─── 事件详情面板 ─────────────────────────────────────────────────────────────

function EventDetail({ event, nodes }: { event: EvolutionEvent; nodes: CognitiveNode[] }) {
  const node = nodes.find((n) => n.id === event.nodeId);
  const color = EVENT_COLORS[event.type];
  const label = EVENT_LABELS[event.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="mt-3 p-3 bg-gray-900/80 border border-gray-700/50 rounded-xl"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium" style={{ color }}>{label}</span>
        <span className="text-xs text-gray-600">
          {new Date(event.timestamp).toLocaleDateString("zh-CN", {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      {node && (
        <p className="text-xs text-gray-400 mb-2 leading-relaxed line-clamp-2">
          「{node.statement}」
        </p>
      )}

      {event.fromStatement && (
        <div className="mb-1">
          <span className="text-xs text-gray-600">之前：</span>
          <span className="text-xs text-gray-500 line-through">{event.fromStatement}</span>
        </div>
      )}
      {event.toStatement && (
        <div className="mb-2">
          <span className="text-xs text-gray-600">修正为：</span>
          <span className="text-xs text-gray-300">{event.toStatement}</span>
        </div>
      )}

      <p className="text-xs text-gray-500 leading-relaxed">{event.reason}</p>
    </motion.div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

interface TimeMachineProps {
  events: EvolutionEvent[];
  nodes: CognitiveNode[];
  onClose: () => void;
  /** 时间点变化时的回调（用于外部高亮重建状态） */
  onTimeChange?: (timestamp: string) => void;
}

export function TimeMachine({ events, nodes, onClose, onTimeChange }: TimeMachineProps) {
  const [selectedIdx, setSelectedIdx] = useState(events.length - 1);
  const [showDetail, setShowDetail] = useState(true);

  // 事件按时间排序
  const sorted = useMemo(
    () => [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [events]
  );

  const selectedEvent = sorted[selectedIdx];

  const handleSlider = (idx: number) => {
    setSelectedIdx(idx);
    if (sorted[idx] && onTimeChange) {
      onTimeChange(sorted[idx].timestamp);
    }
  };

  if (sorted.length === 0) return null;

  const startDate = new Date(sorted[0].timestamp).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  const endDate = new Date(sorted[sorted.length - 1].timestamp).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });

  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#080d16]/97 backdrop-blur-md border-t border-gray-800"
    >
      <div className="max-w-3xl mx-auto p-4">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm text-gray-300 font-medium">认知演变轨迹</h3>
            <p className="text-xs text-gray-600">{startDate} → {endDate} · {sorted.length} 个事件</p>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            关闭
          </button>
        </div>

        {/* 时间轴 */}
        <div className="relative mb-2">
          {/* 事件气泡行 */}
          <div className="flex justify-between items-end mb-2 px-1">
            {sorted.map((event, i) => (
              <EventBubble
                key={event.id}
                event={event}
                nodeName={nodes.find((n) => n.id === event.nodeId)?.statement.slice(0, 15)}
                isSelected={i === selectedIdx}
                onClick={() => { handleSlider(i); setShowDetail(true); }}
              />
            ))}
          </div>

          {/* Slider */}
          <input
            type="range"
            min={0}
            max={sorted.length - 1}
            value={selectedIdx}
            onChange={(e) => handleSlider(parseInt(e.target.value))}
            className="w-full h-1 bg-gray-800 rounded-full appearance-none cursor-pointer accent-teal-500"
          />

          {/* 时间标签 */}
          <div className="flex justify-between mt-1 text-xs text-gray-700">
            <span>{startDate}</span>
            <span>{endDate}</span>
          </div>
        </div>

        {/* 事件详情 */}
        <AnimatePresence mode="wait">
          {showDetail && selectedEvent && (
            <EventDetail
              key={selectedEvent.id}
              event={selectedEvent}
              nodes={nodes}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
