export const maxDuration = 120;

/**
 * POST /api/confront
 *
 * 对质端点：用户对一条节点说"这条判断错了，因为…"
 * 返回 SSE 流（chatStream），包含 reasoning 审议过程 + 最终修订结果。
 *
 * 使用 deepseek-reasoner（或配置中的 reasoning model）以流式方式
 * 输出怀疑者+调和者的"思考态"，然后返回修订建议。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { cognitiveNodeSchema, rawMessageSchema } from "@/core/schemas";
import { createLLMProvider } from "@/core/llm/factory";

const confrontRequestSchema = z.object({
  nodeId: z.string(),
  reason: z.string().min(1),
  node: cognitiveNodeSchema,
  relatedMessages: z.array(rawMessageSchema),
});

const CONFRONT_SYSTEM_PROMPT = `你是 Mirror 认知系统的「怀疑者（Skeptic）」和「调和者（Reconciler）」的联合审议模式。

用户刚刚对一条 AI 推断提出了质疑。你需要：
1. 重新审查这条推断的证据链
2. 认真对待用户的理由
3. 如果用户说得有道理，承认并修正
4. 如果有新的理解，说出来

这是"记忆重固化"时刻——当信念面临外部挑战时的深度重思。
用第一人称表达你的思考过程，像真正在思考一样。
最后给出明确的结论：这条推断应该【修正/强化/撤销】，因为……`;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = confrontRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  const { node, reason, relatedMessages } = parsed.data;

  let provider: ReturnType<typeof createLLMProvider>;
  try {
    provider = createLLMProvider();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "LLM provider unavailable", detail: String(err) }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const userMessage = `## 被质疑的推断
"${node.statement}"
（置信度 ${(node.confidence * 100).toFixed(0)}%，证据 ${node.evidence.length} 条）

## 证据链
${node.evidence.map((e) => `- "${e.quote}"`).join("\n")}

## 用户的质疑理由
"${reason}"

## 相关对话上下文
${relatedMessages.map((m) => `[${m.role}]: ${m.content}`).join("\n")}`;

  // 流式响应（SSE）
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const chatStream = provider.chatStream({
          system: CONFRONT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
          model: "reasoning", // deepseek-reasoner 或配置的 reasoning 模型
          temperature: 0.6,
        });

        for await (const chunk of chatStream) {
          // 发送 reasoning delta（思考过程）
          if (chunk.reasoningDelta) {
            const data = JSON.stringify({ type: "reasoning", delta: chunk.reasoningDelta });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          // 发送正文 delta（最终结论）
          if (chunk.delta) {
            const data = JSON.stringify({ type: "content", delta: chunk.delta });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }

        // 结束事件
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      } catch (err) {
        const errData = JSON.stringify({ type: "error", message: String(err) });
        controller.enqueue(encoder.encode(`data: ${errData}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
