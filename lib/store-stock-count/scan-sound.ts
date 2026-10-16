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

function errorPulse(ctx: AudioContext, freq: number, start: number) {
  const duration = 0.2;
  const tone = ctx.createOscillator();
  const body = ctx.createOscillator();
  const toneGain = ctx.createGain();
  const bodyGain = ctx.createGain();
  tone.type = "square";
  body.type = "sawtooth";
  tone.frequency.setValueAtTime(freq, start);
  body.frequency.setValueAtTime(freq / 2, start);
  toneGain.gain.setValueAtTime(0.0001, start);
  bodyGain.gain.setValueAtTime(0.0001, start);
  toneGain.gain.exponentialRampToValueAtTime(0.62, start + 0.012);
  bodyGain.gain.exponentialRampToValueAtTime(0.38, start + 0.012);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  tone.connect(toneGain);
  body.connect(bodyGain);
  toneGain.connect(ctx.destination);
  bodyGain.connect(ctx.destination);
  tone.start(start);
  body.start(start);
  tone.stop(start + duration + 0.02);
  body.stop(start + duration + 0.02);
}

/** Loud three-pulse alarm for a bad barcode or a qty over available. */
export function playScanErrorSound() {
  const ctx = getScanAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const now = ctx.currentTime;
  [660, 440, 294].forEach((freq, i) => {
    errorPulse(ctx, freq, now + i * 0.24);
  });
}
