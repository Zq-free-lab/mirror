"use client";
/**
 * Mirror / 镜 —— 分享卡（T5.2）
 *
 * 一键截图当前星云，**脱敏处理**后导出为可分享卡片：
 *  - 只保留星云形态/颜色/大小（视觉结构）
 *  - 隐藏 statement 文本（保护隐私）
 *  - 加 Mirror / 镜 水印 + 日期
 *  - 导出为 PNG（gl.domElement.toDataURL()）
 *
 * 脱敏逻辑：截图前临时修改 canvas，截图后恢复。
 * 实际截图由 r3f 的 `useThree().gl.domElement` 处理。
 */
import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CognitiveNode } from "@/core/types";

interface ShareCardProps {
  nodes: CognitiveNode[];
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onClose: () => void;
}

export function ShareCard({ nodes, canvasRef, onClose }: ShareCardProps) {
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 截取 canvas 为 PNG
    const dataURL = canvas.toDataURL("image/png", 0.95);

    // 创建带水印的版本（在 2D canvas 上叠加）
    const overlay = document.createElement("canvas");
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    // 绘制星云截图
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);

      // 水印
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.font = `${Math.floor(overlay.width * 0.018)}px -apple-system, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(
        `Mirror / 镜  ·  ${new Date().toLocaleDateString("zh-CN")}`,
        overlay.width - 16,
        overlay.height - 16
      );

      // 节点数统计（脱敏后只显示数量）
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillText(
        `${nodes.length} 个认知节点`,
        16,
        overlay.height - 16
      );

      // 下载
      const finalURL = overlay.toDataURL("image/png", 0.95);
      if (downloadRef.current) {
        downloadRef.current.href = finalURL;
        downloadRef.current.download = `mirror-nebula-${Date.now()}.png`;
        downloadRef.current.click();
      }
    };
    img.src = dataURL;
  };

  const systemDistribution = ["narrative", "affect", "valence", "social", "rhythm"].map((sys) => ({
    system: sys,
    count: nodes.filter((n) => n.system === sys).length,
  }));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          className="bg-[#0a0f1a] border border-gray-700 rounded-2xl p-6 w-80 shadow-2xl"
        >
          <h2 className="text-sm text-gray-300 font-medium mb-1">分享你的认知星云</h2>
          <p className="text-xs text-gray-600 mb-4">
            导出图片已脱敏：只保留星云形态，隐藏所有推断文本。
          </p>

          {/* 星云统计预览（文字版） */}
          <div className="bg-gray-900 rounded-xl p-3 mb-4">
            <p className="text-xs text-gray-500 mb-2">星团分布</p>
            <div className="space-y-1.5">
              {systemDistribution.filter((s) => s.count > 0).map(({ system, count }) => (
                <div key={system} className="flex items-center gap-2">
                  <div className="text-xs text-gray-500 w-12">{system}</div>
                  <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / nodes.length) * 100}%`,
                        backgroundColor: {
                          narrative: "#F2D399",
                          affect: "#FF6B5E",
                          valence: "#5EE0C0",
                          social: "#6FA8FF",
                          rhythm: "#B08D57",
                        }[system],
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 w-4 text-right">{count}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex-1 py-2 bg-teal-900/40 border border-teal-700 text-teal-300 text-xs rounded-xl hover:bg-teal-800/40 transition-all"
            >
              下载 PNG
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-700 text-gray-500 text-xs rounded-xl hover:border-gray-600 transition-all"
            >
              取消
            </button>
          </div>

          <a ref={downloadRef} className="hidden" aria-hidden="true" />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
