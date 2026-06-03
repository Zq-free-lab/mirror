/**
 * 校准模块测试 — AC-CAL-1 / AC-CAL-2 / AC-CAL-3
 *
 * AC-CAL-1：先验规则生效——单一证据节点 confidence ≤ 0.6；跨 ≥2 时间点多证据可 > 0.6。
 * AC-CAL-2：在线校准——喂入"某桶命中率 40%"，rawConfidence 被映射到 ≈0.4。
 * AC-CAL-3：getCalibrationCurve() 返回单调、可绘制的 (claimed, actual) 序列。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  CalibrationStore,
  calibrate,
  countUniqueSources,
} from "@/core/calibration";

// ── AC-CAL-1：先验规则 ───────────────────────────────────────────────────────

describe("AC-CAL-1: Prior rules cap confidence correctly", () => {
  it("single evidence → confidence ≤ 0.6 even if rawConfidence is high", () => {
    const result = calibrate(0.9, 1, 1);
    expect(result).toBeLessThanOrEqual(0.6);
  });

  it("single evidence → caps to rawConfidence if already below 0.6", () => {
    const result = calibrate(0.4, 1, 1);
    expect(result).toBe(0.4);
  });

  it("multi evidence same source → confidence ≤ 0.65", () => {
    const result = calibrate(0.9, 3, 1);
    expect(result).toBeLessThanOrEqual(0.65);
  });

  it("multi evidence cross ≥2 sources → confidence ≤ 0.85", () => {
    const result = calibrate(0.9, 3, 2);
    expect(result).toBeLessThanOrEqual(0.85);
  });

  it("multi evidence cross ≥2 sources → confidence can exceed 0.6", () => {
    const result = calibrate(0.75, 3, 2);
    expect(result).toBeGreaterThan(0.6);
  });

  it("result is always ≤ rawConfidence (prior only compresses, never inflates)", () => {
    const cases = [
      [0.9, 1, 1],
      [0.5, 2, 1],
      [0.8, 4, 3],
    ] as const;
    for (const [raw, evCount, srcCount] of cases) {
      const result = calibrate(raw, evCount, srcCount);
      expect(result).toBeLessThanOrEqual(raw + 1e-9);
    }
  });
});

// ── AC-CAL-2：在线分桶校准 ──────────────────────────────────────────────────

describe("AC-CAL-2: Online calibration maps rawConfidence to actual hit rate", () => {
  let store: CalibrationStore;

  beforeEach(() => {
    store = new CalibrationStore();
  });

  it("with no data, falls back to prior rules", () => {
    const result = calibrate(0.7, 2, 2, store);
    expect(result).toBeLessThanOrEqual(0.85); // prior cap for 2+ sources
    expect(result).toBe(calibrate(0.7, 2, 2)); // same as without store
  });

  it("bucket with 40% hit rate → calibrated confidence ≈ 0.4 (AC-CAL-2)", () => {
    // 桶 [0.6-0.8)：3 confirmed, 7 denied → 30%... let's do 4 confirmed 6 denied = 40%
    for (let i = 0; i < 4; i++) store.updateBucket(0.7, true);
    for (let i = 0; i < 6; i++) store.updateBucket(0.7, false);

    const result = calibrate(0.7, 2, 2, store);

    // 实际命中率 = 4/10 = 0.4，先验 cap=0.85，min(0.4, 0.85) = 0.4
    expect(result).toBeCloseTo(0.4, 2);
  });

  it("100% hit rate bucket → calibrated = min(1.0, prior_cap)", () => {
    for (let i = 0; i < 5; i++) store.updateBucket(0.5, true);

    const result = calibrate(0.5, 2, 2, store);

    // hit rate=1.0, cap=0.85 → min(1.0, 0.85)=0.85
    expect(result).toBeCloseTo(0.85, 2);
  });

  it("0% hit rate bucket → calibrated = 0.0", () => {
    for (let i = 0; i < 5; i++) store.updateBucket(0.5, false);

    const result = calibrate(0.5, 2, 2, store);

    expect(result).toBeCloseTo(0.0, 2);
  });

  it("prior rule still caps even when hit rate is high", () => {
    // single evidence (cap=0.6) + bucket has 100% hit rate
    for (let i = 0; i < 5; i++) store.updateBucket(0.7, true);

    const result = calibrate(0.7, 1, 1, store);

    expect(result).toBeLessThanOrEqual(0.6);
  });

  it("different rawConfidence values in the same bucket get the same hit rate", () => {
    for (let i = 0; i < 3; i++) store.updateBucket(0.65, true);
    for (let i = 0; i < 7; i++) store.updateBucket(0.65, false);

    const r1 = calibrate(0.61, 2, 2, store);
    const r2 = calibrate(0.79, 2, 2, store);

    expect(r1).toBeCloseTo(0.3, 2);
    expect(r2).toBeCloseTo(0.3, 2);
  });
});

// ── AC-CAL-3：校准曲线 ───────────────────────────────────────────────────────

describe("AC-CAL-3: getCalibrationCurve returns monotonic, drawable sequence", () => {
  it("returns 5 data points (one per bucket)", () => {
    const store = new CalibrationStore();
    const curve = store.getCalibrationCurve();
    expect(curve).toHaveLength(5);
  });

  it("claimed values are strictly monotonically increasing", () => {
    const store = new CalibrationStore();
    const curve = store.getCalibrationCurve();
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].claimed).toBeGreaterThan(curve[i - 1].claimed);
    }
  });

  it("claimed midpoints are 0.1, 0.3, 0.5, 0.7, 0.9", () => {
    const store = new CalibrationStore();
    const curve = store.getCalibrationCurve();
    const expected = [0.1, 0.3, 0.5, 0.7, 0.9];
    curve.forEach((pt, i) => {
      expect(pt.claimed).toBeCloseTo(expected[i], 5);
    });
  });

  it("actual values are in [0, 1]", () => {
    const store = new CalibrationStore();
    for (let i = 0; i < 3; i++) store.updateBucket(0.3, true);
    for (let i = 0; i < 7; i++) store.updateBucket(0.3, false);

    const curve = store.getCalibrationCurve();
    for (const pt of curve) {
      expect(pt.actual).toBeGreaterThanOrEqual(0);
      expect(pt.actual).toBeLessThanOrEqual(1);
    }
  });

  it("n reflects correct sample count per bucket", () => {
    const store = new CalibrationStore();
    for (let i = 0; i < 4; i++) store.updateBucket(0.7, true);
    for (let i = 0; i < 6; i++) store.updateBucket(0.7, false);

    const curve = store.getCalibrationCurve();
    const bucketIdx = 3; // [0.6-0.8) is bucket 3
    expect(curve[bucketIdx].n).toBe(10);
  });

  it("no-data buckets fall on diagonal (actual = claimed)", () => {
    const store = new CalibrationStore();
    const curve = store.getCalibrationCurve();
    for (const pt of curve) {
      expect(pt.actual).toBeCloseTo(pt.claimed, 5);
      expect(pt.n).toBe(0);
    }
  });

  it("actual hits updated bucket correctly in curve", () => {
    const store = new CalibrationStore();
    for (let i = 0; i < 4; i++) store.updateBucket(0.1, true);
    for (let i = 0; i < 6; i++) store.updateBucket(0.1, false);

    const curve = store.getCalibrationCurve();
    expect(curve[0].actual).toBeCloseTo(0.4, 2); // bucket [0-0.2), 4/10
  });
});

// ── CalibrationStore 序列化 / 反序列化 ──────────────────────────────────────

describe("CalibrationStore serialization", () => {
  it("toJSON returns array of BucketData", () => {
    const store = new CalibrationStore();
    store.updateBucket(0.5, true);
    const data = store.toJSON();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(CalibrationStore.BUCKET_COUNT);
  });

  it("new CalibrationStore(data) restores state", () => {
    const original = new CalibrationStore();
    for (let i = 0; i < 3; i++) original.updateBucket(0.7, true);
    for (let i = 0; i < 2; i++) original.updateBucket(0.7, false);

    const restored = new CalibrationStore(original.toJSON());
    const hit = restored.getActualHitRate(0.7);
    expect(hit).toBeCloseTo(3 / 5, 5);
  });

  it("serialization round-trip preserves all bucket counts", () => {
    const original = new CalibrationStore();
    original.updateBucket(0.1, true);
    original.updateBucket(0.3, false);
    original.updateBucket(0.5, true);
    original.updateBucket(0.7, false);
    original.updateBucket(0.9, true);

    const restored = new CalibrationStore(original.toJSON());
    const curve = restored.getCalibrationCurve();
    for (const pt of curve) {
      expect(pt.n).toBe(1);
    }
  });
});

// ── countUniqueSources 工具函数 ──────────────────────────────────────────────

describe("countUniqueSources", () => {
  it("counts unique sourceMessageIds", () => {
    const evidence = [
      { sourceMessageId: "msg-001", quote: "a" },
      { sourceMessageId: "msg-002", quote: "b" },
      { sourceMessageId: "msg-001", quote: "c" },
    ];
    expect(countUniqueSources(evidence)).toBe(2);
  });

  it("returns 1 for all same source", () => {
    const evidence = [
      { sourceMessageId: "msg-001", quote: "a" },
      { sourceMessageId: "msg-001", quote: "b" },
    ];
    expect(countUniqueSources(evidence)).toBe(1);
  });

  it("returns 0 for empty evidence", () => {
    expect(countUniqueSources([])).toBe(0);
  });
});
