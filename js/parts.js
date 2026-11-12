// Shared pieces every view is built from: labels, posters, rows, shelves,
// filters, the Watched group and the icons. Each returns an HTML string.
import { S, title, verdictsOf, lbOf, pitchOf, seen, open } from './store.js';
import { esc } from './md.js';
import { availMarks } from './avail.js';

export const IMG = 'https://image.tmdb.org/t/p/';
export const ENERGY = { light: 'Light night', dense: 'Dense night', heavy: 'Heavy token' };
export const TIER = { B: 'Together', 'B?': 'Test together', M: 'Solo', T: 'Tristan’s queue', W: 'Store picks', C: 'Coming soon', R: 'Rent' };
// An entry the monthly pass added is parked until it is kept, so it stays off the shelves.
export const onShelf = (e) => !e.auto;
export const REACTION = { favourite: 'All-time favourite', loved: 'Loved it', liked: 'Liked it', mixed: 'Mixed', bounced: 'Bounced off', disliked: 'Disliked', seen: 'Seen' };
export const VIEWER = { both: 'Together', tristan: 'Tristan', meta: 'You' };
export const STATUS = { queued: 'To watch', ongoing: 'Ongoing', done: 'Done', dropped: 'Dropped' };
export const ROLE = { director: 'Directed', creator: 'Created', writer: 'Written', producer: 'Produced', composer: 'Music', cinematographer: 'Cinematography', actor: 'Cast' };
export const ROLE_RANK = { director: 0, creator: 1, writer: 2, producer: 3, cinematographer: 4, composer: 5, actor: 6 };

export const THEMES = [['luv', 'Luv Video', 'Black with neon green']];
export let LAYOUT = 'list';
export const setLayout = (l) => { LAYOUT = l === 'posters' ? 'posters' : 'list'; };
export function viewToggle() {
  return `<div class="viewsw" role="group" aria-label="View">${[['list', 'List'], ['posters', 'Posters']].map(([v, l]) => `<button type="button" data-act="layout" data-v="${v}" aria-pressed="${LAYOUT === v}">${l}</button>`).join('')}</div>`;
}
export function byline(t) {
  // Precomputed in the data so a row reads right before credits.json arrives.
  if (!t.credits) return t.by || '';
  const names = (r) => [...new Set((t.credits || []).filter(c => c.r === r).map(c => S.people[c.p]?.name).filter(Boolean))];
  const d = names('director'), w = names('writer').slice(0, 3), cr = names('creator');
  if (t.kind === 'series') return cr.length ? `Created by ${cr.join(', ')}` : d.length ? `Directed by ${d.join(', ')}` : '';
  if (!d.length) return w.length ? `Written by ${w.join(', ')}` : '';
  if (w.length && w.length === d.length && w.every(x => d.includes(x))) return `Written and directed by ${d.join(', ')}`;
  return `Directed by ${d.join(', ')}` + (w.length ? `. Written by ${w.join(', ')}` : '');
}

// ---------------------------------------------------------------- small parts
export function runtime(t) {
  if (t.kind === 'series' && t.seasons) return `${t.seasons} season${t.seasons > 1 ? 's' : ''}`;
  if (!t.runtime) return '';
  const h = Math.floor(t.runtime / 60), m = t.runtime % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}
export const initials = (s) => String(s).replace(/^(the|a|an)\s+/i, '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
export function poster(t, size = 'w154', cls = '') {
  if (t?.poster) return `<img class="poster ${cls}" src="${IMG}${size}${esc(t.poster)}" alt="" loading="lazy" decoding="async">`;
  return `<span class="poster ph ${cls}" data-kind="${esc(t?.kind || '')}" aria-hidden="true">${esc(initials(t?.title || '?'))}</span>`;
}
export function metaLine(t) {
  return [t.year, runtime(t), t.kind === 'series' ? 'Series' : t.kind === 'standup' ? 'Stand-up' : ''].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('');
}
export function marks(id, verdictShown = false) {
  const s = seen(id), l = lbOf(id), out = [];
  // In a Watched group the verdict chip already says who saw it.
  if (!verdictShown) {
    if (s.together) out.push('<span class="mark both" title="Watched together">Seen together</span>');
    else { if (s.tristan) out.push('<span class="mark">Tristan’s seen it</span>'); if (s.meta) out.push('<span class="mark">You’ve seen it</span>'); }
  }
  if (l?.rating) out.push(`<span class="mark rating" title="Your Letterboxd rating">${stars(l.rating)}</span>`);
  return out.join('') + availMarks(id);
}
// "Together: Loved it" from the newest verdict, for rows in a Watched group.
export function verdictMark(id, e) {
  const v = [...verdictsOf(id)].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).at(-1);
  if (v) return `<span class="mark verdict r-${esc(v.reaction)}">${esc(VIEWER[v.viewer] || '')}: ${esc(REACTION[v.reaction] || v.reaction)}</span>`;
  return e?.status === 'dropped' ? '<span class="mark verdict">Dropped</span>' : e?.status === 'done' ? '<span class="mark verdict">Done</span>' : '';
}
export const stars = (r) => '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '');

export function row(id, opts = {}) {
  const t = title(id); if (!t) return '';
  const e = opts.entry, p = opts.pitch !== false && pitchOf(t.id);
  const en = esc(e?.energy || (e?.tier === 'B?' ? 'test' : ''));
  const star = e?.star ? '<span class="star" title="Highest-confidence pick">★</span>' : '';
  if (LAYOUT === 'posters') return `<a class="pcard" href="#/t/${encodeURIComponent(t.id)}" data-energy="${en}">
    ${poster(t, 'w342')}<span class="pcard-title">${star}${esc(t.title)}</span><span class="row-meta">${metaLine(t)}</span></a>`;
  const by = byline(t);
  return `<a class="row${e?.star ? ' starred' : ''}" href="#/t/${encodeURIComponent(t.id)}" data-energy="${en}">
    ${poster(t)}
    <span class="row-main">
      <span class="row-title">${star}${esc(t.title)}</span>
      <span class="row-meta">${metaLine(t)}</span>
      ${by ? `<span class="row-by">${esc(by)}</span>` : ''}
      ${p ? `<span class="row-pitch">${esc(p)}</span>` : e?.note && opts.note !== false ? `<span class="row-pitch note">${esc(e.note)}</span>` : ''}
      ${t.overview || t.syn ? `<span class="row-syn">${esc(t.overview || t.syn)}</span>` : ''}
      ${opts.marks !== false ? `<span class="row-marks">${opts.verdict ? verdictMark(t.id, e) : ''}${marks(t.id, opts.verdict && verdictsOf(t.id).length > 0)}${t.match === 'pending' ? '<span class="mark">Looking it up</span>' : ''}</span>` : ''}
    </span>
  </a>`;
}
export function shelf(ui, key, head, inner, defaultOpen = true, cls = 'group shelf') {
  const isOpen = key in (ui.openShelves || {}) ? ui.openShelves[key] : defaultOpen;
  return `<details class="${cls}" data-shelf="${esc(key)}"${isOpen ? ' open' : ''}><summary><h2>${head}</h2></summary>${inner}</details>`;
}
export function empty(msg, action = '') { return `<div class="empty"><p>${msg}</p>${action}</div>`; }
export function filters(ui, keys) {
  const sel = (name, opts, val) => `<label class="filter"><span class="sr">${esc(name)}</span><select data-ui="${name}">${opts.map(([v, l]) => `<option value="${v}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return `<div class="filters">
    ${keys.includes('kind') ? sel('kind', [['all', 'Films & series'], ['film', 'Films'], ['series', 'Series']], ui.kind) : ''}
    ${sel('sort', [['curated', 'List order'], ['short', 'Shortest first'], ['new', 'Newest first'], ['old', 'Oldest first'], ['az', 'A to Z']], ui.sort)}
    ${viewToggle()}
  </div>`;
}
export function sortEntries(list, ui) {
  const t = (e) => title(e.t) || {};
  const by = {
    curated: (a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || (a.order ?? 0) - (b.order ?? 0),
    short: (a, b) => (t(a).runtime || 999) - (t(b).runtime || 999),
    new: (a, b) => (t(b).year || 0) - (t(a).year || 0),
    old: (a, b) => (t(a).year || 9999) - (t(b).year || 9999),
    az: (a, b) => String(t(a).title).localeCompare(String(t(b).title)),
  }[ui.sort] || ((a, b) => 0);
  return [...list].sort(by);
}
export const kindOk = (e, ui) => ui.kind === 'all' || !ui.kind || (title(e.t)?.kind || 'film') === ui.kind;
// Still to watch on this list. Anything watched by the list's audience (a verdict,
// or Letterboxd for solo), or marked done or dropped, moves to the Watched group.
export function visible(list, ui) { return list.filter(e => open(e) && kindOk(e, ui)); }
export function watchedOf(list, ui) { return list.filter(e => !open(e) && kindOk(e, ui)); }

// When it was last watched: the newest verdict, else the Letterboxd log date.
export function lastWatched(id) {
  const ds = verdictsOf(id).map(v => v.date).filter(Boolean).sort();
  return ds.at(-1) || lbOf(id)?.watched || '';
}
// The collapsed group at the bottom of a list, newest first.
export function watchedShelf(ui, key, list, rowOpts = {}) {
  if (!list.length) return '';
  const seenRows = [...list].sort((a, b) => String(lastWatched(b.t)).localeCompare(String(lastWatched(a.t))) || (a.order ?? 0) - (b.order ?? 0));
  return shelf(ui, key + ':watched', `Watched <span class="count">${seenRows.length}</span>`,
    `<p class="hint">Off the list once there’s a verdict. Newest first.</p><div class="rows">${seenRows.map(e => row(e.t, { ...rowOpts, entry: e, verdict: true })).join('')}</div>`,
    false, 'group shelf watched');
}

// Shelf names in the order curation.sectionOrder gives; anything not listed keeps
// its place after them.
export function orderSections(names) {
  const want = S.cur?.sectionOrder || [];
  const rank = (n) => { const i = want.indexOf(n); return i === -1 ? want.length + names.indexOf(n) : i; };
  return [...names].sort((a, b) => rank(a) - rank(b));
}
export function syncNote() {
  if (S.saving) return '<span class="sync busy">Saving…</span>';
  if (S.syncing) return '<span class="sync busy">Syncing…</span>';
  if (S.offline) return '<span class="sync warn">Offline copy</span>';
  if (S.error) return `<span class="sync warn">${esc(S.error)}</span>`;
  return '';
}

// A dice button in a list's header: rolls from that list.
export const rollButton = (aud) => `<button class="roll-mini" type="button" data-act="roll-from" data-v="${aud}" aria-label="Pick something at random from this list" title="Roll the dice">${ICON.dice}</button>`;

// A played pick comes back after six months so it can go on the screens again.
export const PLAY_RESET_DAYS = 183;
export function playedOn(e) {
  if (!e.played) return null;
  const days = (Date.now() - Date.parse(e.played)) / 86400000;
  return days >= 0 && days < PLAY_RESET_DAYS ? e.played : null;
}
// ---------------------------------------------------------------- icons
export const sv = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const ICON = {
  wolf: sv('<path d="M6.5 3.2 9.8 7.1l2.9-.2L12.1 2.8l3.2 4.4c1.3.8 2.4 1.9 3.1 3.2l3.5 2-2.2 1.6-3.4.3-1.9 2.7-4.8 1.8-3-.4-1.3-2.4c-.6-2.9-.5-5.3.1-7.1.5-1.9 1.3-3 1.8-3.6z"/><circle cx="14.8" cy="10.7" r=".8" fill="currentColor" stroke="none"/>'),
  tape: sv('<path d="M3.5 9.5V19a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1V9.5"/><path d="M2.4 9.5 4.1 5a1 1 0 0 1 .94-.65h13.92a1 1 0 0 1 .94.65l1.7 4.5"/><path d="M9.2 20v-5.6h5.6V20"/>'),
  inbox: sv('<path d="M12 2.8v8.4m0 0 3-3m-3 3-3-3"/><path d="M3.2 13.6h4.4l1.3 2.2h6.2l1.3-2.2h4.4"/><path d="M3.2 13.6 5.4 6.9a1 1 0 0 1 .95-.7h1.9M21.2 13.6 19 6.9a1 1 0 0 0-.95-.7h-1.9"/><path d="M3.2 13.6V19a1.6 1.6 0 0 0 1.6 1.6h14.4a1.6 1.6 0 0 0 1.6-1.6v-5.4"/>'),
  plus: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 8.2v7.6M8.2 12h7.6"/>'),
  tray: sv('<path d="M3 13.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.5"/><path d="M3 13.5h5l1.2 2h5.6l1.2-2h5"/><path d="M12 3v7m0 0 2.6-2.6M12 10 9.4 7.4"/>'),
  verify: sv('<path d="M7 4h7l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 4v4h4"/><path d="M9 14l2.2 2.2L15.5 12"/>'),
  star: sv('<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/>'),
  dice: sv('<rect x="3" y="7" width="12" height="12" rx="2.5"/><path d="M9 7V5.5A2.5 2.5 0 0 1 11.5 3H18.5A2.5 2.5 0 0 1 21 5.5V12.5A2.5 2.5 0 0 1 18.5 15H15"/><circle cx="6.5" cy="10.5" r=".9" fill="currentColor" stroke="none"/><circle cx="11.5" cy="15.5" r=".9" fill="currentColor" stroke="none"/><circle cx="9" cy="13" r=".9" fill="currentColor" stroke="none"/><circle cx="17.5" cy="6.5" r=".9" fill="currentColor" stroke="none"/>'),
  disc: sv('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.6"/><path d="M12 3a9 9 0 0 1 7.5 4"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.1 14.7a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.6 1.1v.2a1.8 1.8 0 0 1-3.6 0v-.1a1.5 1.5 0 0 0-2.6-1.1l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1.1-2.6h-.2a1.8 1.8 0 0 1 0-3.6h.1a1.5 1.5 0 0 0 1.1-2.6l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.2a1.8 1.8 0 0 1 3.6 0v.1a1.5 1.5 0 0 0 2.6 1.1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.2a1.8 1.8 0 0 1 0 3.6h-.1a1.5 1.5 0 0 0-1.4.9z"/>'),
};
