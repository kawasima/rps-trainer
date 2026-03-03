import { useEffect, useRef } from 'react';
import { Chart, type ChartConfiguration } from 'chart.js/auto';
import type { GestureRecord } from '../db';
import { GESTURES, GESTURE_COLORS, GESTURE_BORDER_COLORS } from '../gesture';
import type { Gesture } from '../gesture';

interface Props {
  records: GestureRecord[];
}

function computeHitRate(hands: Gesture[], n: number) {
  if (hands.length <= n) return { n, rate: 0, total: 0 };

  const keys: string[] = [];
  const freqTable: Record<string, Record<Gesture, number>> = {};
  for (let i = n; i < hands.length; i++) {
    const key = hands.slice(i - n, i).join(',');
    keys.push(key);
    if (!freqTable[key]) {
      freqTable[key] = { 'グー': 0, 'チョキ': 0, 'パー': 0 };
    }
    freqTable[key][hands[i]]++;
  }

  let correct = 0;
  let total = 0;
  for (let i = n; i < hands.length; i++) {
    const counts = freqTable[keys[i - n]];
    if (!counts) continue;
    let maxCount = 0;
    let prediction: Gesture | null = null;
    for (const g of GESTURES) {
      if (counts[g] > maxCount) { maxCount = counts[g]; prediction = g; }
    }
    if (prediction === hands[i]) correct++;
    total++;
  }
  return { n, rate: total > 0 ? correct / total : 0, total };
}

export default function PredictionAnalysis({ records }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const hands = records.map(r => r.hand).filter((h): h is Gesture =>
    GESTURES.includes(h as Gesture)
  );
  const hitRates = [1, 2, 3].map(n => computeHitRate(hands, n));
  const maxRate = Math.max(...hitRates.map(r => r.rate));

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: hitRates.map(r => `直前${r.n}手`),
        datasets: [
          {
            label: '的中率',
            data: hitRates.map(r => r.rate * 100),
            backgroundColor: [...GESTURE_COLORS],
            borderColor: [...GESTURE_BORDER_COLORS],
            borderWidth: 1,
          },
          {
            label: 'ランダム基準 (33.3%)',
            data: hitRates.map(() => 33.3),
            type: 'line',
            borderColor: 'rgba(149,165,166,0.8)',
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          } as ChartConfiguration['data']['datasets'][0],
        ],
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: '的中率 (%)' } } },
      },
    };
    chartRef.current = new Chart(canvasRef.current, config);

    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [records]); // eslint-disable-line react-hooks/exhaustive-deps

  if (hands.length < 4) {
    return (
      <div>
        <h2>予測可能性スコア</h2>
        <div className="analysis-result"><p>予測分析には4件以上の記録が必要です。</p></div>
      </div>
    );
  }

  return (
    <div>
      <h2>予測可能性スコア</h2>
      <div className="chart-container">
        <canvas ref={canvasRef} />
      </div>
      <div className="analysis-result">
        <table className="transition-table" style={{ maxWidth: 400 }}>
          <thead>
            <tr><th>モデル</th><th>的中率</th><th>予測数</th></tr>
          </thead>
          <tbody>
            {hitRates.map(r => (
              <tr key={r.n}>
                <td>直前{r.n}手</td>
                <td>{(r.rate * 100).toFixed(1)}%</td>
                <td>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {maxRate > 0.40
          ? <p className="warning">癖が読まれやすい傾向があります。出す手のパターンを意識的に変えてみましょう。</p>
          : maxRate > 0.333
            ? <p>わずかにパターンが見られますが、大きな偏りではありません。</p>
            : <p className="not-significant">ランダムに近い出し方です。パターンを読まれにくい状態です。</p>
        }
      </div>
    </div>
  );
}
