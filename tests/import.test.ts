/**
 * import.ts 测试 — AC-IMP-1（T3.4）
 *
 * 验证 ChatGPT / Claude 导出格式能被解析为 RawMessage[]。
 */
import { describe, it, expect } from "vitest";
import { parseExport, MAX_MESSAGES } from "@/data/import";
import { rawMessageSchema } from "@/core/schemas";

// ── ChatGPT format fixtures ───────────────────────────────────────────────────

const chatGPTSimpleFixture = [
  {
    id: "conv-001",
    title: "关于焦虑的对话",
    create_time: 1714000000,
    messages: [
      { id: "msg-a", role: "user", content: "我最近很焦虑", create_time: 1714000100 },
      { id: "msg-b", role: "assistant", content: "能说说是什么让你焦虑吗？", create_time: 1714000200 },
      { id: "msg-c", role: "user", content: "工作压力很大", create_time: 1714000300 },
    ],
  },
];

const chatGPTMappingFixture = [
  {
    id: "conv-002",
    title: "独处对话",
    create_time: 1714001000,
    mapping: {
      "node-1": {
        id: "node-1",
        message: { id: "msg-1", role: "user", content: "我喜欢独处", create_time: 1714001100 },
        children: ["node-2"],
      },
      "node-2": {
        id: "node-2",
        message: { id: "msg-2", role: "assistant", content: "为什么喜欢独处？", create_time: 1714001200 },
        children: [],
      },
    },
  },
];

const chatGPTWithPartsFixture = [
  {
    id: "conv-003",
    messages: [
      {
        id: "msg-p1",
        role: "user",
        content: { parts: ["这是一段", "多部分内容"] },
        create_time: 1714002000,
      },
    ],
  },
];

// ── Claude format fixtures ────────────────────────────────────────────────────

const claudeFixture = [
  {
    uuid: "claude-conv-001",
    name: "关于自我认知的对话",
    created_at: "2026-03-01T10:00:00.000Z",
    chat_messages: [
      {
        uuid: "claude-msg-001",
        sender: "human",
        text: "我觉得我不太了解自己",
        created_at: "2026-03-01T10:00:00.000Z",
      },
      {
        uuid: "claude-msg-002",
        sender: "assistant",
        text: "你对哪个方面最不了解？",
        created_at: "2026-03-01T10:01:00.000Z",
      },
      {
        uuid: "claude-msg-003",
        sender: "human",
        text: "我不知道自己真正想要什么",
        created_at: "2026-03-01T10:02:00.000Z",
      },
    ],
  },
];

const claudeWithContentArrayFixture = [
  {
    uuid: "claude-conv-002",
    chat_messages: [
      {
        uuid: "claude-msg-array-001",
        sender: "human",
        content: [{ type: "text", text: "用内容数组格式的消息" }],
        created_at: "2026-03-02T10:00:00.000Z",
      },
    ],
  },
];

// ── 解析测试 ──────────────────────────────────────────────────────────────────

describe("parseExport: ChatGPT simple format", () => {
  it("parses user and assistant messages", () => {
    const { messages } = parseExport(chatGPTSimpleFixture);
    expect(messages.length).toBe(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[2].role).toBe("user");
  });

  it("all messages pass Zod rawMessageSchema", () => {
    const { messages } = parseExport(chatGPTSimpleFixture);
    for (const msg of messages) {
      expect(() => rawMessageSchema.parse(msg)).not.toThrow();
    }
  });

  it("message content is correct", () => {
    const { messages } = parseExport(chatGPTSimpleFixture);
    expect(messages[0].content).toBe("我最近很焦虑");
    expect(messages[2].content).toBe("工作压力很大");
  });
});

describe("parseExport: ChatGPT mapping format", () => {
  it("parses mapping format correctly", () => {
    const { messages } = parseExport(chatGPTMappingFixture);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("我喜欢独处");
  });
});

describe("parseExport: ChatGPT parts format", () => {
  it("joins parts into a single string", () => {
    const { messages } = parseExport(chatGPTWithPartsFixture);
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe("这是一段多部分内容");
  });
});

describe("parseExport: Claude format", () => {
  it("parses human and assistant messages", () => {
    const { messages } = parseExport(claudeFixture);
    expect(messages.length).toBe(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  it("message text is correctly extracted", () => {
    const { messages } = parseExport(claudeFixture);
    expect(messages[0].content).toBe("我觉得我不太了解自己");
  });

  it("all messages pass Zod validation", () => {
    const { messages } = parseExport(claudeFixture);
    for (const msg of messages) {
      expect(() => rawMessageSchema.parse(msg)).not.toThrow();
    }
  });
});

describe("parseExport: Claude content array format", () => {
  it("extracts text from content array", () => {
    const { messages } = parseExport(claudeWithContentArrayFixture);
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe("用内容数组格式的消息");
  });
});

describe("parseExport: Mixed format and edge cases", () => {
  it("handles multiple conversations in one file", () => {
    const mixed = [...chatGPTSimpleFixture, ...claudeFixture];
    const { messages } = parseExport(mixed);
    expect(messages.length).toBe(6); // 3 + 3
  });

  it("returns empty array and warning for non-array input", () => {
    const { messages, warnings } = parseExport({ invalid: "object" });
    expect(messages).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("truncates messages to maxMessages limit", () => {
    const manyMsgs = Array.from({ length: 10 }, (_, i) => ({
      id: `conv-${i}`,
      messages: [
        { id: `msg-${i}`, role: "user" as const, content: `消息 ${i}`, create_time: 1714000000 + i },
      ],
    }));
    const { messages, warnings, totalParsed } = parseExport(manyMsgs, 5);
    expect(messages).toHaveLength(5);
    expect(totalParsed).toBe(10);
    expect(warnings.some((w) => w.includes("截断"))).toBe(true);
  });

  it("skips system and tool messages", () => {
    const withSystem = [
      {
        id: "conv-sys",
        messages: [
          { id: "s1", role: "system", content: "You are an AI", create_time: 1714000000 },
          { id: "s2", role: "user", content: "Hello", create_time: 1714000001 },
          { id: "s3", role: "tool", content: "tool result", create_time: 1714000002 },
        ],
      },
    ];
    const { messages } = parseExport(withSystem);
    // Only user message should be included
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
  });

  it("skips empty content messages", () => {
    const withEmpty = [
      {
        id: "conv-empty",
        messages: [
          { id: "e1", role: "user", content: "", create_time: 1714000000 },
          { id: "e2", role: "user", content: "有内容的消息", create_time: 1714000001 },
        ],
      },
    ];
    const { messages } = parseExport(withEmpty);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("有内容的消息");
  });

  it("has stable MAX_MESSAGES constant of 500", () => {
    expect(MAX_MESSAGES).toBe(500);
  });

  it("unrecognized conversation format adds warning", () => {
    const unknown = [{ some: "unknown", format: true }];
    const { warnings } = parseExport(unknown);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
