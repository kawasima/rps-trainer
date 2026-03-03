// MediaPipe 21-point landmark indices
// WRIST=0
// THUMB: CMC=1, MCP=2, IP=3, TIP=4
// INDEX: MCP=5, PIP=6, DIP=7, TIP=8
// MIDDLE: MCP=9, PIP=10, DIP=11, TIP=12
// RING: MCP=13, PIP=14, DIP=15, TIP=16
// PINKY: MCP=17, PIP=18, DIP=19, TIP=20

export type Gesture = 'グー' | 'チョキ' | 'パー';
export const GESTURES = ['グー', 'チョキ', 'パー'] as const;
export const GESTURE_COLORS = ['rgba(231, 76, 60, 0.7)', 'rgba(52, 152, 219, 0.7)', 'rgba(46, 204, 113, 0.7)'] as const;
export const GESTURE_BORDER_COLORS = ['rgb(231, 76, 60)', 'rgb(52, 152, 219)', 'rgb(46, 204, 113)'] as const;

/** BattleView でのランドマーク収集間隔 (ms) — TimingAnalysis でも参照 */
export const MOTION_INTERVAL_MS = 50;

interface Landmark {
  x: number;
  y: number;
  z?: number;
}

function distance(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 指が「伸びている」かどうかを判定する。
 *
 * 判定方法: tip の y座標が PIP の y座標より「上」（画面上方 = 小さい値）にあること。
 * MediaPipe の座標系では y は画面下向きに増加するため、
 * tip.y < pip.y なら指先が関節より上 = 伸びている。
 *
 * さらに「tip が MCP より明らかに遠い」距離条件もANDで組み合わせることで
 * 斜め向きのときの誤判定を減らす。
 */
function isFingerExtended(
  mcp: Landmark, pip: Landmark, tip: Landmark
): boolean {
  // 条件1: tipがpipより画面上方にある（y座標が小さい）
  const tipAbovePip = tip.y < pip.y;
  // 条件2: MCP→tip距離 が MCP→PIP距離より長い（指が折れていない）
  const stretched = distance(mcp, tip) > distance(mcp, pip);
  return tipAbovePip && stretched;
}

export function classifyFingerStates(landmarks: Landmark[]): boolean[] {
  // 親指: 横方向の距離で判定（左右どちらの手でも機能するようにする）
  const thumbTipLateral = Math.abs(landmarks[4].x - landmarks[2].x);
  const thumbIPLateral = Math.abs(landmarks[3].x - landmarks[2].x);
  const thumbOpen = thumbTipLateral > thumbIPLateral * 1.2;

  const indexOpen  = isFingerExtended(landmarks[5],  landmarks[6],  landmarks[8]);
  const middleOpen = isFingerExtended(landmarks[9],  landmarks[10], landmarks[12]);
  const ringOpen   = isFingerExtended(landmarks[13], landmarks[14], landmarks[16]);
  const pinkyOpen  = isFingerExtended(landmarks[17], landmarks[18], landmarks[20]);

  return [thumbOpen, indexOpen, middleOpen, ringOpen, pinkyOpen];
}

export function classifyGesture(fingerStates: boolean[]): Gesture | null {
  const [, index, middle, ring, pinky] = fingerStates;

  const allClosed = !index && !middle && !ring && !pinky;
  const allOpen   = index && middle && ring && pinky;

  if (allClosed) return 'グー';
  if (allOpen)   return 'パー';

  // チョキ: 人差し指と中指が伸びており、薬指と小指が折れている
  if (index && middle && !ring && !pinky) return 'チョキ';

  return null;
}

export interface Stabilizer {
  push(gesture: Gesture | null): void;
  getStable(): Gesture | null;
  reset(): void;
}

export function createStabilizer(windowSize = 5): Stabilizer {
  const buffer: (Gesture | null)[] = [];

  return {
    push(gesture) {
      buffer.push(gesture);
      if (buffer.length > windowSize) {
        buffer.shift();
      }
    },

    getStable() {
      if (buffer.length < windowSize) return null;

      const counts: Record<string, number> = {};
      for (const g of buffer) {
        if (g != null) {
          counts[g] = (counts[g] ?? 0) + 1;
        }
      }

      const threshold = Math.ceil(windowSize / 2);
      for (const [gesture, count] of Object.entries(counts)) {
        if (count >= threshold) {
          return gesture as Gesture;
        }
      }
      return null;
    },

    reset() {
      buffer.length = 0;
    },
  };
}
