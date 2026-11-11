// Views. Each returns an HTML string; main.js wires up events by data-act / data-form.
import { S, IX, title, entriesOf, verdictsOf, lbOf, diaryOf, pitchOf, seen, open } from './store.js';
import { esc, md, frontMatter, noteSections, splitQuestions } from './md.js';

export const IMG = 'https://image.tmdb.org/t/p/';
export const ENERGY = { light: 'Light night', dense: 'Dense night', heavy: 'Heavy token' };
export const TIER = { B: 'Together', 'B?': 'Test together', M: 'Solo', T: 'Tristan’s queue' };
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
const NIGHTS = [['all', 'Any night'], ['light', 'Light'], ['dense', 'Dense'], ['heavy', 'Heavy token'], ['test', 'Test one']];
export function together(ui) {
  const all = S.cur.entries.filter(e => e.tier === 'B' || e.tier === 'B?');
  const vis = visible(all, ui);
  const groupOf = (e) => e.tier === 'B?' ? 'test' : e.energy || 'light';
  const count = (g) => vis.filter(e => g === 'all' || groupOf(e) === g).length;
  const groups = [['light', 'Light nights', 'Easy to start, easy to stop.'], ['dense', 'Dense nights', 'Full attention, worth it.'], ['heavy', 'Heavy tokens', 'Ration these. Both opt in.'], ['test', 'Test together', 'One episode or twenty minutes, then decide.']]
    .filter(([g]) => ui.night === 'all' || ui.night === g);
  let body = '';
  for (const [g, name, hint] of groups) {
    const list = sortEntries(vis.filter(e => groupOf(e) === g), ui);
    if (!list.length) continue;
    const sections = [...new Set(list.map(e => e.section))];
    const sub = ui.sort === 'curated' && sections.length > 1 && g !== 'test';
    body += `<section class="group" data-energy="${g}"><h2>${name} <span class="count">${list.length}</span></h2><p class="hint">${hint}</p>`;
    if (sub) for (const s of sections) {
      const sl = list.filter(e => e.section === s);
      body += `<h3>${esc(/^(Light nights|Dense nights|Heavy tokens)$/.test(s) ? 'General picks' : s)}</h3><div class="rows">${sl.map(e => row(e.t, { entry: e })).join('')}</div>`;
    } else body += `<div class="rows">${list.map(e => row(e.t, { entry: e })).join('')}</div>`;
    body += '</section>';
  }
  return `<header class="view-head"><h1>Together</h1>${syncNote()}</header>
    <div class="night" role="radiogroup" aria-label="What kind of night?">
      <p class="night-q" id="nightq">What kind of night?</p>
      <div class="night-opts">${NIGHTS.map(([v, l]) => `<button type="button" role="radio" aria-checked="${ui.night === v}" data-act="night" data-v="${v}" data-energy="${v}"><span class="n-label">${l}</span><span class="n-count">${count(v)}</span></button>`).join('')}</div>
    </div>
    ${filters(ui, ['kind'])}
    ${body || empty(ui.showSeen ? 'Nothing here yet.' : 'Everything on this shelf is watched. Turn on “Show watched” to see it.')}`;
}

// ---------------------------------------------------------------- Solo + Tristan
export function solo(ui) {
  const all = S.cur.entries.filter(e => e.tier === 'M');
  const vis = visible(all, ui);
  const order = []; for (const e of all) if (!order.includes(e.section)) order.push(e.section);
  const body = order.map(s => {
    const list = sortEntries(vis.filter(e => e.section === s), ui);
    if (!list.length) return '';
    const isOpen = ui.openSolo.includes(s) || order.indexOf(s) === 0;
    return `<details class="group shelf"${isOpen ? ' open' : ''} data-section="${esc(s)}"><summary><h2>${esc(s)} <span class="count">${list.length}</span></h2></summary><div class="rows">${list.map(e => row(e.t, { entry: e, pitch: false })).join('')}</div></details>`;
  }).join('');
  return `<header class="view-head"><h1>Solo</h1>${syncNote()}</header>${filters(ui, ['kind'])}${body || empty('Nothing left on your solo shelves.')}`;
}
export function tristan(ui) {
  const vis = sortEntries(visible(S.cur.entries.filter(e => e.tier === 'T'), ui), ui);
  return `<header class="view-head"><h1>Tristan’s queue</h1>${syncNote()}</header>
    <p class="lede">For when you’re travelling: universe-loyalty picks and Moffat. Things he’ll enjoy and you won’t.</p>
    ${filters(ui, [])}<div class="rows">${vis.map(e => row(e.t, { entry: e })).join('') || empty('His queue is empty.')}</div>`;
}

// ---------------------------------------------------------------- Film school
export function school(ui, vols) {
  const queue = S.cur.entries.filter(e => e.section === 'Film school' && e.note !== 'Volume 1' && !/^Volume \d+/.test(e.note || ''));
  const vis = sortEntries(visible(queue, ui), ui);
  return `<header class="view-head"><h1>Film school</h1>${syncNote()}</header>
    <section class="group"><h2>Volumes</h2><div class="vols">${vols.map(v => `<a class="vol" href="#/school/${v.n}"><span class="vol-n">Vol. ${v.n}</span><span class="vol-t">${esc(v.title)}</span><span class="vol-p">${v.seen} of ${v.films.length} watched</span></a>`).join('') || '<p class="hint">No volumes yet.</p>'}</div>
    <p class="hint">New volumes appear here when their notes are added to the data repo.</p></section>
    <section class="group"><h2>On the syllabus <span class="count">${vis.length}</span></h2><p class="hint">Not yet in a volume.</p>${filters(ui, [])}<div class="rows">${vis.map(e => row(e.t, { entry: e })).join('')}</div></section>`;
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

  // "also in your lists" by shared people
  const seenP = new Set(), links = [];
  for (const c of [...(t.credits || [])].sort((a, b) => ROLE_RANK[a.r] - ROLE_RANK[b.r] || (a.o ?? 0) - (b.o ?? 0))) {
    if (seenP.has(c.p) || (c.r === 'actor' && (c.o ?? 0) > 5)) continue;
    seenP.add(c.p);
    const others = (IX.person.get(c.p) || []).filter(x => x.t !== t.id && title(x.t));
    if (others.length) links.push({ p: c.p, r: c.r, others });
  }
  const alsoHtml = links.slice(0, 10).map(({ p, r, others }) => `<div class="also"><h3><a href="#/p/${p}">${esc(S.people[p]?.name || p)}</a> <span>${esc((ROLE[r] || r).toLowerCase())} this</span></h3>
      <ul>${others.slice(0, 8).map(x => { const o = title(x.t); return `<li><a href="#/t/${encodeURIComponent(o.id)}">${esc(o.title)}</a> <span class="also-meta">${esc(o.year || '')}${x.r.filter(rr => rr !== r).length ? ' · ' + esc(x.r.map(rr => ROLE[rr].toLowerCase()).join(', ')) : ''}</span>${marks(o.id)}</li>`; }).join('')}${others.length > 8 ? `<li><a href="#/p/${p}">and ${others.length - 8} more</a></li>` : ''}</ul></div>`).join('');

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
    ${p || tristanish ? `<section class="pitch"><h2>The pitch for Tristan</h2>${p ? `<blockquote>${esc(p)}</blockquote>` : '<p class="hint">No pitch yet.</p>'}<button class="btn ghost small" data-act="edit-pitch" data-id="${esc(t.id)}">${p ? 'Edit pitch' : 'Write a pitch'}</button></section>` : ''}
    <section class="block"><h2>On your lists</h2>
      ${es.length ? `<ul class="placements">${es.map((e, i) => `<li><button class="placement" data-act="edit-entry" data-id="${esc(t.id)}" data-i="${i}" data-energy="${esc(e.energy || (e.tier === 'B?' ? 'test' : ''))}">
          <strong>${esc(TIER[e.tier] || 'Unsorted')}${e.energy ? ', ' + esc(ENERGY[e.energy].toLowerCase()) : ''}</strong>
          <span>${esc(e.section)}${e.status && e.status !== 'queued' ? ' — ' + esc(STATUS[e.status].toLowerCase()) : ''}${e.star ? ' — ★' : ''}</span>
          ${e.note ? `<em>${esc(e.note)}</em>` : ''}</button></li>`).join('')}</ul>` : '<p class="hint">Not on any list yet.</p>'}
      <button class="btn ghost small" data-act="add-entry" data-id="${esc(t.id)}">Add to a list</button>
    </section>
    <section class="block"><h2>Verdicts</h2>
      ${vs.length ? `<ul class="verdicts">${vs.map(v => `<li><button data-act="edit-verdict" data-id="${esc(t.id)}" data-v="${esc(v.id)}"><strong>${esc(VIEWER[v.viewer])}: ${esc(REACTION[v.reaction] || v.reaction)}</strong>${v.note ? `<span>${esc(v.note)}</span>` : ''}${v.date ? `<small>${esc(v.date)}</small>` : ''}</button></li>`).join('')}</ul>` : `<p class="hint">${s.meta ? 'You’ve logged it on Letterboxd, but there’s no verdict here yet.' : 'Nobody’s watched it yet.'}</p>`}
      <button class="btn" data-act="add-verdict" data-id="${esc(t.id)}">Log a verdict</button>
    </section>
    <section class="block school"><h2>Film school</h2>${schoolHtml}</section>
    ${l || di.length ? `<section class="block"><h2>Your Letterboxd</h2>
      <p class="lbline">${l?.rating ? `<span class="rating">${stars(l.rating)}</span>` : ''}${l?.liked ? '<span>Liked</span>' : ''}${l?.favourite ? '<span>One of your four favourites</span>' : ''}${l?.watched ? `<span>Logged as watched ${esc(l.watched)}</span>` : ''}${l?.watchlist && !l?.watched ? `<span>On your Letterboxd watchlist since ${esc(l.watchlist)}</span>` : ''}</p>
      ${di.map(d => `<div class="diary"><p class="hint">${esc(d.date || d.logged)}${d.rating ? ' — ' + stars(d.rating) : ''}${d.rewatch ? ' — rewatch' : ''}${d.tags?.length ? ' — ' + esc(d.tags.join(', ')) : ''}</p>${d.review ? `<div class="prose review">${md(d.review)}</div>` : ''}</div>`).join('')}
      </section>` : ''}
    ${alsoHtml ? `<section class="block"><h2>Also in your lists</h2>${alsoHtml}</section>` : ''}
    ${creditHtml ? `<section class="block"><h2>Credits</h2><dl class="credits">${creditHtml}</dl></section>` : ''}
    ${t.overview ? `<section class="block"><h2>Synopsis</h2><p class="prose">${esc(t.overview)}</p><p class="hint">From TMDB — may contain spoilers for the setup.</p></section>` : ''}
    ${t.match !== 'review' && t.match !== 'notfound' && t.kind !== 'standup' ? `<p class="fine"><button class="linkish" data-act="fix-match" data-id="${esc(t.id)}">Wrong film or show? Fix the match</button></p>` : ''}
  </article>`;
}

// ---------------------------------------------------------------- Person
export function personPage(pid) {
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
    ${Object.keys(byRole).sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]).map(role => `<section class="group"><h2>${ROLE[role]}</h2><div class="rows">${byRole[role]
      .sort((a, b) => (title(b.t)?.year || 0) - (title(a.t)?.year || 0)).map(r => row(r.t, { entry: entriesOf(r.t)[0], pitch: false })).join('')}</div></section>`).join('')}`;
}

// ---------------------------------------------------------------- More, search, unsorted, watched, review
export function more() {
  const review = S.titles.filter(t => (t.match === 'review' || t.match === 'notfound') && !S.cur.matchOverrides?.[t.id]).length;
  const unsorted = unsortedIds().length;
  return `<header class="view-head"><h1>More</h1>${syncNote()}</header>
    <nav class="menu">
      <a href="#/search">Search everything</a>
      <a href="#/add">Add a film or show</a>
      <a href="#/watched">Verdicts and calibration</a>
      <a href="#/unsorted">Unsorted from Letterboxd <span class="count">${unsorted}</span></a>
      <a href="#/review">Check TMDB matches <span class="count">${review}</span></a>
      <a href="#/settings">Settings</a>
    </nav>
    <p class="fine">${S.titles.length} titles, ${S.cur.entries.length} list entries, ${S.cur.verdicts.length} verdicts. Letterboxd export from ${esc(S.lb?.exportedAt || '—')}.</p>
    <p class="fine">Posters, credits and links come from the TMDB API. This app is not endorsed or certified by TMDB.</p>`;
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
export function unsorted() {
  const ids = new Set(unsortedIds());
  const wl = [...ids].filter(id => lbOf(id)?.watchlist).sort((a, b) => (lbOf(b).watchlist || '').localeCompare(lbOf(a).watchlist || ''));
  const lists = Object.entries(S.lb?.lists || {}).map(([name, l]) => [name, l.items.filter(id => ids.has(id))]).filter(([, x]) => x.length);
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Unsorted</h1></header>
    <p class="lede">On your Letterboxd watchlist or lists, unwatched, and not on any shelf here yet. Open one and choose “Add to a list”.</p><div class="filters">${viewToggle()}</div>
    <details class="group shelf" open><summary><h2>Letterboxd watchlist <span class="count">${wl.length}</span></h2></summary><div class="rows">${wl.map(id => row(id, { pitch: false })).join('')}</div></details>
    ${lists.map(([name, items]) => `<details class="group shelf"><summary><h2>${esc(name)} <span class="count">${items.length}</span></h2></summary><div class="rows">${items.map(id => row(id, { pitch: false })).join('')}</div></details>`).join('')}`;
}
export function watched() {
  const groups = [['both', 'Together'], ['tristan', 'Tristan'], ['meta', 'You']];
  const order = ['favourite', 'loved', 'liked', 'mixed', 'bounced', 'disliked', 'seen'];
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Verdicts</h1></header>
    <section class="group"><h2>What we’ve learned</h2><ul class="calib">${(S.cur.calibration || []).map(c => `<li>${md(c.text).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul></section>
    ${groups.map(([v, name]) => {
      const vs = S.cur.verdicts.filter(x => x.viewer === v && x.reaction !== 'seen').sort((a, b) => order.indexOf(a.reaction) - order.indexOf(b.reaction));
      if (!vs.length) return '';
      return `<section class="group"><h2>${name} <span class="count">${vs.length}</span></h2><ul class="verdict-list">${vs.map(x => { const t = title(x.t); return t ? `<li><a href="#/t/${encodeURIComponent(t.id)}">${esc(t.title)}</a> <span class="r r-${x.reaction}">${esc(REACTION[x.reaction])}</span>${x.note ? `<small>${esc(x.note)}</small>` : ''}</li>` : ''; }).join('')}</ul></section>`;
    }).join('')}
    <section class="group"><h2>Recent diary</h2><div class="rows">${(S.lb?.diary || []).slice(0, 25).map(d => row(d.t, { pitch: false })).join('')}</div></section>`;
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
    <label>List<select name="tier">${opt([['B', 'Together'], ['B?', 'Test together'], ['M', 'Solo'], ['T', 'Tristan’s queue']], e.tier)}</select></label>
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
      <label>List<select name="tier">${opt([['B', 'Together'], ['B?', 'Test together'], ['M', 'Solo'], ['T', 'Tristan’s queue']], 'B')}</select></label>
      <label>Energy<select name="energy">${opt([['', 'Not set'], ['light', 'Light night'], ['dense', 'Dense night'], ['heavy', 'Heavy token']], 'dense')}</select></label>
      <label>Shelf<input name="section" list="sections" placeholder="e.g. Dense nights"></label>${sectionList()}
      <label>Pitch for Tristan<textarea name="pitch" rows="3" placeholder="Optional"></textarea></label>
      <div class="actions"><button class="btn">Add</button></div>
      <p class="hint">The poster, credits and links are looked up on TMDB within a few minutes.</p>
    </form>`;
}
export function settings(auth, theme) {
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Settings</h1></header>
    <h2>Data</h2>
    <dl class="kv"><dt>Data repo</dt><dd>${esc(auth?.repo || '')} (${esc(auth?.branch || 'main')})</dd><dt>Token</dt><dd>…${esc((auth?.token || '').slice(-6))}</dd></dl>
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
