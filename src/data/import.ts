/**
 * Mirror / 镜 —— 对话导入解析（T3.4）
 *
 * 支持解析两种导出格式：
 *   - ChatGPT：conversations.json（数组，每项含 mapping 结构或 messages 数组）
 *   - Claude：claude_conversations.json（数组，每项含 chat_messages）
 *
 * 输出：RawMessage[]（过滤 system/tool 消息，只保留 user/assistant 对话）
 *
 * 限额：单次最多处理 MAX_MESSAGES 条消息，避免超大上下文塞满 LLM。
 */
import type { RawMessage } from "@/core/types";
import { rawMessageSchema } from "@/core/schemas";
import { z } from "zod";

export const MAX_MESSAGES = 500;

// ─── ChatGPT conversations.json 格式 ─────────────────────────────────────────

const chatGPTMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system", "tool"]).optional(),
  content: z
    .union([
      z.string(),
      z.object({ parts: z.array(z.string()) }).optional(),
      z.null(),
    ])
    .optional(),
  create_time: z.number().nullable().optional(),
});

const chatGPTMappingSchema = z.record(
  z.string(),
  z.object({
    id: z.string(),
    message: chatGPTMessageSchema.nullable().optional(),
    children: z.array(z.string()).optional(),
  })
);

const chatGPTConversationSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  create_time: z.number().optional(),
  mapping: chatGPTMappingSchema.optional(),
  messages: z.array(chatGPTMessageSchema).optional(), // simplified format
});

// ─── Claude claude_conversations.json 格式 ───────────────────────────────────

const claudeMessageSchema = z.object({
  uuid: z.string().optional(),
  text: z.string().optional(),
  content: z
    .union([
      z.string(),
      z.array(z.object({ type: z.string(), text: z.string().optional() })),
    ])
    .optional(),
  sender: z.enum(["human", "assistant"]).optional(),
  role: z.enum(["user", "assistant", "human"]).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const claudeConversationSchema = z.object({
  uuid: z.string().optional(),
  name: z.string().optional(),
  chat_messages: z.array(claudeMessageSchema).optional(),
  created_at: z.string().optional(),
});

// ─── 解析工具函数 ─────────────────────────────────────────────────────────────

function extractTextContent(content: unknown): string | null {
  if (typeof content === "string") return content.trim() || null;
  if (content && typeof content === "object" && "parts" in content) {
    const parts = (content as { parts: unknown[] }).parts;
    const text = parts
      .filter((p) => typeof p === "string")
      .join("")
      .trim();
    return text || null;
  }
  return null;
}

function normalizeRole(role: string | undefined): "user" | "assistant" | null {
  if (role === "user" || role === "human") return "user";
  if (role === "assistant") return "assistant";
  return null;
}

function toISO(timestamp: number | string | null | undefined): string {
  if (!timestamp) return new Date().toISOString();
  if (typeof timestamp === "number") return new Date(timestamp * 1000).toISOString();
  if (typeof timestamp === "string") {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
}

let _msgCounter = 0;
function makeId(prefix = "imp"): string {
  return `${prefix}-${Date.now()}-${++_msgCounter}`;
}

// ─── ChatGPT 解析 ─────────────────────────────────────────────────────────────

function parseChatGPTConversation(conv: z.infer<typeof chatGPTConversationSchema>): RawMessage[] {
  const messages: RawMessage[] = [];

  if (conv.messages) {
    for (const msg of conv.messages) {
      const role = normalizeRole(msg.role);
      const text = extractTextContent(msg.content);
      if (!role || !text) continue;
      messages.push({
        id: msg.id || makeId("chatgpt"),
        role,
        content: text,
        timestamp: toISO(msg.create_time),
      });
    }
    return messages;
  }

  if (conv.mapping) {
    // Traverse mapping in order: find root, then follow children
    const entries = Object.values(conv.mapping);
    const sorted = entries
      .filter((e) => e.message && e.message.create_time !== undefined)
      .sort((a, b) => (a.message?.create_time ?? 0) - (b.message?.create_time ?? 0));

    for (const entry of sorted) {
      const msg = entry.message;
      if (!msg) continue;
      const role = normalizeRole(msg.role);
      const text = extractTextContent(msg.content);
      if (!role || !text) continue;
      messages.push({
        id: entry.id || makeId("chatgpt"),
        role,
        content: text,
        timestamp: toISO(msg.create_time),
      });
    }
  }

  return messages;
}

// ─── Claude 解析 ──────────────────────────────────────────────────────────────

function parseClaudeConversation(conv: z.infer<typeof claudeConversationSchema>): RawMessage[] {
  const messages: RawMessage[] = [];

  for (const msg of conv.chat_messages ?? []) {
    const role = normalizeRole(msg.sender ?? msg.role);
    let text: string | null = null;

    if (msg.text) {
      text = msg.text.trim() || null;
    } else if (msg.content) {
      if (typeof msg.content === "string") {
        text = msg.content.trim() || null;
      } else if (Array.isArray(msg.content)) {
        text = msg.content
          .filter((c) => c.type === "text" && c.text)
          .map((c) => c.text)
          .join("")
          .trim() || null;
      }
    }

    if (!role || !text) continue;
    messages.push({
      id: msg.uuid || makeId("claude"),
      role,
      content: text,
      timestamp: toISO(msg.created_at),
    });
  }

  return messages;
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────

export interface ImportResult {
  messages: RawMessage[];
  /** 解析时遇到的非致命警告 */
  warnings: string[];
  /** 总共解析出的消息数（含截断前） */
  totalParsed: number;
}

/**
 * 解析 ChatGPT 或 Claude 导出 JSON，返回 RawMessage[]。
 *
 * @param json    导出文件的 JSON 对象（已由调用层 JSON.parse）
 * @param maxMessages  最大消息数（防止超大上下文，默认 MAX_MESSAGES）
 */
export function parseExport(
  json: unknown,
  maxMessages = MAX_MESSAGES
): ImportResult {
  const warnings: string[] = [];
  const allMessages: RawMessage[] = [];

  if (!Array.isArray(json)) {
    warnings.push("导入文件格式错误：顶层应为数组");
    return { messages: [], warnings, totalParsed: 0 };
  }

  for (let i = 0; i < json.length; i++) {
    const conv = json[i];

    // 尝试 ChatGPT 格式
    const chatGPTParsed = chatGPTConversationSchema.safeParse(conv);
    if (chatGPTParsed.success && (chatGPTParsed.data.mapping || chatGPTParsed.data.messages)) {
      const msgs = parseChatGPTConversation(chatGPTParsed.data);
      allMessages.push(...msgs);
      continue;
    }

    // 尝试 Claude 格式
    const claudeParsed = claudeConversationSchema.safeParse(conv);
    if (claudeParsed.success && claudeParsed.data.chat_messages) {
      const msgs = parseClaudeConversation(claudeParsed.data);
      allMessages.push(...msgs);
      continue;
    }

    warnings.push(`第 ${i + 1} 条对话格式无法识别，已跳过`);
  }

  // 最终 Zod 校验
  const validated: RawMessage[] = [];
  for (const msg of allMessages) {
    const result = rawMessageSchema.safeParse(msg);
    if (result.success) {
      validated.push(result.data);
    }
  }

  const totalParsed = validated.length;
  const messages = validated.slice(0, maxMessages);

  if (totalParsed > maxMessages) {
    warnings.push(
      `共解析 ${totalParsed} 条消息，超过限额 ${maxMessages}，已截断至前 ${maxMessages} 条`
    );
  }

  return { messages, warnings, totalParsed };
}
