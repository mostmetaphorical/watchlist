// GitHub contents API client for the private data repo + an IndexedDB cache.
const API = 'https://api.github.com';

export function getAuth() {
  try { return JSON.parse(localStorage.getItem('fs.auth') || 'null'); } catch { return null; }
}
export function setAuth(a) {
  try { a ? localStorage.setItem('fs.auth', JSON.stringify(a)) : localStorage.removeItem('fs.auth'); } catch {}
}

// ---------------------------------------------------------------- tiny IndexedDB key-value store
const DB = 'film-school', STORE = 'kv';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function cacheGet(key) {
  try {
    const db = await idb();
    return await new Promise((res) => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); });
  } catch { return undefined; }
}
export async function cacheSet(key, val) {
  try {
    const db = await idb();
    await new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = res; tx.onerror = res; });
  } catch {}
}
export async function cacheClear() {
  try { const db = await idb(); await new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = res; tx.onerror = res; }); } catch {}
}

// ---------------------------------------------------------------- helpers
const enc = new TextEncoder(), dec = new TextDecoder();
async function blobSha(bytes) {
  // git's blob id: sha1("blob <len>\0" + content) — lets us update files of any size without a metadata call
  const head = enc.encode(`blob ${bytes.byteLength}\0`);
  const all = new Uint8Array(head.length + bytes.byteLength); all.set(head); all.set(new Uint8Array(bytes), head.length);
  const h = await crypto.subtle.digest('SHA-1', all);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function b64(bytes) {
  let s = ''; const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export class GitHubError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
function headers(auth, extra = {}) {
  return { Authorization: `Bearer ${auth.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...extra };
}
const contentsUrl = (auth, path) => `${API}/repos/${auth.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;

export async function checkAuth(auth) {
  const r = await fetch(`${API}/repos/${auth.repo}`, { headers: headers(auth, { Accept: 'application/vnd.github+json' }), cache: 'no-store' });
  if (r.status === 401) throw new GitHubError(401, 'GitHub rejected that token. Check it was copied in full and hasn’t expired.');
  if (r.status === 404) throw new GitHubError(404, `Can’t see ${auth.repo}. Check the repo name, and that the token has access to it.`);
  if (!r.ok) throw new GitHubError(r.status, `GitHub answered ${r.status}.`);
  const j = await r.json();
  return { private: j.private, branch: j.default_branch, canPush: j.permissions ? !!j.permissions.push : true };
}

// Read a file. Uses the cached copy's ETag so unchanged files cost nothing.
// Returns { text, sha, changed } or null when the file doesn't exist.
export async function readFile(auth, path) {
  const key = 'file:' + auth.repo + ':' + path;
  const cached = await cacheGet(key);
  const h = headers(auth, { Accept: 'application/vnd.github.raw+json' });
  if (cached?.etag) h['If-None-Match'] = cached.etag;
  let r, bytes;
  try {
    r = await fetch(contentsUrl(auth, path) + `?ref=${encodeURIComponent(auth.branch || 'main')}`, { headers: h, cache: 'no-store' });
    if (r.status === 304 && cached) return { ...cached, changed: false };
    if (r.status === 404) return null;
    if (r.status === 401) throw new GitHubError(401, 'Your GitHub token stopped working. Add a new one in Settings.');
    if (!r.ok) throw new GitHubError(r.status, `Couldn’t read ${path} (GitHub ${r.status}).`);
    // These files run to several megabytes, so the body is the part most likely to
    // drop on a weak connection. Reading it inside the try means a half-finished
    // transfer falls back to the cached copy instead of failing the whole load.
    bytes = await r.arrayBuffer();
  } catch (e) {
    if (e instanceof GitHubError) throw e;
    if (cached) return { ...cached, changed: false, offline: true };
    throw new GitHubError(0, 'Can’t reach GitHub. Check your connection.');
  }
  const text = dec.decode(bytes);
  // A cut-short transfer can still arrive as a 200 with a partial body, which
  // parses as broken JSON. Check before caching: half a file is worse than none,
  // because it would persist and break every later open.
  if (path.endsWith('.json')) {
    try { JSON.parse(text); }
    catch {
      if (cached) return { ...cached, changed: false, offline: true };
      throw new GitHubError(0, 'The download was cut short. Check your connection and try again.');
    }
  }
  const rec = { text, sha: await blobSha(bytes), etag: r.headers.get('ETag') };
  await cacheSet(key, rec);
  return { ...rec, changed: true };
}

// Write a file. `sha` is the version we started from (null for a new file).
export async function writeFile(auth, path, text, message, sha) {
  const bytes = enc.encode(text);
  const body = { message, content: b64(bytes), branch: auth.branch || 'main', ...(sha ? { sha } : {}) };
  const r = await fetch(contentsUrl(auth, path), { method: 'PUT', headers: headers(auth, { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) throw new GitHubError(409, 'conflict');
  if (r.status === 403 || r.status === 404) throw new GitHubError(r.status, 'This token can read the data but not save it. Give it “Contents: read and write” access.');
  if (!r.ok) throw new GitHubError(r.status, `Couldn’t save ${path} (GitHub ${r.status}).`);
  const j = await r.json();
  const rec = { text, sha: j.content?.sha || await blobSha(bytes), etag: null };
  await cacheSet('file:' + auth.repo + ':' + path, rec);
  return rec;
}
