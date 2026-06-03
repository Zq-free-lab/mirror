"use client";
/**
 * Mirror / 镜 —— 记忆来源总览（R1.4）
 *
 * 可展开抽屉：按时间列 rawMessages，点一条展开它催生的推断节点列表。
 * 点击推断节点 → 调用 onSelectNode 打开 NodeInspector。
 *
 * AC-UX-MEMLIST：能从一句话追到它影响了哪些推断。
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMirrorStore } from "@/store/useMirrorStore";
import { HOLO, FONT, SYSTEM_COLORS } from "@/viz/theme";
import { SYSTEM_META } from "@/core/types";

interface MemoryListProps {
  onSelectNode: (id: string) => void;
}

export function MemoryList({ onSelectNode }: MemoryListProps) {
  const [open, setOpen] = useState(false);
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);
  const { rawMessages, nodes } = useMirrorStore();

  // 构建 messageId → node[] 索引（记忆溯源）
  const msgToNodes = useMemo(() => {
    const map = new Map<string, string[]>(); // messageId → nodeId[]
    for (const node of nodes) {
      for (const ev of node.evidence) {
        const list = map.get(ev.sourceMessageId) ?? [];
        list.push(node.id);
        map.set(ev.sourceMessageId, list);
      }
    }
    return map;
  }, [nodes]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const sortedMessages = useMemo(
    () => [...rawMessages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [rawMessages]
  );

  return (
    <>
      {/* 展开按钮 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-md transition-all"
        style={{
          background: open ? `rgba(95,224,255,0.12)` : "rgba(8,14,26,0.75)",
          border: `1px solid ${open ? HOLO.line + "55" : "rgba(255,255,255,0.1)"}`,
          color: open ? HOLO.line : "rgba(255,255,255,0.45)",
          fontFamily: FONT.mono,
          fontSize: 11,
          boxShadow: open ? `0 0 16px ${HOLO.line}18` : undefined,
        }}
      >
        <span style={{ opacity: 0.7 }}>你说过的话</span>
        <span style={{ opacity: 0.5 }}>{sortedMessages.length}</span>
      </button>

      {/* 抽屉面板 */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed bottom-16 right-6 z-40 w-80 max-h-[65vh] overflow-y-auto rounded-2xl"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            style={{
              background: "rgba(8,14,26,0.88)",
              border: `1px solid ${HOLO.line}22`,
              boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 30px ${HOLO.line}0A`,
              scrollbarWidth: "none",
            }}
          >
            {/* 标题栏 */}
            <div
              className="sticky top-0 px-4 py-2.5 flex items-center justify-between"
              style={{
                background: "rgba(8,14,26,0.95)",
                borderBottom: `1px solid ${HOLO.line}18`,
              }}
            >
              <span style={{ fontFamily: FONT.mono, fontSize: 11, color: HOLO.line }}>
                记忆来源 · {sortedMessages.length} 条
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* 消息列表 */}
            <div className="p-2 flex flex-col gap-1">
              {sortedMessages.length === 0 && (
                <p className="text-center py-4" style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, fontFamily: FONT.mono }}>
                  还没有记录的对话
                </p>
              )}
              {sortedMessages.map((msg) => {
                const relatedIds = msgToNodes.get(msg.id) ?? [];
                const isExpanded = expandedMsgId === msg.id;

                return (
                  <div key={msg.id}>
                    <button
                      className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
                      style={{
                        background: isExpanded ? `${HOLO.line}0D` : "transparent",
                        border: `1px solid ${isExpanded ? HOLO.line + "30" : "transparent"}`,
                      }}
                      onClick={() => setExpandedMsgId(isExpanded ? null : msg.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className="text-xs leading-relaxed flex-1"
                          style={{
                            color: msg.role === "user" ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)",
                            fontFamily: FONT.sans,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {msg.content}
                        </span>
                        {relatedIds.length > 0 && (
                          <span
                            className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-md"
                            style={{
                              background: `${HOLO.line}18`,
                              color: HOLO.line,
                              fontFamily: FONT.mono,
                              fontSize: 10,
                            }}
                          >
                            {relatedIds.length} 推断
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5" style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: FONT.mono }}>
                        {new Date(msg.timestamp).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </button>

                    {/* 展开：催生的推断节点 */}
                    <AnimatePresence>
                      {isExpanded && relatedIds.length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden ml-3 mb-1"
                        >
                          <div
                            className="pt-1 pb-2 pl-2 flex flex-col gap-1"
                            style={{ borderLeft: `1px solid ${HOLO.line}30` }}
                          >
                            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: FONT.mono, marginBottom: 2 }}>
                              由此催生的推断：
                            </p>
                            {relatedIds.map((nodeId) => {
                              const node = nodeMap.get(nodeId);
                              if (!node) return null;
                              const sysColor = SYSTEM_COLORS[node.system].base;
                              const sysMeta = SYSTEM_META[node.system];
                              return (
                                <button
                                  key={nodeId}
                                  className="text-left px-2 py-1.5 rounded-lg transition-all"
                                  style={{
                                    background: `${sysColor}10`,
                                    border: `1px solid ${sysColor}25`,
                                  }}
                                  onClick={() => {
                                    onSelectNode(nodeId);
                                    setOpen(false);
                                  }}
                                >
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span
                                      style={{
                                        width: 5,
                                        height: 5,
                                        borderRadius: "50%",
                                        background: sysColor,
                                        display: "block",
                                        flexShrink: 0,
                                        boxShadow: `0 0 4px ${sysColor}`,
                                      }}
                                    />
                                    <span style={{ color: sysColor, fontSize: 9, fontFamily: FONT.mono }}>
                                      {sysMeta.poeticName}
                                    </span>
                                  </div>
                                  <p
                                    className="text-xs leading-relaxed"
                                    style={{
                                      color: "rgba(255,255,255,0.65)",
                                      fontFamily: FONT.sans,
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical",
                                      overflow: "hidden",
                                    }}
                                  >
                                    {node.statement}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                      {isExpanded && relatedIds.length === 0 && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-xs ml-5 mb-1"
                          style={{ color: "rgba(255,255,255,0.25)", fontFamily: FONT.mono }}
                        >
                          暂无关联推断
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
