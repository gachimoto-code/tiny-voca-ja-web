// Log-mel spectrogram extraction matching the vocoder pilot's reference
// implementation (tiny-voca-ja/vocoder-pilot/ours/mel.py, PyTorch) exactly:
//
//   SR 24000, n_fft 1024, hop 256, win 1024 (periodic Hann),
//   reflect-pad (n_fft - hop) / 2 = 384 samples on both sides, center=False,
//   magnitude = sqrt(re^2 + im^2 + 1e-9),
//   80 Slaney-scale mel bands (fmin 0, fmax 12000) with area normalization,
//   log(clamp(mel, min=1e-5)).
//
// Verified against the Python reference output (see scripts/check-mel.ts):
// max abs error in the log domain stays well below 0.01.

export const MEL_SR = 24000;
export const MEL_N_FFT = 1024;
export const MEL_HOP = 256;
export const MEL_NUM_BANDS = 80;
const MEL_FMIN = 0;
const MEL_FMAX = 12000;
const EPS = 1e-9;
const MEL_FLOOR = 1e-5;

// ---- Slaney mel scale -------------------------------------------------

const F_SP = 200 / 3;
const MIN_LOG_HZ = 1000;
const MIN_LOG_MEL = MIN_LOG_HZ / F_SP;
const LOGSTEP = Math.log(6.4) / 27;

function hzToMel(hz: number): number {
  const linear = hz / F_SP;
  return hz >= MIN_LOG_HZ
    ? MIN_LOG_MEL + Math.log(hz / MIN_LOG_HZ) / LOGSTEP
    : linear;
}

function melToHz(mel: number): number {
  const linear = mel * F_SP;
  return mel >= MIN_LOG_MEL
    ? MIN_LOG_HZ * Math.exp(LOGSTEP * (mel - MIN_LOG_MEL))
    : linear;
}

// ---- Mel filterbank [80, 513] -----------------------------------------

let filterbankCache: Float64Array | null = null;

function melFilterbank(): Float64Array {
  if (filterbankCache) return filterbankCache;
  const nBins = MEL_N_FFT / 2 + 1;
  const fb = new Float64Array(MEL_NUM_BANDS * nBins);
  // fftfreqs = linspace(0, SR/2, 513)
  const fftFreqs = new Float64Array(nBins);
  for (let i = 0; i < nBins; i++) fftFreqs[i] = (MEL_SR / 2) * (i / (nBins - 1));
  // mel points = linspace(hzToMel(fmin), hzToMel(fmax), 82) -> Hz
  const minMel = hzToMel(MEL_FMIN);
  const maxMel = hzToMel(MEL_FMAX);
  const hzPoints = new Float64Array(MEL_NUM_BANDS + 2);
  for (let i = 0; i < hzPoints.length; i++) {
    hzPoints[i] = melToHz(minMel + ((maxMel - minMel) * i) / (hzPoints.length - 1));
  }
  for (let band = 0; band < MEL_NUM_BANDS; band++) {
    const left = hzPoints[band];
    const center = hzPoints[band + 1];
    const right = hzPoints[band + 2];
    const enorm = 2 / (right - left);
    for (let bin = 0; bin < nBins; bin++) {
      const f = fftFreqs[bin];
      const up = (f - left) / (center - left);
      const down = (right - f) / (right - center);
      const v = Math.min(up, down);
      fb[band * nBins + bin] = (v > 0 ? v : 0) * enorm;
    }
  }
  filterbankCache = fb;
  return fb;
}

// ---- Periodic Hann window ----------------------------------------------

let windowCache: Float64Array | null = null;

function hannWindow(): Float64Array {
  if (windowCache) return windowCache;
  const w = new Float64Array(MEL_N_FFT);
  for (let n = 0; n < MEL_N_FFT; n++) {
    w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / MEL_N_FFT);
  }
  windowCache = w;
  return w;
}

// ---- Radix-2 FFT (in place, size must be a power of two) ---------------

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curR = 1;
      let curI = 0;
      for (let k = 0; k < half; k++) {
        const aR = re[i + k];
        const aI = im[i + k];
        const bR = re[i + k + half] * curR - im[i + k + half] * curI;
        const bI = re[i + k + half] * curI + im[i + k + half] * curR;
        re[i + k] = aR + bR;
        im[i + k] = aI + bI;
        re[i + k + half] = aR - bR;
        im[i + k + half] = aI - bI;
        const nextR = curR * wr - curI * wi;
        curI = curR * wi + curI * wr;
        curR = nextR;
      }
    }
  }
}

// ---- Reflect padding (PyTorch mode="reflect": edge not repeated) ------

function reflectIndex(i: number, length: number): number {
  let x = i;
  while (x < 0 || x >= length) {
    if (x < 0) x = -x;
    if (x >= length) x = 2 * length - 2 - x;
  }
  return x;
}

// ---- Public API ----------------------------------------------------------

/**
 * Extract the log-mel spectrogram of a 24 kHz mono waveform.
 * Returns { mel, frames } with mel laid out as [80, frames] (row-major),
 * ready to feed to the vocoder as a [1, 80, frames] tensor.
 */
export function extractMel(wav: Float32Array): { mel: Float32Array; frames: number } {
  const pad = (MEL_N_FFT - MEL_HOP) / 2; // 384
  const paddedLength = wav.length + 2 * pad;
  const frames = Math.floor((paddedLength - MEL_N_FFT) / MEL_HOP) + 1;
  const window = hannWindow();
  const fb = melFilterbank();
  const nBins = MEL_N_FFT / 2 + 1;
  const mel = new Float32Array(MEL_NUM_BANDS * frames);
  const re = new Float64Array(MEL_N_FFT);
  const im = new Float64Array(MEL_N_FFT);
  const mag = new Float64Array(nBins);

  for (let frame = 0; frame < frames; frame++) {
    const start = frame * MEL_HOP;
    for (let n = 0; n < MEL_N_FFT; n++) {
      const idx = reflectIndex(start + n - pad, wav.length);
      re[n] = wav[idx] * window[n];
      im[n] = 0;
    }
    fft(re, im);
    for (let bin = 0; bin < nBins; bin++) {
      mag[bin] = Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin] + EPS);
    }
    for (let band = 0; band < MEL_NUM_BANDS; band++) {
      let acc = 0;
      const base = band * nBins;
      for (let bin = 0; bin < nBins; bin++) acc += fb[base + bin] * mag[bin];
      mel[band * frames + frame] = Math.log(Math.max(acc, MEL_FLOOR));
    }
  }
  return { mel, frames };
}
