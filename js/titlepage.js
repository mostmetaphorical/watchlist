// One film or show, and one person.
import { S, IX, title, entriesOf, verdictsOf, lbOf, diaryOf, pitchOf, seen, open } from './store.js';
import { esc, md, frontMatter, noteSections, splitQuestions } from './md.js';
import { availBlock } from './avail.js';
import { IMG, ENERGY, TIER, REACTION, VIEWER, STATUS, ROLE, ROLE_RANK, viewToggle, poster, metaLine, stars, row, shelf, empty } from './parts.js';

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
  // Radarr-added films carry a bare TMDB number until the enrich job runs.
  const tm = t.tmdb && typeof t.tmdb === 'object' ? t.tmdb : t.tmdb ? { type: 'movie', id: t.tmdb } : null;
  const lbUrl = /^https:\/\/(letterboxd\.com|boxd\.it)\//.test(t.lb || '') ? t.lb : tm?.type === 'movie' ? `https://letterboxd.com/tmdb/${tm.id}/` : `https://letterboxd.com/search/${encodeURIComponent(t.title)}/`;
  const imdbUrl = t.imdb ? `https://www.imdb.com/title/${t.imdb}/` : `https://www.imdb.com/find/?q=${encodeURIComponent(t.title + (t.year ? ' ' + t.year : ''))}`;
  const tmdbUrl = tm ? `https://www.themoviedb.org/${tm.type}/${tm.id}` : `https://www.themoviedb.org/search?query=${encodeURIComponent(t.title)}`;
  const tristanish = es.some(e => ['B', 'B?', 'T'].includes(e.tier));

  // credits grouped by role
  const credits = {};
  for (const c of t.credits || []) (credits[c.r] ||= []).push(c);
  const creditHtml = Object.keys(credits).sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]).map(r =>
    `<div class="credit"><dt>${ROLE[r]}</dt><dd>${credits[r].sort((a, b) => (a.o ?? 0) - (b.o ?? 0)).map(c => `<a href="#/p/${encodeURIComponent(c.p)}">${esc(S.people[c.p]?.name || c.p)}</a>${c.c && r === 'actor' ? ` <span class="as">as ${esc(c.c)}</span>` : ''}`).join(', ')}</dd></div>`).join('');

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
      <div class="cands">${t.candidates.map(c => `<button class="cand" data-act="pick-match" data-id="${esc(t.id)}" data-type="${esc(c.type)}" data-tmdb="${esc(c.id)}">${c.poster ? `<img src="${IMG}w154${esc(c.poster)}" alt="" loading="lazy">` : '<span class="poster ph"></span>'}<span>${esc(c.title)} <em>${esc(c.year || '')}</em> <small>${c.type === 'tv' ? 'series' : 'film'}</small></span></button>`).join('')}</div>
      <button class="btn ghost small" data-act="fix-match" data-id="${esc(t.id)}">None of these</button></section>`
    : t.match === 'notfound' ? `<section class="block warn-block"><h2>Not found on TMDB</h2><p class="hint">The search came back empty. Paste the link if you can find it, or try the search again.</p>${fixBtns}</section>`
    : t.match === 'pending' ? `<p class="hint block">Poster, credits and links appear after the next TMDB lookup (usually within a few minutes).</p>` : '';

  return `<article class="title-page">
    <header class="tp-head">
      <a class="back" href="#/together" data-act="back">Back</a>
      <div class="tp-top">${poster(t, 'w342', 'big')}
        <div class="tp-id">
          <h1>${esc(t.title)}</h1>
          ${t.original && t.original !== t.title ? `<p class="orig">${esc(t.original)}</p>` : ''}
          <p class="row-meta">${metaLine(t)}</p>
          ${t.genres?.length ? `<p class="genres">${esc(t.genres.join(', '))}</p>` : ''}
          <div class="ext"><a href="${esc(lbUrl)}" target="_blank" rel="noopener noreferrer">Letterboxd</a><a href="${esc(imdbUrl)}" target="_blank" rel="noopener noreferrer">IMDb</a><a href="${esc(tmdbUrl)}" target="_blank" rel="noopener noreferrer">TMDB</a></div>
        </div>
      </div>
    </header>
    ${matchHtml}
    ${t.overview || t.syn ? `<section class="block synopsis"><h2>What it is</h2><p class="prose">${esc(t.overview || t.syn)}</p><p class="hint">From TMDB — may contain spoilers for the setup.</p></section>` : ''}
    ${availBlock(t)}
    ${p || tristanish ? `<section class="pitch"><h2>The pitch for Tristan</h2>${p ? `<blockquote>${esc(p)}</blockquote>` : '<p class="hint">No pitch yet.</p>'}<button class="btn ghost small" data-act="edit-pitch" data-id="${esc(t.id)}">${p ? 'Edit pitch' : 'Write a pitch'}</button></section>` : ''}
    <section class="block"><h2>On your lists</h2>
      ${es.length ? `<ul class="placements">${es.map((e, i) => `<li><button class="placement" data-act="edit-entry" data-id="${esc(t.id)}" data-i="${i}" data-energy="${esc(e.energy || (e.tier === 'B?' ? 'test' : ''))}">
          <strong>${esc(TIER[e.tier] || 'Unsorted')}${e.energy ? ', ' + esc(ENERGY[e.energy].toLowerCase()) : ''}</strong>
          <span>${esc(e.section)}${e.status && e.status !== 'queued' ? ' — ' + esc(STATUS[e.status].toLowerCase()) : ''}${e.star ? ' — ★' : ''}</span>
          ${e.note && e.tier !== 'R' ? `<em>${esc(e.note)}</em>` : ''}</button></li>`).join('')}</ul>` : '<p class="hint">Not on any list yet.</p>'}
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
    ${creditHtml ? `<section class="block"><h2>Credits</h2><dl class="credits">${creditHtml}</dl></section>`
      : !S.extras ? '<section class="block"><h2>Credits</h2><p class="hint">Still loading.</p></section>' : ''}
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
  return `<header class="view-head person-head"><a class="back" href="#/together" data-act="back">Back</a>
      ${person.img ? `<img class="headshot" src="${IMG}w185${esc(person.img)}" alt="">` : ''}
      <h1>${esc(person.name)}</h1>${person.dept ? `<p class="hint">Known for ${esc(person.dept.toLowerCase())}</p>` : ''}
      <p class="ext"><a href="https://www.themoviedb.org/person/${esc(pid.slice(1))}" target="_blank" rel="noopener noreferrer">TMDB</a><a href="https://letterboxd.com/search/${encodeURIComponent(person.name)}/" target="_blank" rel="noopener noreferrer">Letterboxd</a></p></header>
    <p class="lede">${rows.length} title${rows.length === 1 ? '' : 's'} in your lists and Letterboxd.</p><div class="filters">${viewToggle()}</div>
    ${Object.keys(byRole).sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]).map(role => shelf(ui, `person:${pid}:${role}`,
      `${ROLE[role]} <span class="count">${byRole[role].length}</span>`,
      `<div class="rows">${byRole[role].sort((a, b) => (title(b.t)?.year || 0) - (title(a.t)?.year || 0)).map(r => row(r.t, { entry: entriesOf(r.t)[0], pitch: false })).join('')}</div>`)).join('')}`;
}
