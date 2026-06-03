/**
 * Schema smoke tests — AC-DM-1 & AC-DM-2
 * Covers: all core schemas parse valid samples; reject invalid inputs.
 */
import { describe, it, expect } from "vitest";
import {
  cognitiveNodeSchema,
  evolutionEventSchema,
  activeQuestionSchema,
  cognitiveGraphSchema,
  observerOutputSchema,
  infererOutputSchema,
  skepticOutputSchema,
  reconcilerOutputSchema,
  reflectorOutputSchema,
  evidenceSchema,
  rawMessageSchema,
} from "@/core/schemas";
import { observerOutputFixture } from "./fixtures/observer";
import { infererOutputFixture } from "./fixtures/inferer";
import { skepticOutputFixture } from "./fixtures/skeptic";
import { reconcilerOutputFixture } from "./fixtures/reconciler";
import { reflectorOutputFixture } from "./fixtures/reflector";
import { seedGraphFixture } from "./fixtures/seed-graph";

// ── AC-DM-1: all schemas parse valid samples ──────────────────────────────────

describe("AC-DM-1: schemas parse valid samples", () => {
  it("parses a valid CognitiveNode (inference)", () => {
    const node = seedGraphFixture.nodes[0];
    expect(() => cognitiveNodeSchema.parse(node)).not.toThrow();
  });

  it("parses a valid CognitiveNode (fact)", () => {
    const factNode = seedGraphFixture.nodes[2];
    expect(() => cognitiveNodeSchema.parse(factNode)).not.toThrow();
  });

  it("parses a valid EvolutionEvent", () => {
    expect(() =>
      evolutionEventSchema.parse(seedGraphFixture.events[0])
    ).not.toThrow();
  });

  it("parses a valid ActiveQuestion", () => {
    expect(() =>
      activeQuestionSchema.parse(seedGraphFixture.questions[0])
    ).not.toThrow();
  });

  it("parses a valid CognitiveGraph", () => {
    expect(() => cognitiveGraphSchema.parse(seedGraphFixture)).not.toThrow();
  });

  it("parses valid ObserverOutput", () => {
    expect(() => observerOutputSchema.parse(observerOutputFixture)).not.toThrow();
  });

  it("parses valid InfererOutput", () => {
    expect(() => infererOutputSchema.parse(infererOutputFixture)).not.toThrow();
  });

  it("parses valid SkepticOutput", () => {
    expect(() => skepticOutputSchema.parse(skepticOutputFixture)).not.toThrow();
  });

  it("parses valid ReconcilerOutput", () => {
    expect(() =>
      reconcilerOutputSchema.parse(reconcilerOutputFixture)
    ).not.toThrow();
  });

  it("parses valid ReflectorOutput", () => {
    expect(() =>
      reflectorOutputSchema.parse(reflectorOutputFixture)
    ).not.toThrow();
  });

  it("parses valid Evidence", () => {
    expect(() =>
      evidenceSchema.parse(seedGraphFixture.nodes[0].evidence[0])
    ).not.toThrow();
  });

  it("parses valid RawMessage", () => {
    expect(() =>
      rawMessageSchema.parse(seedGraphFixture.rawMessages[0])
    ).not.toThrow();
  });
});

// ── AC-DM-2: schemas reject invalid inputs ────────────────────────────────────

describe("AC-DM-2: schemas reject invalid inputs", () => {
  it("rejects confidence > 1", () => {
    const bad = { ...seedGraphFixture.nodes[0], confidence: 1.5 };
    expect(() => cognitiveNodeSchema.parse(bad)).toThrow();
  });

  it("rejects confidence < 0", () => {
    const bad = { ...seedGraphFixture.nodes[0], confidence: -0.1 };
    expect(() => cognitiveNodeSchema.parse(bad)).toThrow();
  });

  it("rejects inference node with empty evidence array", () => {
    const bad = { ...seedGraphFixture.nodes[0], evidence: [] };
    // cognitiveNodeSchema allows empty for fact; but we test via infererOutputSchema
    // which requires evidence.min(1) in inferredNodeDraftSchema
    const badInferer = {
      inferences: [{ ...infererOutputFixture.inferences[0], evidence: [] }],
    };
    expect(() => infererOutputSchema.parse(badInferer)).toThrow();
  });

  it("rejects unknown system value", () => {
    const bad = { ...seedGraphFixture.nodes[0], system: "unknown_system" };
    expect(() => cognitiveNodeSchema.parse(bad)).toThrow();
  });

  it("rejects missing required field (statement)", () => {
    const { statement: _omit, ...bad } = seedGraphFixture.nodes[0] as Record<string, unknown>;
    expect(() => cognitiveNodeSchema.parse(bad)).toThrow();
  });

  it("rejects rawConfidence > 1", () => {
    const bad = { ...seedGraphFixture.nodes[0], rawConfidence: 1.1 };
    expect(() => cognitiveNodeSchema.parse(bad)).toThrow();
  });

  it("rejects empty statement string", () => {
    const bad = { ...seedGraphFixture.nodes[0], statement: "" };
    expect(() => cognitiveNodeSchema.parse(bad)).toThrow();
  });

  it("rejects invalid layer value", () => {
    const bad = { ...seedGraphFixture.nodes[0], layer: "evolution" };
    // cognitiveNodeSchema.layer only allows 'fact' | 'inference'
    expect(() => cognitiveNodeSchema.parse(bad)).toThrow();
  });

  it("rejects invalid status value", () => {
    const bad = { ...seedGraphFixture.nodes[0], status: "ghost" };
    expect(() => cognitiveNodeSchema.parse(bad)).toThrow();
  });

  it("rejects invalid userVerdict value", () => {
    const bad = { ...seedGraphFixture.nodes[0], userVerdict: "maybe" };
    expect(() => cognitiveNodeSchema.parse(bad)).toThrow();
  });

  it("rejects SkepticOutput with negative targetIndex", () => {
    const bad = {
      judgments: [{ ...skepticOutputFixture.judgments[0], targetIndex: -1 }],
    };
    expect(() => skepticOutputSchema.parse(bad)).toThrow();
  });
});

// ── AC-DM-2 extra: userVerdict nullable works correctly ──────────────────────

describe("userVerdict nullable behavior", () => {
  it("accepts null userVerdict", () => {
    const node = { ...seedGraphFixture.nodes[0], userVerdict: null };
    expect(() => cognitiveNodeSchema.parse(node)).not.toThrow();
  });

  it("accepts 'confirmed' userVerdict", () => {
    const node = { ...seedGraphFixture.nodes[0], userVerdict: "confirmed" };
    expect(() => cognitiveNodeSchema.parse(node)).not.toThrow();
  });

  it("accepts 'denied' userVerdict", () => {
    const node = { ...seedGraphFixture.nodes[0], userVerdict: "denied" };
    expect(() => cognitiveNodeSchema.parse(node)).not.toThrow();
  });

  it("accepts 'dont_guess' userVerdict", () => {
    const node = { ...seedGraphFixture.nodes[0], userVerdict: "dont_guess" };
    expect(() => cognitiveNodeSchema.parse(node)).not.toThrow();
  });
});
