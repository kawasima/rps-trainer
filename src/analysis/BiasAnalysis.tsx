import { useEffect, useRef } from 'react';
import { Chart, type ChartConfiguration } from 'chart.js/auto';
import { chiSquaredTest } from '../stats';
import type { GestureRecord } from '../db';
import { GESTURES, GESTURE_COLORS, GESTURE_BORDER_COLORS } from '../gesture';

const COLORS = [...GESTURE_COLORS];
const BORDER_COLORS = [...GESTURE_BORDER_COLORS];

interface Props {
  records: GestureRecord[];
}

export default function BiasAnalysis({ records }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const counts = GESTURES.map(g => records.filter(r => r.hand === g).length);
  const total = counts.reduce((s, v) => s + v, 0);
  const expected = GESTURES.map(() => total / 3);
  const test = total > 0 ? chiSquaredTest(counts, expected) : null;

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();

    const config: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: [...GESTURES],
        datasets: [{
          label: '出現回数',
          data: counts,
          backgroundColor: COLORS,
          borderColor: BORDER_COLORS,
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    };
    chartRef.current = new Chart(canvasRef.current, config);

    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [records]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h2>出す手の偏り分析</h2>
      <div className="chart-container">
        <canvas ref={canvasRef} />
      </div>
      <div className="analysis-result">
        {total === 0 ? (
          <p>データがありません。</p>
        ) : (
          <>
            <p>
              {GESTURES.map((g, i) => (
                <span key={g}>{g}: {counts[i]}回 ({((counts[i] / total) * 100).toFixed(1)}%)　</span>
              ))}
            </p>
            {test && (
              <>
                <p>カイ二乗統計量: {test.statistic.toFixed(3)}、p値: {test.pValue.toFixed(4)}</p>
                {test.significant
                  ? <p className="significant">判定: 偏りあり（p &lt; 0.05）</p>
                  : <p className="not-significant">判定: 有意な偏りなし</p>
                }
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
