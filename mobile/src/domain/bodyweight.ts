export type BodyweightEntry = { date: string; kg: number };

export const TREND_SMOOTHING = 0.1;
export const RATE_WINDOW_DAYS = 28;
export const MIN_RATE_ENTRIES = 4;
export const MIN_RATE_SPAN_DAYS = 10;

export const LOSS_BAND: [number, number] = [0.5, 1];
export const GAIN_BAND: [number, number] = [0.25, 0.5];

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;

export function trend(entries: BodyweightEntry[]): { date: string; kg: number }[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const out: { date: string; kg: number }[] = [];
  let value: number | null = null;
  let last = 0;
  for (const e of sorted) {
    const d = dayNumber(e.date);
    if (value === null) value = e.kg;
    else {
      const gap = Math.max(1, d - last);
      const w = 1 - (1 - TREND_SMOOTHING) ** gap;
      value += w * (e.kg - value);
    }
    last = d;
    out.push({ date: e.date, kg: value });
  }
  return out;
}

export type Rate = {
  pctPerWeek: number;
  low: number;
  high: number;
  entries: number;
};

export function weeklyRate(entries: BodyweightEntry[], today: string): Rate | null {
  const end = dayNumber(today);
  const pts = entries.map((e) => ({ x: dayNumber(e.date), y: e.kg })).filter((p) => p.x <= end && p.x > end - RATE_WINDOW_DAYS);
  if (pts.length < MIN_RATE_ENTRIES) return null;
  const span = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  if (span < MIN_RATE_SPAN_DAYS) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  const resid = pts.reduce((s, p) => s + (p.y - (my + slope * (p.x - mx))) ** 2, 0);
  const se = Math.sqrt(resid / Math.max(1, n - 2) / sxx);
  const toPct = (kgPerDay: number) => ((kgPerDay * 7) / my) * 100;
  return { pctPerWeek: toPct(slope), low: toPct(slope - se), high: toPct(slope + se), entries: n };
}

export function describeRate(r: Rate, minor: boolean): string {
  const abs = Math.abs(r.pctPerWeek);
  const fmt = (x: number) => (Math.abs(x) < 0.05 ? '0' : Math.abs(x).toFixed(1));
  const range = `likely ${r.low < 0 && r.high > 0 ? `${fmt(r.low)}% down to ${fmt(r.high)}% up` : `${fmt(Math.min(Math.abs(r.low), Math.abs(r.high)))}–${fmt(Math.max(Math.abs(r.low), Math.abs(r.high)))}%`}`;
  if (r.low < 0 && r.high > 0 && abs < 0.15) return `About steady (${range} a week).`;
  if (r.pctPerWeek < 0) {
    const head = `Losing about ${fmt(abs)}% of your weight a week (${range}).`;
    if (minor) return head;
    return `${head} ${abs > LOSS_BAND[1] ? 'Faster than the 0.5–1% that keeps the most muscle.' : abs < LOSS_BAND[0] ? 'Slower than 0.5–1%: fine, muscle is safest at slow rates.' : 'Within the 0.5–1% that keeps the most muscle.'}`;
  }
  const head = `Gaining about ${fmt(abs)}% of your weight a week (${range}).`;
  return `${head} ${abs > GAIN_BAND[1] ? 'Faster than the 0.25–0.5% that limits fat gain.' : abs < GAIN_BAND[0] ? 'Slower than 0.25–0.5%.' : 'Within the 0.25–0.5% suggested for gaining muscle.'}`;
}
