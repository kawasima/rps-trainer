import { useState, useCallback, useRef, useEffect } from 'react';
import type { Gesture } from './gesture';
import { MOTION_INTERVAL_MS } from './gesture';
import type { BattleRecord } from './db';
import { saveBattleRecord } from './db';
import { createBattleAI } from './battleAI';

type Phase = 'idle' | 'jan' | 'ken' | 'pon' | 'result';

interface Score {
  win: number;
  lose: number;
  draw: number;
}

interface Props {
  /** スタビライザーを通さない生の推論結果。frameTime・landmarks付きで「ぽん」以降のフレームか判定できる */
  getCurrentRawGesture: () => { gesture: Gesture; frameTime: number; landmarks: number[][] } | null;
  /** 「ぽん」のタイミングでスタビライザーバッファをリセットする */
  resetStabilizer: () => void;
  onBattleEnd: (records: BattleRecord[]) => void;
  onBack: () => void;
}

function speak(text: string): Promise<void> {
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ja-JP';
    utter.rate = 1.3;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    // Chrome では cancel() 直後に speak() すると発火しないバグがある。
    // cancel() せずにキューに追加するだけにして、前の発声が残っていれば自然に流れるようにする。
    // ラウンド開始時に runRound() 内で cancel() 済みのため、ここでは不要。
    speechSynthesis.speak(utter);
  });
}

function judgeResult(user: Gesture, cpu: Gesture): 'win' | 'lose' | 'draw' {
  if (user === cpu) return 'draw';
  if (
    (user === 'グー' && cpu === 'チョキ') ||
    (user === 'チョキ' && cpu === 'パー') ||
    (user === 'パー' && cpu === 'グー')
  ) return 'win';
  return 'lose';
}

const gestureEmoji: Record<Gesture, string> = {
  'グー': '✊',
  'チョキ': '✌️',
  'パー': '🖐️',
};

const ROUND_INTERVAL_MS = 3000;

export default function BattleView({ getCurrentRawGesture, resetStabilizer, onBattleEnd, onBack }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState(0);
  const [score, setScore] = useState<Score>({ win: 0, lose: 0, draw: 0 });
  const [userHand, setUserHand] = useState<Gesture | null>(null);
  const [cpuHand, setCpuHand] = useState<Gesture | null>(null);
  const [resultText, setResultText] = useState('');
  const [resultClass, setResultClass] = useState('');
  const [running, setRunning] = useState(false);

  const sessionId = useRef(crypto.randomUUID());
  const roundRef = useRef(0);
  const recordsRef = useRef<BattleRecord[]>([]);
  const aiRef = useRef(createBattleAI());
  const runningRef = useRef(false);
  const ponTimeRef = useRef(0);

  const runRound = useCallback(async () => {
    if (!runningRef.current) return;

    // 前のラウンドの音声が残っていればクリア。
    // Chrome は cancel() 直後に speak() するとサイレントになるバグがあるため 50ms 待つ。
    speechSynthesis.cancel();
    await new Promise(r => setTimeout(r, 50));
    if (!runningRef.current) return;

    roundRef.current += 1;
    const currentRound = roundRef.current;
    setRound(currentRound);
    setUserHand(null);
    setCpuHand(null);
    setResultText('');
    setResultClass('');

    // じゃん
    setPhase('jan');
    await speak('じゃん');
    if (!runningRef.current) return;

    // けん：ここからランドマーク収集を開始する
    setPhase('ken');
    const motionLandmarks: number[][][] = [];
    let motionTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
      const raw = getCurrentRawGesture();
      if (raw && raw.landmarks.length === 21) {
        motionLandmarks.push(raw.landmarks);
      }
    }, MOTION_INTERVAL_MS);

    await speak('けん');
    if (!runningRef.current) {
      clearInterval(motionTimer);
      return;
    }

    // ぽん
    setPhase('pon');
    // じゃん・けんフェーズのグーがスタビライザーバッファに残らないようリセット
    resetStabilizer();
    await speak('ぽん');
    clearInterval(motionTimer);
    motionTimer = null;
    if (!runningRef.current) return;

    // 「ぽん」発声完了後、ユーザーが手を出し切るまで待ってからキャプチャする。
    // CAPTURE_DELAY_MS 経過後に最新フレームを採用する。
    // frameTime でぽん完了前のキャッシュ値を誤採用しない。
    const CAPTURE_DELAY_MS = 300; // ぽん完了後にこれだけ待ってからキャプチャ
    const POLL_INTERVAL = 33;    // ms (≈1フレーム@30fps)
    const POLL_TIMEOUT  = 1500;  // ms
    let captured: Gesture | null = null;
    const ponEndTime = Date.now(); // ぽん発声完了時刻を基準にする
    ponTimeRef.current = ponEndTime;

    // CAPTURE_DELAY_MS 待つ
    await new Promise(r => setTimeout(r, CAPTURE_DELAY_MS));
    if (!runningRef.current) return;

    // 待機後、ぽん完了以降の新しいフレームをポーリングで取得
    const captureStart = Date.now();
    while (Date.now() - captureStart < POLL_TIMEOUT) {
      if (!runningRef.current) return;
      const raw = getCurrentRawGesture();
      if (raw !== null && raw.frameTime >= ponEndTime) {
        captured = raw.gesture;
        break;
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
    const reactionMs = Date.now() - ponTimeRef.current;

    setPhase('result');

    if (captured == null) {
      // 手が認識できない場合はスキップ
      setResultText('手が認識できませんでした');
      setResultClass('');
      await new Promise(r => setTimeout(r, ROUND_INTERVAL_MS));
      if (runningRef.current) runRound();
      return;
    }

    const cpu = aiRef.current.chooseCpuHand();
    aiRef.current.recordUserHand(captured);

    const result = judgeResult(captured, cpu);
    setUserHand(captured);
    setCpuHand(cpu);

    setScore(prev => ({ ...prev, [result]: prev[result] + 1 }));

    const resultMap = { win: 'あなたの勝ち！', lose: 'あなたの負け', draw: '引き分け' };
    const classMap = { win: 'win', lose: 'lose', draw: 'draw' };
    setResultText(resultMap[result]);
    setResultClass(classMap[result]);

    const record: BattleRecord = {
      id: crypto.randomUUID(),
      sessionId: sessionId.current,
      timestamp: Date.now(),
      round: currentRound,
      userHand: captured,
      cpuHand: cpu,
      result,
      reactionTimeMs: reactionMs,
      motionLandmarks,
    };
    recordsRef.current.push(record);
    await saveBattleRecord(record);

    await new Promise(r => setTimeout(r, ROUND_INTERVAL_MS));
    if (runningRef.current) runRound();
  }, [getCurrentRawGesture, resetStabilizer]);

  const handleStart = useCallback(() => {
    sessionId.current = crypto.randomUUID();
    roundRef.current = 0;
    recordsRef.current = [];
    aiRef.current = createBattleAI();
    setRound(0);
    setScore({ win: 0, lose: 0, draw: 0 });
    setUserHand(null);
    setCpuHand(null);
    setResultText('');
    setResultClass('');
    runningRef.current = true;
    setRunning(true);
    runRound();
  }, [runRound]);

  const handleStop = useCallback(() => {
    runningRef.current = false;
    speechSynthesis.cancel();
    setRunning(false);
    setPhase('idle');
    onBattleEnd(recordsRef.current);
  }, [onBattleEnd]);

  // アンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      runningRef.current = false;
      speechSynthesis.cancel();
    };
  }, []);

  const phaseLabel: Record<Phase, string> = {
    idle: '',
    jan: 'じゃん',
    ken: 'けん',
    pon: 'ぽん！',
    result: '',
  };

  return (
    <div className="battle-view">
      <div className="battle-header">
        <h2>コンピュータと対戦</h2>
        {!running && (
          <button className="btn btn-secondary btn-sm" onClick={onBack}>戻る</button>
        )}
      </div>

      {!running ? (
        <div className="battle-start">
          <p className="battle-hint">
            「開始」を押すと「じゃん・けん・ぽん」が自動で繰り返されます。<br />
            「ぽん」と言い終わった直後に手を出し切ってください。
          </p>
          <button className="btn btn-battle" onClick={handleStart}>
            対戦開始
          </button>
        </div>
      ) : (
        <>
          <div className="battle-score">
            <span className="score-item win">勝 {score.win}</span>
            <span className="score-item draw">分 {score.draw}</span>
            <span className="score-item lose">負 {score.lose}</span>
            <span className="score-round">第 {round} ラウンド</span>
          </div>

          <div className={`battle-countdown${phase === 'pon' ? ' pon' : ''}`}>
            {phaseLabel[phase]}
          </div>

          <div className="battle-hands">
            <div className="battle-hand-box">
              <div className="battle-hand-label">あなた</div>
              <div className="battle-hand-value">
                {userHand ? gestureEmoji[userHand] : '？'}
              </div>
              <div className="battle-hand-name">{userHand ?? ''}</div>
            </div>
            <div className="battle-vs">VS</div>
            <div className="battle-hand-box">
              <div className="battle-hand-label">CPU</div>
              <div className="battle-hand-value">
                {cpuHand ? gestureEmoji[cpuHand] : '？'}
              </div>
              <div className="battle-hand-name">{cpuHand ?? ''}</div>
            </div>
          </div>

          {resultText && (
            <div className={`battle-result ${resultClass}`}>
              {resultText}
            </div>
          )}

          <button className="btn btn-danger" style={{ marginTop: 24 }} onClick={handleStop}>
            ストップ
          </button>
        </>
      )}
    </div>
  );
}
