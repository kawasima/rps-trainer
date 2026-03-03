import { useEffect, useRef } from 'react';
import { Chart, type ChartConfiguration } from 'chart.js/auto';
import { BoxPlotController, BoxAndWiskers } from '@sgratzl/chartjs-chart-boxplot';
import { mean, standardDeviation } from '../stats';
import type { GestureRecord, BattleRecord } from '../db';
import { GESTURES, GESTURE_COLORS, GESTURE_BORDER_COLORS, MOTION_INTERVAL_MS, classifyFingerStates, classifyGesture } from '../gesture';

Chart.register(BoxPlotController, BoxAndWiskers);

const COLORS = [...GESTURE_COLORS];
const BORDER_COLORS = [...GESTURE_BORDER_COLORS];

interface Props {
  records: GestureRecord[];
  battleRecords?: BattleRecord[];
}

/**
 * motionLandmarks（けん〜ぽん間の軌跡）から、最終的な手と同じジェスチャーが
 * 最初に確定したフレームのオフセット（ms）を返す。
 * 判別できなかった場合は null。
 */
function calcReadableMs(motionLandmarks: number[][][], finalHand: string): number | null {
  for (let i = 0; i < motionLandmarks.length; i++) {
    const lm = motionLandmarks[i];
    // number[][] → {x,y,z}[] に変換してルールベース分類
    const landmarks = lm.map(p => ({ x: p[0], y: p[1], z: p[2] ?? 0 }));
    const fs = classifyFingerStates(landmarks);
    const g = classifyGesture(fs);
    if (g === finalHand) {
      return i * MOTION_INTERVAL_MS;
    }
  }
  return null;
}

export default function TimingAnalysis({ records, battleRecords }: Props) {
  const timingCanvasRef = useRef<HTMLCanvasElement>(null);
  const tremorCanvasRef = useRef<HTMLCanvasElement>(null);
  const readableCanvasRef = useRef<HTMLCanvasElement>(null);
  const timingChartRef = useRef<Chart | null>(null);
  const tremorChartRef = useRef<Chart | null>(null);
  const readableChartRef = useRef<Chart | null>(null);

  const timingData: Record<string, number[]> = {};
  const landmarkData: Record<string, number[][][]> = {};
  for (const g of GESTURES) { timingData[g] = []; landmarkData[g] = []; }
  for (const r of records) {
    if (r.hand in timingData) {
      timingData[r.hand].push(r.stabilizationTimeMs);
      if (r.landmarks && r.landmarks.length === 21) landmarkData[r.hand].push(r.landmarks);
    }
  }

  // 手ごとの「読まれるタイミング（ms）」データ
  const readableData: Record<string, number[]> = {};
  for (const g of GESTURES) readableData[g] = [];
  if (battleRecords) {
    for (const r of battleRecords) {
      if (!r.motionLandmarks || r.motionLandmarks.length === 0) continue;
      const ms = calcReadableMs(r.motionLandmarks, r.userHand);
      if (ms !== null) readableData[r.userHand].push(ms);
    }
  }

  const tremorScores = GESTURES.map(g => {
    const landmarks = landmarkData[g];
    if (landmarks.length < 2) return 0;
    let totalStd = 0;
    let count = 0;
    for (let i = 0; i < 21; i++) {
      totalStd += standardDeviation(landmarks.map(l => l[i][0]));
      totalStd += standardDeviation(landmarks.map(l => l[i][1]));
      count += 2;
    }
    return count > 0 ? totalStd / count : 0;
  });

  useEffect(() => {
    if (!timingCanvasRef.current || !tremorCanvasRef.current) return;

    timingChartRef.current?.destroy();
    tremorChartRef.current?.destroy();
    readableChartRef.current?.destroy();

    const timingConfig = {
      type: 'boxplot',
      data: {
        labels: [...GESTURES],
        datasets: [{
          label: '判定確定時間 (ms)',
          data: GESTURES.map(g => timingData[g]),
          backgroundColor: COLORS,
          borderColor: BORDER_COLORS,
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, title: { display: true, text: '時間 (ms)' } } },
      },
    } as ChartConfiguration;
    timingChartRef.current = new Chart(timingCanvasRef.current, timingConfig);

    const tremorConfig: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: [...GESTURES],
        datasets: [{
          label: '揺らぎスコア',
          data: tremorScores,
          backgroundColor: COLORS,
          borderColor: BORDER_COLORS,
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, title: { display: true, text: '揺らぎスコア（小さいほど安定）' } } },
      },
    };
    tremorChartRef.current = new Chart(tremorCanvasRef.current, tremorConfig);

    if (readableCanvasRef.current && GESTURES.some(g => readableData[g].length > 0)) {
      const readableConfig: ChartConfiguration = {
        type: 'boxplot',
        data: {
          labels: [...GESTURES],
          datasets: [{
            label: '手が読まれるタイミング (ms)',
            data: GESTURES.map(g => readableData[g]),
            backgroundColor: COLORS,
            borderColor: BORDER_COLORS,
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: '「けん」からの経過時間 (ms)' },
            },
          },
        },
      } as ChartConfiguration;
      readableChartRef.current = new Chart(readableCanvasRef.current, readableConfig);
    }

    return () => {
      timingChartRef.current?.destroy(); timingChartRef.current = null;
      tremorChartRef.current?.destroy(); tremorChartRef.current = null;
      readableChartRef.current?.destroy(); readableChartRef.current = null;
    };
  }, [records, battleRecords]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxIdx = tremorScores.indexOf(Math.max(...tremorScores));
  const positiveScores = tremorScores.filter(s => s > 0);
  const minIdx = positiveScores.length > 0
    ? tremorScores.indexOf(Math.min(...positiveScores))
    : -1;
  const timingMeans = GESTURES.map((g, i) => ({
    gesture: g, mean: mean(timingData[g]), count: timingData[g].length, idx: i,
  })).filter(t => t.count > 0);

  return (
    <div>
      <h2>出す瞬間の癖分析</h2>
      <h3>判定確定までの時間（ms）</h3>
      <div className="chart-container">
        <canvas ref={timingCanvasRef} />
      </div>
      <h3>手の揺らぎ比較</h3>
      <div className="chart-container">
        <canvas ref={tremorCanvasRef} />
      </div>

      {battleRecords && battleRecords.some(r => r.motionLandmarks && r.motionLandmarks.length > 0) && (
        <>
          <h3>手が読まれるタイミング（対戦データ）</h3>
          <div className="chart-container">
            <canvas ref={readableCanvasRef} />
          </div>
          <div className="analysis-result">
            <p>「けん」の発声開始から何ms後に手の形が確定するかを示します。値が小さいほど早い段階で手が読まれやすいことを意味します。</p>
            {GESTURES.map(g => {
              const d = readableData[g];
              if (d.length === 0) return null;
              const avg = mean(d);
              return (
                <p key={g}>
                  <strong>{g}</strong>: 平均 {avg.toFixed(0)}ms で判別可能（{d.length}回）
                </p>
              );
            })}
          </div>
        </>
      )}

      <div className="analysis-result">
        <p>揺らぎスコアは、同じ手を出した際のランドマーク位置のばらつきを表しています。</p>
        <p>揺らぎが大きい手ほど、出す際に「迷い」がある可能性があります。対戦相手がその迷いを手の動きから読み取れるかもしれません。</p>
        {tremorScores[maxIdx] > 0 && (
          <p>
            最も揺らぎが大きい手: <strong>{GESTURES[maxIdx]}</strong>
            {minIdx >= 0 && maxIdx !== minIdx && (
              <>　最も安定している手: <strong>{GESTURES[minIdx]}</strong></>
            )}
          </p>
        )}
        {timingMeans.length > 0 && (
          <p>平均判定確定時間: {timingMeans.map(t => `${t.gesture}: ${t.mean.toFixed(0)}ms`).join('　')}</p>
        )}
      </div>
    </div>
  );
}
