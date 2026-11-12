// Everything under More: the tile menu, Incoming, Rent, search, Unsorted,
// Verdicts and Check matches.
import { S, IX, title, entriesOf, lbOf, seen, open } from './store.js';
import { esc, md } from './md.js';
import { wlvOf, wlvUrl, atWlv, formatsOf } from './avail.js';
import { IMG, ENERGY, TIER, onShelf, REACTION, viewToggle, row, shelf, empty, filters, kindOk, syncNote, ICON } from './parts.js';

export function more() {
  const review = S.titles.filter(t => (t.match === 'review' || t.match === 'notfound') && !S.cur.matchOverrides?.[t.id]).length;
  const unsorted = unsortedIds().length;
  const tiles = [
    ['#/roll', 'Roll the dice', ICON.dice, 0],
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
  // Stock comes from the monthly catalogue check when there is one; the entry's own
  // flag is the fallback. Copies on the shelf are left to the store page.
  const w = wlvOf(e.t), item = w?.items?.find(x => wlvUrl(x.slug));
  const stocked = w ? !!item && item.total !== 0 : e.wlv === 'yes';
  const href = wlvUrl(item?.slug || e.wlvSlug);
  const line = e.rented ? `Rented ${esc(e.rented)}` : stocked ? `Stocks it${item && formatsOf(item) ? ` (${esc(formatsOf(item))})` : ''}` : 'Not in the catalogue';
  return `<div class="irow${e.rented ? ' is-played' : ''}">
    ${row(e.t, { entry: { ...e, note: undefined }, marks: false })}
    <div class="irow-foot">
      <span class="suggest">${line}${stocked && href ? ` <a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open in the store</a>` : ''}</span>
      <span class="irow-acts">
        <button class="btn small${e.rented ? ' ghost' : ''}" data-act="${e.rented ? 'unrent' : 'rent'}" data-t="${esc(e.t)}" data-i="${i}">${e.rented ? 'Put back' : 'Rented'}</button>
        <button class="btn small ghost" data-act="drop-rent" data-t="${esc(e.t)}" data-i="${i}">Remove</button>
      </span>
    </div>
  </div>`;
}
// Stocked by We Luv Video, by the monthly check when there is one.
const rentStocked = (e) => (wlvOf(e.t) ? atWlv(e.t) : e.wlv === 'yes');
export function rent(ui) {
  const all = S.cur.entries.map((e, i) => ({ e, i })).filter(x => x.e.tier === 'R');
  const kindOk = (x) => ui.kind === 'all' || !ui.kind || (title(x.e.t)?.kind || 'film') === ui.kind;
  const live = all.filter(x => kindOk(x) && !x.e.rented);
  const done = all.filter(x => x.e.rented);
  const head = `<header class="view-head"><a class="back" href="#/more">More</a><h1>Rent</h1>${syncNote()}</header>`;
  if (!all.length) return head + empty('Nothing to rent. Anything you want that isn\u2019t streaming anywhere lands here, with a note on whether We Luv Video has a copy.');
  const stocked = live.filter(x => rentStocked(x.e)), maybe = live.filter(x => !rentStocked(x.e));
  const block = (key, t2, list, hint) => list.length ? shelf(ui, 'rent:' + key, `${t2} <span class="count">${list.length}</span>`,
    `${hint ? `<p class="hint">${hint}</p>` : ''}<div class="rows">${list.map(x => rentRow(x.e, x.i)).join('')}</div>`) : '';
  return `${head}
    <p class="lede">Not streaming anywhere you subscribe to. Take the list on your next shift.</p>
    ${filters(ui, ['kind'])}
    ${block('wlv', 'At We Luv Video', stocked, 'In their catalogue. Open the store page to see if a copy is in today.')}
    ${block('else', 'Nowhere found yet', maybe, 'Not in the We Luv Video catalogue either \u2014 worth asking, or waiting for next month\u2019s check.')}
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
    ppl = ph.map(([id, p]) => `<a class="person-row" href="#/p/${encodeURIComponent(id)}">${p.img ? `<img src="${IMG}w92${esc(p.img)}" alt="" loading="lazy">` : '<span class="poster ph small"></span>'}<span>${esc(p.name)}</span><span class="count">${IX.person.get(id)?.length || 0}</span></a>`).join('');
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
