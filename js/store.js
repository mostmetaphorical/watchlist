// The data layer. Loads the JSON files from the private data repo, keeps them in
// memory (S), builds lookup tables (IX), answers "who has seen this?", and saves
// edits to data/curation.json back to GitHub. Views read from here; only main.js
// writes, and only through saveCuration() and saveNote().
import { getAuth, readFile, writeFile, GitHubError } from './gh.js';

// Two tiers. CORE is what a list needs and is fetched before anything is drawn;
// EXTRA is credits, full synopses and the people index, which only the title,
// person and search views need, and which together outweigh CORE three to one.
// Drawing first and filling in after is the difference between a 6 MB wait and
// a 1.5 MB one on a phone.
const CORE = { titles: 'data/titles.json', curation: 'data/curation.json', letterboxd: 'data/letterboxd.json' };
// Radarr and We Luv Video availability are optional: they appear once the data
// repo's GitHub Actions have run, and the app simply shows less until then.
const EXTRA = { details: 'data/details.json', people: 'data/people.json', radarr: 'data/radarr.json', wlv: 'data/wlv.json' };
const FILES = { ...CORE, ...EXTRA };

// Everything loaded, plus the state of the connection.
export const S = {
  titles: [],        // data/titles.json: one record per film, series or special
  byId: new Map(),   // title id -> record (built by rebuild())
  cur: null,         // data/curation.json: list entries, verdicts, pitches, shelf order
  lb: null,          // data/letterboxd.json: your Letterboxd ratings, diary and lists
  details: null,     // data/details.json: credits and full synopses, merged into titles
  people: {},        // data/people.json: person id -> name, photo, department
  radarr: null,      // data/radarr.json: which films Radarr has (optional file)
  wlv: null,         // data/wlv.json: which titles We Luv Video stocks (optional file)
  shas: {},          // file name -> git blob sha of the version in memory
  loaded: false,     // the lists can be drawn
  extras: false,     // credits, people and availability have arrived too
  syncing: false, saving: 0, offline: false,
  error: null, errorStatus: null,   // last error, and its HTTP status (0 = no connection)
};

// main.js subscribes to redraw whenever S changes.
const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach(fn => fn());

// ---------------------------------------------------------------- indexes
// Lookup tables rebuilt after every load or save, so views never scan whole files.
export const IX = {
  entries: new Map(),    // title id -> its list entries (a title can be on several lists)
  verdicts: new Map(),   // title id -> its verdicts
  person: new Map(),     // person id -> [{ t: title id, r: [roles], c: character, o: billing order }]
  alias: new Map(),      // old title id -> current id, for titles that were merged
  sections: [],          // every shelf name in use, for the "Shelf" suggestions in forms
};
function rebuild() {
  S.byId = new Map(S.titles.map(t => [t.id, t]));
  IX.alias = new Map();
  for (const t of S.titles) for (const a of t.aliases || []) IX.alias.set(a, t.id);
  // titles added in the app that the TMDB job hasn't picked up yet
  for (const a of S.cur?.added || []) if (!S.byId.has(a.id)) S.byId.set(a.id, { ...a, match: 'pending', lb: null });
  IX.entries = new Map(); IX.verdicts = new Map(); IX.person = new Map();
  const secs = new Map();
  for (const e of S.cur?.entries || []) {
    (IX.entries.get(e.t) || IX.entries.set(e.t, []).get(e.t)).push(e);
    if (!secs.has(e.section)) secs.set(e.section, { name: e.section, tier: e.tier, order: e.order ?? 0 });
  }
  IX.sections = [...secs.values()];
  for (const v of S.cur?.verdicts || []) (IX.verdicts.get(v.t) || IX.verdicts.set(v.t, []).get(v.t)).push(v);
  // A credit is { p: person id, r: role, c: character, o: billing order }. One person
  // can hold several roles on a title (wrote and directed), so they are merged into
  // one row per title, keeping the first character name and the best billing.
  for (const t of S.titles) for (const c of t.credits || []) {
    const list = IX.person.get(c.p) || IX.person.set(c.p, []).get(c.p);
    const row = list.find(x => x.t === t.id);
    if (!row) { list.push({ t: t.id, r: [c.r], ...(c.c ? { c: c.c } : {}), ...(c.o !== undefined ? { o: c.o } : {}) }); continue; }
    if (!row.r.includes(c.r)) row.r.push(c.r);
    if (c.c && !row.c) row.c = c.c;
    if (c.o !== undefined) row.o = Math.min(row.o ?? 99, c.o);
  }
}
export const title = (id) => S.byId.get(id) || S.byId.get(IX.alias.get(id));
export const entriesOf = (id) => IX.entries.get(id) || [];
export const verdictsOf = (id) => IX.verdicts.get(id) || [];
export const lbOf = (id) => S.lb?.films?.[id] || null;
export const diaryOf = (id) => (S.lb?.diary || []).filter(d => d.t === id);
export const pitchOf = (id) => S.cur?.pitches?.[id] || null;

// A title's TMDB reference as { type: 'movie' | 'tv', id }. Films added by the
// Radarr job carry a bare number until the TMDB job fills in the type.
export function tmdbRef(t) {
  if (!t?.tmdb) return null;
  return typeof t.tmdb === 'object' ? t.tmdb : { type: 'movie', id: t.tmdb };
}

// Which list belongs to whom. A verdict by that viewer takes a title off that list.
//   B   Together            B?  Test together (try an episode first)
//   M   Meta, solo          T   Tristan's queue (for when Meta is away)
//   W   Store picks: what to play during a shift at the video store
//   R   Rent: films Radarr can't find, to rent instead
//   C   Coming soon: announced, not yet out
export const AUDIENCE = { B: 'both', 'B?': 'both', M: 'meta', T: 'tristan' };

// Who has seen it, from verdicts + Letterboxd. Watching together counts for both.
export function seen(id) {
  const vs = verdictsOf(id), l = lbOf(id);
  const together = vs.some(v => v.viewer === 'both');
  return {
    together,
    meta: together || !!l?.watched || vs.some(v => v.viewer === 'meta'),
    tristan: together || vs.some(v => v.viewer === 'tristan'),
  };
}
// Is this entry still "to watch" on its own list? Done and dropped never are,
// ongoing always is; otherwise it's open until that list's audience has seen it.
// Store picks are a programme to replay, not a watchlist, so they stay open.
export function open(e) {
  if (e.status === 'done' || e.status === 'dropped') return false;
  if (e.status === 'ongoing' || e.tier === 'W') return true;
  const s = seen(e.t), who = AUDIENCE[e.tier] || 'meta';
  return who === 'both' ? !s.together : !s[who];
}

// ---------------------------------------------------------------- loading
// Put one downloaded file into S.
function apply(name, text) {
  const j = JSON.parse(text);
  if (name === 'titles') S.titles = j;
  else if (name === 'details') { S.details = j; mergeDetails(); }
  else if (name === 'people') S.people = j;
  else if (name === 'curation') S.cur = j;
  else if (name === 'letterboxd') S.lb = j;
  else if (name === 'radarr') S.radarr = j;
  else if (name === 'wlv') S.wlv = j;
}
// details.json is keyed by title id; fold it back onto the records in memory so
// every reader can keep using t.credits and t.overview.
function mergeDetails() {
  if (!S.details) return;
  for (const t of S.titles) {
    const d = S.details[t.id];
    if (d) { if (d.credits) t.credits = d.credits; if (d.overview) t.overview = d.overview; }
  }
}

// Fetch everything. Called on start, when the app comes back to the foreground,
// and after a failed save. Unchanged files cost nothing (see readFile in gh.js).
export async function load() {
  const auth = getAuth(); if (!auth) return;
  S.syncing = true; S.error = null; S.errorStatus = null; emit();
  let changed = false;
  const take = async (group) => {
    const results = await Promise.all(Object.entries(group).map(async ([name, path]) => [name, await readFile(auth, path)]));
    for (const [name, f] of results) {
      if (!f) { if (name === 'titles' || name === 'curation') throw new GitHubError(404, `The data repo has no ${FILES[name]}.`); continue; }
      if (f.offline) S.offline = true;
      // Apply each version of a file once, keyed on its git sha. (A file served
      // from the cache on a later visit still has to be applied on that visit.)
      if (S.shas[name] === f.sha) continue;
      S.shas[name] = f.sha; apply(name, f.text); changed = true;
    }
  };
  try {
    S.offline = false;
    await take(CORE);
    if (!S.lb) S.lb = { films: {}, diary: [], lists: {} };
    if (changed) rebuild();
    S.loaded = true;
    S.syncing = false; emit();            // draw the lists now

    // The rest arrives behind the first paint. Failing here is not fatal: the
    // lists already work, so only the title, person and search views are thinner.
    try {
      changed = false;
      await take(EXTRA);
      if (changed) { mergeDetails(); rebuild(); }
      S.extras = true;
    } catch { S.extras = false; }
    return;
  } catch (e) {
    S.error = e.message || String(e);
    S.errorStatus = e.status ?? 0;
  } finally { S.syncing = false; emit(); }
}

// ---------------------------------------------------------------- saving
// mutate(cur) changes the curation object in place; message becomes the commit
// message. GitHub refuses a write based on an out-of-date copy (409), so on a
// conflict we fetch the newest copy and apply the same change to it. Two devices,
// or a GitHub Action, saving at once never overwrite each other.
export async function saveCuration(mutate, message) {
  const auth = getAuth();
  mutate(S.cur); rebuild(); S.saving++; emit();
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const rec = await writeFile(auth, FILES.curation, JSON.stringify(S.cur, null, 1) + '\n', message, S.shas.curation);
        S.shas.curation = rec.sha; return true;
      } catch (e) {
        if (!(e instanceof GitHubError) || e.status !== 409) throw e;
        const f = await readFile(auth, FILES.curation);
        S.cur = JSON.parse(f.text); S.shas.curation = f.sha; mutate(S.cur); rebuild(); emit();
      }
    }
    throw new Error('Someone else kept saving at the same time. Try again.');
  } catch (e) {
    S.error = e.message; await load(); throw e;
  } finally { S.saving--; emit(); }
}

// ---------------------------------------------------------------- film-school notes (fetched on demand)
// notes/<title id>.md and volumes/vol-NN.md are fetched only when opened.
const noteCache = new Map();
export async function getNote(id) {
  if (noteCache.has(id)) return noteCache.get(id);
  const f = await readFile(getAuth(), `notes/${id}.md`);
  const v = f ? { text: f.text, sha: f.sha } : null;
  noteCache.set(id, v); return v;
}
export async function saveNote(id, text, titleName) {
  const prev = noteCache.get(id);
  const rec = await writeFile(getAuth(), `notes/${id}.md`, text, `Film-school notes: ${titleName}`, prev?.sha || null);
  noteCache.set(id, { text, sha: rec.sha });
}
const volCache = new Map();
export async function getVolume(n) {
  if (volCache.has(n)) return volCache.get(n);
  const f = await readFile(getAuth(), `volumes/vol-${String(n).padStart(2, '0')}.md`);
  volCache.set(n, f?.text || null); return f?.text || null;
}

// ---------------------------------------------------------------- small utilities
export const today = () => new Date().toISOString().slice(0, 10);
// Lower case with accents removed ("Amélie" -> "amelie"), for searching and ids.
export const fold = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// A readable id from a name: "Amélie & Nino" -> "amelie-and-nino".
export function slug(s) {
  return fold(s).replace(/[’'`]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}
// Ids for titles added in the app: the slug plus the year, numbered if taken.
export function newTitleId(name, year) {
  const base = slug(name) + (year ? '-' + year : '');
  let id = base, i = 1;
  while (S.byId.has(id) || (S.cur.added || []).some(a => a.id === id)) id = `${base}-${++i}`;
  return id;
}
// "v42-k3x9": a running number plus a random tail, so two devices adding a
// verdict at the same moment don't collide.
export function nextVerdictId() {
  let n = 0; for (const v of S.cur.verdicts) n = Math.max(n, Number(String(v.id).replace(/\D/g, '')) || 0);
  return 'v' + (n + 1) + '-' + Math.random().toString(36).slice(2, 6);
}
