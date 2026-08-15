// Small math and helper utilities.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Format milliseconds as M:SS.mmm
export function fmtTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
}

export function fmtClock(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${t}`;
}

export function hslToHex(h, s = 0.85, l = 0.55) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return parseInt(f(0) + f(8) + f(4), 16);
}

// Deterministic hash-based noise (for terrain) — simple value noise.
export function makeNoise(seed = 1) {
  const s = Math.sin(seed) * 10000;
  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + s) * 43758.5453;
    return n - Math.floor(n);
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  return function noise2D(x, y, freq = 1) {
    const X = x * freq, Y = y * freq;
    const x0 = Math.floor(X), y0 = Math.floor(Y);
    const fx = X - x0, fy = Y - y0;
    const v00 = hash(x0, y0), v10 = hash(x0 + 1, y0);
    const v01 = hash(x0, y0 + 1), v11 = hash(x0 + 1, y0 + 1);
    const sx = smooth(fx), sy = smooth(fy);
    return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
  };
}

// Safe localStorage wrapper (may throw in some contexts).
export function loadSave(defaults) {
  try {
    const raw = localStorage.getItem('apexVelocitySave');
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return { ...defaults };
}
export function persistSave(save) {
  try { localStorage.setItem('apexVelocitySave', JSON.stringify(save)); } catch (e) { /* ignore */ }
}
