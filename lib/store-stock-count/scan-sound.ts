let audioCtx: AudioContext | null = null;

function getScanAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

export function unlockScanSound() {
  const ctx = getScanAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
}

/** Short two-tone buzzer for unmatched / rejected scans. */
export function playScanErrorSound() {
  const ctx = getScanAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const now = ctx.currentTime;
  for (const [i, freq] of [880, 420].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + i * 0.13;
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.14, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.13);
  }
}
