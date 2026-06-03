"use client";
/**
 * Mirror / 镜 —— 初始化加载动画（T5.3）
 *
 * 把等待变成体验：当 embedding 模型首次下载（MiniLM ~30MB）时，
 * 显示"星云在你的设备里凝结成形"的动画，掩盖技术等待感。
 *
 * 视觉：
 *  - 深空背景
 *  - 中心发光点，随机粒子向内聚拢（凝结）
 *  - 状态文字：下载中 → 初始化中 → 凝结中 → 准备完毕
 *  - 进度条（可接入真实进度）
 *
 * 对应原题任务3"杀死 Boring Loading"——把等待变成仪式感。
 */
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, useAnimate } from "framer-motion";

// ─── 粒子（纯 CSS 动画，不依赖 Three.js）────────────────────────────────────

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
}

const PARTICLE_COLORS = ["#F2D399", "#FF6B5E", "#5EE0C0", "#6FA8FF", "#B08D57"];

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    delay: Math.random() * 3,
    duration: Math.random() * 2 + 2,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
  }));
}

// ─── 加载阶段 ─────────────────────────────────────────────────────────────────

const PHASES = [
  { progress: 0,   label: "在你的设备上启动…",       sub: "Mirror 完全本地运行，数据不离开你的设备" },
  { progress: 25,  label: "加载认知模型…",            sub: "下载 all-MiniLM-L6-v2（约 30MB，只需一次）" },
  { progress: 60,  label: "语义空间初始化…",          sub: "向量维度：384 · 星团引力计算中" },
  { progress: 85,  label: "认知星云正在凝结…",        sub: "把你的对话历史铸成星云形态" },
  { progress: 100, label: "凝结完毕",                  sub: "你的认知星云已就绪" },
];

// ─── 主组件 ──────────────────────────────────────────────────────────────────

interface LoadingNebulaProps {
  progress?: number; // 0-100，由 EmbeddingProvider 传入
  onComplete?: () => void;
}

export function LoadingNebula({ progress = 0, onComplete }: LoadingNebulaProps) {
  const [particles] = useState(() => generateParticles(40));
  const [scope, animate] = useAnimate();
  const completedRef = useRef(false);

  const currentPhase = PHASES.reduce(
    (acc, phase) => (progress >= phase.progress ? phase : acc),
    PHASES[0]
  );

  useEffect(() => {
    if (progress >= 100 && !completedRef.current) {
      completedRef.current = true;
      // 凝结完成动画：粒子向中心坍缩
      animate(scope.current, { scale: 1.2, opacity: 0 }, { duration: 0.8 })
        .then(() => onComplete?.());
    }
  }, [progress, animate, scope, onComplete]);

  return (
    <motion.div
      ref={scope}
      className="fixed inset-0 z-[100] bg-[#050a0f] flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 1 }}
    >
      {/* 背景粒子 */}
      <div className="absolute inset-0">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
            }}
            animate={{
              x: [`0%`, `${(50 - p.x) * 0.3}%`],
              y: [`0%`, `${(50 - p.y) * 0.3}%`],
              opacity: [0.2, 0.6, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* 中心发光核 */}
      <div className="relative mb-8">
        <motion.div
          className="w-20 h-20 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(94,224,192,0.4) 0%, rgba(94,224,192,0.05) 60%, transparent 100%)",
          }}
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border border-teal-500/20"
          animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border border-teal-400/10"
          animate={{ scale: [1, 1.8], opacity: [0.2, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
        />
      </div>

      {/* 标题 */}
      <motion.h1
        className="text-white/60 text-sm font-light tracking-[0.3em] mb-2"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        Mirror / 镜
      </motion.h1>

      {/* 阶段文字 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPhase.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="text-center mb-6"
        >
          <p className="text-white/80 text-sm mb-1">{currentPhase.label}</p>
          <p className="text-gray-600 text-xs max-w-[240px] leading-relaxed">{currentPhase.sub}</p>
        </motion.div>
      </AnimatePresence>

      {/* 进度条 */}
      <div className="w-48 h-0.5 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, #5EE0C0, #6FA8FF)",
          }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      <p className="text-gray-700 text-xs mt-2">{progress}%</p>
    </motion.div>
  );
}
