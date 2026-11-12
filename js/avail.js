// Where a title can be had: Radarr (from data/radarr.json) and We Luv Video
// (from data/wlv.json). Both files are written by GitHub Actions in the data repo;
// the app only reads them and builds links. It never contacts Radarr or the shop.
import { S, tmdbRef } from './store.js';
import { esc } from './md.js';

export const WLV_STORE = 'https://store.weluvvideo.org';
// A store page path as the catalogue check records it ("/the-thing-1982").
// Anything else is ignored rather than turned into a link.
const WLV_SLUG = /^\/[a-z0-9][a-z0-9-]*$/;

// data/radarr.json: { titles: { <title id>: { slug, file, monitored } } }
// data/wlv.json:    { titles: { <title id>: { checked, items: [{ slug, name, total, formats }] } } }
// (total is the shop's own copy count; 0 means it lists the film but has no copies.)
export const radarrOf = (id) => S.radarr?.titles?.[id] || null;
export const wlvOf = (id) => S.wlv?.titles?.[id] || null;
export const onDisk = (id) => !!radarrOf(id)?.file;
export const atWlv = (id) => (wlvOf(id)?.items || []).some(i => wlvUrl(i.slug) && i.total !== 0);
export const wlvUrl = (slug) => (WLV_SLUG.test(String(slug || '')) ? WLV_STORE + slug : null);

// ---------------------------------------------------------------- Radarr address (this device only)
const KEY = 'fs.radarr';
export function radarrBase() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}
// Throws a readable message for anything that isn't a plain http(s) address.
export function setRadarrBase(input) {
  const raw = String(input || '').trim();
  if (!raw) { try { localStorage.removeItem(KEY); } catch {} return ''; }
  let u;
  try { u = new URL(raw); } catch { throw new Error('That isn’t a web address. Paste the one you open Radarr with.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('The address has to start with https://.');
  if (u.username || u.password) throw new Error('Leave the login out of the address; your browser will ask for it.');
  const base = (u.origin + u.pathname).replace(/\/+$/, '');
  try { localStorage.setItem(KEY, base); } catch {}
  return base;
}
export const radarrUrl = (slug) => {
  const base = radarrBase();
  return base && slug ? `${base}/movie/${encodeURIComponent(slug)}` : null;
};

// ---------------------------------------------------------------- pieces of HTML
const link = (href, label) => href ? ` <a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';
const fmtDate = (d) => { const t = Date.parse(d); return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
// Which formats the shop carries ("DVD, VHS"). Whether a copy is on the shelf
// today is deliberately not shown: the store page answers that live.
export const formatsOf = (i) => [...new Set((i.formats || []).map(f => (typeof f === 'string' ? f : f.format)).filter(Boolean))].join(', ');

// Radarr only handles films, so series and stand-up get no Radarr line.
export const isFilm = (t) => t && t.kind !== 'series' && t.kind !== 'standup' && tmdbRef(t)?.type !== 'tv';

// Small chips for list rows. Cheap: two map lookups.
export function availMarks(id) {
  return (onDisk(id) ? '<span class="mark avail" title="Radarr has a file">On disk</span>' : '') +
    (atWlv(id) ? '<span class="mark avail" title="In the We Luv Video catalogue">At WLV</span>' : '');
}

// The "Where to get it" block on a title page. Empty when there is nothing to say.
export function availBlock(t) {
  const lines = [];
  if (isFilm(t) && S.radarr) {
    const r = radarrOf(t.id), href = r && radarrUrl(r.slug);
    const state = !r ? 'Not in Radarr' : r.file ? 'On disk' : r.monitored ? 'Wanted, no file yet' : 'In Radarr, not monitored, no file';
    lines.push(`<li><span class="src">Radarr</span><span><strong>${state}</strong>${link(href, 'Open in Radarr')}</span></li>`);
  }
  const w = wlvOf(t.id);
  if (w) {
    const items = (w.items || []).filter(i => wlvUrl(i.slug));
    if (items.length > 1) {
      lines.push(`<li><span class="src">We Luv Video</span><span><strong>Stocks it</strong>${items.map(i =>
        `<br>${esc(i.name)}${formatsOf(i) ? ` <small>(${esc(formatsOf(i))})</small>` : ''}${link(wlvUrl(i.slug), 'Open')}`).join('')}</span></li>`);
    } else if (items.length) {
      const i = items[0];
      lines.push(`<li><span class="src">We Luv Video</span><span><strong>Stocks it</strong>${formatsOf(i) ? ` <small>(${esc(formatsOf(i))})</small>` : ''}${link(wlvUrl(i.slug), 'Open in the store')}</span></li>`);
    } else lines.push(`<li><span class="src">We Luv Video</span><span>Not in the catalogue${w.checked ? ` <small>(checked ${esc(fmtDate(w.checked))})</small>` : ''}</span></li>`);
  }
  if (!lines.length) return '';
  const hint = isFilm(t) && radarrOf(t.id) && !radarrBase()
    ? '<p class="hint">Add your Radarr address in Settings to link straight to the film.</p>' : '';
  return `<section class="block avail"><h2>Where to get it</h2><ul class="avail-list">${lines.join('')}</ul>${hint}</section>`;
}
