import type { Gesture } from './gesture';
import { GESTURES } from './gesture';

function randomGesture(): Gesture {
  return GESTURES[Math.floor(Math.random() * 3)];
}

function counterOf(g: Gesture): Gesture {
  if (g === 'グー') return 'パー';
  if (g === 'チョキ') return 'グー';
  return 'チョキ';
}

/**
 * 直前 windowSize 手のパターンから次の手を予測する。
 * 最も頻度の高い次手を返す。同数の場合はランダム選択。
 * 学習データが不足している場合は null を返す。
 */
function predictNext(history: Gesture[], windowSize: number): Gesture | null {
  if (history.length <= windowSize) return null;

  const counts: Record<string, number> = {};
  for (let i = windowSize; i < history.length; i++) {
    const pattern = history.slice(i - windowSize, i).join(',');
    const lastPattern = history.slice(history.length - windowSize).join(',');
    if (pattern === lastPattern) {
      const next = history[i];
      counts[next] = (counts[next] ?? 0) + 1;
    }
  }

  const entries = Object.entries(counts);
  if (entries.length === 0) return null;

  const maxCount = Math.max(...entries.map(([, c]) => c));
  const bests = entries.filter(([, c]) => c === maxCount).map(([g]) => g as Gesture);
  return bests[Math.floor(Math.random() * bests.length)];
}

export interface BattleAI {
  recordUserHand(g: Gesture): void;
  chooseCpuHand(): Gesture;
}

export function createBattleAI(): BattleAI {
  const history: Gesture[] = [];

  return {
    recordUserHand(g: Gesture) {
      history.push(g);
    },

    chooseCpuHand(): Gesture {
      // 直前3手→2手→1手の順でパターンを検索し、最初に予測できたものを使う
      for (const windowSize of [3, 2, 1]) {
        const predicted = predictNext(history, windowSize);
        if (predicted !== null) {
          return counterOf(predicted);
        }
      }
      // 学習データ不足のためランダム
      return randomGesture();
    },
  };
}
