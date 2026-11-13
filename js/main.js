// The starting point. Reads the address (#/together, #/t/<id>…), draws that page
// into #view, and handles every tap and form on the page. Pages themselves are
// built in ui.js (lists, title page, forms) and roll.js (the dice); data comes
// from store.js. Buttons say what they do with data-act="…" (see ACTIONS) and
// forms with data-form="…" (see FORMS); nothing on the page uses inline scripts.
import { CONFIG } from '../config.js';
import { getAuth, setAuth, checkAuth, cacheClear } from './gh.js';
import { S, AUDIENCE, onChange, load, saveCuration, title, seen, getNote, saveNote, getVolume, newTitleId, nextVerdictId, today } from './store.js';
import * as UI from './ui.js';
import * as Roll from './roll.js';
import { tumble, rattle } from './dice.js';
import { setServers, forgetServers } from './avail.js';
import { frontMatter } from './md.js';

// Shown in Settings. Bump it, and CACHE in sw.js, with every release.
const BUILD = '2026-11-12.11';
const $ = (s) => document.querySelector(s);
const view = $('#view'), nav = $('#nav'), sheet = $('#sheet'), sheetBody = $('#sheet-body'), toastEl = $('#toast');

// ---------------------------------------------------------------- settings saved by older versions
// Settings used to be kept under "fs." names and the offline copy in a database
// called "film-school". Carry the settings over once and drop the old copy.
try {
  if (['auth', 'ui', 'radarr'].some(k => localStorage.getItem('fs.' + k) !== null)) {
    for (const k of ['auth', 'ui', 'radarr']) {
      const old = localStorage.getItem('fs.' + k);
      if (old !== null && localStorage.getItem('wl.' + k) === null) localStorage.setItem('wl.' + k, old);
      localStorage.removeItem('fs.' + k);
    }
    indexedDB.deleteDatabase('film-school');
  }
} catch {}

// ---------------------------------------------------------------- view options, remembered per device
// Kept in localStorage as "wl.ui". Spoilers opened and the search box are for this visit only.
const PER_VISIT = new Set(['spoilers', 'q', 'rollOptsOpen']);
const ui = Object.assign(
  { layout: 'list', night: 'all', openShelves: {}, kind: 'all', sort: 'curated',
    rollAud: 'together', rollNight: 'any', rollKind: 'all', rollLen: 'any', rollWhere: 'any', rollSound: true },
  (() => { try { return JSON.parse(localStorage.getItem('wl.ui') || '{}'); } catch { return {}; } })(),
  { spoilers: {}, q: '' });
delete ui.theme; delete ui.showSeen;   // options from older versions
const remember = () => {
  try { localStorage.setItem('wl.ui', JSON.stringify(Object.fromEntries(Object.entries(ui).filter(([k]) => !PER_VISIT.has(k))))); } catch {}
};
function applyLayout() {
  document.documentElement.dataset.layout = ui.layout;
  UI.setLayout(ui.layout);
}
applyLayout();

let loginError = null, serverError = null, lastRoute = null, vols = null, pendingRoll = false, rolling = false;
let toastTimer, searchTimer;
const notes = new Map();   // title id -> its film-school note, null if none, undefined while loading

// ---------------------------------------------------------------- scroll position
// Coming back from a film lands where you left the list. Film and person pages
// always open at the top. Kept in sessionStorage, so it lasts until the tab closes.
const LISTS = new Set(['together', 'solo', 'tristan', 'store', 'incoming', 'rent', 'school', 'more', 'watched', 'unsorted', 'review', 'search', 'roll']);
const scrollPos = new Map(Object.entries((() => { try { return JSON.parse(sessionStorage.getItem('wl.scroll') || '{}'); } catch { return {}; } })()));
const keepScroll = () => { try { sessionStorage.setItem('wl.scroll', JSON.stringify(Object.fromEntries(scrollPos))); } catch {} };
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
// Hold the position for a few frames while posters settle, but give way the moment the person scrolls.
function restoreScroll(want) {
  window.scrollTo(0, want);
  if (!want) return;
  let frames = 0, done = false;
  const stop = () => { done = true; };
  const EVENTS = ['wheel', 'touchstart', 'keydown'];
  for (const ev of EVENTS) addEventListener(ev, stop, { once: true, passive: true });
  const step = () => {
    if (done || frames++ > 5) { for (const ev of EVENTS) removeEventListener(ev, stop); return; }
    if (Math.abs(window.scrollY - want) > 2) window.scrollTo(0, want);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function toast(msg, bad) {
  toastEl.textContent = msg; toastEl.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (toastEl.className = 'toast'), bad ? 6000 : 2200);
}

// ---------------------------------------------------------------- pages
// "#/t/amelie-2001?q=x" -> { name: 't', arg: 'amelie-2001', q: 'x' }
function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'together';
  const [path, qs] = h.split('?');
  const [name, ...rest] = path.split('/');
  return { name, arg: rest.length ? decodeURIComponent(rest.join('/')) : null, q: new URLSearchParams(qs || '').get('q') || '' };
}

// Film school: the volume cards need each volume's film list, so they're read once.
async function loadVolumes() {
  const out = [];
  for (let n = 1; n <= 40; n++) {
    const text = await getVolume(n).catch(() => null);
    if (!text) break;
    const { meta } = frontMatter(text);
    const films = (meta.films || []).filter(id => title(id));
    out.push({ n, title: meta.title || '', films, seen: films.filter(id => seen(id).meta).length });
  }
  vols = out; if (route().name === 'school') render();
}
function schoolPage() {
  if (!vols) loadVolumes();
  return UI.school(ui, vols || []);
}
// One volume: shows the loading screen, then swaps in the volume once it's read.
function volumePage(n) {
  getVolume(Number(n)).catch(() => null).then(text => {
    const r = route();
    if (r.name === 'school' && r.arg === n) view.innerHTML = UI.volume(n, text);
  });
  return UI.leader();
}
// A title page draws straight away and fills in its film-school note when it arrives.
function titlePage(id) {
  const t = title(id);
  if (t && !notes.has(t.id)) {
    notes.set(t.id, undefined);
    getNote(t.id).catch(() => null).then(n => { notes.set(t.id, n); if (title(route().arg)?.id === t.id) render(); });
  }
  return UI.titlePage(id, ui, t ? notes.get(t.id) : null);
}

// Each address and the function that draws it. Anything unknown shows Together.
const VIEWS = {
  together: () => UI.together(ui),
  solo: () => UI.solo(ui),
  school: (r) => r.arg ? volumePage(r.arg) : schoolPage(),
  tristan: () => UI.tristan(ui),
  store: () => UI.store(ui),
  t: (r) => titlePage(r.arg),
  p: (r) => UI.personPage(r.arg, ui),
  more: () => UI.more(),
  search: () => UI.search(ui.q),
  add: () => UI.addForm(),
  watched: () => UI.watched(ui),
  unsorted: () => UI.unsorted(ui),
  incoming: () => UI.incoming(ui),
  rent: () => UI.rent(ui),
  review: () => UI.review(),
  settings: () => UI.settings(getAuth(), BUILD, serverError),
  roll: () => Roll.view(ui),
};
// Which button in the bottom bar is lit. Pages reached from More light More;
// film and person pages light nothing.
const TAB = { together: 'together', solo: 'solo', school: 'school', search: 'search' };
const tabOf = (page) => own(TAB, page) || (LISTS.has(page) || page === 'add' || page === 'settings' ? 'more' : null);
// Look a name up in one of the tables above, ignoring what every object inherits
// (so an address like #/constructor shows Together rather than something odd).
function own(table, key) { return Object.hasOwn(table, key) ? table[key] : undefined; }

// GitHub Pages can't send a frame-ancestors header, so refuse to draw inside
// someone else's page (a framed copy could trick taps onto Remove buttons).
const framed = (() => { try { return window.top !== window.self; } catch { return true; } })();

function render() {
  if (framed) { nav.hidden = true; view.textContent = 'The watchlist only opens in its own window.'; return; }
  if (!getAuth()) { nav.hidden = true; view.innerHTML = UI.login(CONFIG, loginError); return; }
  if (!S.loaded) {
    nav.hidden = true;
    // A dropped connection (status 0 or unknown) is not a bad token, so don't offer to replace one.
    view.innerHTML = S.error ? UI.loadFailed(S.error, S.errorStatus === 0 || S.errorStatus === null) : UI.leader();
    return;
  }
  nav.hidden = false;
  const r = route(), key = r.name + '/' + (r.arg || '');
  const html = (own(VIEWS, r.name) || VIEWS.together)(r);
  const y = window.scrollY;
  if (lastRoute) { scrollPos.set(lastRoute, y); keepScroll(); }
  view.innerHTML = html;
  if (key !== lastRoute) {
    restoreScroll(LISTS.has(r.name) ? (scrollPos.get(key) || 0) : 0);
    view.focus({ preventScroll: true });
  } else window.scrollTo(0, y);
  lastRoute = key;
  const tab = tabOf(r.name);
  nav.querySelectorAll('a').forEach(a => a.toggleAttribute('aria-current', a.dataset.tab === tab));
  if (r.name === 'search') { const q = $('#q'); if (q && document.activeElement !== q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  document.title = (r.name === 't' && title(r.arg)?.title ? title(r.arg).title + ' — ' : '') + 'Watchlist';
  if (r.name === 'roll' && pendingRoll) { pendingRoll = false; doRoll(); }
}

// ---------------------------------------------------------------- the dice
async function doRoll() {
  if (rolling) return;
  rolling = true;
  try {
    Roll.roll(Roll.filtersOf(ui));
    if (ui.rollSound !== false) rattle();
    Roll.R.faces = await tumble(document.getElementById('dice'));
  } finally { rolling = false; }
  render();
  const card = document.querySelector('#roll-result .roll-card');
  card?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  card?.querySelector('h2 a')?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- the bottom sheet, and saving
function openSheet(html) {
  sheetBody.innerHTML = html;
  if (!sheet.open) sheet.showModal();
  sheetBody.querySelector('input:not([type=checkbox]):not([type=radio]),select,textarea')?.focus({ preventScroll: true });
}
function closeSheet() { if (sheet.open) sheet.close(); }
// Every change goes through here: mutate edits a copy of curation.json, which
// store.js then writes back to GitHub as one commit with this message.
async function save(mutate, message, done) {
  closeSheet();
  try { await saveCuration(mutate, message); toast(done || 'Saved'); } catch (e) { toast(e.message || 'Couldn’t save', true); }
}
const name = (id) => title(id)?.title || id;
// The n-th entry this title has, the same way the title page numbers them.
const entryRef = (cur, id, i) => cur.entries.filter(e => e.t === id)[i];
const nextOrder = (cur) => Math.max(0, ...cur.entries.map(e => e.order || 0)) + 1;
// The shelf a new entry lands on when none is typed. Together picks get a
// holding shelf that sorts last, so they're easy to spot and move.
const defaultShelf = (tier) => ({ R: 'To rent', C: 'Coming soon', T: 'Tristan’s holiday queue', W: 'In-store play', M: 'Priority queue' }[tier] || 'New picks');
// Removing something by hand should stop the automated passes bringing it back,
// so it's added to curation.json "declined", which they check.
function deny(cur, t, from) {
  if ((cur.declined ||= []).some(d => d.t === t)) return;
  const tm = title(t)?.tmdb;
  cur.declined.push({ t, title: name(t), ...(tm ? { tmdb: tm } : {}), date: today(), ...(from ? { from } : {}) });
}
// Drop empty fields, so curation.json doesn't fill up with "note": "".
const dropEmpty = (o) => { for (const k of Object.keys(o)) if (o[k] === '' || o[k] === null || o[k] === false || o[k] === undefined) delete o[k]; return o; };

// ---------------------------------------------------------------- taps
// One handler per data-act. Each gets the element, the title id it belongs to
// (from data-id or the form around it), and the event.
const setUi = (k, v) => { ui[k] = v; remember(); if (k === 'layout') applyLayout(); render(); };
const ACTIONS = {
  night: (el) => setUi('night', el.dataset.v),
  layout: (el) => setUi('layout', el.dataset.v),
  back: () => { if (history.length > 1) history.back(); else location.hash = '#/together'; },

  // open a form in the bottom sheet
  'add-entry': (el, id) => openSheet(UI.entryForm(id)),
  'edit-entry': (el, id) => openSheet(UI.entryForm(id, Number(el.dataset.i))),
  'add-verdict': (el, id) => openSheet(UI.verdictForm(id)),
  'edit-verdict': (el, id) => openSheet(UI.verdictForm(id, el.dataset.v)),
  'edit-pitch': (el, id) => openSheet(UI.pitchForm(id)),
  'edit-note': (el, id) => openSheet(UI.noteForm(id, notes.get(id)?.text)),
  'fix-match': (el, id) => openSheet(UI.matchForm(id)),
  'remove-title': (el, id) => openSheet(UI.removeTitleForm(id)),
  'close-sheet': () => closeSheet(),

  // buttons inside those forms, and on the title page
  'remove-entry': (el, id) => { const i = Number(el.closest('form').dataset.i); save(cur => { const e = entryRef(cur, id, i); cur.entries = cur.entries.filter(x => x !== e); }, `Remove ${name(id)} from a list`, 'Removed'); },
  'remove-verdict': (el, id) => { const vid = el.closest('form').dataset.v; save(cur => { cur.verdicts = cur.verdicts.filter(v => v.id !== vid); }, `Delete verdict: ${name(id)}`, 'Deleted'); },
  // TMDB match answers. "[enrich]" in the commit message starts the lookup job in the data repo.
  'pick-match': (el, id) => setMatch(id, { type: el.dataset.type, id: Number(el.dataset.tmdb) }, 'Fix TMDB match', 'Saved. Details update in a few minutes.'),
  'retry-match': (el, id) => setMatch(id, 'retry', 'Search TMDB again', 'Searching again. Check back in a few minutes.'),
  'no-match': (el, id) => setMatch(id, 'none', 'Mark as not on TMDB', 'Saved'),

  // Store picks
  play: (el) => played(el.dataset.t, true),
  unplay: (el) => played(el.dataset.t, false),
  'drop-store': (el) => { const t = el.dataset.t; save(cur => { cur.entries = cur.entries.filter(e => !(e.t === t && e.tier === 'W')); }, `Remove from store picks: ${name(t)}`, 'Removed'); },

  // Incoming. data-i is the entry's position in curation.json; data-t guards against it having moved.
  'keep-auto': (el) => atEntry(el, (cur, e) => { delete e.auto; delete e.found; }, `Keep ${name(el.dataset.t)}`, 'Kept'),
  'bin-auto': (el) => atEntry(el, (cur, e) => { cur.entries = cur.entries.filter(x => x !== e); deny(cur, e.t); }, `Bin ${name(el.dataset.t)}`, 'Binned. It won’t come back.'),

  // Rent
  rent: (el) => atEntry(el, (cur, e) => { e.rented = today(); }, `Rented: ${name(el.dataset.t)}`, 'Marked rented'),
  unrent: (el) => atEntry(el, (cur, e) => { delete e.rented; }, `Back on the rent list: ${name(el.dataset.t)}`, 'Back on the list'),
  // Denied too, or the weekly Radarr job would re-add it while Radarr still wants it.
  'drop-rent': (el) => atEntry(el, (cur, e) => { if (e.tier !== 'R') return; cur.entries = cur.entries.filter(x => x !== e); deny(cur, e.t, 'rent'); },
    `Remove from rent list: ${name(el.dataset.t)}`, 'Removed. It won’t come back.'),

  // The dice
  roll: () => doRoll(),
  // The dice in a list's header roll from what that list is showing: its
  // audience, the night tab you're on, and films or series.
  'roll-from': (el) => {
    const together = el.dataset.v === 'together';
    Object.assign(ui, {
      rollAud: together && ui.night === 'test' ? 'test' : el.dataset.v,
      rollNight: together && ['light', 'dense', 'heavy'].includes(ui.night) ? ui.night : 'any',
      rollKind: ui.kind || 'all',
    });
    remember(); Roll.R.current = null; pendingRoll = true; location.hash = '#/roll';
  },
  'roll-skip': (el) => { Roll.R.skip.add(el.dataset.t); doRoll(); },
  'roll-unskip': () => { Roll.R.skip.clear(); render(); },
  // Remembered only when tapped, so the panel folding itself after a roll doesn't count.
  'roll-opts': (el) => { ui.rollOptsOpen = !el.parentElement.open; },

  // Settings
  'servers-clear': () => { forgetServers(); serverError = null; render(); toast('Addresses removed'); },
  reload: async () => { S.error = null; await load(); toast(S.error ? S.error : 'Up to date', !!S.error); },
  signout: async () => { setAuth(null); await cacheClear(); forgetServers(); location.hash = ''; location.reload(); },
};
function setMatch(id, value, what, done) {
  save(cur => { (cur.matchOverrides ||= {})[id] = value; }, `${what}: ${name(id)} [enrich]`, done);
}
function played(t, on) {
  save(cur => { for (const e of cur.entries) if (e.t === t && e.tier === 'W') { if (on) e.played = today(); else delete e.played; } },
    `${on ? 'Played' : 'Back on the list'}: ${name(t)}`, on ? 'Played. Back in six months.' : 'Back on the list');
}
// Change the entry a button points at (data-i), if it's still the same title (data-t).
function atEntry(el, change, message, done) {
  const t = el.dataset.t, i = Number(el.dataset.i);
  save(cur => { const e = cur.entries[i]; if (e && e.t === t) change(cur, e); }, message, done);
}

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const fn = own(ACTIONS, el.dataset.act); if (!fn) return;
  if (el.tagName === 'A') ev.preventDefault();
  await fn(el, el.dataset.id || el.closest('form')?.dataset.id, ev);
});
sheet.addEventListener('click', (ev) => { if (ev.target === sheet) closeSheet(); });   // a tap on the backdrop
// A poster that fails to load falls back to its placeholder styling. (Done here
// rather than with onerror="…", which the content security policy forbids.)
document.addEventListener('error', (ev) => { const img = ev.target; if (img?.tagName === 'IMG' && img.getAttribute('src')) img.removeAttribute('src'); }, true);

// ---------------------------------------------------------------- view options
// Any control with data-ui="key" stores its value as ui[key] and redraws.
document.addEventListener('change', (ev) => {
  const k = ev.target.dataset?.ui; if (!k) return;
  ui[k] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value; remember();
  if (k === 'rollAud') Roll.R.current = null;   // a new audience makes the last pick beside the point
  render();
});
document.addEventListener('input', (ev) => { if (ev.target.id === 'q') { ui.q = ev.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(render, 120); } });
document.addEventListener('toggle', (ev) => {
  const d = ev.target;
  if (d.matches?.('details.shelf[data-shelf]')) { ui.openShelves[d.dataset.shelf] = d.open; remember(); }
  if (d.matches?.('details.spoiler') && d.open) ui.spoilers[route().arg] = true;
}, true);

// ---------------------------------------------------------------- forms
// One handler per data-form. Each gets the form, its fields as an object, and
// the title id the form is about (data-id), if any.
const FORMS = {
  async login(f, d) {
    const auth = { repo: d.repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''), token: d.token.trim(), branch: CONFIG.branch };
    const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Connecting…';
    try {
      const info = await checkAuth(auth); auth.branch = info.branch || CONFIG.branch;
      setAuth(auth); loginError = null; render(); await load();
      if (!info.private) toast('Heads up: that repo is public. Make it private to keep your lists to yourself.', true);
    } catch (e) { loginError = e.message; render(); }
  },
  search(f, d) { ui.q = d.q; render(); },
  // Radarr and Sonarr addresses: both are saved, or neither if one is wrong.
  servers(f, d) {
    try { const saved = setServers(d); serverError = null; toast(saved.radarr || saved.sonarr ? 'Addresses saved' : 'Addresses removed'); }
    catch (e) { serverError = e.message; }
    render();
  },
  // Add to a list, or edit a placement (data-i is which of the title's entries).
  entry(f, d, id) {
    const i = f.dataset.i === '' ? null : Number(f.dataset.i);
    const vals = dropEmpty({ tier: d.tier, energy: d.energy, section: d.section.trim() || defaultShelf(d.tier), status: d.status, note: d.note.trim(), star: !!d.star });
    save(cur => {
      if (i === null) { cur.entries.push({ t: id, ...vals, order: nextOrder(cur) }); return; }
      const e = entryRef(cur, id, i); if (!e) return;
      for (const k of ['energy', 'note', 'star']) delete e[k];   // cleared fields stay cleared
      Object.assign(e, vals);
    }, `${i === null ? 'Add' : 'Move'} ${name(id)}: ${UI.TIER[d.tier]}${d.energy ? ', ' + d.energy : ''}`);
  },
  // A verdict. "Mark it done" closes the list entries that viewer's verdict
  // answers (a "both" verdict closes Together, "tristan" his queue, "meta" Solo).
  verdict(f, d, id) {
    const vid = f.dataset.v;
    const vals = { viewer: d.viewer, reaction: d.reaction, note: d.note.trim() || undefined, date: d.date || null };
    save(cur => {
      if (vid) { const v = cur.verdicts.find(x => x.id === vid); if (v) { delete v.note; Object.assign(v, dropEmpty({ ...vals }), { date: vals.date }); } }
      else cur.verdicts.push({ id: nextVerdictId(), t: id, ...dropEmpty({ ...vals }), date: vals.date });
      if (d.markDone) for (const e of cur.entries) {
        if (e.t !== id || (e.status && e.status !== 'queued') || AUDIENCE[e.tier] !== d.viewer) continue;
        e.status = ['bounced', 'disliked'].includes(d.reaction) ? 'dropped' : 'done';
      }
    }, `Verdict: ${name(id)} — ${UI.VIEWER[d.viewer]}, ${UI.REACTION[d.reaction].toLowerCase()}`, 'Verdict saved');
  },
  pitch(f, d, id) {
    save(cur => { const p = d.pitch.trim(); if (p) cur.pitches[id] = p; else delete cur.pitches[id]; }, `Pitch: ${name(id)}`);
  },
  // Notes are their own file (notes/<id>.md), not part of curation.json.
  async note(f, d, id) {
    closeSheet();
    try { await saveNote(id, d.text.replace(/\r\n/g, '\n').trimEnd() + '\n', name(id)); notes.set(id, await getNote(id)); render(); toast('Notes saved'); }
    catch (e) { toast(e.message === 'conflict' ? 'These notes changed elsewhere. Reload and try again.' : e.message, true); }
  },
  async 'remove-title'(f, d, id) {
    const gone = name(id);
    await save(cur => {
      cur.entries = cur.entries.filter(e => e.t !== id);
      deny(cur, id, 'removed');
      delete cur.pitches[id];
      if (d.verdicts) cur.verdicts = cur.verdicts.filter(v => v.t !== id);
    }, `Remove ${gone} from the lists`, `${gone} removed`);
    history.back();
  },
  match(f, d, id) {
    const m = d.url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
    if (!m) return toast('That doesn’t look like a TMDB film or show link.', true);
    setMatch(id, { type: m[1], id: Number(m[2]) }, 'Fix TMDB match', 'Saved. Details update in a few minutes.');
  },
  // A new title goes in curation.json "added"; the lookup job gives it a poster and credits.
  async add(f, d) {
    const typed = d.title.trim(), year = /^\d{4}$/.test(d.year) ? Number(d.year) : null, nid = newTitleId(typed, year);
    await save(cur => {
      if ((cur.added ||= []).some(a => a.id === nid)) return;
      cur.added.push(dropEmpty({ id: nid, title: typed, year, kind: d.kind }));
      cur.entries.push(dropEmpty({ t: nid, tier: d.tier, energy: d.energy, section: d.section.trim() || defaultShelf(d.tier), status: 'queued', order: nextOrder(cur) }));
      if (d.pitch.trim()) cur.pitches[nid] = d.pitch.trim();
    }, `Add ${typed} [enrich]`, 'Added');
    location.hash = '#/t/' + encodeURIComponent(nid);
  },
};
document.addEventListener('submit', async (ev) => {
  const f = ev.target.closest('form[data-form]'); if (!f) return;
  ev.preventDefault();
  const handler = own(FORMS, f.dataset.form);
  if (handler) await handler(f, Object.fromEntries(new FormData(f)), f.dataset.id);
});

// ---------------------------------------------------------------- start
onChange(render);
window.addEventListener('hashchange', () => { closeSheet(); render(); });
// Coming back to the app checks GitHub for changes made elsewhere.
document.addEventListener('visibilitychange', () => { if (!document.hidden && getAuth() && S.loaded && !S.saving) load(); });
// While a match fix or a new title waits for the TMDB lookup, check for the result every 25 seconds.
setInterval(() => {
  const waiting = Object.keys(S.cur?.matchOverrides || {}).length || (S.cur?.added || []).length;
  if (getAuth() && S.loaded && !S.saving && !S.syncing && !document.hidden && waiting) load();
}, 25000);
render();
if (!framed && getAuth()) load();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
