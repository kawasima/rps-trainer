import * as tf from '@tensorflow/tfjs';

import type { Gesture } from './gesture';
export type { Gesture };
export const GESTURE_LABELS: Gesture[] = ['グー', 'チョキ', 'パー'];
const MODEL_STORAGE_KEY = 'indexeddb://rps-gesture-model';
const INPUT_SIZE = 63; // 21点 × 3座標

let model: tf.Sequential | null = null;

/** ランドマーク配列 (21×{x,y,z}) を正規化して63次元のFloat32Arrayに変換 */
export function landmarksToFeature(
  landmarks: Array<{ x: number; y: number; z?: number }>
): Float32Array {
  const raw = new Float32Array(INPUT_SIZE);
  for (let i = 0; i < 21; i++) {
    raw[i * 3]     = landmarks[i].x;
    raw[i * 3 + 1] = landmarks[i].y;
    raw[i * 3 + 2] = landmarks[i].z ?? 0;
  }

  // 手首(0)を原点にして相対座標化し、手のスケールで正規化する
  const wx = raw[0], wy = raw[1], wz = raw[2];
  for (let i = 0; i < 21; i++) {
    raw[i * 3]     -= wx;
    raw[i * 3 + 1] -= wy;
    raw[i * 3 + 2] -= wz;
  }
  // 中指MCPまでの距離をスケール基準にする
  const scale = Math.sqrt(raw[9 * 3] ** 2 + raw[9 * 3 + 1] ** 2 + raw[9 * 3 + 2] ** 2) || 1;
  for (let i = 0; i < INPUT_SIZE; i++) {
    raw[i] /= scale;
  }
  return raw;
}

function buildModel(): tf.Sequential {
  const m = tf.sequential();
  m.add(tf.layers.dense({ inputShape: [INPUT_SIZE], units: 64, activation: 'relu' }));
  m.add(tf.layers.dropout({ rate: 0.3 }));
  m.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  m.add(tf.layers.dense({ units: 3, activation: 'softmax' }));
  m.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });
  return m;
}

export interface TrainingSample {
  feature: Float32Array;
  label: number; // 0=グー, 1=チョキ, 2=パー
}

export async function trainModel(
  samples: TrainingSample[],
  onEpochEnd?: (epoch: number, logs: tf.Logs) => void
): Promise<{ accuracy: number }> {
  model = buildModel();

  const xs = tf.tensor2d(
    samples.map(s => Array.from(s.feature)),
    [samples.length, INPUT_SIZE]
  );
  const ys = tf.oneHot(
    tf.tensor1d(samples.map(s => s.label), 'int32'),
    3
  );

  let finalAcc = 0;
  await model.fit(xs, ys, {
    epochs: 80,
    batchSize: 16,
    shuffle: true,
    validationSplit: 0.1,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (logs) {
          finalAcc = (logs['val_acc'] ?? logs['acc'] ?? 0) as number;
          onEpochEnd?.(epoch, logs);
        }
      },
    },
  });

  xs.dispose();
  ys.dispose();

  await model.save(MODEL_STORAGE_KEY);
  return { accuracy: finalAcc };
}

/** 推論: 最も確率の高いジェスチャーと信頼度を返す。confidenceが閾値未満なら null */
export function predict(
  landmarks: Array<{ x: number; y: number; z?: number }>,
  confidenceThreshold = 0.6
): { gesture: Gesture; confidence: number } | null {
  if (!model) return null;

  const feature = landmarksToFeature(landmarks);
  const input = tf.tensor2d([Array.from(feature)], [1, INPUT_SIZE]);
  const probs = model.predict(input) as tf.Tensor;
  const probsData = probs.dataSync();
  input.dispose();
  probs.dispose();

  let maxIdx = 0;
  for (let i = 1; i < 3; i++) {
    if (probsData[i] > probsData[maxIdx]) maxIdx = i;
  }
  const confidence = probsData[maxIdx];
  if (confidence < confidenceThreshold) return null;
  return { gesture: GESTURE_LABELS[maxIdx], confidence };
}

/** 保存済みモデルをロード。なければ null を返す */
export async function loadModel(): Promise<boolean> {
  try {
    model = await tf.loadLayersModel(MODEL_STORAGE_KEY) as tf.Sequential;
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
    return true;
  } catch {
    return false;
  }
}

export function isModelReady(): boolean {
  return model !== null;
}

/** 追加サンプルでファインチューニング（学習済みモデルに追加学習） */
export async function fineTune(samples: TrainingSample[]): Promise<void> {
  if (!model || samples.length === 0) return;

  const xs = tf.tensor2d(
    samples.map(s => Array.from(s.feature)),
    [samples.length, INPUT_SIZE]
  );
  const ys = tf.oneHot(
    tf.tensor1d(samples.map(s => s.label), 'int32'),
    3
  );

  await model.fit(xs, ys, { epochs: 20, batchSize: 8, shuffle: true });
  xs.dispose();
  ys.dispose();
  await model.save(MODEL_STORAGE_KEY);
}
