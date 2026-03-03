import { useEffect, useRef } from 'react';
import { Chart, type ChartConfiguration } from 'chart.js/auto';
import type { GestureRecord } from '../db';
import { GESTURES } from '../gesture';

const HIGH_THRESHOLD = 43.3;
const LOW_THRESHOLD = 23.3;

interface Props {
  records: GestureRecord[];
}

export default function TransitionAnalysis({ records }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  // 遷移行列の構築
  const matrix = GESTURES.map(() => GESTURES.map(() => 0));
  for (let i = 0; i < records.length - 1; i++) {
    const from = GESTURES.indexOf(records[i].hand as typeof GESTURES[number]);
    const to = GESTURES.indexOf(records[i + 1].hand as typeof GESTURES[number]);
    if (from >= 0 && to >= 0) matrix[from][to]++;
  }
  const probMatrix = matrix.map(row => {
    const rowSum = row.reduce((s, v) => s + v, 0);
    if (rowSum === 0) return row.map(() => 0);
    return row.map(v => (v / rowSum) * 100);
  });

  // 連続回数
  const streaks: number[] = [];
  let cur = 1;
  for (let i = 1; i < records.length; i++) {
    if (records[i].hand === records[i - 1].hand) { cur++; }
    else { streaks.push(cur); cur = 1; }
  }
  if (records.length > 0) streaks.push(cur);
  const maxStreak = Math.max(...streaks, 1);
  const streakCounts = new Array(maxStreak).fill(0);
  for (const s of streaks) streakCounts[s - 1]++;

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: Array.from({ length: maxStreak }, (_, i) => `${i + 1}回`),
        datasets: [{
          label: '出現頻度',
          data: streakCounts,
          backgroundColor: 'rgba(155, 89, 182, 0.7)',
          borderColor: 'rgb(155, 89, 182)',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: '連続回数' } },
          y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: '頻度' } },
        },
      },
    };
    chartRef.current = new Chart(canvasRef.current, config);

    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [records]); // eslint-disable-line react-hooks/exhaustive-deps

  if (records.length < 2) {
    return (
      <div>
        <h2>遷移パターン分析</h2>
        <p>遷移分析には2件以上の記録が必要です。</p>
      </div>
    );
  }

  return (
    <div>
      <h2>遷移パターン分析</h2>
      <h3>遷移行列</h3>
      <table className="transition-table">
        <thead>
          <tr>
            <th>前 \ 次</th>
            {GESTURES.map(g => <th key={g}>{g}</th>)}
          </tr>
        </thead>
        <tbody>
          {GESTURES.map((g, i) => (
            <tr key={g}>
              <th>{g}</th>
              {GESTURES.map((_, j) => {
                const prob = probMatrix[i][j];
                const rowTotal = matrix[i].reduce((s, v) => s + v, 0);
                const cls = prob > HIGH_THRESHOLD
                  ? 'highlight-high'
                  : (prob < LOW_THRESHOLD && rowTotal > 0 ? 'highlight-low' : '');
                return <td key={j} className={cls}>{prob.toFixed(1)}%</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <h3>同じ手の連続回数</h3>
      <div className="chart-container">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
