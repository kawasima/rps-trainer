import { useState, useCallback, useRef } from 'react';
import {
  GESTURE_LABELS,
  landmarksToFeature,
  trainModel,
  type TrainingSample,
} from './classifier';
import type { Gesture } from './gesture';

const SAMPLES_PER_CLASS = 20; // 各ジェスチャー何サンプル集めるか

interface Props {
  /** 現在のカメラフレームのランドマーク（App から渡される） */
  currentLandmarks: Array<{ x: number; y: number; z?: number }> | null;
  currentGesture: Gesture | null;
  onTrainingComplete: () => void;
  onBack: () => void;
}

type Phase = 'collect' | 'training' | 'done';

export default function TrainingView({
  currentLandmarks,
  currentGesture,
  onTrainingComplete,
  onBack,
}: Props) {
  const [samples, setSamples] = useState<TrainingSample[]>([]);
  const [phase, setPhase] = useState<Phase>('collect');
  const [trainProgress, setTrainProgress] = useState(0);
  const [trainAccuracy, setTrainAccuracy] = useState<number | null>(null);
  const [flashLabel, setFlashLabel] = useState<Gesture | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ジェスチャー別のサンプル数
  const counts = GESTURE_LABELS.reduce<Record<string, number>>((acc, g) => {
    acc[g] = samples.filter(s => s.label === GESTURE_LABELS.indexOf(g as Gesture)).length;
    return acc;
  }, {});

  const minCount = Math.min(...GESTURE_LABELS.map(g => counts[g] ?? 0));
  const canTrain = GESTURE_LABELS.every(g => (counts[g] ?? 0) >= SAMPLES_PER_CLASS);

  const handleCapture = useCallback((targetLabel: Gesture) => {
    if (!currentLandmarks) return;
    const feature = landmarksToFeature(currentLandmarks);
    const label = GESTURE_LABELS.indexOf(targetLabel);
    setSamples(prev => [...prev, { feature, label }]);

    setFlashLabel(targetLabel);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashLabel(null), 400);
  }, [currentLandmarks]);

  const handleTrain = useCallback(async () => {
    setPhase('training');
    setTrainProgress(0);
    const EPOCHS = 80;
    const { accuracy } = await trainModel(samples, (epoch) => {
      setTrainProgress(Math.round(((epoch + 1) / EPOCHS) * 100));
    });
    setTrainAccuracy(accuracy);
    setPhase('done');
  }, [samples]);

  const handleReset = useCallback(() => {
    setSamples([]);
    setPhase('collect');
    setTrainProgress(0);
    setTrainAccuracy(null);
  }, []);

  if (phase === 'training') {
    return (
      <div className="training-view">
        <h2>学習中...</h2>
        <div className="train-progress-bar">
          <div className="train-progress-fill" style={{ width: `${trainProgress}%` }} />
        </div>
        <p>{trainProgress}%</p>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="training-view">
        <h2>学習完了！</h2>
        {trainAccuracy !== null && (
          <p className="train-accuracy">
            検証精度: <strong>{(trainAccuracy * 100).toFixed(1)}%</strong>
          </p>
        )}
        <div className="training-buttons">
          <button className="btn btn-primary" onClick={onTrainingComplete}>
            認識を開始する
          </button>
          <button className="btn btn-secondary" onClick={handleReset}>
            再収集する
          </button>
        </div>
      </div>
    );
  }

  // collect フェーズ
  const gestureEmoji: Record<Gesture, string> = {
    'グー': '✊',
    'チョキ': '✌️',
    'パー': '🖐️',
  };

  return (
    <div className="training-view">
      <div className="training-header">
        <h2>ジェスチャー収集</h2>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>戻る</button>
      </div>

      <p className="training-hint">
        各ジェスチャーを{SAMPLES_PER_CLASS}回ずつ収集します。<br />
        手をカメラに向けたまま各ボタンを押してください。
      </p>

      <div className="training-cards">
        {GESTURE_LABELS.map((g) => {
          const count = counts[g] ?? 0;
          const done = count >= SAMPLES_PER_CLASS;
          const isFlashing = flashLabel === g;
          return (
            <div
              key={g}
              className={`training-card${done ? ' done' : ''}${isFlashing ? ' flash' : ''}`}
            >
              <div className="training-card-emoji">{gestureEmoji[g]}</div>
              <div className="training-card-label">{g}</div>
              <div className="training-card-count">
                {count} / {SAMPLES_PER_CLASS}
              </div>
              <div className="training-card-bar">
                <div
                  className="training-card-bar-fill"
                  style={{ width: `${Math.min(count / SAMPLES_PER_CLASS, 1) * 100}%` }}
                />
              </div>
              <button
                className={`btn btn-collect${done ? ' btn-collect-done' : ''}`}
                onClick={() => handleCapture(g)}
                disabled={!currentLandmarks || done}
              >
                {done ? '完了' : `${g}を追加`}
              </button>
            </div>
          );
        })}
      </div>

      {currentGesture && (
        <p className="training-current">
          現在の認識: <strong>{currentGesture}</strong>
        </p>
      )}
      {!currentLandmarks && (
        <p className="training-no-hand">手が検出されていません</p>
      )}

      <div style={{ marginTop: 24 }}>
        <p className="training-progress-label">
          進捗: 最低 {minCount} / {SAMPLES_PER_CLASS} サンプル収集済み
        </p>
        <button
          className="btn btn-primary"
          onClick={handleTrain}
          disabled={!canTrain}
        >
          学習開始（各{SAMPLES_PER_CLASS}サンプル必要）
        </button>
        {!canTrain && (
          <p className="training-hint" style={{ marginTop: 8 }}>
            ※ 各ジェスチャー {SAMPLES_PER_CLASS} サンプルそろったら学習できます
          </p>
        )}
      </div>
    </div>
  );
}
