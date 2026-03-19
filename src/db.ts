const DB_NAME = 'rps-trainer';
const DB_VERSION = 2;
const STORE_NAME = 'gestures';
const BATTLE_STORE = 'battles';

export interface GestureRecord {
  sessionId: string;
  timestamp: number;
  hand: 'グー' | 'チョキ' | 'パー';
  landmarks: number[][];
  stabilizationTimeMs: number;
  fingerStates: boolean[];
}

export interface BattleRecord {
  id: string;
  sessionId: string;
  timestamp: number;
  round: number;
  userHand: 'グー' | 'チョキ' | 'パー';
  cpuHand: 'グー' | 'チョキ' | 'パー';
  result: 'win' | 'lose' | 'draw';
  reactionTimeMs: number;
  /** けん〜ぽん間に収集したランドマーク列（各フレームの21点）。癖分析に使用 */
  motionLandmarks?: number[][][];
}

let dbInstance: IDBDatabase | null = null;

export async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains(BATTLE_STORE)) {
        const battleStore = db.createObjectStore(BATTLE_STORE, { keyPath: 'id' });
        battleStore.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function saveRecord(record: GestureRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

export async function getAllRecords(): Promise<GestureRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = (event) => {
      const records = (event.target as IDBRequest<GestureRecord[]>).result;
      records.sort((a, b) => a.timestamp - b.timestamp);
      resolve(records);
    };
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

export async function clearAllRecords(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

export async function saveBattleRecord(record: BattleRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BATTLE_STORE, 'readwrite');
    const store = tx.objectStore(BATTLE_STORE);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

export async function getAllBattleRecords(): Promise<BattleRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BATTLE_STORE, 'readonly');
    const store = tx.objectStore(BATTLE_STORE);
    const request = store.getAll();
    request.onsuccess = (event) => {
      const records = (event.target as IDBRequest<BattleRecord[]>).result;
      records.sort((a, b) => a.timestamp - b.timestamp);
      resolve(records);
    };
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}

export async function getBattleRecordsBySession(sessionId: string): Promise<BattleRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BATTLE_STORE, 'readonly');
    const store = tx.objectStore(BATTLE_STORE);
    const index = store.index('sessionId');
    const request = index.getAll(sessionId);
    request.onsuccess = (event) => {
      const records = (event.target as IDBRequest<BattleRecord[]>).result;
      records.sort((a, b) => a.timestamp - b.timestamp);
      resolve(records);
    };
    request.onerror = (event) => reject((event.target as IDBRequest).error);
  });
}
