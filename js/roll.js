// Roll the dice: pick one thing to watch from a chosen pool.
// pool() and pickFrom() only read data (the tests call them directly);
// roll() remembers the pick, and view() draws the page.
import { S, title, open, pitchOf } from './store.js';
import { esc } from './md.js';
import { onDisk, atWlv, availMarks } from './avail.js';
import { face, randomInt } from './dice.js';
import { poster, metaLine, playedOn, isMoodShelf, uiSelect, TIER, ENERGY } from './parts.js';

// The filter choices, as [value, label]. An audience is a set of list tiers.
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

// Every title that fits the filters, one entry per title. f is filtersOf(ui);
// skip is a Set of title ids set aside with "Not tonight".
export function pool(f, skip = new Set()) {
  const tiers = AUDIENCES.find(a => a[0] === f.aud)?.[2] || ALL_TIERS;
  const picked = new Map();
  for (const e of S.cur?.entries || []) {
    if (e.auto || !tiers.includes(e.tier) || picked.has(e.t) || skip.has(e.t)) continue;
    // Still to do: store picks not played lately, rentals not rented, everything else not watched.
    if (e.tier === 'W' ? !!playedOn(e) : e.tier === 'R' ? !!e.rented : !open(e)) continue;
    const t = title(e.t); if (!t) continue;
    if (f.night && f.night !== 'any' && e.energy !== f.night) continue;
    if (f.kind && f.kind !== 'all' && (t.kind || 'film') !== f.kind) continue;
    if (f.len && f.len !== 'any' && t.runtime && t.runtime > Number(f.len)) continue;
    if (f.where === 'disk' && !onDisk(t.id)) continue;
    if (f.where === 'wlv' && !atWlv(t.id)) continue;
    picked.set(e.t, e);
  }
  return [...picked.values()];
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
// Kept in memory only: the current pick, the last eight (so a re-roll doesn't
// repeat them), what's been set aside, and the faces the dice last landed on.
export const R = { current: null, recent: [], skip: new Set(), faces: [5, 2] };
export function roll(f) {
  const e = pickFrom(pool(f, R.skip), R.recent);
  R.current = e ? { t: e.t, tier: e.tier, energy: e.energy, section: e.section, note: e.note } : null;
  if (e) R.recent = [...R.recent.filter(x => x !== e.t), e.t].slice(-8);
  return R.current;
}

// ---------------------------------------------------------------- view
// Shorten to about n characters, at a word break.
const clip = (s, n = 320) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, s.lastIndexOf(' ', n)) + '…' : s; };

// The card for the pick: the pitch if Tristan's in the audience, else the note or synopsis.
function blurb(c) {
  const t = title(c.t); if (!t) return '';
  const said = (['B', 'B?', 'T'].includes(c.tier) && pitchOf(t.id)) || c.note || t.overview || t.syn || '';
  // "Together · dense night · Sci-fi", leaving out a shelf name that says nothing new.
  const list = [TIER[c.tier], c.energy && ENERGY[c.energy]?.toLowerCase()].filter(Boolean);
  const sec = String(c.section || '');
  const generic = isMoodShelf(sec) || /^(to rent|priority queue)$/i.test(sec) || list.some(x => x.toLowerCase() === sec.toLowerCase());
  const where = [...list, sec && !generic ? sec : ''].filter(Boolean).join(' · ');
  return `<article class="roll-card">
    <a class="roll-poster" href="#/t/${encodeURIComponent(t.id)}" tabindex="-1" aria-hidden="true">${poster(t, 'w342')}</a>
    <div class="roll-body">
      <p class="roll-where">${esc(where)}</p>
      <h2><a href="#/t/${encodeURIComponent(t.id)}">${esc(t.title)}</a></h2>
      <p class="row-meta">${metaLine(t)}</p>
      ${said ? `<p class="roll-said">${esc(clip(said))}</p>` : ''}
      <p class="row-marks">${availMarks(t.id)}</p>
    </div>
    <div class="actions left">
      <button class="btn ghost" data-act="roll-skip" data-t="${esc(t.id)}" type="button">Not tonight</button>
      <a class="btn" href="#/t/${encodeURIComponent(t.id)}">Open</a>
    </div>
  </article>`;
}

// The page: the dice button, the pick, and the filters (open until the first roll).
const labelOf = (choices, v) => choices.find(x => x[0] === v)?.[1];
export function view(ui) {
  const f = filtersOf(ui), n = pool(f, R.skip).length;
  const c = R.current && title(R.current.t) ? R.current : null;
  const sum = [labelOf(AUDIENCES, f.aud), labelOf(NIGHTS, f.night), labelOf(KINDS, f.kind),
    f.len !== 'any' && labelOf(LENGTHS, f.len), f.where !== 'any' && labelOf(WHERE, f.where)].filter(Boolean).join(' · ');
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
        ${uiSelect('rollAud', 'Who for', AUDIENCES.map(a => [a[0], a[1]]), f.aud, true)}
        ${uiSelect('rollNight', 'Night', NIGHTS, f.night, true)}
        ${uiSelect('rollKind', 'Kind', KINDS, f.kind, true)}
        ${uiSelect('rollLen', 'Length', LENGTHS, f.len, true)}
        ${uiSelect('rollWhere', 'Where', WHERE, f.where, true)}
        <label class="toggle"><input type="checkbox" data-ui="rollSound"${ui.rollSound !== false ? ' checked' : ''}><span>Dice sound</span></label>
      </div>
    </details>`;
}
// The roll filters as remembered per device, with defaults.
export const filtersOf = (ui) => ({ aud: ui.rollAud || 'together', night: ui.rollNight || 'any', kind: ui.rollKind || 'all', len: ui.rollLen || 'any', where: ui.rollWhere || 'any' });
