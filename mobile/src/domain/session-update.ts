import { estimateRir } from './dose';
import { PRIORS } from './model';

export const RIR_SD = 1;
export const EPLEY_GAP_SD = 0.01;
export const MAX_SET_JUMP = 0.05;
export const MAX_RTF_GAP = 6;

export type LoadEstimate = { logMean: number; logSd: number };

export type SetUpdate = {
  estimate: LoadEstimate;
  next: { value: number; low: number; high: number };
};

export function updateAfterSet(args: {
  prior: LoadEstimate | null;
  weightKg: number;
  reps: number;
  rpe: number | null;
  missed: boolean;
  targetReps: number;
  targetRir: number;
  incrementKg: number;
  bodyweightKg?: number;
}): SetUpdate {
  const bw = args.bodyweightKg ?? 0;
  const total = bw + args.weightKg;
  const inc = args.incrementKg;
  const rawRtf = args.reps + estimateRir({ rpe: args.missed ? 10 : args.rpe, rir: null, failed: args.missed, reps: args.reps }).rir;
  const targetRtf = args.targetReps + estimateRir({ rpe: null, rir: args.targetRir, reps: args.targetReps }).rir;
  const loggedRtf = Math.min(targetRtf + MAX_RTF_GAP, Math.max(targetRtf - MAX_RTF_GAP, rawRtf));

  const sigma = PRIORS.sigmaMedian;
  const obsMean = Math.log(total) + Math.log(1 + loggedRtf / 30) - Math.log(1 + targetRtf / 30);
  const obsSd = Math.sqrt(sigma ** 2 + (RIR_SD / (30 + loggedRtf)) ** 2 + (EPLEY_GAP_SD * Math.abs(loggedRtf - targetRtf)) ** 2);

  let logMean = obsMean;
  let logSd = obsSd;
  if (args.prior) {
    const wp = 1 / args.prior.logSd ** 2;
    const wo = 1 / obsSd ** 2;
    logMean = (wp * args.prior.logMean + wo * obsMean) / (wp + wo);
    logSd = Math.sqrt(1 / (wp + wo));
    if (args.missed) logSd = Math.max(logSd, args.prior.logSd);
  }
  logSd = Math.max(logSd, sigma);

  const show = (logLoad: number) => Math.exp(logLoad) - bw;
  const ceilingTotal = Math.max(total * (1 + MAX_SET_JUMP), total + 2 * inc);
  const floor = (x: number) => Math.floor(x / inc + 1e-9) * inc;
  const ceil = (x: number) => Math.ceil(x / inc - 1e-9) * inc;
  const value = Math.max(0, Math.min(Math.round(show(logMean) / inc) * inc, floor(ceilingTotal - bw)));
  const low = Math.max(0, Math.min(value - inc, floor(show(logMean - logSd))));
  const high = Math.max(value + inc, ceil(show(logMean + logSd)));
  return { estimate: { logMean, logSd }, next: { value, low, high } };
}

export function estimateFromBracket(low: number, high: number, bodyweightKg = 0): LoadEstimate | null {
  const lo = low + bodyweightKg;
  const hi = high + bodyweightKg;
  if (lo <= 0 || hi <= lo) return null;
  return { logMean: (Math.log(lo) + Math.log(hi)) / 2, logSd: (Math.log(hi) - Math.log(lo)) / 2 };
}
