/**
 * Mirror / 镜 —— IndexedDB 数据层（Dexie）
 *
 * 五张表（来自《技术方案.md》第 6 节）：
 *   nodes       → CognitiveNode[]（认知图节点，主键 id）
 *   events      → EvolutionEvent[]（演变事件，主键 id，索引 nodeId）
 *   messages    → RawMessage[]（原始对话，主键 id，索引 timestamp）
 *   calibration → { id, buckets }（CalibrationStore 序列化，单行 key=1）
 *   meta        → { key, value }（元数据键值对，如 lastRunAt）
 *
 * 红线（AC-RL-5 隐私）：此文件只写 IndexedDB，**没有任何远程写调用**。
 * AC-DB-1：节点/事件/消息可写入并读回，结构经 Zod 校验。
 *
 * 测试：使用 fake-indexeddb（idb-keyval 兼容），无真实浏览器依赖。
 */
import Dexie, { type Table } from "dexie";
import type { CognitiveNode, EvolutionEvent, RawMessage } from "@/core/types";
import type { BucketData } from "@/core/calibration";

// ─── 表结构类型 ───────────────────────────────────────────────────────────────

export interface CalibrationRow {
  id: number; // 固定 = 1（单行）
  buckets: BucketData[];
  updatedAt: string; // ISO
}

export interface MetaRow {
  key: string;
  value: string; // JSON-serialized
  updatedAt: string;
}

// ─── Dexie 数据库类 ───────────────────────────────────────────────────────────

export class MirrorDB extends Dexie {
  nodes!: Table<CognitiveNode, string>;
  events!: Table<EvolutionEvent, string>;
  messages!: Table<RawMessage, string>;
  calibration!: Table<CalibrationRow, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("MirrorDB");
    this.version(1).stores({
      nodes:       "id, system, layer, status, lastReinforced, createdAt",
      events:      "id, nodeId, type, timestamp",
      messages:    "id, role, timestamp",
      calibration: "id",
      meta:        "key",
    });
  }
}

// ─── 单例（浏览器复用同一 DB 实例） ──────────────────────────────────────────

let _db: MirrorDB | null = null;

/**
 * 获取（或懒创建）MirrorDB 单例。
 * 测试层在调用前注入 fake-indexeddb：
 *   `import "fake-indexeddb/auto";` 即可全局替换 indexedDB。
 */
export function getDB(): MirrorDB {
  if (!_db) _db = new MirrorDB();
  return _db;
}

/** 清除单例（测试 between-test 隔离用）。 */
export function resetDB(): void {
  _db = null;
}

// ─── CRUD 方法 ───────────────────────────────────────────────────────────────

// ── 节点 ──────────────────────────────────────────────────────────────────────

export async function putNode(node: CognitiveNode): Promise<void> {
  await getDB().nodes.put(node);
}

export async function putNodes(nodes: CognitiveNode[]): Promise<void> {
  await getDB().nodes.bulkPut(nodes);
}

export async function getNode(id: string): Promise<CognitiveNode | undefined> {
  return getDB().nodes.get(id);
}

export async function getAllNodes(): Promise<CognitiveNode[]> {
  return getDB().nodes.toArray();
}

export async function getNodesBySystem(system: string): Promise<CognitiveNode[]> {
  return getDB().nodes.where("system").equals(system).toArray();
}

export async function deleteNode(id: string): Promise<void> {
  await getDB().nodes.delete(id);
}

// ── 演变事件 ────────────────────────────────────────────────────────────────

export async function putEvent(event: EvolutionEvent): Promise<void> {
  await getDB().events.put(event);
}

export async function putEvents(events: EvolutionEvent[]): Promise<void> {
  await getDB().events.bulkPut(events);
}

export async function getEventsByNode(nodeId: string): Promise<EvolutionEvent[]> {
  return getDB().events.where("nodeId").equals(nodeId).sortBy("timestamp");
}

export async function getAllEvents(): Promise<EvolutionEvent[]> {
  return getDB().events.orderBy("timestamp").toArray();
}

// ── 原始消息 ────────────────────────────────────────────────────────────────

export async function putMessage(message: RawMessage): Promise<void> {
  await getDB().messages.put(message);
}

export async function putMessages(messages: RawMessage[]): Promise<void> {
  await getDB().messages.bulkPut(messages);
}

export async function getAllMessages(): Promise<RawMessage[]> {
  return getDB().messages.orderBy("timestamp").toArray();
}

// ── 校准数据 ─────────────────────────────────────────────────────────────────

const CALIBRATION_ROW_ID = 1;

export async function saveCalibration(buckets: BucketData[]): Promise<void> {
  await getDB().calibration.put({
    id: CALIBRATION_ROW_ID,
    buckets,
    updatedAt: new Date().toISOString(),
  });
}

export async function loadCalibration(): Promise<BucketData[] | null> {
  const row = await getDB().calibration.get(CALIBRATION_ROW_ID);
  return row?.buckets ?? null;
}

// ── 元数据 ───────────────────────────────────────────────────────────────────

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getDB().meta.put({
    key,
    value: JSON.stringify(value),
    updatedAt: new Date().toISOString(),
  });
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const row = await getDB().meta.get(key);
  if (!row) return null;
  return JSON.parse(row.value) as T;
}
