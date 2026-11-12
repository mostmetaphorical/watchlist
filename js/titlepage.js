// The page for one film or show, and the page for one person. The title page is
// a stack of blocks, each built by its own function below and left out when it
// has nothing to say.
import { S, IX, title, entriesOf, verdictsOf, lbOf, diaryOf, pitchOf, seen, open, tmdbRef } from './store.js';
import { esc, md, frontMatter, noteSections, splitQuestions } from './md.js';
import { availBlock } from './avail.js';
import { IMG, ENERGY, TIER, REACTION, VIEWER, STATUS, ROLE, ROLE_RANK, viewToggle, poster, metaLine, stars, row, shelf, heading, empty } from './parts.js';

const out = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const inline = (html) => html.replace(/^<p>|<\/p>$/g, '');   // drop the paragraph md() wraps around one line
const btn = (act, t, label, cls = 'btn ghost small') => `<button class="${cls}" data-act="${act}" data-id="${esc(t.id)}">${label}</button>`;

// ---------------------------------------------------------------- outside links
// Letterboxd, IMDb and TMDB: a direct link when the id is known, a search otherwise.
function externalLinks(t) {
  const tm = tmdbRef(t), q = encodeURIComponent(t.title);
  const lb = /^https:\/\/(letterboxd\.com|boxd\.it)\//.test(t.lb || '') ? t.lb
    : tm?.type === 'movie' ? `https://letterboxd.com/tmdb/${tm.id}/` : `https://letterboxd.com/search/${q}/`;
  const imdb = t.imdb ? `https://www.imdb.com/title/${t.imdb}/` : `https://www.imdb.com/find/?q=${encodeURIComponent(t.title + (t.year ? ' ' + t.year : ''))}`;
  const tmdb = tm ? `https://www.themoviedb.org/${tm.type}/${tm.id}` : `https://www.themoviedb.org/search?query=${q}`;
  return `<div class="ext">${out(lb, 'Letterboxd')}${out(imdb, 'IMDb')}${out(tmdb, 'TMDB')}</div>`;
}

// ---------------------------------------------------------------- TMDB match status
// Shown when the automatic lookup is unsure, failed, or is still to run, or when
// she has answered and the lookup job hasn't picked the answer up yet.
function matchBlock(t) {
  const fix = `<div class="actions left">${btn('retry-match', t, 'Search TMDB again')}${btn('fix-match', t, 'Paste a TMDB link')}</div>`;
  const warn = (h2, text, extra) => `<section class="block warn-block"><h2>${h2}</h2><p class="hint">${text}</p>${extra}</section>`;
  const saved = S.cur.matchOverrides?.[t.id];
  if (saved) {
    const [h2, text] = saved === 'retry' ? ['Looking it up again', 'TMDB will be searched again.']
      : saved === 'none' ? ['Match saved', 'Marked as not on TMDB.'] : ['Match saved', 'Your choice is saved.'];
    return `<section class="block ok-block" role="status"><h2>${h2}</h2><p class="hint">${text} This page updates by itself in a few minutes.</p>${saved === 'none' ? fix : ''}</section>`;
  }
  if (t.match === 'none' && t.kind !== 'standup') return warn('Marked as not on TMDB', 'No poster, credits or cross-links for this one. Changed your mind, or has it been added to TMDB since?', fix);
  if (t.match === 'notfound') return warn('Not found on TMDB', 'The search came back empty. Paste the link if you can find it, or try the search again.', fix);
  if (t.match === 'pending') return '<p class="hint block">Poster, credits and links appear after the next TMDB lookup (usually within a few minutes).</p>';
  if (t.match !== 'review' || !t.candidates?.length) return '';
  const cand = (c) => `<button class="cand" data-act="pick-match" data-id="${esc(t.id)}" data-type="${esc(c.type)}" data-tmdb="${esc(c.id)}">${
    c.poster ? `<img src="${IMG}w154${esc(c.poster)}" alt="" loading="lazy">` : '<span class="poster ph"></span>'}<span>${esc(c.title)} <em>${esc(c.year || '')}</em> <small>${c.type === 'tv' ? 'series' : 'film'}</small></span></button>`;
  return warn(`Is this the right ${t.kind === 'series' ? 'show' : 'film'}?`, 'The TMDB lookup wasn’t sure. Pick the right one and the details update on the next lookup run.',
    `<div class="cands">${t.candidates.map(cand).join('')}</div>${btn('fix-match', t, 'None of these')}`);
}

// ---------------------------------------------------------------- pitch, lists, verdicts
function pitchBlock(t, es) {
  const p = pitchOf(t.id);
  if (!p && !es.some(e => ['B', 'B?', 'T'].includes(e.tier))) return '';   // only for things Tristan might watch
  return `<section class="pitch"><h2>The pitch for Tristan</h2>${p ? `<blockquote>${esc(p)}</blockquote>` : '<p class="hint">No pitch yet.</p>'}${btn('edit-pitch', t, p ? 'Edit pitch' : 'Write a pitch')}</section>`;
}
function listsBlock(t, es) {
  const placement = (e, i) => `<li><button class="placement" data-act="edit-entry" data-id="${esc(t.id)}" data-i="${i}" data-energy="${esc(e.energy || (e.tier === 'B?' ? 'test' : ''))}">
      <strong>${esc(TIER[e.tier] || 'Unsorted')}${e.energy ? ', ' + esc(ENERGY[e.energy].toLowerCase()) : ''}</strong>
      <span>${esc(e.section)}${e.status && e.status !== 'queued' ? ' — ' + esc(STATUS[e.status].toLowerCase()) : ''}${e.star ? ' — ★' : ''}</span>
      ${e.note && e.tier !== 'R' ? `<em>${esc(e.note)}</em>` : ''}</button></li>`;
  return `<section class="block"><h2>On your lists</h2>
    ${es.length ? `<ul class="placements">${es.map(placement).join('')}</ul>` : '<p class="hint">Not on any list yet.</p>'}
    ${btn('add-entry', t, 'Add to a list')}
  </section>`;
}
function verdictsBlock(t) {
  const vs = verdictsOf(t.id);
  const item = (v) => `<li><button data-act="edit-verdict" data-id="${esc(t.id)}" data-v="${esc(v.id)}"><strong>${esc(VIEWER[v.viewer])}: ${esc(REACTION[v.reaction] || v.reaction)}</strong>${v.note ? `<span>${esc(v.note)}</span>` : ''}${v.date ? `<small>${esc(v.date)}</small>` : ''}</button></li>`;
  const none = seen(t.id).meta ? 'You’ve logged it on Letterboxd, but there’s no verdict here yet.' : 'Nobody’s watched it yet.';
  return `<section class="block"><h2>Verdicts</h2>
    ${vs.length ? `<ul class="verdicts">${vs.map(item).join('')}</ul>` : `<p class="hint">${none}</p>`}
    ${btn('add-verdict', t, 'Log a verdict', 'btn')}
  </section>`;
}

// ---------------------------------------------------------------- film school notes
// note is undefined while it loads, null when there isn't one, else { text }.
// The note's sections become collapsibles: "Before" starts open, "After" is
// hidden behind a spoiler warning until opened once, "Diary" becomes a numbered list.
function schoolBlock(t, note, ui) {
  let inner;
  if (note === undefined) inner = '<p class="hint">Loading notes…</p>';
  else if (!note) inner = `<p class="hint">No notes yet. Ask Claude to write them, or write your own.</p>${btn('edit-note', t, 'Write notes', 'btn ghost')}`;
  else {
    const { meta, body } = frontMatter(note.text);
    const where = meta.volume ? `<p class="hint"><a href="#/school/${esc(meta.volume)}">Volume ${esc(meta.volume)}, film ${esc(meta.number)}</a>${meta.heading ? ' — ' + esc(meta.heading) : ''}</p>` : '';
    const part = ({ label, body: text }) => {
      const qs = /diary/i.test(label) && splitQuestions(text);
      const html = qs ? `<ol class="questions">${qs.map(q => `<li>${inline(md(q))}</li>`).join('')}</ol>` : md(text);
      if (/^read more/i.test(label)) return `<p class="note-more">${inline(html)}</p>`;
      if (!label) return `<div class="prose">${html}</div>`;
      if (/^after/i.test(label) && !ui.spoilers[t.id]) return `<details class="note-part spoiler"><summary>${esc(label)} <span class="hint">contains spoilers</span></summary><div class="prose">${html}</div></details>`;
      return `<details class="note-part"${/before/i.test(label) ? ' open' : ''}><summary>${esc(label)}</summary><div class="prose">${html}</div></details>`;
    };
    inner = where + noteSections(body).map(part).join('') + btn('edit-note', t, 'Edit notes');
  }
  return `<section class="block school"><h2>Film school</h2>${inner}</section>`;
}

// ---------------------------------------------------------------- Letterboxd, credits, similar
function letterboxdBlock(t) {
  const l = lbOf(t.id), diary = diaryOf(t.id);
  if (!l && !diary.length) return '';
  const facts = [
    l?.rating && `<span class="rating">${stars(l.rating)}</span>`,
    l?.liked && '<span>Liked</span>',
    l?.favourite && '<span>One of your four favourites</span>',
    l?.watched && `<span>Logged as watched ${esc(l.watched)}</span>`,
    l?.watchlist && !l?.watched && `<span>On your Letterboxd watchlist since ${esc(l.watchlist)}</span>`,
  ].filter(Boolean).join('');
  const entry = (d) => `<div class="diary"><p class="hint">${esc(d.date || d.logged)}${d.rating ? ' — ' + stars(d.rating) : ''}${d.rewatch ? ' — rewatch' : ''}${d.tags?.length ? ' — ' + esc(d.tags.join(', ')) : ''}</p>${d.review ? `<div class="prose review">${md(d.review)}</div>` : ''}</div>`;
  return `<section class="block"><h2>Your Letterboxd</h2><p class="lbline">${facts}</p>${diary.map(entry).join('')}</section>`;
}
function creditsBlock(t) {
  const byRole = {};
  for (const c of t.credits || []) (byRole[c.r] ||= []).push(c);
  const roles = Object.keys(byRole).sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]);
  if (!roles.length) return S.extras ? '' : '<section class="block"><h2>Credits</h2><p class="hint">Still loading.</p></section>';
  const name = (c, role) => `<a href="#/p/${encodeURIComponent(c.p)}">${esc(S.people[c.p]?.name || c.p)}</a>${c.c && role === 'actor' ? ` <span class="as">as ${esc(c.c)}</span>` : ''}`;
  return `<section class="block"><h2>Credits</h2><dl class="credits">${roles.map(r =>
    `<div class="credit"><dt>${ROLE[r]}</dt><dd>${byRole[r].sort((a, b) => (a.o ?? 0) - (b.o ?? 0)).map(c => name(c, r)).join(', ')}</dd></div>`).join('')}</dl></section>`;
}

// Five titles from her own lists that share makers or genres with this one.
// Directors and creators count most, then writers, then music and camera; actors
// only when billed in the top five. Ties go to same kind, still to watch, has a poster.
const ROLE_WEIGHT = { director: 6, creator: 6, writer: 3, composer: 2, cinematographer: 2, producer: 1 };
function similarTo(t) {
  const score = new Map();
  const bump = (id, n) => { if (id !== t.id) score.set(id, (score.get(id) || 0) + n); };
  for (const c of t.credits || []) {
    const w = c.r === 'actor' ? ((c.o ?? 9) <= 4 ? 2 : 0) : (ROLE_WEIGHT[c.r] || 0);
    if (w) for (const r of IX.person.get(c.p) || []) bump(r.t, w);
  }
  const genres = new Set(t.genres || []);
  if (genres.size) for (const id of IX.entries.keys()) {
    const shared = (title(id)?.genres || []).filter(x => genres.has(x)).length;
    if (shared) bump(id, Math.min(3, shared * 1.2));
  }
  const ranked = [];
  for (const [id, base] of score) {
    const o = title(id), es = entriesOf(id);
    if (!o || !es.length) continue;
    ranked.push([id, base + ((o.kind || 'film') === (t.kind || 'film') ? 1 : 0) + (es.some(open) ? 1.5 : 0) + (o.poster ? 0.5 : 0)]);
  }
  return ranked.sort((a, b) => b[1] - a[1] || String(title(a[0]).title).localeCompare(title(b[0]).title)).slice(0, 5).map(x => x[0]);
}
function similarBlock(t) {
  const near = similarTo(t);
  if (near.length < 3) return '';
  return `<section class="block"><h2>More like this</h2>
    <p class="hint">From your lists, by the people who made it and what it is.</p>
    <div class="similar">${near.map(id => { const o = title(id);
      return `<a href="#/t/${encodeURIComponent(o.id)}">${poster(o, 'w185')}<span>${esc(o.title)}</span></a>`; }).join('')}</div></section>`;
}

// ---------------------------------------------------------------- Title page
// note: the film-school note for this title (see schoolBlock).
export function titlePage(id, ui, note) {
  const t = title(id);
  if (!t) return `<header class="view-head"><h1>Not found</h1></header>${empty('That title isn’t in your data. It may have been merged with another one.', '<a class="btn" href="#/search">Search</a>')}`;
  const es = entriesOf(t.id);
  const synopsis = t.overview || t.syn;
  const canFix = t.match !== 'review' && t.match !== 'notfound' && t.kind !== 'standup';
  const canRemove = es.length || pitchOf(t.id) || verdictsOf(t.id).length;
  return `<article class="title-page">
    <header class="tp-head">
      <a class="back" href="#/together" data-act="back">Back</a>
      <div class="tp-top">${poster(t, 'w342', 'big')}
        <div class="tp-id">
          <h1>${esc(t.title)}</h1>
          ${t.original && t.original !== t.title ? `<p class="orig">${esc(t.original)}</p>` : ''}
          <p class="row-meta">${metaLine(t)}</p>
          ${t.genres?.length ? `<p class="genres">${esc(t.genres.join(', '))}</p>` : ''}
          ${externalLinks(t)}
        </div>
      </div>
    </header>
    ${matchBlock(t)}
    ${synopsis ? `<section class="block synopsis"><h2>What it is</h2><p class="prose">${esc(synopsis)}</p><p class="hint">From TMDB — may contain spoilers for the setup.</p></section>` : ''}
    ${availBlock(t)}
    ${pitchBlock(t, es)}
    ${listsBlock(t, es)}
    ${schoolBlock(t, note, ui)}
    ${verdictsBlock(t)}
    ${letterboxdBlock(t)}
    ${creditsBlock(t)}
    ${similarBlock(t)}
    <p class="fine">
      ${canFix ? `<button class="linkish" data-act="fix-match" data-id="${esc(t.id)}">Wrong film or show? Fix the match</button><br>` : ''}
      ${canRemove ? `<button class="linkish danger" data-act="remove-title" data-id="${esc(t.id)}">Remove ${t.kind === 'series' ? 'this series' : 'this film'} from your lists</button>` : ''}
    </p>
  </article>`;
}

// ---------------------------------------------------------------- Person
// Everything on her lists or Letterboxd this person worked on, by role, newest first.
export function personPage(pid, ui) {
  const person = S.people[pid];
  if (!person) return '<header class="view-head"><h1>Unknown person</h1></header>';
  const credits = IX.person.get(pid) || [];
  const byRole = {};
  for (const c of credits) for (const role of c.r) (byRole[role] ||= []).push(c);
  const newestFirst = (a, b) => (title(b.t)?.year || 0) - (title(a.t)?.year || 0);
  return `<header class="view-head person-head"><a class="back" href="#/together" data-act="back">Back</a>
      ${person.img ? `<img class="headshot" src="${IMG}w185${esc(person.img)}" alt="">` : ''}
      <h1>${esc(person.name)}</h1>${person.dept ? `<p class="hint">Known for ${esc(person.dept.toLowerCase())}</p>` : ''}
      <p class="ext">${out(`https://www.themoviedb.org/person/${pid.slice(1)}`, 'TMDB')}${out(`https://letterboxd.com/search/${encodeURIComponent(person.name)}/`, 'Letterboxd')}</p></header>
    <p class="lede">${credits.length} title${credits.length === 1 ? '' : 's'} in your lists and Letterboxd.</p><div class="filters">${viewToggle()}</div>
    ${Object.keys(byRole).sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]).map(role => shelf(ui, `person:${pid}:${role}`, heading(ROLE[role], byRole[role].length),
      `<div class="rows">${byRole[role].sort(newestFirst).map(c => row(c.t, { entry: entriesOf(c.t)[0], pitch: false })).join('')}</div>`)).join('')}`;
}
