"use client";
/**
 * Mirror / 镜 —— 首屏 onboarding（R3.1）
 *
 * 首次访问显示轻量引导——一句定位 + 3 步玩法 + 可点的起手句。
 * localStorage 记忆已读；再访不再显示。
 *
 * AC-VAL-ONBOARD：新用户 10 秒内知道这是什么、怎么玩。
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HOLO, FONT } from "@/viz/theme";

const STORAGE_KEY = "mirror_onboarded_v1";

const STARTER_SENTENCES = [
  "我最近压力很大，但不知道从何说起",
  "我发现自己总在逃避某些话题",
  "我不太擅长表达自己的感受",
  "我有时会在意别人对我的看法",
  "我喜欢独处，但有时会感到孤独",
];

const STEPS = [
  {
    icon: "◎",
    title: "每个光点是一条理解",
    desc: "AI 从你说过的话，提炼出对你的推断——每颗粒子都是它「偷偷猜测」的你",
  },
  {
    icon: "◉",
    title: "点开看它凭什么猜",
    desc: "点击任意光点，查看 AI 的证据链——它从你说的哪句话里得出这个结论",
  },
  {
    icon: "⊗",
    title: "不认同？当场对质它",
    desc: "发起对质，看它在「后背发凉」的流式思考后，当场改写自己的理解",
  },
];

interface OnboardingProps {
  onStarterClick: (text: string) => void;
}

export function Onboarding({ onStarterClick }: OnboardingProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<"intro" | "steps" | "start">("intro");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done) setVisible(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    setVisible(false);
  }, []);

  const handleStarter = useCallback((text: string) => {
    dismiss();
    onStarterClick(text);
  }, [dismiss, onStarterClick]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          style={{ background: "rgba(3,6,13,0.85)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden"
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97, y: 8 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{
              background: "rgba(8,14,26,0.92)",
              border: `1px solid ${HOLO.line}25`,
              boxShadow: `0 0 60px ${HOLO.line}10, 0 24px 60px rgba(0,0,0,0.7)`,
            }}
          >
            {/* 顶部色条 */}
            <div style={{ height: 2, background: `linear-gradient(to right, transparent, ${HOLO.line}88, ${HOLO.warmCore}66, transparent)` }} />

            <AnimatePresence mode="wait">
              {step === "intro" && (
                <motion.div
                  key="intro"
                  className="p-8"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.22 }}
                >
                  {/* 标志 */}
                  <div className="mb-6 text-center">
                    <div style={{ fontFamily: FONT.sans, fontWeight: 300, fontSize: 22, color: "rgba(255,255,255,0.9)", letterSpacing: "0.15em" }}>
                      Mirror / 镜
                    </div>
                    <div style={{ fontFamily: FONT.mono, fontSize: 10, color: `${HOLO.line}88`, marginTop: 4, letterSpacing: "0.1em" }}>
                      AI 眼中的你
                    </div>
                  </div>

                  {/* 核心一句话 */}
                  <p className="text-center leading-loose mb-8" style={{ fontFamily: FONT.sans, fontSize: 15, color: "rgba(255,255,255,0.7)", fontWeight: 300 }}>
                    你知道 AI 把你理解成<br />
                    <span style={{ color: HOLO.warmCore }}>什么样的人</span>吗？
                  </p>

                  <button
                    onClick={() => setStep("steps")}
                    className="w-full py-3 rounded-xl transition-all"
                    style={{
                      background: `${HOLO.line}14`,
                      border: `1px solid ${HOLO.line}40`,
                      color: HOLO.line,
                      fontFamily: FONT.mono,
                      fontSize: 12,
                      letterSpacing: "0.08em",
                    }}
                  >
                    看看 Mirror 怎么玩 →
                  </button>

                  <button
                    onClick={dismiss}
                    className="w-full mt-2 py-2 text-xs"
                    style={{ color: "rgba(255,255,255,0.2)", fontFamily: FONT.mono }}
                  >
                    跳过，直接进入
                  </button>
                </motion.div>
              )}

              {step === "steps" && (
                <motion.div
                  key="steps"
                  className="p-8"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.22 }}
                >
                  <p style={{ fontFamily: FONT.mono, fontSize: 10, color: `${HOLO.line}88`, letterSpacing: "0.12em", marginBottom: 20 }}>
                    三步玩法
                  </p>

                  <div className="flex flex-col gap-5 mb-8">
                    {STEPS.map((s, i) => (
                      <div key={i} className="flex gap-3">
                        <span style={{ fontFamily: FONT.mono, fontSize: 16, color: HOLO.line, flexShrink: 0, width: 20, lineHeight: 1.4 }}>
                          {s.icon}
                        </span>
                        <div>
                          <p style={{ fontFamily: FONT.sans, fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 3 }}>{s.title}</p>
                          <p style={{ fontFamily: FONT.sans, fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>{s.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setStep("start")}
                    className="w-full py-3 rounded-xl transition-all"
                    style={{
                      background: `${HOLO.line}14`,
                      border: `1px solid ${HOLO.line}40`,
                      color: HOLO.line,
                      fontFamily: FONT.mono,
                      fontSize: 12,
                      letterSpacing: "0.08em",
                    }}
                  >
                    我懂了，开始探索 →
                  </button>
                </motion.div>
              )}

              {step === "start" && (
                <motion.div
                  key="start"
                  className="p-8"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.22 }}
                >
                  <p style={{ fontFamily: FONT.mono, fontSize: 10, color: `${HOLO.line}88`, letterSpacing: "0.12em", marginBottom: 6 }}>
                    选一句起手
                  </p>
                  <p style={{ fontFamily: FONT.sans, fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16, lineHeight: 1.6 }}>
                    点一句发给 Mirror，或直接关闭自己输入
                  </p>

                  <div className="flex flex-col gap-2 mb-6">
                    {STARTER_SENTENCES.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStarter(s)}
                        className="text-left px-4 py-3 rounded-xl transition-all"
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: `1px solid rgba(255,255,255,0.08)`,
                          color: "rgba(255,255,255,0.65)",
                          fontFamily: FONT.sans,
                          fontSize: 12,
                          lineHeight: 1.5,
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = `${HOLO.line}40`;
                          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.9)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
                          (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.65)";
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={dismiss}
                    className="w-full py-2 text-xs"
                    style={{ color: "rgba(255,255,255,0.25)", fontFamily: FONT.mono }}
                  >
                    自己输入 →
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 底部色条 */}
            <div style={{ height: 2, background: `linear-gradient(to right, transparent, ${HOLO.line}30, transparent)` }} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
