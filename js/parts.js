// Shared pieces every view is built from: labels, posters, list rows, shelves,
// filters, the Watched group and the icons. Every function here returns a string
// of HTML; main.js puts it on the page. Anything that comes from the data goes
// through esc() first, so a title can never inject markup.
import { S, title, verdictsOf, lbOf, pitchOf, seen, open } from './store.js';
import { esc } from './md.js';
import { availMarks } from './avail.js';

// ---------------------------------------------------------------- labels
export const IMG = 'https://image.tmdb.org/t/p/';   // TMDB poster and photo base URL
// S: the user picked the title and left the list to the next curation run, which
// replaces it with a real tier and writes the pitch and notes (CURATION.md, "Sort requests").
export const TIER = { B: 'Together', 'B?': 'Test together', M: 'Solo', T: 'Tristan’s queue', W: 'Store picks', C: 'Coming soon', R: 'Rent', S: 'For Claude to sort' };
export const SORT_SHELF = 'For Claude to sort';
export const ENERGY = { light: 'Light night', dense: 'Dense night', heavy: 'Heavy token' };
export const REACTION = { favourite: 'All-time favourite', loved: 'Loved it', liked: 'Liked it', mixed: 'Mixed', bounced: 'Bounced off', disliked: 'Disliked', seen: 'Seen' };
export const VIEWER = { both: 'Together', tristan: 'Tristan', meta: 'You' };
export const STATUS = { queued: 'To watch', ongoing: 'Ongoing', done: 'Done', dropped: 'Dropped' };
export const ROLE = { director: 'Directed', creator: 'Created', writer: 'Written', producer: 'Produced', composer: 'Music', cinematographer: 'Cinematography', actor: 'Cast' };
export const ROLE_RANK = { director: 0, creator: 1, writer: 2, producer: 3, cinematographer: 4, composer: 5, actor: 6 };

// An entry the monthly pass added waits in Incoming (auto: true) until it's kept.
export const onShelf = (e) => !e.auto;

// Shelf names that describe a mood rather than a subject. Older entries still use
// them; they're shown as "Other picks" and sorted last.
export const isMoodShelf = (name) => /^(Light nights|Dense nights|Heavy tokens|Test together|New picks)$/i.test(name || '');

// ---------------------------------------------------------------- list or poster layout
// Chosen in the filters bar, remembered per device by main.js.
export let LAYOUT = 'list';
export const setLayout = (l) => { LAYOUT = l === 'posters' ? 'posters' : 'list'; };
export function viewToggle() {
  return `<div class="viewsw" role="group" aria-label="View">${[['list', 'List'], ['posters', 'Posters']].map(([v, l]) =>
    `<button type="button" data-act="layout" data-v="${v}" aria-pressed="${LAYOUT === v}">${l}</button>`).join('')}</div>`;
}

// ---------------------------------------------------------------- small parts
// <option>s for a select; pairs is [[value, label], …].
export const options = (pairs, val) => pairs.map(([v, l]) =>
  `<option value="${esc(v)}"${String(v) === String(val ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
// A shelf heading with its count: "Comedies (6)".
export const heading = (label, n) => `${esc(label)} <span class="count">${n}</span>`;
export const empty = (msg, action = '') => `<div class="empty"><p>${msg}</p>${action}</div>`;
export const stars = (r) => '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '');

export function runtime(t) {
  if (t.kind === 'series' && t.seasons) return `${t.seasons} season${t.seasons > 1 ? 's' : ''}`;
  if (!t.runtime) return '';
  const h = Math.floor(t.runtime / 60), m = t.runtime % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}
// Year, length, kind, then the rating badges (left out on the title page, which has its own).
export function metaLine(t, { ratings = true } = {}) {
  return [t.year, runtime(t), t.kind === 'series' ? 'Series' : t.kind === 'standup' ? 'Stand-up' : '']
    .filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('') + (ratings ? ratingBadges(t) : '');
}

// ---------------------------------------------------------------- ratings
// From data/ratings.json: tmdb (out of 10) and votes; rt (Tomatometer %) and rtVotes
// (critics' reviews); audience (Rotten Tomatoes audience %) and audienceVotes; rtUrl, the
// title's Rotten Tomatoes page when known. Any of them may be missing.
export const ratingOf = (id) => S.ratings?.[id] || null;
// A TMDB average from a handful of votes says little, so below this it isn't shown in
// lists or used for sorting (the title page still shows it, with the count).
export const MIN_VOTES = 20;
const tmdbScore = (r) => (r?.tmdb != null && r.votes >= MIN_VOTES ? r.tmdb : null);
const count = (n, one, many) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

// A red tomato for Rotten Tomatoes, a blue television for TMDB (colours in app.css).
const TOMATO = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle class="tomato" cx="12" cy="13.6" r="8.4"/>'
  + '<path class="leaf" d="M12 4.1L12.9 6.5L16.4 6.4L13.4 7.7L14.7 10.1L12 8.5L9.3 10.1L10.6 7.7L7.6 6.4L11.1 6.5Z"/>'
  + '<path class="stem" d="M12 7V3.2" stroke-width="1.8" stroke-linecap="round"/></svg>';
const TV = '<svg class="ico tv" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + '<rect x="2.5" y="7" width="19" height="13" rx="2.5"/><path d="M8 2.8l4 4 4-4"/></svg>';

// Where each badge leads: the Rotten Tomatoes page if known, else a search there for the
// title; the TMDB page.
const rtLink = (t, r) => r.rtUrl || `https://www.rottentomatoes.com/search?search=${encodeURIComponent(t.title)}`;
const tmdbLink = (t) => (t.tmdb?.id ? `https://www.themoviedb.org/${t.tmdb.type === 'tv' ? 'tv' : 'movie'}/${t.tmdb.id}`
  : `https://www.themoviedb.org/search?query=${encodeURIComponent(t.title)}`);
// The hover text: what each figure is and how many people it rests on.
function rtTip(r) {
  const crit = `Rotten Tomatoes: ${r.rt}% of ${r.rtVotes ? count(r.rtVotes, 'critic', 'critics') : 'critics'} liked it`;
  const aud = r.audience != null ? `; audience score ${r.audience}%${r.audienceVotes ? ` from ${count(r.audienceVotes, 'rating', 'ratings')}` : ''}` : '';
  return crit + aud;
}
const tmdbTip = (r) => `TMDB users: ${r.tmdb.toFixed(1)} out of 10 from ${count(r.votes, 'vote', 'votes')}`;

// The badges. In lists they sit inside a row that is itself a link, so they can't be links
// too: they carry data-href and main.js opens it (in a new tab) instead of the row. On the
// title page (full) they're real links and spell the counts out, since phones can't hover.
export function ratingBadges(t, { full = false } = {}) {
  const r = ratingOf(t.id); if (!r) return '';
  const badge = (href, tip, icon, text) => full
    ? `<a class="rate" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(tip)}">${icon}<span>${esc(text)}</span></a>`
    : `<span class="rate" data-href="${esc(href)}" role="link" tabindex="0" title="${esc(tip)}" aria-label="${esc(tip)}">${icon}${esc(text)}</span>`;
  const out = [];
  if (r.rt != null) out.push(badge(rtLink(t, r), rtTip(r), TOMATO, full
    ? `${r.rt}%${r.rtVotes ? ` of ${count(r.rtVotes, 'review', 'reviews')}` : ''}${r.audience != null ? ` · audience ${r.audience}%` : ''}` : `${r.rt}%`));
  if (full ? r.tmdb != null : tmdbScore(r) != null) out.push(badge(tmdbLink(t), tmdbTip(r), TV, full
    ? `${r.tmdb.toFixed(1)} · ${count(r.votes, 'vote', 'votes')}` : r.tmdb.toFixed(1)));
  return full ? (out.length ? `<p class="ratings">${out.join('')}</p>` : '') : out.join('');
}
// "Written and directed by …". Uses the full credits once they've loaded, and the
// short line precomputed in titles.json (t.by) until then.
export function byline(t) {
  if (!t.credits) return t.by || '';
  const names = (r) => [...new Set(t.credits.filter(c => c.r === r).map(c => S.people[c.p]?.name).filter(Boolean))];
  const d = names('director'), w = names('writer').slice(0, 3), cr = names('creator');
  if (t.kind === 'series') return cr.length ? `Created by ${cr.join(', ')}` : d.length ? `Directed by ${d.join(', ')}` : '';
  if (!d.length) return w.length ? `Written by ${w.join(', ')}` : '';
  if (w.length === d.length && w.every(x => d.includes(x))) return `Written and directed by ${d.join(', ')}`;
  return `Directed by ${d.join(', ')}` + (w.length ? `. Written by ${w.join(', ')}` : '');
}

// A poster, or a striped placeholder with the title's initials when there isn't one.
const initials = (s) => String(s).replace(/^(the|a|an)\s+/i, '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
export function poster(t, size = 'w154', cls = '') {
  if (t?.poster) return `<img class="poster ${cls}" src="${IMG}${size}${esc(t.poster)}" alt="" loading="lazy" decoding="async">`;
  return `<span class="poster ph ${cls}" data-kind="${esc(t?.kind || '')}" aria-hidden="true">${esc(initials(t?.title || '?'))}</span>`;
}

// The small chips under a row: who has seen it, your Letterboxd rating, and
// whether it's on disk or at the video store. In a Watched group the verdict chip
// already says who saw it, so that part is skipped.
export function marks(id, verdictShown = false) {
  const s = seen(id), l = lbOf(id), out = [];
  if (!verdictShown) {
    if (s.together) out.push('<span class="mark both" title="Watched together">Seen together</span>');
    else {
      if (s.tristan) out.push('<span class="mark">Tristan’s seen it</span>');
      if (s.meta) out.push('<span class="mark">You’ve seen it</span>');
    }
  }
  if (l?.rating) out.push(`<span class="mark rating" title="Your Letterboxd rating">${stars(l.rating)}</span>`);
  return out.join('') + availMarks(id);
}
// "Together: Loved it", from the newest verdict, for rows in a Watched group.
function verdictMark(id, e) {
  const v = [...verdictsOf(id)].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).at(-1);
  if (v) return `<span class="mark verdict r-${esc(v.reaction)}">${esc(VIEWER[v.viewer] || '')}: ${esc(REACTION[v.reaction] || v.reaction)}</span>`;
  if (e?.status === 'dropped') return '<span class="mark verdict">Dropped</span>';
  if (e?.status === 'done') return '<span class="mark verdict">Done</span>';
  return '';
}

// ---------------------------------------------------------------- one row in a list
// opts: entry   the list entry it belongs to (colours the edge by energy, shows its note)
//       pitch   false to hide Tristan's pitch      note    false to hide the entry's note
//       marks   false to hide the chips            verdict true to show the newest verdict
export function row(id, opts = {}) {
  const t = title(id); if (!t) return '';
  const e = opts.entry, p = opts.pitch !== false && pitchOf(t.id);
  const energy = esc(e?.energy || (e?.tier === 'B?' ? 'test' : ''));
  const star = e?.star ? '<span class="star" title="Highest-confidence pick">★</span>' : '';
  const href = `#/t/${encodeURIComponent(t.id)}`;
  if (LAYOUT === 'posters') return `<a class="pcard" href="${href}" data-energy="${energy}">
    ${poster(t, 'w342')}<span class="pcard-title">${star}${esc(t.title)}</span><span class="row-meta">${metaLine(t)}</span></a>`;

  const by = byline(t), syn = t.overview || t.syn;
  const said = p ? `<span class="row-pitch">${esc(p)}</span>`
    : e?.note && opts.note !== false ? `<span class="row-pitch note">${esc(e.note)}</span>` : '';
  const chips = opts.marks === false ? '' : `<span class="row-marks">${opts.verdict ? verdictMark(t.id, e) : ''}${
    marks(t.id, opts.verdict && verdictsOf(t.id).length > 0)}${t.match === 'pending' ? '<span class="mark">Looking it up</span>' : ''}</span>`;
  return `<a class="row${e?.star ? ' starred' : ''}" href="${href}" data-energy="${energy}">
    ${poster(t)}
    <span class="row-main">
      <span class="row-title">${star}${esc(t.title)}</span>
      <span class="row-meta">${metaLine(t)}</span>
      ${by ? `<span class="row-by">${esc(by)}</span>` : ''}
      ${said}
      ${syn ? `<span class="row-syn">${esc(syn)}</span>` : ''}
      ${chips}
    </span>
  </a>`;
}
// A list of rows. items can be entries ({ t, … }) or plain title ids.
export const rows = (items, opts = {}, cls = 'rows') =>
  `<div class="${cls}">${items.map(x => typeof x === 'string' ? row(x, opts) : row(x.t, { ...opts, entry: x })).join('')}</div>`;

// ---------------------------------------------------------------- shelves
// A collapsible section. key identifies it, so main.js can remember per device
// whether it was left open. head is HTML (use heading() for "Name (n)").
// options: open   whether it starts open before the person has touched it
//          cls    CSS classes ("group shelf" for a top-level group, "shelf sub" inside one)
//          attrs  extra attributes, e.g. ' data-energy="light"' to colour it
export function shelf(ui, key, head, inner, { open = true, cls = 'group shelf', attrs = '' } = {}) {
  const isOpen = key in (ui.openShelves || {}) ? ui.openShelves[key] : open;
  return `<details class="${cls}" data-shelf="${esc(key)}"${attrs}${isOpen ? ' open' : ''}><summary><h2>${head}</h2></summary>${inner}</details>`;
}

// Shelf names in the order data/curation.json "sectionOrder" gives; names not
// listed keep their order after them, and mood names go last.
export function orderSections(names) {
  const want = S.cur?.sectionOrder || [];
  const rank = (n) => isMoodShelf(n) ? 1e6 : want.includes(n) ? want.indexOf(n) : want.length + names.indexOf(n);
  return [...names].sort((a, b) => rank(a) - rank(b));
}
export const shelfLabel = (name) => isMoodShelf(name) ? 'Other picks' : name;

// ---------------------------------------------------------------- filters bar
export const kindOk = (e, ui) => !ui.kind || ui.kind === 'all' || (title(e.t)?.kind || 'film') === ui.kind;
// A select bound to a remembered view option: main.js stores its value as ui[key].
export const uiSelect = (key, label, pairs, val, showLabel = false) =>
  `<label class="filter"><span${showLabel ? '' : ' class="sr"'}>${esc(label)}</span><select data-ui="${key}">${options(pairs, val)}</select></label>`;
export function filters(ui, { kind = false } = {}) {
  return `<div class="filters">
    ${kind ? uiSelect('kind', 'Kind', [['all', 'Films & series'], ['film', 'Films'], ['series', 'Series']], ui.kind) : ''}
    ${uiSelect('sort', 'Sort', [['curated', 'List order'], ['rt', 'Rotten Tomatoes'], ['tmdb', 'TMDB rating'], ['short', 'Shortest first'], ['new', 'Newest first'], ['old', 'Oldest first'], ['az', 'A to Z']], ui.sort)}
    ${viewToggle()}
  </div>`;
}
export function sortEntries(list, ui) {
  const t = (e) => title(e.t) || {};
  const curated = (a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || (a.order ?? 0) - (b.order ?? 0);   // starred first, then list order
  // Highest first; titles without that rating go to the end, in list order.
  const high = (score) => (a, b) => {
    const x = score(ratingOf(a.t)), y = score(ratingOf(b.t));
    return (x == null) - (y == null) || (y ?? 0) - (x ?? 0) || curated(a, b);
  };
  const by = {
    curated,
    rt: high(r => r?.rt ?? null),
    tmdb: high(tmdbScore),
    short: (a, b) => (t(a).runtime || 999) - (t(b).runtime || 999),
    new: (a, b) => (t(b).year || 0) - (t(a).year || 0),
    old: (a, b) => (t(a).year || 9999) - (t(b).year || 9999),
    az: (a, b) => String(t(a).title).localeCompare(String(t(b).title)),
  }[ui.sort] || (() => 0);
  return [...list].sort(by);
}

// ---------------------------------------------------------------- still to watch / watched
// Still to watch on this list, and the ones whose audience has seen them (or that
// are marked done or dropped), which move to the Watched group at the bottom.
export const visible = (list, ui) => list.filter(e => open(e) && kindOk(e, ui));
export const watchedOf = (list, ui) => list.filter(e => !open(e) && kindOk(e, ui));

// When it was last watched: the newest verdict, else the Letterboxd log date.
function lastWatched(id) {
  const ds = verdictsOf(id).map(v => v.date).filter(Boolean).sort();
  return ds.at(-1) || lbOf(id)?.watched || '';
}
// The collapsed Watched group at the bottom of a list, newest first.
export function watchedShelf(ui, key, list, rowOpts = {}) {
  if (!list.length) return '';
  const sorted = [...list].sort((a, b) => String(lastWatched(b.t)).localeCompare(String(lastWatched(a.t))) || (a.order ?? 0) - (b.order ?? 0));
  return shelf(ui, key + ':watched', heading('Watched', sorted.length),
    `<p class="hint">Off the list once there’s a verdict. Newest first.</p>${rows(sorted, { ...rowOpts, verdict: true })}`,
    { open: false, cls: 'group shelf watched' });
}

// "Saving…", "Offline copy" and so on, next to a page title.
export function syncNote() {
  if (S.saving) return '<span class="sync busy">Saving…</span>';
  if (S.syncing) return '<span class="sync busy">Syncing…</span>';
  if (S.offline) return '<span class="sync warn">Offline copy</span>';
  if (S.error) return `<span class="sync warn">${esc(S.error)}</span>`;
  return '';
}

// A dice button in a list's header: rolls from that list (see roll.js).
export const rollButton = (aud) => `<button class="roll-mini" type="button" data-act="roll-from" data-v="${aud}" aria-label="Pick something at random from this list" title="Roll the dice">${ICON.dice}</button>`;

// Store picks: a played one comes back after six months so it can go on the screens again.
export const PLAY_RESET_DAYS = 183;
export function playedOn(e) {
  if (!e.played) return null;
  const days = (Date.now() - Date.parse(e.played)) / 86400000;
  return days >= 0 && days < PLAY_RESET_DAYS ? e.played : null;
}

// ---------------------------------------------------------------- icons
// Line icons on a 24×24 grid, drawn with the current text colour.
const sv = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
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
