import { CONFIG } from '../config.js';
import { getAuth, setAuth, checkAuth, cacheClear } from './gh.js';
import { S, onChange, load, saveCuration, title, entriesOf, verdictsOf, seen, getNote, saveNote, getVolume, newTitleId, nextVerdictId, today } from './store.js';
import * as UI from './ui.js';
import { frontMatter } from './md.js';

const BUILD = '2026-11-11.13';
const $ = (s) => document.querySelector(s);
const view = $('#view'), nav = $('#nav'), sheet = $('#sheet'), sheetBody = $('#sheet-body'), toastEl = $('#toast');

// ---------------------------------------------------------------- remembered view options (per device)
const ui = Object.assign({ theme: 'luv', layout: 'list', night: 'all', openShelves: {}, kind: 'all', sort: 'curated', showSeen: false, openSolo: [], spoilers: {}, q: '' },
  (() => { try { return JSON.parse(localStorage.getItem('fs.ui') || '{}'); } catch { return {}; } })());
ui.spoilers = {}; ui.q = '';
const remember = () => { try { localStorage.setItem('fs.ui', JSON.stringify({ theme: ui.theme, layout: ui.layout, night: ui.night, openShelves: ui.openShelves, kind: ui.kind, sort: ui.sort, showSeen: ui.showSeen, openSolo: ui.openSolo })); } catch {} };

function applyLook() {
  const r = document.documentElement;
  if (!UI.THEMES.some(([v]) => v === ui.theme)) ui.theme = 'luv';
  r.dataset.theme = ui.theme;
  r.dataset.layout = ui.layout; UI.setLayout(ui.layout);
}
applyLook();
let loginError = null, lastRoute = null, vols = null;

// Remember how far down each list was scrolled, so coming back from a film lands where you left off.
// Film and person pages always open at the top.
const LISTS = new Set(['together', 'solo', 'tristan', 'store', 'school', 'more', 'watched', 'unsorted', 'review', 'search']);
const scrollPos = new Map(Object.entries((() => { try { return JSON.parse(sessionStorage.getItem('fs.scroll') || '{}'); } catch { return {}; } })()));
const keepScroll = () => { try { sessionStorage.setItem('fs.scroll', JSON.stringify(Object.fromEntries(scrollPos))); } catch {} };
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
// Hold the position for a few frames while posters settle, but give way the moment the person scrolls.
function restoreScroll(want) {
  window.scrollTo(0, want);
  if (!want) return;
  let frames = 0, done = false;
  const stop = () => { done = true; };
  for (const ev of ['wheel', 'touchstart', 'keydown']) addEventListener(ev, stop, { once: true, passive: true });
  const step = () => {
    if (done || frames++ > 5) { for (const ev of ['wheel', 'touchstart', 'keydown']) removeEventListener(ev, stop); return; }
    if (Math.abs(window.scrollY - want) > 2) window.scrollTo(0, want);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const notes = new Map(); // id -> note | null (undefined = loading)

function toast(msg, bad) {
  toastEl.textContent = msg; toastEl.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (toastEl.className = 'toast'), bad ? 6000 : 2200);
}
function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'together';
  const [path, qs] = h.split('?');
  const [name, ...rest] = path.split('/');
  return { name, arg: rest.length ? decodeURIComponent(rest.join('/')) : null, q: new URLSearchParams(qs || '').get('q') || '' };
}

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

function render() {
  const auth = getAuth();
  if (!auth) { nav.hidden = true; view.innerHTML = UI.login(CONFIG, loginError); return; }
  if (!S.loaded) {
    nav.hidden = true;
    view.innerHTML = S.error ? `<main class="login"><h1>Film School</h1><p class="error" role="alert">${S.error}</p><div class="actions left"><button class="btn" data-act="reload">Try again</button><button class="btn ghost" data-act="signout">Use a different token</button></div></main>` : UI.leader();
    return;
  }
  nav.hidden = false;
  const r = route(), key = r.name + '/' + (r.arg || '');
  let html;
  switch (r.name) {
    case 'together': html = UI.together(ui); break;
    case 'solo': html = UI.solo(ui); break;
    case 'tristan': html = UI.tristan(ui); break;
    case 'store': html = UI.store(ui); break;
    case 'school':
      if (r.arg) { html = UI.volume(r.arg, undefined); getVolume(Number(r.arg)).then(t => { if (route().arg === r.arg && route().name === 'school') view.innerHTML = UI.volume(r.arg, t); }); html = UI.leader(); }
      else { if (!vols) loadVolumes(); html = UI.school(ui, vols || []); }
      break;
    case 't': {
      const t = title(r.arg);
      if (t && !notes.has(t.id)) getNote(t.id).then(n => { notes.set(t.id, n); if (route().arg === r.arg) render(); }).catch(() => { notes.set(t.id, null); render(); });
      html = UI.titlePage(r.arg, ui, t ? notes.get(t.id) : null); break;
    }
    case 'p': html = UI.personPage(r.arg, ui); break;
    case 'more': html = UI.more(); break;
    case 'search': html = UI.search(ui.q); break;
    case 'add': html = UI.addForm(); break;
    case 'watched': html = UI.watched(ui); break;
    case 'unsorted': html = UI.unsorted(ui); break;
    case 'review': html = UI.review(); break;
    case 'settings': html = UI.settings(auth, BUILD); break;
    default: html = UI.together(ui);
  }
  const y = window.scrollY;
  if (lastRoute) { scrollPos.set(lastRoute, y); keepScroll(); }
  view.innerHTML = html;
  if (key !== lastRoute) {
    restoreScroll(LISTS.has(r.name) ? (scrollPos.get(key) || 0) : 0);
    view.focus({ preventScroll: true });
  } else window.scrollTo(0, y);
  lastRoute = key;
  const tab = ['solo', 'school'].includes(r.name) ? r.name : r.name === 'together' ? 'together' : ['tristan', 'store', 'search', 'add', 'watched', 'unsorted', 'review', 'settings'].includes(r.name) ? 'more' : null;
  nav.querySelectorAll('a').forEach(a => a.toggleAttribute('aria-current', a.dataset.tab === tab));
  if (r.name === 'search') { const q = $('#q'); if (q && document.activeElement !== q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  document.title = (r.name === 't' && title(r.arg)?.title ? title(r.arg).title + ' — ' : '') + 'Film School';
}

function openSheet(html) { sheetBody.innerHTML = html; if (!sheet.open) sheet.showModal(); sheetBody.querySelector('input:not([type=checkbox]):not([type=radio]),select,textarea')?.focus({ preventScroll: true }); }
function closeSheet() { if (sheet.open) sheet.close(); }
async function save(mutate, message, done) {
  closeSheet();
  try { await saveCuration(mutate, message); toast(done || 'Saved'); } catch (e) { toast(e.message || 'Couldn’t save', true); }
}
const name = (id) => title(id)?.title || id;
const SECTION_FOR = (d) => d.tier === 'B?' ? 'Test together' : d.tier === 'T' ? 'Tristan’s holiday queue' : d.tier === 'W' ? 'In-store play'
  : d.tier === 'M' ? 'Priority queue' : ({ light: 'Light nights', dense: 'Dense nights', heavy: 'Heavy tokens' }[d.energy] || 'Dense nights');
const entryRef = (cur, id, i) => cur.entries.filter(e => e.t === id)[i];

// ---------------------------------------------------------------- clicks
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id || el.closest('form')?.dataset.id;
  if (a === 'night') { ui.night = el.dataset.v; remember(); render(); }
  else if (a === 'layout') { ui.layout = el.dataset.v; remember(); applyLook(); render(); }
  else if (a === 'theme') { ui.theme = el.dataset.v; remember(); applyLook(); render(); }
  else if (a === 'add-entry') openSheet(UI.entryForm(id));
  else if (a === 'edit-entry') openSheet(UI.entryForm(id, Number(el.dataset.i)));
  else if (a === 'add-verdict') openSheet(UI.verdictForm(id));
  else if (a === 'edit-verdict') openSheet(UI.verdictForm(id, el.dataset.v));
  else if (a === 'edit-pitch') openSheet(UI.pitchForm(id));
  else if (a === 'edit-note') openSheet(UI.noteForm(id, notes.get(id)?.text));
  else if (a === 'fix-match') openSheet(UI.matchForm(id));
  else if (a === 'remove-title') openSheet(UI.removeTitleForm(id));
  else if (a === 'close-sheet') closeSheet();
  else if (a === 'remove-entry') { const i = Number(el.closest('form').dataset.i); save(cur => { const e = entryRef(cur, id, i); cur.entries = cur.entries.filter(x => x !== e); }, `Remove ${name(id)} from a list`, 'Removed'); }
  else if (a === 'remove-verdict') { const vid = el.closest('form').dataset.v; save(cur => { cur.verdicts = cur.verdicts.filter(v => v.id !== vid); }, `Delete verdict: ${name(id)}`, 'Deleted'); }
  else if (a === 'pick-match') save(cur => { (cur.matchOverrides ||= {})[id] = { type: el.dataset.type, id: Number(el.dataset.tmdb) }; }, `Fix TMDB match: ${name(id)} [enrich]`, 'Saved. Details update in a few minutes.');
  else if (a === 'play' || a === 'unplay') {
    const t = el.dataset.t, on = a === 'play';
    save(cur => { for (const e of cur.entries) if (e.t === t && e.tier === 'W') { if (on) e.played = today(); else delete e.played; } },
      `${on ? 'Played' : 'Back on the list'}: ${name(t)}`, on ? 'Played. Back in six months.' : 'Back on the list');
  }
  else if (a === 'drop-store') {
    const t = el.dataset.t;
    save(cur => { cur.entries = cur.entries.filter(e => !(e.t === t && e.tier === 'W')); }, `Remove from store picks: ${name(t)}`, 'Removed');
  }
  else if (a === 'retry-match') save(cur => { (cur.matchOverrides ||= {})[id] = 'retry'; }, `Search TMDB again: ${name(id)} [enrich]`, 'Searching again. Check back in a few minutes.');
  else if (a === 'no-match') save(cur => { (cur.matchOverrides ||= {})[id] = 'none'; }, `Mark as not on TMDB: ${name(id)} [enrich]`, 'Saved');
  else if (a === 'reload') { S.error = null; await load(); toast(S.error ? S.error : 'Up to date', !!S.error); }
  else if (a === 'signout') { setAuth(null); await cacheClear(); location.hash = ''; location.reload(); }
});
sheet.addEventListener('click', (ev) => { if (ev.target === sheet) closeSheet(); });

// ---------------------------------------------------------------- view options
document.addEventListener('change', (ev) => {
  const k = ev.target.dataset?.ui; if (!k) return;
  ui[k] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value; remember(); render();
});
document.addEventListener('input', (ev) => { if (ev.target.id === 'q') { ui.q = ev.target.value; clearTimeout(render.t); render.t = setTimeout(render, 120); } });
document.addEventListener('toggle', (ev) => {
  const d = ev.target;
  if (d.matches?.('details.shelf[data-shelf]')) { ui.openShelves[d.dataset.shelf] = d.open; remember(); }
  if (d.matches?.('details.spoiler') && d.open) ui.spoilers[route().arg] = true;
}, true);

// ---------------------------------------------------------------- forms
document.addEventListener('submit', async (ev) => {
  const f = ev.target.closest('form[data-form]'); if (!f) return;
  ev.preventDefault();
  const d = Object.fromEntries(new FormData(f)), id = f.dataset.id, kind = f.dataset.form;
  const clean = (o) => { for (const k of Object.keys(o)) if (o[k] === '' || o[k] === null || o[k] === false || o[k] === undefined) delete o[k]; return o; };
  if (kind === 'login') {
    const auth = { repo: d.repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''), token: d.token.trim(), branch: CONFIG.branch };
    const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Connecting…';
    try {
      const info = await checkAuth(auth); auth.branch = info.branch || CONFIG.branch;
      setAuth(auth); loginError = null; render(); await load();
      if (!info.private) toast('Heads up: that repo is public. Make it private to keep your lists to yourself.', true);
    } catch (e) { loginError = e.message; render(); }
  }
  else if (kind === 'search') { ui.q = d.q; render(); }
  else if (kind === 'entry') {
    const i = f.dataset.i === '' ? null : Number(f.dataset.i);
    const fallback = SECTION_FOR(d);
    const vals = clean({ tier: d.tier, energy: d.energy, section: d.section.trim() || fallback, status: d.status, note: d.note.trim(), star: !!d.star });
    save(cur => {
      if (i === null) cur.entries.push({ t: id, ...vals, order: Math.max(0, ...cur.entries.map(e => e.order || 0)) + 1 });
      else { const e = entryRef(cur, id, i); if (!e) return; for (const k of ['energy', 'note', 'star']) delete e[k]; Object.assign(e, vals); }
    }, `${i === null ? 'Add' : 'Move'} ${name(id)}: ${UI.TIER[d.tier]}${d.energy ? ', ' + d.energy : ''}`);
  }
  else if (kind === 'verdict') {
    const vid = f.dataset.v;
    const vals = { viewer: d.viewer, reaction: d.reaction, note: d.note.trim() || undefined, date: d.date || null };
    save(cur => {
      if (vid) { const v = cur.verdicts.find(x => x.id === vid); if (v) { delete v.note; Object.assign(v, clean({ ...vals }), { date: vals.date }); } }
      else cur.verdicts.push({ id: nextVerdictId(), t: id, ...clean({ ...vals }), date: vals.date });
      if (d.markDone) for (const e of cur.entries) {
        if (e.t !== id || (e.status && e.status !== 'queued')) continue;
        const mine = (d.viewer === 'both' && (e.tier === 'B' || e.tier === 'B?')) || (d.viewer === 'tristan' && e.tier === 'T') || (d.viewer === 'meta' && e.tier === 'M');
        if (mine) e.status = ['bounced', 'disliked'].includes(d.reaction) ? 'dropped' : 'done';
      }
    }, `Verdict: ${name(id)} — ${UI.VIEWER[d.viewer]}, ${UI.REACTION[d.reaction].toLowerCase()}`, 'Verdict saved');
  }
  else if (kind === 'pitch') save(cur => { const p = d.pitch.trim(); if (p) cur.pitches[id] = p; else delete cur.pitches[id]; }, `Pitch: ${name(id)}`);
  else if (kind === 'note') {
    closeSheet();
    try { await saveNote(id, d.text.replace(/\r\n/g, '\n').trimEnd() + '\n', name(id)); notes.set(id, await getNote(id)); render(); toast('Notes saved'); }
    catch (e) { toast(e.message === 'conflict' ? 'These notes changed elsewhere. Reload and try again.' : e.message, true); }
  }
  else if (kind === 'remove-title') {
    const gone = name(id);
    await save(cur => {
      cur.entries = cur.entries.filter(e => e.t !== id);
      delete cur.pitches[id];
      if (d.verdicts) cur.verdicts = cur.verdicts.filter(v => v.t !== id);
    }, `Remove ${gone} from the lists`, `${gone} removed`);
    history.back();
  }
  else if (kind === 'match') {
    const m = d.url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
    if (!m) return toast('That doesn’t look like a TMDB film or show link.', true);
    save(cur => { (cur.matchOverrides ||= {})[id] = { type: m[1], id: Number(m[2]) }; }, `Fix TMDB match: ${name(id)} [enrich]`, 'Saved. Details update in a few minutes.');
  }
  else if (kind === 'add') {
    const year = /^\d{4}$/.test(d.year) ? Number(d.year) : null, nid = newTitleId(d.title.trim(), year);
    const fallback = SECTION_FOR(d);
    await save(cur => {
      if ((cur.added ||= []).some(a => a.id === nid)) return;
      cur.added.push(clean({ id: nid, title: d.title.trim(), year, kind: d.kind }));
      cur.entries.push(clean({ t: nid, tier: d.tier, energy: d.energy, section: d.section.trim() || fallback, status: 'queued', order: Math.max(0, ...cur.entries.map(e => e.order || 0)) + 1 }));
      if (d.pitch.trim()) cur.pitches[nid] = d.pitch.trim();
    }, `Add ${d.title.trim()} [enrich]`, 'Added');
    location.hash = '#/t/' + encodeURIComponent(nid);
  }
});

// ---------------------------------------------------------------- start
onChange(render);
window.addEventListener('hashchange', () => { closeSheet(); render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && getAuth() && S.loaded && !S.saving) load(); });
// while a match fix or a new title is waiting for the TMDB lookup, check for the result every 25 seconds
setInterval(() => { if (getAuth() && S.loaded && !S.saving && !S.syncing && !document.hidden && (Object.keys(S.cur.matchOverrides || {}).length || (S.cur.added || []).length)) load(); }, 25000);
render();
if (getAuth()) load();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
