import type {
  LLMProvider,
  ChatRequest,
  ChatResult,
  ChatStreamChunk,
  StructuredRequest,
} from "@/core/llm/provider";

export interface MockFixture {
  /** Raw object that will be returned (will be Zod-parsed by structured()) */
  data: unknown;
}

/**
 * Deterministic LLM mock for unit and integration tests.
 * structured() returns pre-registered fixtures keyed by schemaName.
 * Use `failTimes` to simulate transient failures (testing retry logic).
 */
export class MockLLMProvider implements LLMProvider {
  readonly id = "mock";

  private fixtures = new Map<string, MockFixture>();
  private failCounts = new Map<string, number>();
  public callLog: { method: string; schemaName?: string }[] = [];

  registerFixture(schemaName: string, data: unknown): this {
    this.fixtures.set(schemaName, { data });
    return this;
  }

  /** Make the next N calls to structured(schemaName) throw, then succeed. */
  setFailTimes(schemaName: string, times: number): this {
    this.failCounts.set(schemaName, times);
    return this;
  }

  async chat(_req: ChatRequest): Promise<ChatResult> {
    this.callLog.push({ method: "chat" });
    return { text: "mock response" };
  }

  async *chatStream(_req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    this.callLog.push({ method: "chatStream" });
    yield { delta: "mock ", reasoningDelta: "mock reasoning " };
    yield { delta: "stream", reasoningDelta: "stream" };
  }

  async structured<T>(req: StructuredRequest<T>): Promise<T> {
    this.callLog.push({ method: "structured", schemaName: req.schemaName });

    const remaining = this.failCounts.get(req.schemaName) ?? 0;
    if (remaining > 0) {
      this.failCounts.set(req.schemaName, remaining - 1);
      // Return invalid JSON to trigger retry logic in the adapter under test
      throw new Error(`MockLLMProvider: simulated failure for ${req.schemaName}`);
    }

    const fixture = this.fixtures.get(req.schemaName);
    if (!fixture) {
      throw new Error(
        `MockLLMProvider: no fixture registered for schemaName "${req.schemaName}". ` +
          `Call provider.registerFixture("${req.schemaName}", data) in your test setup.`
      );
    }

    return req.schema.parse(fixture.data) as T;
  }
}
