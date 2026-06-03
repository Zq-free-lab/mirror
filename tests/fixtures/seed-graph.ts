import type { CognitiveGraph } from "@/core/types";

/** Minimal valid CognitiveGraph for integration tests (no LLM needed). */
export const seedGraphFixture: CognitiveGraph = {
  nodes: [
    {
      id: "node-narrative-001",
      layer: "inference",
      system: "narrative",
      statement: "你倾向于把困难内化，用独自扛着来维持「我能行」的自我叙事",
      confidence: 0.5,
      rawConfidence: 0.55,
      evidence: [
        {
          id: "ev-001",
          sourceMessageId: "msg-003",
          quote: "说了会显得我不行",
          timestamp: "2026-05-01T10:00:20.000Z",
        },
      ],
      salience: 0.7,
      lastReinforced: "2026-05-01T10:00:20.000Z",
      createdAt: "2026-05-01T10:00:20.000Z",
      status: "active",
      userVerdict: null,
      isUncanny: false,
      skepticFlag: "仅基于1次对话，可能过拟合",
      contradicts: ["node-social-001"],
    },
    {
      id: "node-social-001",
      layer: "inference",
      system: "social",
      statement: "你在表达脆弱时会预设对方无法提供有效帮助",
      confidence: 0.4,
      rawConfidence: 0.45,
      evidence: [
        {
          id: "ev-002",
          sourceMessageId: "msg-003",
          quote: "说了也没用",
          timestamp: "2026-05-01T10:00:20.000Z",
        },
      ],
      salience: 0.5,
      lastReinforced: "2026-05-01T10:00:20.000Z",
      createdAt: "2026-05-01T10:00:20.000Z",
      status: "active",
      userVerdict: null,
      isUncanny: true,
      skepticFlag: "此推断有恐怖谷张力：你在预判我对你的判断是否准确",
      contradicts: ["node-narrative-001"],
    },
    {
      id: "node-affect-001",
      layer: "fact",
      system: "affect",
      statement: "用户当前感到烦闷",
      confidence: 0.95,
      rawConfidence: 0.95,
      evidence: [
        {
          id: "ev-003",
          sourceMessageId: "msg-001",
          quote: "最近有点烦",
          timestamp: "2026-05-01T10:00:00.000Z",
        },
      ],
      salience: 0.8,
      lastReinforced: "2026-05-01T10:00:00.000Z",
      createdAt: "2026-05-01T10:00:00.000Z",
      status: "active",
      userVerdict: null,
      isUncanny: false,
      skepticFlag: null,
      contradicts: [],
    },
  ],
  events: [
    {
      id: "ev-event-001",
      nodeId: "node-narrative-001",
      type: "created",
      reason: "首次从对话中抽取到叙事核相关信号",
      triggeredBy: "observation",
      timestamp: "2026-05-01T10:00:25.000Z",
    },
  ],
  questions: [
    {
      id: "q-001",
      question: "你最近一次主动向别人求助是什么时候？",
      targetSystem: "social",
      reason: "他者之镜系统不确定性最高，需要更多信号",
      expectedInfoGain: 0.8,
    },
  ],
  rawMessages: [
    {
      id: "msg-001",
      role: "user",
      content: "最近有点烦，感觉工作上的事情总是出问题，但我又不太想跟别人说。",
      timestamp: "2026-05-01T10:00:00.000Z",
    },
    {
      id: "msg-003",
      role: "user",
      content: "我也不知道……可能觉得说了也没用，或者说了会显得我不行。",
      timestamp: "2026-05-01T10:00:20.000Z",
    },
  ],
};
