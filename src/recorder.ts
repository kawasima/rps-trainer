import { saveRecord, type GestureRecord } from './db';
import type { Gesture } from './gesture';

interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export interface Recorder {
  startSession(): void;
  stopSession(): void;
  readonly recording: boolean;
  /** フレームごとに現在の手の状態を更新する（記録はしない） */
  updateFrame(gesture: Gesture | null, landmarks: Landmark[], fingerStates: boolean[]): void;
  /** 「ぽん」のタイミングで呼ぶ。現在のジェスチャーを記録する */
  captureNow(): Promise<Gesture | null>;
}

export function createRecorder(): Recorder {
  let sessionId: string | null = null;
  let isRecording = false;

  // 現在フレームのスナップショット
  let currentGesture: Gesture | null = null;
  let currentLandmarks: Landmark[] = [];
  let currentFingerStates: boolean[] = [];
  let lastCaptureTime = 0;

  return {
    startSession() {
      sessionId = crypto.randomUUID();
      isRecording = true;
      currentGesture = null;
      lastCaptureTime = 0;
    },

    stopSession() {
      isRecording = false;
      sessionId = null;
      currentGesture = null;
    },

    get recording() {
      return isRecording;
    },

    updateFrame(gesture, landmarks, fingerStates) {
      currentGesture = gesture;
      currentLandmarks = landmarks;
      currentFingerStates = fingerStates;
    },

    async captureNow() {
      if (!isRecording || currentGesture == null) return null;

      // 連打防止: 500ms以内の再キャプチャは無視
      const now = Date.now();
      if (now - lastCaptureTime < 500) return null;
      lastCaptureTime = now;

      const record: GestureRecord = {
        sessionId: sessionId!,
        timestamp: now,
        hand: currentGesture,
        landmarks: currentLandmarks.map(l => [l.x, l.y, l.z ?? 0]),
        stabilizationTimeMs: 0,
        fingerStates: [...currentFingerStates],
      };
      await saveRecord(record);
      return currentGesture;
    },
  };
}
