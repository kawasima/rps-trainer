export function chiSquaredTest(
  observed: number[],
  expected: number[]
): { statistic: number; pValue: number; significant: boolean } {
  let statistic = 0;
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] === 0) continue;
    const diff = observed[i] - expected[i];
    statistic += (diff * diff) / expected[i];
  }

  const df = observed.length - 1;
  const pValue = chiSquaredPValue(statistic, df);

  return { statistic, pValue, significant: pValue < 0.05 };
}

function chiSquaredPValue(x: number, df: number): number {
  if (x <= 0) return 1;
  // df=2 の場合は簡略化: p = e^(-x/2)
  if (df === 2) return Math.exp(-x / 2);
  return 1 - regularizedGammaP(df / 2, x / 2);
}

function regularizedGammaP(a: number, x: number): number {
  if (x < a + 1) return gammaPSeries(a, x);
  return 1 - gammaPContinuedFraction(a, x);
}

function gammaPSeries(a: number, x: number): number {
  const lnGammaA = lnGamma(a);
  let sum = 1 / a;
  let term = 1 / a;
  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-10) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGammaA);
}

function gammaPContinuedFraction(a: number, x: number): number {
  const lnGammaA = lnGamma(a);
  let f = x - a + 1;
  let c = 1e30;
  let d = 1 / f;
  let h = d;
  for (let n = 1; n < 200; n++) {
    const an = -n * (n - a);
    const bn = x - a + 1 + 2 * n;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  return h * Math.exp(-x + a * Math.log(x) - lnGammaA);
}

function lnGamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    ser += cof[j] / ++y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

export function quartiles(data: number[]): {
  min: number; q1: number; median: number; q3: number; max: number;
} {
  if (data.length === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
  const sorted = [...data].sort((a, b) => a - b);
  return {
    min: sorted[0],
    q1: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    q3: percentile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  };
}

function percentile(sorted: number[], p: number): number {
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

export function mean(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((s, v) => s + v, 0) / data.length;
}

export function standardDeviation(data: number[]): number {
  if (data.length < 2) return 0;
  const m = mean(data);
  const variance = data.reduce((s, v) => s + (v - m) * (v - m), 0) / (data.length - 1);
  return Math.sqrt(variance);
}
