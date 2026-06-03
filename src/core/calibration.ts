/**
 * Mirror / 镜 —— 置信度校准（可信三件套之一）
 *
 * 红线（AC-RL-2）：节点最终 confidence 必须由此模块计算，
 * **禁止** pipeline 直接把 rawConfidence 赋给 confidence。
 *
 * 两层机制：
 * 1. 先验规则（冷启动）：证据条数/来源多样性 → 先验上限 cap
 * 2. 在线分桶校准（CalibrationStore）：用户 confirmed/denied 的实际命中率
 *    反向映射 rawConfidence → calibrated confidence（AC-CAL-2）
 *
 * CalibrationStore 是纯内存对象，持久化由调用层（db.ts / Dexie）负责。
 * 序列化：`store.toJSON()` → IndexedDB，`new CalibrationStore(data)` 恢复。
 */

// ─── 分桶结构 ────────────────────────────────────────────────────────────────

export interface BucketData {
  confirmed: number;
  denied: number;
}

/** 校准曲线的一个数据点（供 UI 绘图）。 */
export interface CalibrationPoint {
  /** 声称置信度（桶的中心值，单调递增）。 */
  claimed: number;
  /** 实际命中率（该桶 confirmed/total，无数据时等于 claimed）。 */
  actual: number;
  /** 该桶的样本数。 */
  n: number;
}

// ─── CalibrationStore ────────────────────────────────────────────────────────

/**
 * 在线置信度校准存储器。
 *
 * 5 个桶，覆盖 [0, 0.2) [0.2, 0.4) [0.4, 0.6) [0.6, 0.8) [0.8, 1]。
 * 桶的中心值为 0.1, 0.3, 0.5, 0.7, 0.9。
 */
export class CalibrationStore {
  static readonly BOUNDARIES = [0, 0.2, 0.4, 0.6, 0.8, 1.0] as const;
  static readonly BUCKET_COUNT = 5;

  private readonly buckets: BucketData[];

  /**
   * @param initialData 从 IndexedDB 反序列化的 BucketData[]，或 undefined（冷启动）
   */
  constructor(initialData?: BucketData[]) {
    if (initialData && initialData.length === CalibrationStore.BUCKET_COUNT) {
      this.buckets = initialData.map((b) => ({ ...b }));
    } else {
      this.buckets = Array.from({ length: CalibrationStore.BUCKET_COUNT }, () => ({
        confirmed: 0,
        denied: 0,
      }));
    }
  }

  /** 找到 rawConfidence 所属的桶索引（0-4）。 */
  getBucketIndex(rawConfidence: number): number {
    const clamped = Math.max(0, Math.min(1, rawConfidence));
    for (let i = 0; i < CalibrationStore.BUCKET_COUNT - 1; i++) {
      if (clamped < CalibrationStore.BOUNDARIES[i + 1]) return i;
    }
    return CalibrationStore.BUCKET_COUNT - 1;
  }

  /**
   * 记录一次用户裁决，更新对应桶的计数。
   *
   * @param rawConfidence 该节点当时的 rawConfidence（LLM 原始自评）
   * @param isCorrect     用户 confirmed=true / denied=false
   */
  updateBucket(rawConfidence: number, isCorrect: boolean): void {
    const idx = this.getBucketIndex(rawConfidence);
    if (isCorrect) {
      this.buckets[idx].confirmed++;
    } else {
      this.buckets[idx].denied++;
    }
  }

  /**
   * 查询某 rawConfidence 对应桶的实际命中率。
   *
   * @returns 0~1 的命中率；桶尚无数据时返回 null（退回先验规则）。
   */
  getActualHitRate(rawConfidence: number): number | null {
    const idx = this.getBucketIndex(rawConfidence);
    const { confirmed, denied } = this.buckets[idx];
    const total = confirmed + denied;
    return total > 0 ? confirmed / total : null;
  }

  /**
   * 返回完整校准曲线数据（供 UI 绘制"声称置信度 vs 实际命中率"曲线）。
   *
   * claimed 值单调递增（0.1, 0.3, 0.5, 0.7, 0.9）——AC-CAL-3 要求。
   * 无数据的桶：actual = claimed（对角线——完美校准的假设值）。
   */
  getCalibrationCurve(): CalibrationPoint[] {
    return this.buckets.map((b, i) => {
      const lower = CalibrationStore.BOUNDARIES[i];
      const upper = CalibrationStore.BOUNDARIES[i + 1];
      const claimed = (lower + upper) / 2;
      const total = b.confirmed + b.denied;
      return {
        claimed,
        actual: total > 0 ? b.confirmed / total : claimed,
        n: total,
      };
    });
  }

  /** 序列化为 JSON（存入 IndexedDB）。 */
  toJSON(): BucketData[] {
    return this.buckets.map((b) => ({ ...b }));
  }
}

// ─── 先验规则（冷启动上限） ──────────────────────────────────────────────────

/**
 * 根据证据数量/来源多样性计算先验 cap。
 *
 * - 单一证据 → cap 0.6
 * - 多证据但同一来源 → cap 0.65
 * - 多证据跨 ≥2 条不同消息 → cap 0.85
 */
function getPriorCap(evidenceCount: number, uniqueSourceCount: number): number {
  if (evidenceCount <= 1) return 0.6;
  if (uniqueSourceCount <= 1) return 0.65;
  return 0.85;
}

/**
 * 从 EvidenceDraft[] 中推算 uniqueSourceCount。
 */
export function countUniqueSources(
  evidence: Array<{ sourceMessageId: string }>
): number {
  return new Set(evidence.map((e) => e.sourceMessageId)).size;
}

// ─── 主校准函数 ──────────────────────────────────────────────────────────────

/**
 * 将 LLM 原始置信度校准为最终置信度。
 *
 * 优先使用在线分桶命中率（AC-CAL-2）；无数据时退回先验规则（AC-CAL-1）。
 * 两路结果均受先验 cap 约束。
 *
 * @param rawConfidence      Inferer 给出的原始自评置信度（0~1）
 * @param evidenceCount      本条推断引用的证据条数
 * @param uniqueSourceCount  不同 sourceMessageId 的数量
 * @param store              CalibrationStore 实例（可选，无则纯先验规则）
 */
export function calibrate(
  rawConfidence: number,
  evidenceCount: number,
  uniqueSourceCount: number,
  store?: CalibrationStore
): number {
  const cap = getPriorCap(evidenceCount, uniqueSourceCount);

  if (store) {
    const hitRate = store.getActualHitRate(rawConfidence);
    if (hitRate !== null) {
      return Math.min(hitRate, cap);
    }
  }

  return Math.min(rawConfidence, cap);
}
