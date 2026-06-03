export const maxDuration = 120;

/**
 * POST /api/infer  (SSE 流式)
 *
 * 输入：{ messages: RawMessage[], graph: { nodes: CognitiveNode[] } }
 *
 * 输出流格式（text/event-stream）：
 *   每个 Agent 完成时推一个 stage 事件：
 *     data: {"type":"stage","stage":"observer","label":"观察者在读你的话"}
 *   全部完成后推 done 事件：
 *     data: {"type":"done","result":{...PipelineResult}}
 *   失败时推 error 事件：
 *     data: {"type":"error","message":"..."}
 *
 * 服务端密钥（LLM_API_KEY）在此处消费，不暴露前端。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { rawMessageSchema, cognitiveNodeSchema } from "@/core/schemas";
import { createLLMProvider } from "@/core/llm/factory";
import { runPipeline } from "@/core/agents/pipeline";

const inferRequestSchema = z.object({
  messages: z.array(rawMessageSchema).min(1),
  graph: z.object({
    nodes: z.array(cognitiveNodeSchema),
  }),
});

const encoder = new TextEncoder();

function sseEvent(payload: object): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const parsed = inferRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  let provider: ReturnType<typeof createLLMProvider>;
  try {
    provider = createLLMProvider();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "LLM provider unavailable", detail: String(err) }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const { messages, graph } = parsed.data;
  const sortedNodes = [...graph.nodes]
    .sort((a, b) => new Date(b.lastReinforced).getTime() - new Date(a.lastReinforced).getTime())
    .slice(0, 15);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await runPipeline(
          messages,
          { nodes: sortedNodes },
          provider,
          (stage, label) => {
            controller.enqueue(sseEvent({ type: "stage", stage, label }));
          }
        );
        controller.enqueue(sseEvent({ type: "done", result }));
      } catch (err) {
        console.error("[/api/infer] pipeline error:", err);
        controller.enqueue(sseEvent({ type: "error", message: String(err) }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
