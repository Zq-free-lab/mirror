/**
 * LLM Adapter 单元测试 — AC-LLM-1 / AC-LLM-2 / AC-LLM-3 / AC-LLM-4
 *
 * 全程注入 mock OpenAI client，无真实网络请求。
 * 测的是 structured() 的重试逻辑 + chatStream() 的 reasoning 透传。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { OpenAICompatibleProvider } from "@/core/llm/openai-compatible";
import type { OpenAIClientLike } from "@/core/llm/openai-compatible";

// ── 工具：构造测试用 provider ─────────────────────────────────────────────────

function makeProvider(client: OpenAIClientLike) {
  return new OpenAICompatibleProvider({
    id: "test",
    apiKey: "test-key",
    baseURL: "https://api.test.local",
    fastModel: "test-fast",
    reasoningModel: "test-reasoning",
    client,
  });
}

// 简单测试 schema
const testSchema = z.object({
  result: z.string(),
  score: z.number().min(0).max(1),
});

type TestOutput = z.infer<typeof testSchema>;

const validData: TestOutput = { result: "ok", score: 0.8 };

// ── 构建 mock client 的辅助 ──────────────────────────────────────────────────

function completionResponse(content: string) {
  return { choices: [{ message: { content, reasoning_content: undefined } }] };
}

function makeClient(createFn: ReturnType<typeof vi.fn>): OpenAIClientLike {
  return { chat: { completions: { create: createFn } } };
}

// ── AC-LLM-1：首次返回合法 JSON → 直接通过 Zod 并返回 ───────────────────────

describe("AC-LLM-1: structured() with valid first response", () => {
  it("returns parsed result without retrying", async () => {
    const create = vi.fn().mockResolvedValueOnce(
      completionResponse(JSON.stringify(validData))
    );
    const provider = makeProvider(makeClient(create));

    const result = await provider.structured({
      system: "test",
      messages: [{ role: "user", content: "go" }],
      schema: testSchema,
      schemaName: "TestOutput",
    });

    expect(result).toEqual(validData);
    // Called exactly once — no retry
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("strips markdown fences before parsing", async () => {
    const create = vi.fn().mockResolvedValueOnce(
      completionResponse("```json\n" + JSON.stringify(validData) + "\n```")
    );
    const provider = makeProvider(makeClient(create));

    const result = await provider.structured({
      system: "test",
      messages: [{ role: "user", content: "go" }],
      schema: testSchema,
      schemaName: "TestOutput",
    });

    expect(result).toEqual(validData);
  });
});

// ── AC-LLM-2：首次非法 → 自动重试 → 第二次合法 → 通过 ──────────────────────

describe("AC-LLM-2: structured() retries on invalid response", () => {
  it("retries when first response fails Zod validation", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(completionResponse('{"result":"ok","score":2.0}')) // score>1 → Zod error
      .mockResolvedValueOnce(completionResponse(JSON.stringify(validData)));

    const provider = makeProvider(makeClient(create));

    const result = await provider.structured({
      system: "test",
      messages: [{ role: "user", content: "go" }],
      schema: testSchema,
      schemaName: "TestOutput",
      maxRetries: 2,
    });

    expect(result).toEqual(validData);
    expect(create).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("retries when first response is not valid JSON", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(completionResponse("not-json-at-all"))
      .mockResolvedValueOnce(completionResponse(JSON.stringify(validData)));

    const provider = makeProvider(makeClient(create));

    const result = await provider.structured({
      system: "test",
      messages: [{ role: "user", content: "go" }],
      schema: testSchema,
      schemaName: "TestOutput",
    });

    expect(result).toEqual(validData);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not exceed maxRetries call count", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(completionResponse("bad"))
      .mockResolvedValueOnce(completionResponse(JSON.stringify(validData)));

    const provider = makeProvider(makeClient(create));

    await provider.structured({
      system: "test",
      messages: [{ role: "user", content: "go" }],
      schema: testSchema,
      schemaName: "TestOutput",
      maxRetries: 1,
    });

    // maxRetries=1 means at most 2 calls total (initial + 1 retry)
    expect(create).toHaveBeenCalledTimes(2);
  });
});

// ── AC-LLM-3：耗尽重试仍失败 → 抛出带 schemaName 的明确错误 ────────────────

describe("AC-LLM-3: structured() throws after exhausting retries", () => {
  it("throws with schemaName in error message", async () => {
    const create = vi.fn().mockResolvedValue(completionResponse("bad-json"));

    const provider = makeProvider(makeClient(create));

    await expect(
      provider.structured({
        system: "test",
        messages: [{ role: "user", content: "go" }],
        schema: testSchema,
        schemaName: "TestOutput",
        maxRetries: 2,
      })
    ).rejects.toThrow(/TestOutput/);
  });

  it("makes exactly maxRetries+1 calls before throwing", async () => {
    const create = vi.fn().mockResolvedValue(completionResponse("{}"));

    const provider = makeProvider(makeClient(create));
    const maxRetries = 2;

    await expect(
      provider.structured({
        system: "test",
        messages: [{ role: "user", content: "go" }],
        schema: testSchema,
        schemaName: "TestOutput",
        maxRetries,
      })
    ).rejects.toThrow();

    expect(create).toHaveBeenCalledTimes(maxRetries + 1);
  });
});

// ── AC-LLM-4：chatStream 透传 reasoningDelta ─────────────────────────────────

describe("AC-LLM-4: chatStream() passes reasoningDelta", () => {
  it("yields delta and reasoningDelta from stream chunks", async () => {
    async function* fakeStream() {
      yield { choices: [{ delta: { content: "Hello", reasoning_content: "step1" } }] };
      yield { choices: [{ delta: { content: " world", reasoning_content: "step2" } }] };
    }

    const create = vi.fn().mockResolvedValueOnce(fakeStream());
    const provider = makeProvider(makeClient(create));

    const chunks: { delta: string; reasoningDelta?: string }[] = [];
    for await (const chunk of provider.chatStream({
      system: "test",
      messages: [{ role: "user", content: "go" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ delta: "Hello", reasoningDelta: "step1" });
    expect(chunks[1]).toEqual({ delta: " world", reasoningDelta: "step2" });
  });

  it("omits reasoningDelta when model does not return reasoning_content", async () => {
    async function* fakeStream() {
      yield { choices: [{ delta: { content: "text" } }] };
    }

    const create = vi.fn().mockResolvedValueOnce(fakeStream());
    const provider = makeProvider(makeClient(create));

    const chunks: { delta: string; reasoningDelta?: string }[] = [];
    for await (const chunk of provider.chatStream({
      system: "test",
      messages: [{ role: "user", content: "go" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks[0].delta).toBe("text");
    expect(chunks[0].reasoningDelta).toBeUndefined();
  });
});
