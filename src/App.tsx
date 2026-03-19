import { useEffect, useRef, useState, useCallback } from 'react';
import { initCamera } from './camera';
import { classifyFingerStates, classifyGesture } from './gesture';
import { createStabilizer } from './gesture';
import { openDB, clearAllRecords, getAllRecords, getAllBattleRecords, type GestureRecord, type BattleRecord } from './db';
import { predict, loadModel, isModelReady } from './classifier';
import BiasAnalysis from './analysis/BiasAnalysis';
import TransitionAnalysis from './analysis/TransitionAnalysis';
import TimingAnalysis from './analysis/TimingAnalysis';
import PredictionAnalysis from './analysis/PredictionAnalysis';
import TrainingView from './TrainingView';
import BattleView from './BattleView';
import './style.css';

type View = 'main' | 'dashboard' | 'training' | 'battle';
type TabId = 'bias' | 'transition' | 'timing' | 'prediction';
type Gesture = 'グー' | 'チョキ' | 'パー';

const gestureClassMap: Record<Gesture, string> = {
  'グー': 'rock',
  'チョキ': 'scissors',
  'パー': 'paper',
};

const FINGER_LABELS = ['親', '人', '中', '薬', '小'];
const TABS: { id: TabId; label: string }[] = [
  { id: 'bias', label: '偏り分析' },
  { id: 'transition', label: '遷移パターン' },
  { id: 'timing', label: '癖分析' },
  { id: 'prediction', label: '予測可能性' },
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [view, setView] = useState<View>('main');
  const [loading, setLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [fingerStates, setFingerStates] = useState<boolean[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('bias');
  const [records, setRecords] = useState<GestureRecord[]>([]);
  const [battleRecords, setBattleRecords] = useState<BattleRecord[]>([]);
  const [modelReady, setModelReady] = useState(false);

  const stabilizerRef = useRef(createStabilizer(5));
  // 現在フレームのランドマーク（TrainingView に渡す）
  const currentLandmarksRef = useRef<Array<{ x: number; y: number; z?: number }> | null>(null);
  // 現在フレームのジェスチャー（BattleView が参照する）
  const currentGestureRef = useRef<Gesture | null>(null);
  // スタビライザーを通す前の生の推論結果（対戦時のキャプチャ用）。
  // { gesture, frameTime, landmarks } でフレームのタイムスタンプとランドマークも保持し、
  // 「ぽん」発声開始以降のフレームのみ採用できるようにする。
  const currentRawGestureRef = useRef<{ gesture: Gesture; frameTime: number; landmarks: number[][] } | null>(null);

  // 起動時に保存済みモデルをロード
  useEffect(() => {
    openDB().catch(console.error);
    loadModel().then(loaded => setModelReady(loaded));
  }, []);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;

    initCamera(
      videoRef.current,
      canvasRef.current,
      (results) => {
        setLoading(false);

        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
          stabilizerRef.current.reset();
          setGesture(null);
          setConfidence(null);
          setFingerStates([]);
          currentLandmarksRef.current = null;
          currentGestureRef.current = null;
          currentRawGestureRef.current = null;
          return;
        }

        const landmarks = results.multiHandLandmarks[0];
        currentLandmarksRef.current = landmarks;

        // 推論: モデルがあればMLPを使用、なければルールベース
        let stable: Gesture | null = null;
        let conf: number | null = null;

        let rawGesture: Gesture | null = null;

        if (isModelReady()) {
          const result = predict(landmarks);
          if (result) {
            rawGesture = result.gesture;
            stabilizerRef.current.push(result.gesture);
            stable = stabilizerRef.current.getStable() as Gesture | null;
            conf = result.confidence;
          } else {
            stabilizerRef.current.push(null);
            stable = null;
          }
        } else {
          // フォールバック: ルールベース
          const fs = classifyFingerStates(landmarks);
          rawGesture = classifyGesture(fs);
          stabilizerRef.current.push(rawGesture);
          stable = stabilizerRef.current.getStable() as Gesture | null;
          setFingerStates(fs);
        }

        setGesture(stable);
        setConfidence(conf);
        currentGestureRef.current = stable;
        currentRawGestureRef.current = rawGesture
          ? { gesture: rawGesture, frameTime: Date.now(), landmarks: landmarks.map(l => [l.x, l.y, l.z ?? 0]) }
          : null;
      },
      (err) => {
        setLoading(false);
        if (err.name === 'NotAllowedError') {
          setCameraError('カメラへのアクセスが拒否されました。ブラウザの設定からカメラの使用を許可してください。');
        } else if (err.name === 'NotFoundError') {
          setCameraError('カメラが見つかりません。カメラが接続されていることを確認してください。');
        } else {
          setCameraError(`カメラの初期化に失敗しました: ${err.message}`);
        }
      }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnalyze = useCallback(async () => {
    const [data, battles] = await Promise.all([getAllRecords(), getAllBattleRecords()]);
    if (data.length === 0 && battles.length > 0) {
      const converted: GestureRecord[] = battles.map(r => ({
        sessionId: r.sessionId,
        timestamp: r.timestamp,
        hand: r.userHand,
        landmarks: [],
        stabilizationTimeMs: r.reactionTimeMs,
        fingerStates: [],
      }));
      setRecords(converted);
    } else {
      setRecords(data);
    }
    setBattleRecords(battles);
    setView('dashboard');
  }, []);

  const handleClear = useCallback(async () => {
    if (confirm('すべての記録を削除しますか？')) {
      await clearAllRecords();
      alert('記録を削除しました。');
    }
  }, []);

  const handleTrainingComplete = useCallback(() => {
    setModelReady(true);
    setView('main');
  }, []);

  const handleBattleEnd = useCallback((incoming: BattleRecord[]) => {
    // BattleRecord を GestureRecord 形式に変換して既存の分析を流用。
    const gestureRecords: GestureRecord[] = incoming.map(r => ({
      sessionId: r.sessionId,
      timestamp: r.timestamp,
      hand: r.userHand,
      landmarks: [],
      stabilizationTimeMs: r.reactionTimeMs,
      fingerStates: [],
    }));
    setBattleRecords(incoming);
    setRecords(gestureRecords);
    setView('dashboard');
  }, []);

  return (
    <>
      {/* カメラ常時表示エリア（main / training ビューで共有） */}
      <div style={{ display: view === 'dashboard' ? 'none' : '' }}>
        <h1 className="app-title">じゃんけん分析</h1>

        {loading && (
          <div id="loading-overlay">
            <div className="loading-content">
              <div className="spinner" />
              <p>カメラとモデルを初期化中...</p>
            </div>
          </div>
        )}

        {cameraError && (
          <div id="camera-error">
            <p>{cameraError}</p>
          </div>
        )}

        <div className="main-layout">
          <div className="camera-panel">
            <video ref={videoRef} className="input-video" style={{ display: 'none' }} />
            <canvas ref={canvasRef} id="camera-canvas" width={640} height={480} />
          </div>

          {/* 学習ビューの右パネル */}
          {view === 'training' && (
            <div className="result-panel" style={{ overflowY: 'auto' }}>
              <TrainingView
                currentLandmarks={currentLandmarksRef.current}
                currentGesture={gesture}
                onTrainingComplete={handleTrainingComplete}
                onBack={() => setView('main')}
              />
            </div>
          )}

          {/* 対戦ビューの右パネル */}
          {view === 'battle' && (
            <div className="result-panel" style={{ overflowY: 'auto' }}>
              <BattleView
                getCurrentRawGesture={() => currentRawGestureRef.current as { gesture: Gesture; frameTime: number; landmarks: number[][] } | null}
                resetStabilizer={() => stabilizerRef.current.reset()}
                onBattleEnd={handleBattleEnd}
                onBack={() => setView('main')}
              />
            </div>
          )}

          {/* メイン画面の右パネル */}
          {view === 'main' && (
            <div className="result-panel">
              <div
                id="gesture-display"
                className={gesture ? gestureClassMap[gesture] : ''}
              >
                {gesture ?? '--'}
              </div>
              {confidence !== null && gesture && (
                <div className="confidence-bar-wrap">
                  <div className="confidence-bar" style={{ width: `${Math.round(confidence * 100)}%` }} />
                  <span className="confidence-label">{Math.round(confidence * 100)}%</span>
                </div>
              )}
              {!modelReady && (
                <div id="finger-states">
                  {FINGER_LABELS.map((label, i) => (
                    <span key={label} className={`finger${fingerStates[i] ? ' open' : ''}`}>
                      {label}
                    </span>
                  ))}
                </div>
              )}
              <div className="model-badge">
                {modelReady ? '🤖 ML認識' : '📐 ルール認識'}
              </div>
            </div>
          )}
        </div>

        {view === 'main' && (
          <div className="controls">
            <button className="btn btn-battle" onClick={() => setView('battle')}>
              コンピュータと対戦
            </button>
            <button className="btn btn-train" onClick={() => setView('training')}>
              {modelReady ? '再学習' : '学習する'}
            </button>
            <button className="btn btn-secondary" onClick={handleAnalyze}>
              分析を見る
            </button>
            <button className="btn btn-danger" onClick={handleClear}>
              履歴クリア
            </button>
          </div>
        )}
      </div>

      {/* 分析ダッシュボード */}
      <div id="dashboard-view" style={{ display: view === 'dashboard' ? '' : 'none' }}>
        <div className="dashboard-header">
          <h1 className="app-title">分析ダッシュボード</h1>
          <button className="btn btn-secondary" onClick={() => setView('main')}>
            メイン画面に戻る
          </button>
        </div>

        {records.length === 0 ? (
          <div id="no-data-message">
            <p>分析するデータがありません。メイン画面で記録を行ってください。</p>
          </div>
        ) : (
          <>
            <div className="tabs">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`tab${activeTab === tab.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="tab-content active">
              {activeTab === 'bias' && <BiasAnalysis records={records} />}
              {activeTab === 'transition' && <TransitionAnalysis records={records} />}
              {activeTab === 'timing' && <TimingAnalysis records={records} battleRecords={battleRecords} />}
              {activeTab === 'prediction' && <PredictionAnalysis records={records} />}
            </div>
          </>
        )}
      </div>
    </>
  );
}
