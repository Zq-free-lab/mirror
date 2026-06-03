"use client";
/**
 * Mirror / 镜 —— 洞察报告 + 人格档案导出（R3.2 + R3.3）
 *
 * R3.2 洞察报告（向内·觉察）：
 *   汇总高显著 + 恐怖谷 + 被纠正的节点，生成可读叙事报告。
 *   "AI 眼中的你：它最确信的 3 件事 / 它在偷偷揣测的 / 它承认看走眼的"
 *
 * R3.3 人格档案导出（向外·可移植档案）：
 *   导出 Markdown + JSON，附"贴到新 AI 对话开头"的即用 prompt。
 *   只导出用户已 confirm 或未否决的（尊重否决权）。
 *
 * AC-VAL-REPORT, AC-VAL-EXPORT（红线 AC-RL-3 证据可溯源）
 */
import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMirrorStore } from "@/store/useMirrorStore";
import { HOLO, FONT, SYSTEM_COLORS, HUD } from "@/viz/theme";
import { SYSTEM_META } from "@/core/types";
import type { CognitiveNode } from "@/core/types";

// ─── 工具：按否决权过滤导出节点 ─────────────────────────────────────────────

function getExportableNodes(nodes: CognitiveNode[]): CognitiveNode[] {
  return nodes.filter((n) => n.userVerdict !== "denied" && n.userVerdict !== "dont_guess" && n.status === "active");
}

// ─── 生成可移植人格档案 prompt ────────────────────────────────────────────────

function buildProfilePrompt(nodes: CognitiveNode[]): string {
  const exportable = getExportableNodes(nodes);
  if (exportable.length === 0) return "";

  const bySystem = new Map<string, CognitiveNode[]>();
  for (const n of exportable) {
    const list = bySystem.get(n.system) ?? [];
    list.push(n);
    bySystem.set(n.system, list);
  }

  const sysBlocks = Array.from(bySystem.entries())
    .map(([sys, ns]) => {
      const meta = SYSTEM_META[sys as keyof typeof SYSTEM_META];
      const sorted = [...ns].sort((a, b) => b.confidence - a.confidence).slice(0, 3);
      return `【${meta.poeticName}】\n${sorted.map((n) => `- ${n.statement}（置信度 ${(n.confidence * 100).toFixed(0)}%）`).join("\n")}`;
    })
    .join("\n\n");

  const confirmed = exportable.filter((n) => n.userVerdict === "confirmed");
  const confirmedBlock = confirmed.length > 0
    ? `\n\n【我已确认准确的理解】\n${confirmed.map((n) => `- ${n.statement}`).join("\n")}`
    : "";

  return `# 关于我的人格档案（由 Mirror / 镜 生成）

以下是 AI 通过分析我与你的对话，形成的关于我的理解。这份档案经过我的校准，你可以用它来更准确地理解我。

${sysBlocks}${confirmedBlock}

---
使用说明：将以上内容贴到新对话开头，AI 将能立刻基于这份理解与你交流。`;
}

// ─── 生成 JSON 档案 ────────────────────────────────────────────────────────────

function buildProfileJSON(nodes: CognitiveNode[]) {
  const exportable = getExportableNodes(nodes);
  return {
    version: "mirror-v2",
    exportedAt: new Date().toISOString(),
    totalNodes: exportable.length,
    confirmedNodes: exportable.filter((n) => n.userVerdict === "confirmed").length,
    nodes: exportable.map((n) => ({
      system: n.system,
      systemName: SYSTEM_META[n.system].poeticName,
      statement: n.statement,
      confidence: Math.round(n.confidence * 100) / 100,
      confirmed: n.userVerdict === "confirmed",
      evidenceCount: n.evidence.length,
    })),
  };
}

// ─── 洞察报告内容 ─────────────────────────────────────────────────────────────

interface ReportData {
  topConfident: CognitiveNode[];    // 最确信的（conf>0.6，非恐怖谷）
  uncanny: CognitiveNode[];         // 恐怖谷节点（偷偷揣测）
  corrected: CognitiveNode[];       // 被否认的（看走眼）
  confirmed: CognitiveNode[];       // 用户确认准确的
}

function buildReportData(nodes: CognitiveNode[]): ReportData {
  const active = nodes.filter((n) => n.status === "active");
  return {
    topConfident: active.filter((n) => n.confidence > 0.55 && !n.isUncanny && n.userVerdict !== "denied").sort((a, b) => b.confidence - a.confidence).slice(0, 5),
    uncanny: active.filter((n) => n.isUncanny).slice(0, 3),
    corrected: nodes.filter((n) => n.userVerdict === "denied").slice(0, 3),
    confirmed: nodes.filter((n) => n.userVerdict === "confirmed").slice(0, 3),
  };
}

// ─── 单节点行 ─────────────────────────────────────────────────────────────────

function NodeRow({ node, accent }: { node: CognitiveNode; accent?: string }) {
  const meta = SYSTEM_META[node.system];
  const col = SYSTEM_COLORS[node.system];
  const color = accent ?? col.base;
  return (
    <div className="flex gap-2.5 py-2" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 4px ${color}`, display: "block", marginTop: 5, flexShrink: 0 }} />
      <div className="flex-1">
        <p style={{ fontFamily: FONT.sans, fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>{node.statement}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span style={{ fontFamily: FONT.mono, fontSize: 9, color: `${color}99` }}>{meta.poeticName}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
            {(node.confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function InsightReport() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"report" | "export">("report");
  const [copied, setCopied] = useState(false);
  const { nodes } = useMirrorStore();

  const report = useMemo(() => buildReportData(nodes), [nodes]);
  const profilePrompt = useMemo(() => buildProfilePrompt(nodes), [nodes]);
  const profileJSON = useMemo(() => buildProfileJSON(nodes), [nodes]);

  const exportableCount = useMemo(() => getExportableNodes(nodes).length, [nodes]);

  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(profilePrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [profilePrompt]);

  const handleDownloadJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(profileJSON, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mirror-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [profileJSON]);

  const handleDownloadMD = useCallback(() => {
    const blob = new Blob([profilePrompt], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mirror-profile-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [profilePrompt]);

  return (
    <>
      {/* 触发按钮（顶部右侧） */}
      <button
        onClick={() => setOpen(true)}
        className="fixed z-40 flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-md transition-all"
        style={{
          top: 14,
          right: 16,
          background: "rgba(8,14,26,0.72)",
          border: `1px solid ${HOLO.line}25`,
          color: `${HOLO.line}CC`,
          fontFamily: FONT.mono,
          fontSize: 10,
          letterSpacing: "0.06em",
        }}
      >
        <span style={{ opacity: 0.7 }}>洞察</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span style={{ opacity: 0.7 }}>导出</span>
      </button>

      {/* 弹出面板 */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[55] flex items-center justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="relative h-full w-96 overflow-y-auto"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: HUD.glass.bg,
                backdropFilter: `blur(${HUD.glass.blur})`,
                borderLeft: `1px solid ${HOLO.line}25`,
                boxShadow: `-8px 0 40px rgba(0,0,0,0.6), inset 0 0 40px ${HOLO.line}06`,
                scrollbarWidth: "none",
              }}
            >
              {/* 顶部引导条 */}
              <div style={{ height: 2, background: `linear-gradient(to right, transparent, ${HOLO.line}66, transparent)` }} />

              {/* 头部 */}
              <div className="p-5 pb-3" style={{ borderBottom: `1px solid ${HOLO.line}12` }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span style={{ fontFamily: FONT.mono, fontSize: 11, color: HOLO.line, letterSpacing: "0.1em" }}>AI 眼中的你</span>
                    <p style={{ fontFamily: FONT.sans, fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{nodes.length} 个推断节点</p>
                  </div>
                  <button onClick={() => setOpen(false)} style={{ color: "rgba(255,255,255,0.3)", fontFamily: FONT.mono, fontSize: 14 }}>×</button>
                </div>

                {/* Tab 切换 */}
                <div className="flex gap-2">
                  {(["report", "export"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className="flex-1 py-1.5 rounded-lg transition-all"
                      style={{
                        background: tab === t ? `${HOLO.line}18` : "transparent",
                        border: `1px solid ${tab === t ? HOLO.line + "44" : "rgba(255,255,255,0.08)"}`,
                        color: tab === t ? HOLO.line : "rgba(255,255,255,0.4)",
                        fontFamily: FONT.mono,
                        fontSize: 10,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {t === "report" ? "洞察报告" : "导出档案"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 内容区 */}
              <div className="p-5">
                {tab === "report" && (
                  <div className="flex flex-col gap-5">
                    {/* 最确信 */}
                    {report.topConfident.length > 0 && (
                      <Section title="它最确信的" color={HOLO.line}>
                        {report.topConfident.map((n) => <NodeRow key={n.id} node={n} />)}
                      </Section>
                    )}

                    {/* 恐怖谷/偷偷揣测 */}
                    {report.uncanny.length > 0 && (
                      <Section title="它在偷偷揣测的" color="#A68FFF" desc="存在反常信号，它自己也不确定">
                        {report.uncanny.map((n) => <NodeRow key={n.id} node={n} accent="#A68FFF" />)}
                      </Section>
                    )}

                    {/* 你纠正的 */}
                    {report.corrected.length > 0 && (
                      <Section title="它承认看走眼的" color={HOLO.tension} desc="你已否认，它的理解被你修正了">
                        {report.corrected.map((n) => <NodeRow key={n.id} node={n} accent={HOLO.tension} />)}
                      </Section>
                    )}

                    {/* 你确认的 */}
                    {report.confirmed.length > 0 && (
                      <Section title="你亲自确认的" color="#38F2C8">
                        {report.confirmed.map((n) => <NodeRow key={n.id} node={n} accent="#38F2C8" />)}
                      </Section>
                    )}

                    {nodes.length === 0 && (
                      <p style={{ color: "rgba(255,255,255,0.25)", fontFamily: FONT.mono, fontSize: 11, textAlign: "center", paddingTop: 24 }}>
                        还没有任何推断节点<br />补充一句话，看星云生长
                      </p>
                    )}
                  </div>
                )}

                {tab === "export" && (
                  <div className="flex flex-col gap-4">
                    <div className="p-3 rounded-xl" style={{ background: `${HOLO.line}08`, border: `1px solid ${HOLO.line}18` }}>
                      <p style={{ fontFamily: FONT.mono, fontSize: 9, color: `${HOLO.line}88`, letterSpacing: "0.1em", marginBottom: 4 }}>可导出节点</p>
                      <p style={{ fontFamily: FONT.sans, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                        <span style={{ color: HOLO.line, fontFamily: FONT.mono }}>{exportableCount}</span> 个推断
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginLeft: 6 }}>（已排除你否认/叫停的）</span>
                      </p>
                    </div>

                    {/* 即用 prompt 预览 */}
                    <div>
                      <p style={{ fontFamily: FONT.mono, fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", marginBottom: 8 }}>
                        贴到新 AI 对话开头的即用 prompt：
                      </p>
                      <div
                        className="rounded-xl p-3 mb-3"
                        style={{
                          background: "rgba(255,255,255,0.02)",
                          border: `1px solid rgba(255,255,255,0.06)`,
                          maxHeight: 200,
                          overflowY: "auto",
                          scrollbarWidth: "none",
                        }}
                      >
                        <pre style={{ fontFamily: FONT.mono, fontSize: 10, color: "rgba(255,255,255,0.5)", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                          {profilePrompt || "请先补充一些对话让 Mirror 形成推断"}
                        </pre>
                      </div>

                      <button
                        onClick={handleCopyPrompt}
                        disabled={!profilePrompt}
                        className="w-full py-2.5 rounded-xl mb-2 transition-all"
                        style={{
                          background: copied ? `rgba(56,242,200,0.12)` : `${HOLO.line}12`,
                          border: `1px solid ${copied ? "#38F2C8" : HOLO.line}44`,
                          color: copied ? "#38F2C8" : HOLO.line,
                          fontFamily: FONT.mono,
                          fontSize: 11,
                          letterSpacing: "0.06em",
                          cursor: profilePrompt ? "pointer" : "not-allowed",
                          opacity: profilePrompt ? 1 : 0.4,
                        }}
                      >
                        {copied ? "✓ 已复制" : "复制 prompt"}
                      </button>
                    </div>

                    {/* 下载按钮 */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleDownloadMD}
                        disabled={!profilePrompt}
                        className="flex-1 py-2 rounded-xl transition-all"
                        style={{
                          background: "transparent",
                          border: `1px solid rgba(255,255,255,0.12)`,
                          color: "rgba(255,255,255,0.5)",
                          fontFamily: FONT.mono,
                          fontSize: 10,
                          cursor: profilePrompt ? "pointer" : "not-allowed",
                          opacity: profilePrompt ? 1 : 0.4,
                        }}
                      >
                        .md 下载
                      </button>
                      <button
                        onClick={handleDownloadJSON}
                        disabled={!profilePrompt}
                        className="flex-1 py-2 rounded-xl transition-all"
                        style={{
                          background: "transparent",
                          border: `1px solid rgba(255,255,255,0.12)`,
                          color: "rgba(255,255,255,0.5)",
                          fontFamily: FONT.mono,
                          fontSize: 10,
                          cursor: profilePrompt ? "pointer" : "not-allowed",
                          opacity: profilePrompt ? 1 : 0.4,
                        }}
                      >
                        .json 下载
                      </button>
                    </div>

                    <p style={{ fontFamily: FONT.sans, fontSize: 10, color: "rgba(255,255,255,0.2)", lineHeight: 1.6 }}>
                      档案仅包含你未否决的推断。导出不经过任何服务器，数据不离开本设备。
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Section({ title, color, desc, children }: { title: string; color: string; desc?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ width: 3, height: 14, background: color, borderRadius: 2, display: "block", flexShrink: 0 }} />
        <div>
          <span style={{ fontFamily: FONT.mono, fontSize: 10, color, letterSpacing: "0.06em" }}>{title}</span>
          {desc && <span style={{ fontFamily: FONT.sans, fontSize: 9, color: "rgba(255,255,255,0.3)", marginLeft: 6 }}>{desc}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}
