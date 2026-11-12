// Views. Each returns an HTML string; main.js wires up events by data-act / data-form.
import { S, IX, title, entriesOf, verdictsOf, lbOf, diaryOf, pitchOf, seen, open } from './store.js';
import { esc, md, frontMatter, noteSections, splitQuestions } from './md.js';

export const IMG = 'https://image.tmdb.org/t/p/';
export const ENERGY = { light: 'Light night', dense: 'Dense night', heavy: 'Heavy token' };
export const TIER = { B: 'Together', 'B?': 'Test together', M: 'Solo', T: 'Tristan’s queue', W: 'Store picks', C: 'Coming soon', R: 'Rent' };
// An entry the monthly pass added is parked until it is kept, so it stays off the shelves.
export const onShelf = (e) => !e.auto;
export const REACTION = { favourite: 'All-time favourite', loved: 'Loved it', liked: 'Liked it', mixed: 'Mixed', bounced: 'Bounced off', disliked: 'Disliked', seen: 'Seen' };
export const VIEWER = { both: 'Together', tristan: 'Tristan', meta: 'You' };
export const STATUS = { queued: 'To watch', ongoing: 'Ongoing', done: 'Done', dropped: 'Dropped' };
const ROLE = { director: 'Directed', creator: 'Created', writer: 'Written', producer: 'Produced', composer: 'Music', cinematographer: 'Cinematography', actor: 'Cast' };
const ROLE_RANK = { director: 0, creator: 1, writer: 2, producer: 3, cinematographer: 4, composer: 5, actor: 6 };

export const THEMES = [['luv', 'Luv Video', 'Black with neon green']];
let LAYOUT = 'list';
export const setLayout = (l) => { LAYOUT = l === 'posters' ? 'posters' : 'list'; };
export function viewToggle() {
  return `<div class="viewsw" role="group" aria-label="View">${[['list', 'List'], ['posters', 'Posters']].map(([v, l]) => `<button type="button" data-act="layout" data-v="${v}" aria-pressed="${LAYOUT === v}">${l}</button>`).join('')}</div>`;
}
function byline(t) {
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
const initials = (s) => String(s).replace(/^(the|a|an)\s+/i, '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
export function poster(t, size = 'w154', cls = '') {
  if (t?.poster) return `<img class="poster ${cls}" src="${IMG}${size}${esc(t.poster)}" alt="" loading="lazy" decoding="async" onerror="this.removeAttribute('src')">`;
  return `<span class="poster ph ${cls}" data-kind="${esc(t?.kind || '')}" aria-hidden="true">${esc(initials(t?.title || '?'))}</span>`;
}
function metaLine(t) {
  return [t.year, runtime(t), t.kind === 'series' ? 'Series' : t.kind === 'standup' ? 'Stand-up' : ''].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('');
}
function marks(id) {
  const s = seen(id), l = lbOf(id), out = [];
  if (s.together) out.push('<span class="mark both" title="Watched together">Seen together</span>');
  else { if (s.tristan) out.push('<span class="mark">Tristan’s seen it</span>'); if (s.meta) out.push('<span class="mark">You’ve seen it</span>'); }
  if (l?.rating) out.push(`<span class="mark rating" title="Your Letterboxd rating">${stars(l.rating)}</span>`);
  return out.join('');
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
      ${t.overview ? `<span class="row-syn">${esc(t.overview)}</span>` : ''}
      ${opts.marks !== false ? `<span class="row-marks">${marks(t.id)}${t.match === 'pending' ? '<span class="mark">Looking it up</span>' : ''}</span>` : ''}
    </span>
  </a>`;
}
export function shelf(ui, key, head, inner, defaultOpen = true, cls = 'group shelf') {
  const isOpen = key in (ui.openShelves || {}) ? ui.openShelves[key] : defaultOpen;
  return `<details class="${cls}" data-shelf="${esc(key)}"${isOpen ? ' open' : ''}><summary><h2>${head}</h2></summary>${inner}</details>`;
}
function empty(msg, action = '') { return `<div class="empty"><p>${msg}</p>${action}</div>`; }
function filters(ui, keys) {
  const sel = (name, opts, val) => `<label class="filter"><span class="sr">${esc(name)}</span><select data-ui="${name}">${opts.map(([v, l]) => `<option value="${v}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return `<div class="filters">
    ${keys.includes('kind') ? sel('kind', [['all', 'Films & series'], ['film', 'Films'], ['series', 'Series']], ui.kind) : ''}
    ${sel('sort', [['curated', 'List order'], ['short', 'Shortest first'], ['new', 'Newest first'], ['old', 'Oldest first'], ['az', 'A to Z']], ui.sort)}
    ${viewToggle()}
    <label class="toggle"><input type="checkbox" data-ui="showSeen"${ui.showSeen ? ' checked' : ''}><span>Show watched</span></label>
  </div>`;
}
function sortEntries(list, ui) {
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
function visible(list, ui) {
  return list.filter(e => (ui.showSeen || open(e)) && (ui.kind === 'all' || !ui.kind || (title(e.t)?.kind || 'film') === ui.kind));
}
export function syncNote() {
  if (S.saving) return '<span class="sync busy">Saving…</span>';
  if (S.syncing) return '<span class="sync busy">Syncing…</span>';
  if (S.offline) return '<span class="sync warn">Offline copy</span>';
  if (S.error) return `<span class="sync warn">${esc(S.error)}</span>`;
  return '';
}

// ---------------------------------------------------------------- Together
const NIGHTS = [['all', 'Any night'], ['light', 'Light'], ['dense', 'Dense'], ['heavy', 'Heavy'], ['test', 'Test']];
const GROUPS = [['light', 'Light nights', 'Easy to start, easy to stop.'], ['dense', 'Dense nights', 'Full attention, worth it.'],
  ['heavy', 'Heavy tokens', 'Ration these. Both opt in.'], ['test', 'Test together', 'One episode or twenty minutes, then decide.']];
export function together(ui) {
  const all = S.cur.entries.filter(e => onShelf(e) && (e.tier === 'B' || e.tier === 'B?'));
  const vis = visible(all, ui);
  const groupOf = (e) => e.tier === 'B?' ? 'test' : e.energy || 'light';
  const count = (g) => vis.filter(e => g === 'all' || groupOf(e) === g).length;

  const rowsFor = (g, sub, collapsible) => {
    const list = sortEntries(vis.filter(e => groupOf(e) === g), ui);
    if (!list.length) return '';
    const sections = [...new Set(list.map(e => e.section))];
    if (!sub || ui.sort !== 'curated' || sections.length < 2 || g === 'test')
      return `<div class="rows">${list.map(e => row(e.t, { entry: e })).join('')}</div>`;
    return sections.map(sec => {
      const label = esc(/^(Light nights|Dense nights|Heavy tokens)$/.test(sec) ? 'General picks' : sec);
      const rows = list.filter(e => e.section === sec);
      const inner = `<div class="rows">${rows.map(e => row(e.t, { entry: e })).join('')}</div>`;
      // inside a collapsed group these would be collapsibles within a collapsible, so keep them plain
      return collapsible
        ? shelf(ui, `vibe:${g}:${sec}`, `${label} <span class="count">${rows.length}</span>`, inner, true, 'shelf sub')
        : `<h3>${label}</h3>${inner}`;
    }).join('');
  };

  let body;
  if (ui.night === 'all') {
    body = GROUPS.map(([g, name, hint]) => {
      const n = count(g); if (!n) return '';
      return shelf(ui, 'night:' + g, `${name} <span class="count">${n}</span>`,
        `<p class="hint">${hint}</p>${rowsFor(g, true, false)}`, g === 'light').replace('class="group shelf"', `class="group shelf" data-energy="${g}"`);
    }).join('');
  } else {
    const [, name, hint] = GROUPS.find(x => x[0] === ui.night) || [];
    body = `<section class="group" data-energy="${ui.night}"><h2>${esc(name || '')} <span class="count">${count(ui.night)}</span></h2>
      <p class="hint">${esc(hint || '')}</p>${rowsFor(ui.night, true, true)}</section>`;
  }

  return `<header class="view-head"><h1>Together</h1>${syncNote()}</header>
    <div class="vibes" role="tablist" aria-label="What kind of night?">
      ${NIGHTS.map(([v, l]) => `<button type="button" role="tab" aria-selected="${ui.night === v}" data-act="night" data-v="${v}" data-energy="${v === 'all' ? '' : v}"><span>${l}</span><span class="n-count">${count(v)}</span></button>`).join('')}
    </div>
    ${filters(ui, ['kind'])}
    ${body || empty(ui.showSeen ? 'Nothing here yet.' : 'Everything on this shelf is watched. Turn on “Show watched” to see it.')}`;
}

// ---------------------------------------------------------------- Solo + Tristan
export function solo(ui) {
  const all = S.cur.entries.filter(e => onShelf(e) && e.tier === 'M');
  const vis = visible(all, ui);
  const order = []; for (const e of all) if (!order.includes(e.section)) order.push(e.section);
  const body = order.map(s => {
    const list = sortEntries(vis.filter(e => e.section === s), ui);
    if (!list.length) return '';
    return shelf(ui, 'solo:' + s, `${esc(s)} <span class="count">${list.length}</span>`,
      `<div class="rows">${list.map(e => row(e.t, { entry: e, pitch: false })).join('')}</div>`, order.indexOf(s) === 0);
  }).join('');
  return `<header class="view-head"><h1>Solo</h1>${syncNote()}</header>${filters(ui, ['kind'])}${body || empty('Nothing left on your solo shelves.')}`;
}
// A played pick comes back after six months so it can go on the screens again.
export const PLAY_RESET_DAYS = 183;
export function playedOn(e) {
  if (!e.played) return null;
  const days = (Date.now() - Date.parse(e.played)) / 86400000;
  return days >= 0 && days < PLAY_RESET_DAYS ? e.played : null;
}
const sinceText = (d) => {
  const days = Math.floor((Date.now() - Date.parse(d)) / 86400000);
  const left = PLAY_RESET_DAYS - days;
  return `Played ${days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'} · back in ${left} day${left === 1 ? '' : 's'}`;
};
function storeRow(e, played) {
  const t = title(e.t); if (!t) return '';
  return `<div class="srow${played ? ' is-played' : ''}">
    <button class="tick" data-act="${played ? 'unplay' : 'play'}" data-t="${esc(e.t)}" aria-pressed="${!!played}"
      aria-label="${played ? 'Put back on the list' : 'Mark as played'}">${played ? '✓' : ''}</button>
    ${row(e.t, { entry: e, pitch: false, marks: false })}
    ${played ? `<div class="played-meta"><span>${esc(sinceText(played))}</span><button class="linkish" data-act="drop-store" data-t="${esc(e.t)}">Remove</button></div>` : ''}
  </div>`;
}
export function store(ui) {
  const all = S.cur.entries.filter(e => onShelf(e) && e.tier === 'W');
  const kindOk = (e) => ui.kind === 'all' || !ui.kind || (title(e.t)?.kind || 'film') === ui.kind;
  const live = all.filter(e => kindOk(e) && !playedOn(e));
  const done = all.filter(e => kindOk(e) && playedOn(e)).sort((a, b) => String(b.played).localeCompare(String(a.played)));
  const order = []; for (const e of all) if (!order.includes(e.section)) order.push(e.section);
  const body = order.map(sec => {
    const list = sortEntries(live.filter(e => e.section === sec), ui);
    if (!list.length) return '';
    return shelf(ui, 'store:' + sec, `${esc(sec)} <span class="count">${list.length}</span>`,
      `<div class="rows store">${list.map(e => storeRow(e, null)).join('')}</div>`);
  }).join('');
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Store picks</h1>${syncNote()}</header>
    <p class="lede">What to put on the screens during a We Luv Video shift. Tick one when you play it; it drops to the bottom and comes back in six months.</p>
    ${all.length ? filters(ui, ['kind']) + body : empty('Nothing here yet. Open any film and choose “Add to a list”, or paste a list into the chat.')}
    ${done.length ? shelf(ui, 'store:played', `Played <span class="count">${done.length}</span>`,
      `<p class="hint">Back on the list automatically after six months. Remove one to keep it off for good.</p>
       <div class="rows store">${done.map(e => storeRow(e, playedOn(e))).join('')}</div>`, true, 'group shelf played') : ''}
    ${(S.cur.storeRules || []).length ? `<section class="group avoid"><h2>What to avoid</h2><ul>${S.cur.storeRules.map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>` : ''}`;
}

export function tristan(ui) {
  const vis = sortEntries(visible(S.cur.entries.filter(e => onShelf(e) && e.tier === 'T'), ui), ui);
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Tristan’s queue</h1>${syncNote()}</header>
    <p class="lede">For when you’re travelling: universe-loyalty picks and Moffat. Things he’ll enjoy and you won’t.</p>
    ${filters(ui, [])}<div class="rows">${vis.map(e => row(e.t, { entry: e })).join('') || empty('His queue is empty.')}</div>`;
}

// ---------------------------------------------------------------- Film school
export function school(ui, vols) {
  const queue = S.cur.entries.filter(e => onShelf(e) && e.section === 'Film school' && e.note !== 'Volume 1' && !/^Volume \d+/.test(e.note || ''));
  const vis = sortEntries(visible(queue, ui), ui);
  return `<header class="view-head"><h1>Film school</h1>${syncNote()}</header>
    ${shelf(ui, 'school:volumes', 'Volumes', `<div class="vols">${vols.map(v => `<a class="vol" href="#/school/${v.n}"><span class="vol-n">Vol. ${v.n}</span><span class="vol-t">${esc(v.title)}</span><span class="vol-p">${v.seen} of ${v.films.length} watched</span></a>`).join('') || '<p class="hint">No volumes yet.</p>'}</div>
    <p class="hint">New volumes appear here when their notes are added to the data repo.</p>`)}
    ${shelf(ui, 'school:syllabus', `On the syllabus <span class="count">${vis.length}</span>`,
      `<p class="hint">Not yet in a volume.</p>${filters(ui, [])}<div class="rows">${vis.map(e => row(e.t, { entry: e })).join('')}</div>`)}`;
}
export function volume(n, text) {
  if (!text) return `<header class="view-head"><a class="back" href="#/school">Film school</a><h1>Volume ${esc(n)}</h1></header>${empty('This volume isn’t in the data repo yet.')}`;
  const { meta, body } = frontMatter(text);
  const [intro, outro] = body.split(/\n---\n/);
  const films = (meta.films || []).map(id => title(id)).filter(Boolean);
  return `<header class="view-head"><a class="back" href="#/school">Film school</a><h1>Vol. ${esc(meta.number)}: ${esc(meta.title)}</h1></header>
    <details class="prose intro"><summary>Read the introduction</summary>${md(intro)}</details>
    <ol class="rows numbered">${films.map((t, i) => `<li>${row(t.id, { pitch: false })}</li>`).join('')}</ol>
    ${outro ? `<details class="prose intro"><summary>How to use the diary</summary>${md(outro)}</details>` : ''}`;
}

// Five titles from her own lists that share makers or kind with this one.
const ROLE_W = { director: 6, creator: 6, writer: 3, composer: 2, cinematographer: 2, producer: 1 };
function similarTo(t) {
  const score = new Map();
  const bump = (id, n) => { if (id !== t.id) score.set(id, (score.get(id) || 0) + n); };
  for (const c of t.credits || []) {
    const w = c.r === 'actor' ? ((c.o ?? 9) <= 4 ? 2 : 0) : (ROLE_W[c.r] || 0);
    if (w) for (const r of IX.person.get(c.p) || []) bump(r.t, w);
  }
  const g = new Set(t.genres || []);
  if (g.size) for (const id of IX.entries.keys()) {
    const o = title(id); if (!o) continue;
    const shared = (o.genres || []).filter(x => g.has(x)).length;
    if (shared) bump(id, Math.min(3, shared * 1.2));
  }
  const out = [];
  for (const [id, base] of score) {
    const o = title(id), es = entriesOf(id);
    if (!o || !es.length) continue;
    let n = base;
    if ((o.kind || 'film') === (t.kind || 'film')) n += 1;
    if (es.some(open)) n += 1.5;
    if (o.poster) n += 0.5;
    out.push([id, n]);
  }
  return out.sort((a, b) => b[1] - a[1] || String(title(a[0]).title).localeCompare(title(b[0]).title)).slice(0, 5).map(x => x[0]);
}

// ---------------------------------------------------------------- Title page
export function titlePage(id, ui, note) {
  const t = title(id);
  if (!t) return `<header class="view-head"><h1>Not found</h1></header>${empty('That title isn’t in your data. It may have been merged with another one.', '<a class="btn" href="#/search">Search</a>')}`;
  const es = entriesOf(t.id), vs = verdictsOf(t.id), l = lbOf(t.id), di = diaryOf(t.id), p = pitchOf(t.id), s = seen(t.id);
  const lbUrl = t.lb && !t.lb.startsWith('name:') ? t.lb : t.tmdb?.type === 'movie' ? `https://letterboxd.com/tmdb/${t.tmdb.id}/` : `https://letterboxd.com/search/${encodeURIComponent(t.title)}/`;
  const imdbUrl = t.imdb ? `https://www.imdb.com/title/${t.imdb}/` : `https://www.imdb.com/find/?q=${encodeURIComponent(t.title + (t.year ? ' ' + t.year : ''))}`;
  const tmdbUrl = t.tmdb ? `https://www.themoviedb.org/${t.tmdb.type}/${t.tmdb.id}` : `https://www.themoviedb.org/search?query=${encodeURIComponent(t.title)}`;
  const tristanish = es.some(e => ['B', 'B?', 'T'].includes(e.tier));

  // credits grouped by role
  const credits = {};
  for (const c of t.credits || []) (credits[c.r] ||= []).push(c);
  const creditHtml = Object.keys(credits).sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]).map(r =>
    `<div class="credit"><dt>${ROLE[r]}</dt><dd>${credits[r].sort((a, b) => (a.o ?? 0) - (b.o ?? 0)).map(c => `<a href="#/p/${c.p}">${esc(S.people[c.p]?.name || c.p)}</a>${c.c && r === 'actor' ? ` <span class="as">as ${esc(c.c)}</span>` : ''}`).join(', ')}</dd></div>`).join('');

  const near = similarTo(t);
  const similarHtml = near.length >= 3 ? `<section class="block"><h2>More like this</h2>
    <p class="hint">From your lists, by the people who made it and what it is.</p>
    <div class="similar">${near.map(id => { const o = title(id);
      return `<a href="#/t/${encodeURIComponent(o.id)}">${poster(o, 'w185')}<span>${esc(o.title)}</span></a>`; }).join('')}</div></section>` : '';

  // film school
  let schoolHtml;
  if (note === undefined) schoolHtml = '<p class="hint">Loading notes…</p>';
  else if (!note) schoolHtml = `<p class="hint">No notes yet. Ask Claude to write them, or write your own.</p><button class="btn ghost" data-act="edit-note" data-id="${esc(t.id)}">Write notes</button>`;
  else {
    const { meta, body } = frontMatter(note.text);
    const parts = noteSections(body);
    schoolHtml = (meta.volume ? `<p class="hint"><a href="#/school/${esc(meta.volume)}">Volume ${esc(meta.volume)}, film ${esc(meta.number)}</a>${meta.heading ? ' — ' + esc(meta.heading) : ''}</p>` : '') +
      parts.map(pt => {
        const after = /^after/i.test(pt.label);
        const qs = /diary/i.test(pt.label) && splitQuestions(pt.body);
        const inner = qs ? `<ol class="questions">${qs.map(q => `<li>${md(q).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ol>` : md(pt.body);
        if (/^read more/i.test(pt.label)) return `<p class="note-more">${inner.replace(/^<p>|<\/p>$/g, '')}</p>`;
        if (after && !ui.spoilers[t.id]) return `<details class="note-part spoiler"><summary>${esc(pt.label)} <span class="hint">contains spoilers</span></summary><div class="prose">${inner}</div></details>`;
        return pt.label ? `<details class="note-part"${/before/i.test(pt.label) ? ' open' : ''}><summary>${esc(pt.label)}</summary><div class="prose">${inner}</div></details>` : `<div class="prose">${inner}</div>`;
      }).join('') + `<button class="btn ghost small" data-act="edit-note" data-id="${esc(t.id)}">Edit notes</button>`;
  }

  const pendingMatch = S.cur.matchOverrides?.[t.id];
  const fixBtns = `<div class="actions left"><button class="btn ghost small" data-act="retry-match" data-id="${esc(t.id)}">Search TMDB again</button><button class="btn ghost small" data-act="fix-match" data-id="${esc(t.id)}">Paste a TMDB link</button></div>`;
  const matchHtml = pendingMatch ? `<section class="block ok-block" role="status"><h2>${pendingMatch === 'retry' ? 'Looking it up again' : 'Match saved'}</h2><p class="hint">${pendingMatch === 'none' ? 'Marked as not on TMDB.' : pendingMatch === 'retry' ? 'TMDB will be searched again.' : 'Your choice is saved.'} This page updates by itself in a few minutes.</p>${pendingMatch === 'none' ? fixBtns : ''}</section>`
    : t.match === 'none' && t.kind !== 'standup' ? `<section class="block warn-block"><h2>Marked as not on TMDB</h2><p class="hint">No poster, credits or cross-links for this one. Changed your mind, or has it been added to TMDB since?</p>${fixBtns}</section>`
    : t.match === 'review' && t.candidates?.length ? `<section class="block warn-block"><h2>Is this the right ${t.kind === 'series' ? 'show' : 'film'}?</h2>
      <p class="hint">The TMDB lookup wasn’t sure. Pick the right one and the details update on the next lookup run.</p>
      <div class="cands">${t.candidates.map(c => `<button class="cand" data-act="pick-match" data-id="${esc(t.id)}" data-type="${c.type}" data-tmdb="${c.id}">${c.poster ? `<img src="${IMG}w154${esc(c.poster)}" alt="" loading="lazy">` : '<span class="poster ph"></span>'}<span>${esc(c.title)} <em>${esc(c.year || '')}</em> <small>${c.type === 'tv' ? 'series' : 'film'}</small></span></button>`).join('')}</div>
      <button class="btn ghost small" data-act="fix-match" data-id="${esc(t.id)}">None of these</button></section>`
    : t.match === 'notfound' ? `<section class="block warn-block"><h2>Not found on TMDB</h2><p class="hint">The search came back empty. Paste the link if you can find it, or try the search again.</p>${fixBtns}</section>`
    : t.match === 'pending' ? `<p class="hint block">Poster, credits and links appear after the next TMDB lookup (usually within a few minutes).</p>` : '';

  return `<article class="title-page">
    <header class="tp-head">
      <a class="back" href="javascript:history.back()">Back</a>
      <div class="tp-top">${poster(t, 'w342', 'big')}
        <div class="tp-id">
          <h1>${esc(t.title)}</h1>
          ${t.original && t.original !== t.title ? `<p class="orig">${esc(t.original)}</p>` : ''}
          <p class="row-meta">${metaLine(t)}</p>
          ${t.genres?.length ? `<p class="genres">${esc(t.genres.join(', '))}</p>` : ''}
          <div class="ext"><a href="${esc(lbUrl)}" target="_blank" rel="noopener">Letterboxd</a><a href="${esc(imdbUrl)}" target="_blank" rel="noopener">IMDb</a><a href="${esc(tmdbUrl)}" target="_blank" rel="noopener">TMDB</a></div>
        </div>
      </div>
    </header>
    ${matchHtml}
    ${t.overview ? `<section class="block synopsis"><h2>What it is</h2><p class="prose">${esc(t.overview)}</p><p class="hint">From TMDB — may contain spoilers for the setup.</p></section>` : ''}
    ${p || tristanish ? `<section class="pitch"><h2>The pitch for Tristan</h2>${p ? `<blockquote>${esc(p)}</blockquote>` : '<p class="hint">No pitch yet.</p>'}<button class="btn ghost small" data-act="edit-pitch" data-id="${esc(t.id)}">${p ? 'Edit pitch' : 'Write a pitch'}</button></section>` : ''}
    <section class="block"><h2>On your lists</h2>
      ${es.length ? `<ul class="placements">${es.map((e, i) => `<li><button class="placement" data-act="edit-entry" data-id="${esc(t.id)}" data-i="${i}" data-energy="${esc(e.energy || (e.tier === 'B?' ? 'test' : ''))}">
          <strong>${esc(TIER[e.tier] || 'Unsorted')}${e.energy ? ', ' + esc(ENERGY[e.energy].toLowerCase()) : ''}</strong>
          <span>${esc(e.section)}${e.status && e.status !== 'queued' ? ' — ' + esc(STATUS[e.status].toLowerCase()) : ''}${e.star ? ' — ★' : ''}</span>
          ${e.note ? `<em>${esc(e.note)}</em>` : ''}</button></li>`).join('')}</ul>` : '<p class="hint">Not on any list yet.</p>'}
      <button class="btn ghost small" data-act="add-entry" data-id="${esc(t.id)}">Add to a list</button>
    </section>
    <section class="block school"><h2>Film school</h2>${schoolHtml}</section>
    <section class="block"><h2>Verdicts</h2>
      ${vs.length ? `<ul class="verdicts">${vs.map(v => `<li><button data-act="edit-verdict" data-id="${esc(t.id)}" data-v="${esc(v.id)}"><strong>${esc(VIEWER[v.viewer])}: ${esc(REACTION[v.reaction] || v.reaction)}</strong>${v.note ? `<span>${esc(v.note)}</span>` : ''}${v.date ? `<small>${esc(v.date)}</small>` : ''}</button></li>`).join('')}</ul>` : `<p class="hint">${s.meta ? 'You’ve logged it on Letterboxd, but there’s no verdict here yet.' : 'Nobody’s watched it yet.'}</p>`}
      <button class="btn" data-act="add-verdict" data-id="${esc(t.id)}">Log a verdict</button>
    </section>
    ${l || di.length ? `<section class="block"><h2>Your Letterboxd</h2>
      <p class="lbline">${l?.rating ? `<span class="rating">${stars(l.rating)}</span>` : ''}${l?.liked ? '<span>Liked</span>' : ''}${l?.favourite ? '<span>One of your four favourites</span>' : ''}${l?.watched ? `<span>Logged as watched ${esc(l.watched)}</span>` : ''}${l?.watchlist && !l?.watched ? `<span>On your Letterboxd watchlist since ${esc(l.watchlist)}</span>` : ''}</p>
      ${di.map(d => `<div class="diary"><p class="hint">${esc(d.date || d.logged)}${d.rating ? ' — ' + stars(d.rating) : ''}${d.rewatch ? ' — rewatch' : ''}${d.tags?.length ? ' — ' + esc(d.tags.join(', ')) : ''}</p>${d.review ? `<div class="prose review">${md(d.review)}</div>` : ''}</div>`).join('')}
      </section>` : ''}
    ${creditHtml ? `<section class="block"><h2>Credits</h2><dl class="credits">${creditHtml}</dl></section>` : ''}
    ${similarHtml}
    <p class="fine">
      ${t.match !== 'review' && t.match !== 'notfound' && t.kind !== 'standup' ? `<button class="linkish" data-act="fix-match" data-id="${esc(t.id)}">Wrong film or show? Fix the match</button><br>` : ''}
      ${es.length || p || vs.length ? `<button class="linkish danger" data-act="remove-title" data-id="${esc(t.id)}">Remove ${esc(t.kind === 'series' ? 'this series' : 'this film')} from your lists</button>` : ''}
    </p>
  </article>`;
}

// ---------------------------------------------------------------- Person
export function personPage(pid, ui) {
  const person = S.people[pid];
  const rows = IX.person.get(pid) || [];
  if (!person) return `<header class="view-head"><h1>Unknown person</h1></header>`;
  const byRole = {};
  for (const r of rows) for (const role of r.r) (byRole[role] ||= []).push(r);
  return `<header class="view-head person-head"><a class="back" href="javascript:history.back()">Back</a>
      ${person.img ? `<img class="headshot" src="${IMG}w185${esc(person.img)}" alt="">` : ''}
      <h1>${esc(person.name)}</h1>${person.dept ? `<p class="hint">Known for ${esc(person.dept.toLowerCase())}</p>` : ''}
      <p class="ext"><a href="https://www.themoviedb.org/person/${esc(pid.slice(1))}" target="_blank" rel="noopener">TMDB</a><a href="https://letterboxd.com/search/${encodeURIComponent(person.name)}/" target="_blank" rel="noopener">Letterboxd</a></p></header>
    <p class="lede">${rows.length} title${rows.length === 1 ? '' : 's'} in your lists and Letterboxd.</p><div class="filters">${viewToggle()}</div>
    ${Object.keys(byRole).sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]).map(role => shelf(ui, `person:${pid}:${role}`,
      `${ROLE[role]} <span class="count">${byRole[role].length}</span>`,
      `<div class="rows">${byRole[role].sort((a, b) => (title(b.t)?.year || 0) - (title(a.t)?.year || 0)).map(r => row(r.t, { entry: entriesOf(r.t)[0], pitch: false })).join('')}</div>`)).join('')}`;
}

// ---------------------------------------------------------------- More, search, unsorted, watched, review
const sv = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  wolf: sv('<path d="M6.5 3.2 9.8 7.1l2.9-.2L12.1 2.8l3.2 4.4c1.3.8 2.4 1.9 3.1 3.2l3.5 2-2.2 1.6-3.4.3-1.9 2.7-4.8 1.8-3-.4-1.3-2.4c-.6-2.9-.5-5.3.1-7.1.5-1.9 1.3-3 1.8-3.6z"/><circle cx="14.8" cy="10.7" r=".8" fill="currentColor" stroke="none"/>'),
  tape: sv('<path d="M3.5 9.5V19a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1V9.5"/><path d="M2.4 9.5 4.1 5a1 1 0 0 1 .94-.65h13.92a1 1 0 0 1 .94.65l1.7 4.5"/><path d="M9.2 20v-5.6h5.6V20"/>'),
  inbox: sv('<path d="M12 2.8v8.4m0 0 3-3m-3 3-3-3"/><path d="M3.2 13.6h4.4l1.3 2.2h6.2l1.3-2.2h4.4"/><path d="M3.2 13.6 5.4 6.9a1 1 0 0 1 .95-.7h1.9M21.2 13.6 19 6.9a1 1 0 0 0-.95-.7h-1.9"/><path d="M3.2 13.6V19a1.6 1.6 0 0 0 1.6 1.6h14.4a1.6 1.6 0 0 0 1.6-1.6v-5.4"/>'),
  plus: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 8.2v7.6M8.2 12h7.6"/>'),
  tray: sv('<path d="M3 13.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.5"/><path d="M3 13.5h5l1.2 2h5.6l1.2-2h5"/><path d="M12 3v7m0 0 2.6-2.6M12 10 9.4 7.4"/>'),
  verify: sv('<path d="M7 4h7l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 4v4h4"/><path d="M9 14l2.2 2.2L15.5 12"/>'),
  star: sv('<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/>'),
  disc: sv('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.6"/><path d="M12 3a9 9 0 0 1 7.5 4"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.1 14.7a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.6 1.1v.2a1.8 1.8 0 0 1-3.6 0v-.1a1.5 1.5 0 0 0-2.6-1.1l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1.1-2.6h-.2a1.8 1.8 0 0 1 0-3.6h.1a1.5 1.5 0 0 0 1.1-2.6l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.2a1.8 1.8 0 0 1 3.6 0v.1a1.5 1.5 0 0 0 2.6 1.1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.2a1.8 1.8 0 0 1 0 3.6h-.1a1.5 1.5 0 0 0-1.4.9z"/>'),
};

export function more() {
  const review = S.titles.filter(t => (t.match === 'review' || t.match === 'notfound') && !S.cur.matchOverrides?.[t.id]).length;
  const unsorted = unsortedIds().length;
  const tiles = [
    ['#/tristan', 'Tristan’s queue', ICON.wolf, S.cur.entries.filter(e => onShelf(e) && e.tier === 'T' && open(e)).length],
    ['#/store', 'Store picks', ICON.tape, S.cur.entries.filter(e => onShelf(e) && e.tier === 'W').length],
    ['#/incoming', 'Incoming', ICON.inbox, S.cur.entries.filter(e => e.auto).length],
    ['#/add', 'Add a title', ICON.plus, 0],
    ['#/rent', 'Rent', ICON.disc, S.cur.entries.filter(e => e.tier === 'R' && !e.rented).length],
    ['#/unsorted', 'Unsorted', ICON.tray, unsorted],
    ['#/review', 'Check matches', ICON.verify, review],
    ['#/watched', 'Verdicts', ICON.star, S.cur.verdicts.length],
    ['#/settings', 'Settings', ICON.gear, 0],
  ];
  return `<header class="view-head"><h1>More</h1>${syncNote()}</header>
    <nav class="tiles">${tiles.map(([href, label, icon, n]) => `<a class="tile" href="${href}">${icon}<span class="lbl">${label}</span>${n ? `<span class="count">${n}</span>` : ''}</a>`).join('')}</nav>
    <p class="fine">${S.titles.length} titles, ${S.cur.entries.length} list entries, ${S.cur.verdicts.length} verdicts. Letterboxd export from ${esc(S.lb?.exportedAt || '—')}.</p>
    <p class="fine">Posters, credits and links come from the TMDB API. This app is not endorsed or certified by TMDB.</p>`;
}
// The monthly pass parks what it finds here. Nothing reaches a shelf until it is kept.
function incomingRow(e, i) {
  const t = title(e.t); if (!t) return '';
  const where = e.tier === 'C' ? 'Coming soon' : `${TIER[e.tier] || e.tier}${e.energy ? ', ' + ENERGY[e.energy].toLowerCase() : ''}`;
  return `<div class="irow">
    ${row(e.t, { entry: e, marks: false })}
    <div class="irow-foot">
      <span class="suggest">${esc(where)}${e.found ? ` · found ${esc(e.found)}` : ''}</span>
      <span class="irow-acts">
        <button class="btn small" data-act="keep-auto" data-t="${esc(e.t)}" data-i="${i}">Keep</button>
        <button class="btn small ghost" data-act="bin-auto" data-t="${esc(e.t)}" data-i="${i}">Bin</button>
      </span>
    </div>
  </div>`;
}
export function incoming(ui) {
  const auto = S.cur.entries.map((e, i) => ({ e, i })).filter(x => x.e.auto);
  const now = auto.filter(x => x.e.tier !== 'C'), soon = auto.filter(x => x.e.tier === 'C');
  const kept = S.cur.entries.map((e, i) => ({ e, i })).filter(x => !x.e.auto && x.e.tier === 'C');
  const head = `<header class="view-head"><a class="back" href="#/more">More</a><h1>Incoming</h1>${syncNote()}</header>`;
  if (!auto.length && !kept.length) return head + empty('Nothing waiting. The monthly pass puts anything it finds here first, so it never lands on a shelf without you.');
  const block = (key, title2, list, hint) => list.length ? shelf(ui, 'incoming:' + key,
    `${title2} <span class="count">${list.length}</span>`,
    `${hint ? `<p class="hint">${hint}</p>` : ''}<div class="rows">${list.map(x => incomingRow(x.e, x.i)).join('')}</div>`) : '';
  return `${head}
    <p class="lede">Picks the monthly pass found. Keep sends one to the list it suggests; Bin removes it and stops it coming back.</p>
    ${block('now', 'Watchable now', now, 'These are out, so keeping one puts it straight on the shelf shown.')}
    ${block('soon', 'Announced', soon, 'Not out yet. Kept ones wait below until a later pass moves them to a real list.')}
    ${kept.length ? shelf(ui, 'incoming:kept', `Coming soon <span class="count">${kept.length}</span>`,
      `<p class="hint">Kept, waiting for release.</p><div class="rows">${kept.map(x => `<div class="irow">${row(x.e.t, { entry: x.e, marks: false })}
        <div class="irow-foot"><span class="suggest">${x.e.note ? esc(x.e.note) : 'Awaiting release'}</span>
        <span class="irow-acts"><button class="btn small ghost" data-act="bin-auto" data-t="${esc(x.e.t)}" data-i="${x.i}">Bin</button></span></div></div>`).join('')}</div>`, false) : ''}`;
}
// Films the pass could not find on any service. Grouped by whether We Luv Video stocks them.
function rentRow(e, i) {
  const t = title(e.t); if (!t) return '';
  const at = e.wlv === 'yes';
  // The note is the stock line, which the footer already shows.
  return `<div class="irow${e.rented ? ' is-played' : ''}">
    ${row(e.t, { entry: { ...e, note: undefined }, marks: false })}
    <div class="irow-foot">
      <span class="suggest">${e.rented ? `Rented ${esc(e.rented)}` : esc(e.note || (at ? 'In stock' : 'Stock not confirmed'))}${e.shelf ? ` \u00b7 ${esc(e.shelf)}` : ''}</span>
      <span class="irow-acts">
        <button class="btn small${e.rented ? ' ghost' : ''}" data-act="${e.rented ? 'unrent' : 'rent'}" data-t="${esc(e.t)}" data-i="${i}">${e.rented ? 'Put back' : 'Rented'}</button>
        <button class="btn small ghost" data-act="drop-rent" data-t="${esc(e.t)}" data-i="${i}">Remove</button>
      </span>
    </div>
  </div>`;
}
export function rent(ui) {
  const all = S.cur.entries.map((e, i) => ({ e, i })).filter(x => x.e.tier === 'R');
  const kindOk = (x) => ui.kind === 'all' || !ui.kind || (title(x.e.t)?.kind || 'film') === ui.kind;
  const live = all.filter(x => kindOk(x) && !x.e.rented);
  const done = all.filter(x => x.e.rented);
  const head = `<header class="view-head"><a class="back" href="#/more">More</a><h1>Rent</h1>${syncNote()}</header>`;
  if (!all.length) return head + empty('Nothing to rent. Anything you want that isn\u2019t streaming anywhere lands here, with a note on whether We Luv Video has a copy.');
  const stocked = live.filter(x => x.e.wlv === 'yes'), maybe = live.filter(x => x.e.wlv !== 'yes');
  const block = (key, t2, list, hint) => list.length ? shelf(ui, 'rent:' + key, `${t2} <span class="count">${list.length}</span>`,
    `${hint ? `<p class="hint">${hint}</p>` : ''}<div class="rows">${list.map(x => rentRow(x.e, x.i)).join('')}</div>`) : '';
  return `${head}
    <p class="lede">Not streaming anywhere you subscribe to. Take the list on your next shift.</p>
    ${filters(ui, ['kind'])}
    ${block('wlv', 'At We Luv Video', stocked, 'Confirmed in the catalogue.')}
    ${block('else', 'Nowhere found yet', maybe, 'Not in the We Luv Video catalogue either \u2014 worth asking, or waiting for a re-check.')}
    ${done.length ? shelf(ui, 'rent:done', `Rented <span class="count">${done.length}</span>`,
      `<div class="rows">${done.map(x => rentRow(x.e, x.i)).join('')}</div>`, false, 'group shelf played') : ''}`;
}
export function search(q) {
  const n = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nq = n(q).trim();
  let res = '', ppl = '';
  if (nq.length >= 2) {
    const hits = S.titles.filter(t => n(t.title).includes(nq) || n(t.original).includes(nq) || n(t.tmdbTitle).includes(nq))
      .sort((a, b) => (n(b.title).startsWith(nq) - n(a.title).startsWith(nq)) || (entriesOf(b.id).length - entriesOf(a.id).length)).slice(0, 40);
    res = hits.map(t => row(t.id, { entry: entriesOf(t.id)[0] })).join('') || '<p class="hint">No titles match.</p>';
    const ph = Object.entries(S.people).filter(([, p]) => n(p.name).includes(nq)).sort((a, b) => (IX.person.get(b[0])?.length || 0) - (IX.person.get(a[0])?.length || 0)).slice(0, 12);
    ppl = ph.map(([id, p]) => `<a class="person-row" href="#/p/${id}">${p.img ? `<img src="${IMG}w92${esc(p.img)}" alt="" loading="lazy">` : '<span class="poster ph small"></span>'}<span>${esc(p.name)}</span><span class="count">${IX.person.get(id)?.length || 0}</span></a>`).join('');
  }
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Search</h1></header>
    <form class="search" data-form="search" role="search"><label class="sr" for="q">Title or person</label><input id="q" name="q" type="search" value="${esc(q)}" placeholder="Title or person" autocomplete="off" autofocus></form>
    ${ppl ? `<section class="group"><h2>People</h2><div class="people">${ppl}</div></section>` : ''}
    ${res ? `<section class="group"><h2>Titles</h2><div class="rows">${res}</div></section>` : nq ? '' : '<p class="hint">Type at least two letters.</p>'}`;
}
export function unsortedIds() {
  const ids = new Set();
  for (const [id, f] of Object.entries(S.lb?.films || {})) if (f.watchlist && !f.watched) ids.add(id);
  for (const l of Object.values(S.lb?.lists || {})) for (const id of l.items) ids.add(id);
  return [...ids].filter(id => !entriesOf(id).length && title(id) && !seen(id).meta);
}
export function unsorted(ui) {
  const ids = new Set(unsortedIds());
  const wl = [...ids].filter(id => lbOf(id)?.watchlist).sort((a, b) => (lbOf(b).watchlist || '').localeCompare(lbOf(a).watchlist || ''));
  const lists = Object.entries(S.lb?.lists || {}).map(([name, l]) => [name, l.items.filter(id => ids.has(id))]).filter(([, x]) => x.length);
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Unsorted</h1></header>
    <p class="lede">On your Letterboxd watchlist or lists, unwatched, and not on any shelf here yet. Open one and choose “Add to a list”.</p><div class="filters">${viewToggle()}</div>
    ${shelf(ui, 'unsorted:watchlist', `Letterboxd watchlist <span class="count">${wl.length}</span>`, `<div class="rows">${wl.map(id => row(id, { pitch: false })).join('')}</div>`)}
    ${lists.map(([name, items]) => shelf(ui, 'unsorted:' + name, `${esc(name)} <span class="count">${items.length}</span>`, `<div class="rows">${items.map(id => row(id, { pitch: false })).join('')}</div>`, false)).join('')}`;
}
export function watched(ui) {
  const groups = [['both', 'Together'], ['tristan', 'Tristan'], ['meta', 'You']];
  const order = ['favourite', 'loved', 'liked', 'mixed', 'bounced', 'disliked', 'seen'];
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Verdicts</h1></header>
    ${shelf(ui, 'watched:learned', 'What we’ve learned', `<ul class="calib">${(S.cur.calibration || []).map(c => `<li>${md(c.text).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>`)}
    ${groups.map(([v, name]) => {
      const vs = S.cur.verdicts.filter(x => x.viewer === v && x.reaction !== 'seen').sort((a, b) => order.indexOf(a.reaction) - order.indexOf(b.reaction));
      if (!vs.length) return '';
      return shelf(ui, 'watched:' + v, `${name} <span class="count">${vs.length}</span>`,
        `<ul class="verdict-list">${vs.map(x => { const t = title(x.t); return t ? `<li><a href="#/t/${encodeURIComponent(t.id)}">${esc(t.title)}</a> <span class="r r-${x.reaction}">${esc(REACTION[x.reaction])}</span>${x.note ? `<small>${esc(x.note)}</small>` : ''}</li>` : ''; }).join('')}</ul>`);
    }).join('')}
    ${shelf(ui, 'watched:diary', 'Recent diary', `<div class="rows">${(S.lb?.diary || []).slice(0, 25).map(d => row(d.t, { pitch: false })).join('')}</div>`)}`;
}
export function review() {
  const pend = S.cur.matchOverrides || {}, waiting = Object.keys(pend).length;
  const list = S.titles.filter(t => (t.match === 'review' || t.match === 'notfound') && !pend[t.id]);
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Check matches</h1></header>${waiting ? `<p class="hint" role="status">${waiting} saved and updating. ${list.length} left to check.</p>` : ''}
    <p class="lede">The TMDB lookup wasn’t sure about these. Open one to pick the right film or show.</p>
    <div class="rows">${list.map(t => row(t.id, { entry: entriesOf(t.id)[0], pitch: false })).join('') || '<p class="hint">Nothing to check.</p>'}</div>`;
}

// ---------------------------------------------------------------- forms (shown in the bottom sheet)
const opt = (pairs, val) => pairs.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
const sectionList = () => `<datalist id="sections">${IX.sections.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>`;
export function entryForm(id, i) {
  const e = i === undefined ? { tier: 'B', energy: 'dense', section: '', status: 'queued' } : entriesOf(id)[i];
  return `<form data-form="entry" data-id="${esc(id)}" data-i="${i ?? ''}">
    <h2>${i === undefined ? 'Add to a list' : 'Edit list placement'}</h2>
    <label>List<select name="tier">${opt([['B', 'Together'], ['B?', 'Test together'], ['M', 'Solo'], ['T', 'Tristan’s queue'], ['W', 'Store picks']], e.tier)}</select></label>
    <label>Energy<select name="energy">${opt([['', 'Not set'], ['light', 'Light night'], ['dense', 'Dense night'], ['heavy', 'Heavy token']], e.energy)}</select></label>
    <label>Shelf<input name="section" list="sections" value="${esc(e.section)}" placeholder="e.g. Dense nights"></label>${sectionList()}
    <label>Status<select name="status">${opt(Object.entries(STATUS), e.status || 'queued')}</select></label>
    <label>Note<input name="note" value="${esc(e.note || '')}" placeholder="Optional"></label>
    <label class="check"><input type="checkbox" name="star"${e.star ? ' checked' : ''}> Highest-confidence pick (★)</label>
    <div class="actions">${i !== undefined ? '<button type="button" class="btn ghost danger" data-act="remove-entry">Remove from this list</button>' : ''}<button class="btn">Save</button></div>
  </form>`;
}
export function verdictForm(id, vid) {
  const v = vid ? verdictsOf(id).find(x => x.id === vid) : { viewer: 'both', reaction: 'loved', date: new Date().toISOString().slice(0, 10) };
  return `<form data-form="verdict" data-id="${esc(id)}" data-v="${esc(vid || '')}">
    <h2>${vid ? 'Edit verdict' : 'Log a verdict'}</h2>
    <fieldset class="seg"><legend>Who watched</legend>${Object.entries(VIEWER).map(([k, l]) => `<label><input type="radio" name="viewer" value="${k}"${v.viewer === k ? ' checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
    <label>Reaction<select name="reaction">${opt(Object.entries(REACTION), v.reaction)}</select></label>
    <label>Note<textarea name="note" rows="3" placeholder="e.g. he loved it until the mystery was solved">${esc(v.note || '')}</textarea></label>
    <label>Date<input type="date" name="date" value="${esc(v.date || '')}"></label>
    <label class="check"><input type="checkbox" name="markDone" checked> Mark it done on the together list</label>
    <div class="actions">${vid ? '<button type="button" class="btn ghost danger" data-act="remove-verdict">Delete verdict</button>' : ''}<button class="btn">Save verdict</button></div>
  </form>`;
}
export function pitchForm(id) {
  return `<form data-form="pitch" data-id="${esc(id)}"><h2>Pitch for Tristan</h2>
    <label><span class="sr">Pitch</span><textarea name="pitch" rows="4" placeholder="One line: why he’d like it">${esc(pitchOf(id) || '')}</textarea></label>
    <div class="actions"><button class="btn">Save pitch</button></div></form>`;
}
export function noteForm(id, text) {
  const t = title(id);
  const tpl = `---\ntitle: ${t?.title || ''}\n---\n\n**Before you watch.** \n\n**The people.** \n\n**After you watch.** \n\n**Diary questions.** (1)  (2)  (3) \n`;
  return `<form data-form="note" data-id="${esc(id)}" class="tall"><h2>Film-school notes</h2>
    <p class="hint">Markdown. “After you watch” is hidden behind a spoiler tap.</p>
    <textarea name="text" rows="18">${esc(text || tpl)}</textarea>
    <div class="actions"><button class="btn">Save notes</button></div></form>`;
}
export function removeTitleForm(id) {
  const t = title(id), es = entriesOf(id), vs = verdictsOf(id), p = pitchOf(id);
  return `<form data-form="remove-title" data-id="${esc(id)}">
    <h2>Remove ${esc(t.title)}?</h2>
    <p>This takes it off ${es.length === 1 ? 'the list it is on' : `all ${es.length} lists it is on`}${es.length ? ` — ${es.map(e => esc(TIER[e.tier] || e.section)).filter((v, i, a) => a.indexOf(v) === i).join(', ')}` : ''}${p ? ', and deletes the pitch' : ''}.</p>
    ${vs.length ? `<label class="check"><input type="checkbox" name="verdicts"> Also delete ${vs.length} verdict${vs.length > 1 ? 's' : ''} (${vs.map(v => esc(VIEWER[v.viewer])).join(', ')})</label>
      <p class="hint">Verdicts are your record of what you watched and what you thought. Leave this unticked to keep them.</p>` : ''}
    <p class="hint">The title itself stays in your data, so it can be added again later. Letterboxd history is untouched.</p>
    <div class="actions"><button type="button" class="btn ghost" data-act="close-sheet">Keep it</button><button class="btn danger-solid">Remove</button></div>
  </form>`;
}
export function matchForm(id) {
  return `<form data-form="match" data-id="${esc(id)}"><h2>Fix the match</h2>
    <p class="hint">Find it on themoviedb.org and paste the page link, e.g. https://www.themoviedb.org/movie/603.</p>
    <label>TMDB link<input name="url" inputmode="url" placeholder="https://www.themoviedb.org/…"></label>
    <div class="actions"><button type="button" class="btn ghost" data-act="no-match">It’s not on TMDB</button><button class="btn">Save</button></div></form>`;
}
export function addForm() {
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Add a film or show</h1></header>
    <form data-form="add" class="page-form">
      <label>Title<input name="title" required autocomplete="off"></label>
      <label>Year<input name="year" inputmode="numeric" pattern="\\d{4}" placeholder="Optional, helps the lookup"></label>
      <fieldset class="seg"><legend>Kind</legend><label><input type="radio" name="kind" value="film" checked><span>Film</span></label><label><input type="radio" name="kind" value="series"><span>Series</span></label><label><input type="radio" name="kind" value=""><span>Not sure</span></label></fieldset>
      <label>List<select name="tier">${opt([['B', 'Together'], ['B?', 'Test together'], ['M', 'Solo'], ['T', 'Tristan’s queue'], ['W', 'Store picks']], 'B')}</select></label>
      <label>Energy<select name="energy">${opt([['', 'Not set'], ['light', 'Light night'], ['dense', 'Dense night'], ['heavy', 'Heavy token']], 'dense')}</select></label>
      <label>Shelf<input name="section" list="sections" placeholder="e.g. Dense nights"></label>${sectionList()}
      <label>Pitch for Tristan<textarea name="pitch" rows="3" placeholder="Optional"></textarea></label>
      <div class="actions"><button class="btn">Add</button></div>
      <p class="hint">The poster, credits and links are looked up on TMDB within a few minutes.</p>
    </form>`;
}
export function settings(auth, build) {
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Settings</h1></header>
    <h2>Data</h2>
    <dl class="kv"><dt>Data repo</dt><dd>${esc(auth?.repo || '')} (${esc(auth?.branch || 'main')})</dd><dt>Token</dt><dd>…${esc((auth?.token || '').slice(-6))}</dd><dt>App version</dt><dd>${esc(build || '—')}</dd></dl>
    <div class="actions left"><button class="btn ghost" data-act="reload">Reload data</button><button class="btn ghost danger" data-act="signout">Sign out on this device</button></div>
    <p class="hint">Signing out removes the token and the offline copy from this device only.</p>`;
}
export function login(cfg, error) {
  return `<main class="login">
    <h1>Film School</h1>
    <p class="lede">Your watchlists live in a private GitHub repo. Connect this device with a token that can read and write it.</p>
    <form data-form="login" class="page-form">
      <label>Data repo<input name="repo" value="${esc(cfg.repo)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <label>GitHub token<input name="token" type="password" autocomplete="off" required placeholder="github_pat_…"></label>
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
      <div class="actions"><button class="btn">Connect</button></div>
    </form>
    <details class="prose"><summary>How to make the token</summary><ol>
      <li>On GitHub: Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.</li>
      <li>Repository access: Only select repositories, then pick <strong>${esc(cfg.repo.split('/')[1] || 'your data repo')}</strong>.</li>
      <li>Permissions: Contents, Read and write.</li>
      <li>Copy the token and paste it here. It stays on this device.</li></ol></details>
  </main>`;
}
export function leader() {
  return `<div class="leader" role="status" aria-label="Loading your lists"><div class="leader-ring"><span class="leader-n">8</span></div><p>Threading the projector</p></div>`;
}
