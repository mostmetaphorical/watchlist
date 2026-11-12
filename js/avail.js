// Where a title can be had: Radarr for films, Sonarr for series, and We Luv
// Video. The status comes from data/radarr.json, data/sonarr.json and
// data/wlv.json, written by GitHub Actions in the data repo; the app only reads
// them and builds links. It never contacts Radarr, Sonarr or the shop.
import { S, tmdbRef } from './store.js';
import { esc } from './md.js';

export const WLV_STORE = 'https://store.weluvvideo.org';
// A store page path as the catalogue check records it ("/the-thing-1982").
// Anything else is ignored rather than turned into a link.
const WLV_SLUG = /^\/[a-z0-9][a-z0-9-]*$/;

// data/radarr.json: { titles: { <title id>: { slug, file, monitored } } }
// data/sonarr.json: { titles: { <title id>: { slug, monitored, episodes, files } } }
//                   (episodes Sonarr expects, and how many of them are on disk)
// data/wlv.json:    { titles: { <title id>: { checked, items: [{ slug, name, total, formats }] } } }
//                   (total is the shop's own copy count; 0 means it lists the title but has no copies)
// A title with no line in radarr.json or sonarr.json isn't in Radarr or Sonarr.
export const radarrOf = (id) => S.radarr?.titles?.[id] || null;
export const sonarrOf = (id) => S.sonarr?.titles?.[id] || null;
export const wlvOf = (id) => S.wlv?.titles?.[id] || null;
// On disk: a film with its file, or a series with at least one episode.
export const onDisk = (id) => !!radarrOf(id)?.file || (sonarrOf(id)?.files || 0) > 0;
export const atWlv = (id) => (wlvOf(id)?.items || []).some(i => wlvUrl(i.slug) && i.total !== 0);
export const wlvUrl = (slug) => (WLV_SLUG.test(String(slug || '')) ? WLV_STORE + slug : null);

// Films go to Radarr and series to Sonarr; stand-up specials to neither.
export const isSeries = (t) => !!t && (t.kind === 'series' || tmdbRef(t)?.type === 'tv');
export const isFilm = (t) => !!t && !isSeries(t) && t.kind !== 'standup';
const serverFor = (t) => (isFilm(t) ? 'radarr' : isSeries(t) ? 'sonarr' : null);

// ---------------------------------------------------------------- Radarr and Sonarr addresses (this device only)
// Typed in Settings and kept in localStorage, so the address of the user's own
// server never goes into the data repo. A Sonarr address left empty is worked
// out from Radarr's: …/radarr becomes …/sonarr, radarr.example.com becomes
// sonarr.example.com.
export const SERVER = { radarr: { name: 'Radarr', key: 'wl.radarr', page: 'movie' }, sonarr: { name: 'Sonarr', key: 'wl.sonarr', page: 'series' } };
const stored = (app) => { try { return localStorage.getItem(SERVER[app].key) || ''; } catch { return ''; } };
export function sonarrFromRadarr(radarr) {
  let u; try { u = new URL(radarr); } catch { return ''; }
  if (/(^|\/)radarr$/i.test(u.pathname)) u.pathname = u.pathname.replace(/radarr$/i, 'sonarr');
  else if (/^radarr\./i.test(u.hostname)) u.hostname = u.hostname.replace(/^radarr\./i, 'sonarr.');
  else return '';
  return (u.origin + u.pathname).replace(/\/+$/, '');
}
// The address in use: the one saved, or for Sonarr the one worked out from Radarr's.
export const serverBase = (app) => stored(app) || (app === 'sonarr' ? sonarrFromRadarr(stored('radarr')) : '');
export const savedBase = stored;

// A typed address, tidied: "" for none. Throws a readable message for anything
// that isn't a plain http(s) address.
function cleanAddress(app, input) {
  const raw = String(input || '').trim(), name = SERVER[app].name;
  if (!raw) return '';
  let u;
  try { u = new URL(raw); } catch { throw new Error(`The ${name} address isn’t a web address. Paste the one you open ${name} with.`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`The ${name} address has to start with https://.`);
  if (u.username || u.password) throw new Error(`Leave the login out of the ${name} address; your browser will ask for it.`);
  return (u.origin + u.pathname).replace(/\/+$/, '');
}
// Saves both addresses, or neither if either is wrong. Returns what was saved.
export function setServers(input) {
  const clean = Object.fromEntries(Object.keys(SERVER).map(app => [app, cleanAddress(app, input[app])]));
  for (const [app, base] of Object.entries(clean)) {
    try { base ? localStorage.setItem(SERVER[app].key, base) : localStorage.removeItem(SERVER[app].key); } catch {}
  }
  return clean;
}
export function forgetServers() {
  for (const { key } of Object.values(SERVER)) try { localStorage.removeItem(key); } catch {}
}

// The title's page in Radarr or Sonarr.
export function serverPage(app, slug) {
  const base = serverBase(app);
  return base && slug ? `${base}/${SERVER[app].page}/${encodeURIComponent(slug)}` : null;
}
// The "Add new" page, already searching for the title. Radarr finds the exact
// film from "tmdb:<id>"; Sonarr gets the title, which every version searches.
export function serverSearch(app, t) {
  const base = serverBase(app); if (!base) return null;
  const tm = tmdbRef(t);
  const term = app === 'radarr' && tm?.type === 'movie' ? `tmdb:${tm.id}` : t.title;
  return `${base}/add/new?term=${encodeURIComponent(term)}`;
}

// ---------------------------------------------------------------- pieces of HTML
const link = (href, label) => href ? ` <a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';
const fmtDate = (d) => { const t = Date.parse(d); return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
// Which formats the shop carries ("DVD, VHS"). Whether a copy is on the shelf
// today is deliberately not shown: the store page answers that live.
export const formatsOf = (i) => [...new Set((i.formats || []).map(f => (typeof f === 'string' ? f : f.format)).filter(Boolean))].join(', ');

// What Radarr or Sonarr has, in words.
function serverState(app, r) {
  if (app === 'radarr') return r.file ? 'On disk' : r.monitored ? 'Wanted, no file yet' : 'In Radarr, not monitored, no file';
  const n = r.episodes || 0, f = r.files || 0;
  if (f && f >= n) return `On disk, all ${f} episode${f === 1 ? '' : 's'}`;
  if (f) return `${f} of ${n} episodes on disk`;
  return r.monitored ? 'Wanted, nothing on disk yet' : 'In Sonarr, not monitored, nothing on disk';
}
const diskNote = (id) => {
  if (radarrOf(id)?.file) return 'Radarr has a file';
  const s = sonarrOf(id);
  return s?.files ? `Sonarr has ${s.files} of ${s.episodes} episodes` : '';
};

// Small chips for list rows. Cheap: a few map lookups.
export function availMarks(id) {
  return (onDisk(id) ? `<span class="mark avail" title="${esc(diskNote(id))}">On disk</span>` : '') +
    (atWlv(id) ? '<span class="mark avail" title="In the We Luv Video catalogue">At WLV</span>' : '');
}

// The Radarr or Sonarr line. With the weekly status: what's there and a link to
// its page, or "Not in Radarr" and a link that searches for it. Before the first
// sync has run, just the search link.
function serverLine(t) {
  const app = serverFor(t); if (!app) return '';
  const { name } = SERVER[app], data = app === 'radarr' ? S.radarr : S.sonarr;
  const r = app === 'radarr' ? radarrOf(t.id) : sonarrOf(t.id);
  let body;
  if (r) body = `<strong>${esc(serverState(app, r))}</strong>${link(serverPage(app, r.slug), `Open in ${name}`)}`;
  else if (data) body = `<strong>Not in ${name}</strong>${link(serverSearch(app, t), `Search in ${name}`)}`;
  else if (serverBase(app)) body = link(serverSearch(app, t), `Search in ${name}`).trim();
  else return '';
  return `<li><span class="src">${name}</span><span>${body}</span></li>`;
}

function wlvLine(t) {
  const w = wlvOf(t.id); if (!w) return '';
  const items = (w.items || []).filter(i => wlvUrl(i.slug));
  const formats = (i) => formatsOf(i) ? ` <small>(${esc(formatsOf(i))})</small>` : '';
  let body;
  if (items.length > 1) body = `<strong>Stocks it</strong>${items.map(i => `<br>${esc(i.name)}${formats(i)}${link(wlvUrl(i.slug), 'Open')}`).join('')}`;
  else if (items.length) body = `<strong>Stocks it</strong>${formats(items[0])}${link(wlvUrl(items[0].slug), 'Open in the store')}`;
  else body = `Not in the catalogue${w.checked ? ` <small>(checked ${esc(fmtDate(w.checked))})</small>` : ''}`;
  return `<li><span class="src">We Luv Video</span><span>${body}</span></li>`;
}

// The "Where to get it" block on a title page. Empty when there is nothing to say.
export function availBlock(t) {
  const lines = serverLine(t) + wlvLine(t);
  if (!lines) return '';
  const app = serverFor(t);
  const hint = app && (app === 'radarr' ? S.radarr : S.sonarr) && !serverBase(app)
    ? `<p class="hint">Add your ${SERVER[app].name} address in Settings to get links to it.</p>` : '';
  return `<section class="block avail"><h2>Where to get it</h2><ul class="avail-list">${lines}</ul>${hint}</section>`;
}
