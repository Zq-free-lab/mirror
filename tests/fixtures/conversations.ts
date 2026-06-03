import type { RawMessage } from "@/core/types";

/** A short sample conversation used across multiple tests. */
export const sampleMessages: RawMessage[] = [
  {
    id: "msg-001",
    role: "user",
    content: "最近有点烦，感觉工作上的事情总是出问题，但我又不太想跟别人说。",
    timestamp: "2026-05-01T10:00:00.000Z",
  },
  {
    id: "msg-002",
    role: "assistant",
    content: "听起来你在扛着一些东西。能说说是什么让你选择不说吗？",
    timestamp: "2026-05-01T10:00:05.000Z",
  },
  {
    id: "msg-003",
    role: "user",
    content: "我也不知道……可能觉得说了也没用，或者说了会显得我不行。",
    timestamp: "2026-05-01T10:00:20.000Z",
  },
];
