/**
 * Retro sound effects synthesized with Web Audio API.
 * No audio files needed. All effects are generated procedurally.
 */

let audioCtx: AudioContext | null = null;
let muted = localStorage.getItem('tradewars-muted') === 'true';

function getCtx(): AudioContext | null {
  if (muted) return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  localStorage.setItem('tradewars-muted', String(m));
}

function tone(
  freqStart: number,
  freqEnd: number,
  duration: number,
  type: OscillatorType = 'square',
  volume: number = 0.1
): void {
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), ctx.currentTime + duration);

  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function noiseBurst(duration: number = 0.2, volume: number = 0.15): void {
  const ctx = getCtx();
  if (!ctx) return;

  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

/** Warp drive engage sound */
export function playWarp(): void {
  tone(200, 1200, 0.4, 'sawtooth', 0.08);
}

/** Red alert klaxon */
export function playAlert(): void {
  tone(440, 440, 0.15, 'square', 0.1);
  setTimeout(() => tone(440, 440, 0.15, 'square', 0.1), 200);
  setTimeout(() => tone(440, 440, 0.15, 'square', 0.1), 400);
}

/** Successful trade cha-ching */
export function playTrade(): void {
  tone(880, 880, 0.1, 'sine', 0.12);
  setTimeout(() => tone(1320, 1320, 0.15, 'sine', 0.12), 120);
}

/** Combat hit */
export function playHit(): void {
  noiseBurst(0.25, 0.18);
}

/** UI keypress blip */
export function playBlip(): void {
  tone(1200, 1200, 0.05, 'square', 0.05);
}

/** CRT power on */
export function playPowerOn(): void {
  tone(100, 800, 0.5, 'sawtooth', 0.06);
}
