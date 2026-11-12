// The randomizer: pick one thing to watch from a chosen pool.
// pool() is pure (and tested); view() and roll() are the screen.
import { S, title, open, pitchOf } from './store.js';
import { esc } from './md.js';
import { onDisk, atWlv, availMarks } from './avail.js';
import { face, randomInt } from './dice.js';
import { poster, runtime, playedOn, TIER, ENERGY } from './ui.js';

// Who it's for. Each audience is a set of list tiers.
export const AUDIENCES = [
  ['all', 'Anything', null],
  ['together', 'Together', ['B', 'B?']],
  ['sure', 'Together, sure bets', ['B']],
  ['test', 'Test together', ['B?']],
  ['solo', 'Just me', ['M']],
  ['tristan', 'Tristan’s queue', ['T']],
  ['store', 'Store picks', ['W']],
  ['rent', 'To rent', ['R']],
];
const ALL_TIERS = ['B', 'B?', 'M', 'T'];   // "Anything" means the watchlists, not the shop's programme
export const NIGHTS = [['any', 'Any night'], ['light', 'Light'], ['dense', 'Dense'], ['heavy', 'Heavy token']];
export const KINDS = [['all', 'Films & series'], ['film', 'Films'], ['series', 'Series']];
export const LENGTHS = [['any', 'Any length'], ['90', 'Under 1½ hours'], ['120', 'Under 2 hours']];
export const WHERE = [['any', 'Anywhere'], ['disk', 'On disk'], ['wlv', 'At We Luv Video']];

// Every title that fits the filters, one entry per title. `skip` is a Set of ids.
export function pool(f, skip = new Set()) {
  const tiers = AUDIENCES.find(a => a[0] === f.aud)?.[2] || ALL_TIERS;
  const seen = new Map();
  for (const e of S.cur?.entries || []) {
    if (e.auto || !tiers.includes(e.tier) || seen.has(e.t) || skip.has(e.t)) continue;
    if (e.tier === 'W' ? !!playedOn(e) : e.tier === 'R' ? !!e.rented : !open(e)) continue;
    const t = title(e.t); if (!t) continue;
    if (f.night && f.night !== 'any' && e.energy !== f.night) continue;
    if (f.kind && f.kind !== 'all' && (t.kind || 'film') !== f.kind) continue;
    if (f.len && f.len !== 'any' && t.runtime && t.runtime > Number(f.len)) continue;
    if (f.where === 'disk' && !onDisk(t.id)) continue;
    if (f.where === 'wlv' && !atWlv(t.id)) continue;
    seen.set(e.t, e);
  }
  return [...seen.values()];
}

// One pick, avoiding the last few results unless that would leave nothing.
export function pickFrom(list, recent = []) {
  if (!list.length) return null;
  const fresh = list.filter(e => !recent.includes(e.t));
  const from = fresh.length ? fresh : list.filter(e => e.t !== recent[recent.length - 1]);
  const src = from.length ? from : list;
  return src[randomInt(src.length)];
}

// ---------------------------------------------------------------- state for this visit
export const R = { current: null, recent: [], skip: new Set(), faces: [5, 2] };
export function roll(f) {
  const e = pickFrom(pool(f, R.skip), R.recent);
  R.current = e ? { t: e.t, tier: e.tier, energy: e.energy, section: e.section, note: e.note } : null;
  if (e) R.recent = [...R.recent.filter(x => x !== e.t), e.t].slice(-8);
  return R.current;
}

// ---------------------------------------------------------------- view
const clip = (s, n = 320) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, s.lastIndexOf(' ', n)) + '…' : s; };
const select = (key, label, opts, val) => `<label class="filter"><span>${esc(label)}</span><select data-ui="${key}">${opts.map(([v, l]) =>
  `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;

function blurb(c) {
  const t = title(c.t); if (!t) return '';
  const said = (['B', 'B?', 'T'].includes(c.tier) && pitchOf(t.id)) || c.note || t.overview || t.syn || '';
  // List, night, and shelf, skipping a shelf name that only repeats the other two.
  const said2 = [TIER[c.tier], c.energy && ENERGY[c.energy]?.toLowerCase()].filter(Boolean);
  const generic = /^(light nights|dense nights|heavy tokens|test together|new picks|to rent|priority queue)$/i.test(c.section || '') ||
    said2.some(x => x.toLowerCase() === String(c.section || '').toLowerCase());
  const where = [...said2, c.section && !generic ? c.section : ''].filter(Boolean).join(' · ');
  return `<article class="roll-card">
    <a class="roll-poster" href="#/t/${encodeURIComponent(t.id)}" tabindex="-1" aria-hidden="true">${poster(t, 'w342')}</a>
    <div class="roll-body">
      <p class="roll-where">${esc(where)}</p>
      <h2><a href="#/t/${encodeURIComponent(t.id)}">${esc(t.title)}</a></h2>
      <p class="row-meta">${[t.year, runtime(t), t.kind === 'series' ? 'Series' : ''].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</p>
      ${said ? `<p class="roll-said">${esc(clip(said))}</p>` : ''}
      <p class="row-marks">${availMarks(t.id)}</p>
    </div>
    <div class="actions left">
      <button class="btn ghost" data-act="roll-skip" data-t="${esc(t.id)}" type="button">Not tonight</button>
      <a class="btn" href="#/t/${encodeURIComponent(t.id)}">Open</a>
    </div>
  </article>`;
}

export function view(ui) {
  const f = filtersOf(ui), n = pool(f, R.skip).length;
  const c = R.current && title(R.current.t) ? R.current : null;
  const sum = [AUDIENCES.find(a => a[0] === f.aud)?.[1], NIGHTS.find(x => x[0] === f.night)?.[1], KINDS.find(x => x[0] === f.kind)?.[1],
    f.len !== 'any' && LENGTHS.find(x => x[0] === f.len)?.[1], f.where !== 'any' && WHERE.find(x => x[0] === f.where)?.[1]].filter(Boolean).join(' · ');
  return `<header class="view-head"><a class="back" href="#/more" data-act="back">Back</a><h1>Roll the dice</h1></header>
    <div class="roll-stage">
      <button class="roll-btn" data-act="roll" type="button"${n ? '' : ' disabled'}>
        <span class="dice" id="dice">${R.faces.map(face).join('')}</span>
        <span class="roll-label">${c ? 'Roll again' : 'Roll'}</span>
      </button>
      <p class="hint roll-count">${n ? `From ${n} title${n === 1 ? '' : 's'}` : 'Nothing fits those filters.'}${R.skip.size ? ` · ${R.skip.size} set aside <button class="linkish" data-act="roll-unskip" type="button">bring back</button>` : ''}</p>
    </div>
    <div id="roll-result" aria-live="polite">${c ? blurb(c) : ''}</div>
    <details class="roll-opts"${!c || ui.rollOptsOpen ? ' open' : ''}><summary data-act="roll-opts"><span>Narrow it down</span> <span class="hint">${esc(sum)}</span></summary>
      <div class="roll-filters">
        ${select('rollAud', 'Who for', AUDIENCES.map(a => [a[0], a[1]]), f.aud)}
        ${select('rollNight', 'Night', NIGHTS, f.night)}
        ${select('rollKind', 'Kind', KINDS, f.kind)}
        ${select('rollLen', 'Length', LENGTHS, f.len)}
        ${select('rollWhere', 'Where', WHERE, f.where)}
        <label class="toggle"><input type="checkbox" data-ui="rollSound"${ui.rollSound !== false ? ' checked' : ''}><span>Dice sound</span></label>
      </div>
    </details>`;
}
export const filtersOf = (ui) => ({ aud: ui.rollAud || 'together', night: ui.rollNight || 'any', kind: ui.rollKind || 'all', len: ui.rollLen || 'any', where: ui.rollWhere || 'any' });
