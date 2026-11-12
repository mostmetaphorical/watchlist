// Everything under More: the tile menu, Incoming, Rent, Search, Unsorted,
// Verdicts and Check matches.
import { S, IX, title, entriesOf, lbOf, seen, open, fold } from './store.js';
import { esc, md } from './md.js';
import { wlvOf, wlvUrl, atWlv, formatsOf } from './avail.js';
import { IMG, ENERGY, TIER, onShelf, REACTION, viewToggle, row, rows, shelf, heading, empty, filters, kindOk, syncNote, ICON } from './parts.js';

const back = (h1) => `<header class="view-head"><a class="back" href="#/more">More</a><h1>${h1}</h1>${syncNote()}</header>`;
const hint = (text) => text ? `<p class="hint">${text}</p>` : '';
// Entries paired with their position in curation.json, which the buttons need to
// say which entry they act on.
const indexed = () => S.cur.entries.map((e, i) => ({ e, i }));
const needsCheck = () => S.titles.filter(t => (t.match === 'review' || t.match === 'notfound') && !S.cur.matchOverrides?.[t.id]);

// ---------------------------------------------------------------- the More menu
export function more() {
  const count = (test) => S.cur.entries.filter(test).length;
  const tiles = [   // [link, label, icon, number shown on the tile (0 hides it)]
    ['#/roll', 'Roll the dice', ICON.dice, 0],
    ['#/tristan', 'Tristan’s queue', ICON.wolf, count(e => onShelf(e) && e.tier === 'T' && open(e))],
    ['#/store', 'Store picks', ICON.tape, count(e => onShelf(e) && e.tier === 'W')],
    ['#/incoming', 'Incoming', ICON.inbox, count(e => e.auto)],
    ['#/add', 'Add a title', ICON.plus, 0],
    ['#/rent', 'Rent', ICON.disc, count(e => e.tier === 'R' && !e.rented)],
    ['#/unsorted', 'Unsorted', ICON.tray, unsortedIds().length],
    ['#/review', 'Check matches', ICON.verify, needsCheck().length],
    ['#/watched', 'Verdicts', ICON.star, S.cur.verdicts.length],
    ['#/settings', 'Settings', ICON.gear, 0],
  ];
  return `<header class="view-head"><h1>More</h1>${syncNote()}</header>
    <nav class="tiles">${tiles.map(([href, label, icon, n]) => `<a class="tile" href="${href}">${icon}<span class="lbl">${label}</span>${n ? `<span class="count">${n}</span>` : ''}</a>`).join('')}</nav>
    <p class="fine">${S.titles.length} titles, ${S.cur.entries.length} list entries, ${S.cur.verdicts.length} verdicts. Letterboxd export from ${esc(S.lb?.exportedAt || '—')}.</p>
    <p class="fine">Posters, credits and links come from the TMDB API. This app is not endorsed or certified by TMDB.</p>`;
}

// ---------------------------------------------------------------- Incoming
// The monthly pass parks what it finds here (auto: true). Nothing reaches a shelf
// until it's kept. Kept announcements (tier C) wait here too until they're out.
// A row with a footer line on the left and buttons on the right.
const footRow = (x, line, buttons) => `<div class="irow${x.e.rented ? ' is-played' : ''}">
    ${row(x.e.t, { entry: x.e, marks: false })}
    <div class="irow-foot"><span class="suggest">${line}</span><span class="irow-acts">${buttons}</span></div>
  </div>`;
const button = (act, x, label, ghost = true) =>
  `<button class="btn small${ghost ? ' ghost' : ''}" data-act="${act}" data-t="${esc(x.e.t)}" data-i="${x.i}">${label}</button>`;

function incomingRow(x) {
  if (!title(x.e.t)) return '';
  const e = x.e;
  const where = e.tier === 'C' ? 'Coming soon' : `${TIER[e.tier] || e.tier}${e.energy ? ', ' + ENERGY[e.energy].toLowerCase() : ''}`;
  return footRow(x, `${esc(where)}${e.found ? ` · found ${esc(e.found)}` : ''}`, button('keep-auto', x, 'Keep', false) + button('bin-auto', x, 'Bin'));
}
const keptRow = (x) => footRow(x, x.e.note ? esc(x.e.note) : 'Awaiting release', button('bin-auto', x, 'Bin'));

export function incoming(ui) {
  const auto = indexed().filter(x => x.e.auto);
  const kept = indexed().filter(x => !x.e.auto && x.e.tier === 'C');
  if (!auto.length && !kept.length) return back('Incoming') + empty('Nothing waiting. The monthly pass puts anything it finds here first, so it never lands on a shelf without you.');
  const block = (key, name, list, text, render = incomingRow, open = true) => list.length
    ? shelf(ui, 'incoming:' + key, heading(name, list.length), `${hint(text)}<div class="rows">${list.map(render).join('')}</div>`, { open })
    : '';
  return `${back('Incoming')}
    <p class="lede">Picks the monthly pass found. Keep sends one to the list it suggests; Bin removes it and stops it coming back.</p>
    ${block('now', 'Watchable now', auto.filter(x => x.e.tier !== 'C'), 'These are out, so keeping one puts it straight on the shelf shown.')}
    ${block('soon', 'Announced', auto.filter(x => x.e.tier === 'C'), 'Not out yet. Kept ones wait below until a later pass moves them to a real list.')}
    ${block('kept', 'Coming soon', kept, 'Kept, waiting for release.', keptRow, false)}`;
}

// ---------------------------------------------------------------- Rent
// Titles not streaming anywhere (tier R), split by whether We Luv Video stocks
// them. Stock comes from the monthly catalogue check (data/wlv.json) when there
// is one, otherwise from the entry's own wlv flag. Whether a copy is on the shelf
// today is left to the store page.
const stocked = (e) => (wlvOf(e.t) ? atWlv(e.t) : e.wlv === 'yes');
function rentRow(x) {
  if (!title(x.e.t)) return '';
  const e = x.e;
  const item = wlvOf(e.t)?.items?.find(i => wlvUrl(i.slug) && i.total !== 0);
  const href = wlvUrl(item?.slug || e.wlvSlug);
  const line = e.rented ? `Rented ${esc(e.rented)}`
    : stocked(e) ? `Stocks it${item && formatsOf(item) ? ` (${esc(formatsOf(item))})` : ''}`
    : 'Not in the catalogue';
  const link = stocked(e) && href ? ` <a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open in the store</a>` : '';
  // The entry's note is hidden here: on Rent it's the bot's stock note, which the line above replaces.
  return footRow({ ...x, e: { ...e, note: undefined } }, line + link,
    button(e.rented ? 'unrent' : 'rent', x, e.rented ? 'Put back' : 'Rented', !!e.rented) + button('drop-rent', x, 'Remove'));
}
export function rent(ui) {
  const all = indexed().filter(x => x.e.tier === 'R');
  if (!all.length) return back('Rent') + empty('Nothing to rent. Anything you want that isn’t streaming anywhere lands here, with a note on whether We Luv Video has a copy.');
  const live = all.filter(x => kindOk(x.e, ui) && !x.e.rented);
  const done = all.filter(x => x.e.rented);
  const block = (key, name, list, text, opts) => list.length
    ? shelf(ui, 'rent:' + key, heading(name, list.length), `${hint(text)}<div class="rows">${list.map(rentRow).join('')}</div>`, opts)
    : '';
  return `${back('Rent')}
    <p class="lede">Not streaming anywhere you subscribe to. Take the list on your next shift.</p>
    ${filters(ui, { kind: true })}
    ${block('wlv', 'At We Luv Video', live.filter(x => stocked(x.e)), 'In their catalogue. Open the store page to see if a copy is in today.')}
    ${block('else', 'Nowhere found yet', live.filter(x => !stocked(x.e)), 'Not in the We Luv Video catalogue either — worth asking, or waiting for next month’s check.')}
    ${block('done', 'Rented', done, '', { open: false, cls: 'group shelf played' })}`;
}

// ---------------------------------------------------------------- Search
// Titles and people whose names contain the query, ignoring case and accents.
export function search(q) {
  const nq = fold(q).trim();
  let titles = '', people = '';
  if (nq.length >= 2) {
    const has = (s) => fold(s).includes(nq);
    titles = S.titles.filter(t => has(t.title) || has(t.original) || has(t.tmdbTitle))
      // names that start with the query first, then titles on more lists
      .sort((a, b) => (fold(b.title).startsWith(nq) - fold(a.title).startsWith(nq)) || (entriesOf(b.id).length - entriesOf(a.id).length))
      .slice(0, 40).map(t => row(t.id, { entry: entriesOf(t.id)[0] })).join('') || '<p class="hint">No titles match.</p>';
    const titlesOf = (id) => IX.person.get(id)?.length || 0;
    people = Object.entries(S.people).filter(([, p]) => has(p.name)).sort((a, b) => titlesOf(b[0]) - titlesOf(a[0])).slice(0, 12)
      .map(([id, p]) => `<a class="person-row" href="#/p/${encodeURIComponent(id)}">${p.img ? `<img src="${IMG}w92${esc(p.img)}" alt="" loading="lazy">` : '<span class="poster ph small"></span>'}<span>${esc(p.name)}</span><span class="count">${titlesOf(id)}</span></a>`).join('');
  }
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Search</h1></header>
    <form class="search" data-form="search" role="search"><label class="sr" for="q">Title or person</label><input id="q" name="q" type="search" value="${esc(q)}" placeholder="Title or person" autocomplete="off" autofocus></form>
    ${people ? `<section class="group"><h2>People</h2><div class="people">${people}</div></section>` : ''}
    ${titles ? `<section class="group"><h2>Titles</h2><div class="rows">${titles}</div></section>` : nq ? '' : '<p class="hint">Type at least two letters.</p>'}`;
}

// ---------------------------------------------------------------- Unsorted
// On the user's Letterboxd watchlist or lists, unwatched, and on no shelf here yet.
export function unsortedIds() {
  const ids = new Set();
  for (const [id, f] of Object.entries(S.lb?.films || {})) if (f.watchlist && !f.watched) ids.add(id);
  for (const l of Object.values(S.lb?.lists || {})) for (const id of l.items) ids.add(id);
  return [...ids].filter(id => !entriesOf(id).length && title(id) && !seen(id).meta);
}
export function unsorted(ui) {
  const ids = new Set(unsortedIds());
  const watchlist = [...ids].filter(id => lbOf(id)?.watchlist).sort((a, b) => (lbOf(b).watchlist || '').localeCompare(lbOf(a).watchlist || ''));
  const lists = Object.entries(S.lb?.lists || {}).map(([name, l]) => [name, l.items.filter(id => ids.has(id))]).filter(([, x]) => x.length);
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Unsorted</h1></header>
    <p class="lede">On your Letterboxd watchlist or lists, unwatched, and not on any shelf here yet. Open one and choose “Add to a list”.</p><div class="filters">${viewToggle()}</div>
    ${shelf(ui, 'unsorted:watchlist', heading('Letterboxd watchlist', watchlist.length), rows(watchlist, { pitch: false }))}
    ${lists.map(([name, items]) => shelf(ui, 'unsorted:' + name, heading(name, items.length), rows(items, { pitch: false }), { open: false })).join('')}`;
}

// ---------------------------------------------------------------- Verdicts
// Everything logged, by who watched it, best reactions first.
const REACTION_ORDER = ['favourite', 'loved', 'liked', 'mixed', 'bounced', 'disliked', 'seen'];
const inline = (text) => md(text).replace(/^<p>|<\/p>$/g, '');   // markdown without the wrapping paragraph
export function watched(ui) {
  const verdictItem = (v) => {
    const t = title(v.t); if (!t) return '';
    return `<li><a href="#/t/${encodeURIComponent(t.id)}">${esc(t.title)}</a> <span class="r r-${esc(v.reaction)}">${esc(REACTION[v.reaction])}</span>${v.note ? `<small>${esc(v.note)}</small>` : ''}</li>`;
  };
  const byViewer = [['both', 'Together'], ['tristan', 'Tristan'], ['meta', 'You']].map(([viewer, name]) => {
    const vs = S.cur.verdicts.filter(v => v.viewer === viewer && v.reaction !== 'seen')
      .sort((a, b) => REACTION_ORDER.indexOf(a.reaction) - REACTION_ORDER.indexOf(b.reaction));
    return vs.length ? shelf(ui, 'watched:' + viewer, heading(name, vs.length), `<ul class="verdict-list">${vs.map(verdictItem).join('')}</ul>`) : '';
  }).join('');
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Verdicts</h1></header>
    ${shelf(ui, 'watched:learned', 'What we’ve learned', `<ul class="calib">${(S.cur.calibration || []).map(c => `<li>${inline(c.text)}</li>`).join('')}</ul>`)}
    ${byViewer}
    ${shelf(ui, 'watched:diary', 'Recent diary', rows((S.lb?.diary || []).slice(0, 25).map(d => d.t), { pitch: false }))}`;
}

// ---------------------------------------------------------------- Check matches
// Titles the TMDB lookup wasn't sure about. Ones already answered (matchOverrides)
// wait for the lookup job and drop off this list.
export function review() {
  const waiting = Object.keys(S.cur.matchOverrides || {}).length;
  const list = needsCheck();
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Check matches</h1></header>${waiting ? `<p class="hint" role="status">${waiting} saved and updating. ${list.length} left to check.</p>` : ''}
    <p class="lede">The TMDB lookup wasn’t sure about these. Open one to pick the right film or show.</p>
    <div class="rows">${list.map(t => row(t.id, { entry: entriesOf(t.id)[0], pitch: false })).join('') || '<p class="hint">Nothing to check.</p>'}</div>`;
}
