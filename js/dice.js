// Two dice for the randomizer: the faces, a short tumble, and a clatter made
// with Web Audio (no sound files to download). Purely decorative — the pick
// itself is made in roll.js.

// Pip positions on a 3x3 grid, numbered 0..8 left to right, top to bottom.
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export function face(n) {
  const dots = (PIPS[n] || PIPS[1]).map(i => `<circle cx="${7 + (i % 3) * 8}" cy="${7 + Math.floor(i / 3) * 8}" r="2.3"/>`).join('');
  return `<svg class="die" viewBox="0 0 30 30" aria-hidden="true"><rect x="1.5" y="1.5" width="27" height="27" rx="6"/>${dots}</svg>`;
}
export const d6 = () => 1 + randomInt(6);

// Unbiased integer in [0, n).
export function randomInt(n) {
  if (n <= 1) return 0;
  const max = Math.floor(0x100000000 / n) * n, buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= max);
  return buf[0] % n;
}

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Tumble the dice inside `box` for about two-thirds of a second, then settle.
// Resolves with the two faces they land on. With reduced motion, they just land.
export function tumble(box) {
  let faces = [d6(), d6()];
  const show = () => { faces = [d6(), d6()]; if (box) box.innerHTML = faces.map(face).join(''); };
  if (!box || calm()) { show(); return Promise.resolve(faces); }
  box.classList.remove('rolling'); void box.offsetWidth; box.classList.add('rolling');
  return new Promise(res => {
    let n = 0;
    const tick = setInterval(() => {
      show();
      if (++n >= 8) { clearInterval(tick); box.classList.remove('rolling'); res(faces); }
    }, 80);
  });
}

// ---------------------------------------------------------------- the clatter
let ctx = null, noise = null;
function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx ||= new AC();
  if (ctx.state === 'suspended') ctx.resume();
  if (!noise) {
    // 40 ms of noise that dies away fast: one die hitting the table.
    const len = Math.floor(ctx.sampleRate * 0.04);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  }
  return ctx;
}
function knock(ac, at, level, pitch) {
  const src = ac.createBufferSource(); src.buffer = noise;
  const band = ac.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = pitch; band.Q.value = 3;
  const g = ac.createGain(); g.gain.value = level;
  src.connect(band).connect(g).connect(ac.destination);
  src.start(at);
}
// Six to eight knocks, closer together and softer as the dice settle, then a
// low thud as they stop. Must be called from a click or key press.
export function rattle() {
  let ac;
  try { ac = audio(); } catch { return; }
  if (!ac) return;
  const t0 = ac.currentTime + 0.01, hits = 6 + randomInt(3);
  let t = t0;
  for (let i = 0; i < hits; i++) {
    knock(ac, t, 0.9 * (1 - i / (hits + 2)), 1800 + Math.random() * 1800);
    t += 0.11 * Math.pow(0.82, i) + Math.random() * 0.03;
  }
  const thud = ac.createOscillator(), g = ac.createGain();
  thud.type = 'sine'; thud.frequency.setValueAtTime(150, t); thud.frequency.exponentialRampToValueAtTime(70, t + 0.12);
  g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  thud.connect(g).connect(ac.destination); thud.start(t); thud.stop(t + 0.18);
}
