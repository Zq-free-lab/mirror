/**
 * Mirror / 镜 —— 核心类型（由 schemas.ts 用 z.infer 导出）+ 系统元数据常量
 *
 * 类型不在此手写，全部从 Zod schema 推断，保证「校验」与「类型」永不漂移。
 * 业务层请从这里 import 类型（`import type { CognitiveNode } from '@/core/types'`）。
 */
import { z } from 'zod';
import type {
  cognitiveSystemSchema,
  memoryLayerSchema,
  nodeStatusSchema,
  userVerdictSchema,
  evidenceDraftSchema,
  evidenceSchema,
  cognitiveNodeSchema,
  evolutionEventTypeSchema,
  evolutionTriggerSchema,
  evolutionEventSchema,
  activeQuestionDraftSchema,
  activeQuestionSchema,
  rawMessageSchema,
  cognitiveGraphSchema,
  factDraftSchema,
  behavioralSignalSchema,
  observerOutputSchema,
  inferredNodeDraftSchema,
  infererOutputSchema,
  skepticJudgmentSchema,
  skepticOutputSchema,
  contradictionSchema,
  revisionSchema,
  reconcilerOutputSchema,
  reflectorOutputSchema,
} from './schemas';

// ───────────────────────── 数据模型类型 ─────────────────────────

export type CognitiveSystemId = z.infer<typeof cognitiveSystemSchema>;
export type MemoryLayer = z.infer<typeof memoryLayerSchema>;
export type NodeStatus = z.infer<typeof nodeStatusSchema>;
export type UserVerdict = z.infer<typeof userVerdictSchema>;

export type EvidenceDraft = z.infer<typeof evidenceDraftSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;

export type CognitiveNode = z.infer<typeof cognitiveNodeSchema>;

export type EvolutionEventType = z.infer<typeof evolutionEventTypeSchema>;
export type EvolutionTrigger = z.infer<typeof evolutionTriggerSchema>;
export type EvolutionEvent = z.infer<typeof evolutionEventSchema>;

export type ActiveQuestionDraft = z.infer<typeof activeQuestionDraftSchema>;
export type ActiveQuestion = z.infer<typeof activeQuestionSchema>;

export type RawMessage = z.infer<typeof rawMessageSchema>;
export type CognitiveGraph = z.infer<typeof cognitiveGraphSchema>;

// ───────────────────────── Agent I/O 类型 ─────────────────────────

export type FactDraft = z.infer<typeof factDraftSchema>;
export type BehavioralSignal = z.infer<typeof behavioralSignalSchema>;
export type ObserverOutput = z.infer<typeof observerOutputSchema>;

export type InferredNodeDraft = z.infer<typeof inferredNodeDraftSchema>;
export type InfererOutput = z.infer<typeof infererOutputSchema>;

export type SkepticJudgment = z.infer<typeof skepticJudgmentSchema>;
export type SkepticOutput = z.infer<typeof skepticOutputSchema>;

export type Contradiction = z.infer<typeof contradictionSchema>;
export type Revision = z.infer<typeof revisionSchema>;
export type ReconcilerOutput = z.infer<typeof reconcilerOutputSchema>;

export type ReflectorOutput = z.infer<typeof reflectorOutputSchema>;

// ───────────────────────── 系统元数据（五星团） ─────────────────────────

export interface SystemMeta {
  /** UI 默认显示的诗意有机名 */
  poeticName: string;
  /** hover / 详情浮出的真实脑区名 */
  brainRegion: string;
  /** hover 时的一句机制说明（双层呈现的第二层） */
  mechanism: string;
  /** 星团主色调（hex） */
  color: string;
  /** 是否主星团（视觉分主次：narrative / affect 为主） */
  isPrimary: boolean;
  /** 星团引力中心（layout.ts 布局用，叠加在 UMAP 坐标上） */
  anchor: [number, number, number];
}

/**
 * 五认知系统元数据。详见「有机本体设计.md」第三节。
 * 视觉红线：color/anchor 是语义锚点，不是装饰。
 */
export const SYSTEM_META: Record<CognitiveSystemId, SystemMeta> = {
  narrative: {
    poeticName: '叙事核',
    brainRegion: '默认模式网络（DMN）',
    mechanism: '维护你是谁的连贯故事——身份、价值观、自我概念。最深、最稳。',
    color: '#FFE7A8',
    isPrimary: true,
    anchor: [0, 0.6, 0],
  },
  affect: {
    poeticName: '情动潮汐',
    brainRegion: '杏仁核 · 边缘系统',
    mechanism: '你在意什么、什么触动你、当下情绪状态。决定全局显著性与亮度。',
    color: '#FF3D8A',
    isPrimary: true,
    anchor: [0.9, 0.1, 0.2],
  },
  valence: {
    poeticName: '趋避场',
    brainRegion: '眶额皮层（OFC）',
    mechanism: '你偏好什么、回避什么——你的"奖赏函数"。双极结构。',
    color: '#38F2C8',
    isPrimary: false,
    anchor: [-0.9, 0.0, 0.3],
  },
  social: {
    poeticName: '他者之镜',
    brainRegion: '颞顶联合区（TPJ）',
    mechanism: '你怎么对待他人、关系动态、你如何揣测别人的心智。',
    color: '#4DA6FF',
    isPrimary: false,
    anchor: [0.3, -0.2, -0.9],
  },
  rhythm: {
    poeticName: '节律之根',
    brainRegion: '基底神经节',
    mechanism: '你没明说但行为暴露的内隐模式、习惯、节律。沉在底层。',
    color: '#8A6BFF',
    isPrimary: false,
    anchor: [0, -0.9, 0],
  },
};
