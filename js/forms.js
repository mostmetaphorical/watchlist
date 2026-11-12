// Forms for the bottom sheet, plus Add, Settings, the login page and the loader.
import { IX, title, entriesOf, verdictsOf, pitchOf, open } from './store.js';
import { esc } from './md.js';
import { radarrBase } from './avail.js';
import { TIER, REACTION, VIEWER, STATUS, poster } from './parts.js';

// ---------------------------------------------------------------- forms (shown in the bottom sheet)
const opt = (pairs, val) => pairs.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
const sectionList = () => `<datalist id="sections">${IX.sections.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>`;
export function entryForm(id, i) {
  const e = i === undefined ? { tier: 'B', energy: 'dense', section: '', status: 'queued' } : entriesOf(id)[i];
  return `<form data-form="entry" data-id="${esc(id)}" data-i="${i ?? ''}">
    <h2>${i === undefined ? 'Add to a list' : 'Edit list placement'}</h2>
    <label>List<select name="tier">${opt([['B', 'Together'], ['B?', 'Test together'], ['M', 'Solo'], ['T', 'Tristan’s queue'], ['W', 'Store picks']], e.tier)}</select></label>
    <label>Energy<select name="energy">${opt([['', 'Not set'], ['light', 'Light night'], ['dense', 'Dense night'], ['heavy', 'Heavy token']], e.energy)}</select></label>
    <label>Shelf<input name="section" list="sections" value="${esc(e.section)}" placeholder="e.g. Comedies"></label>${sectionList()}
    <label>Status<select name="status">${opt(Object.entries(STATUS), e.status || 'queued')}</select></label>
    <label>Note<input name="note" value="${esc(e.note || '')}" placeholder="Optional"></label>
    <label class="check"><input type="checkbox" name="star"${e.star ? ' checked' : ''}> Highest-confidence pick (★)</label>
    <div class="actions">${i !== undefined ? '<button type="button" class="btn ghost danger" data-act="remove-entry">Remove from this list</button>' : ''}<button class="btn">Save</button></div>
  </form>`;
}
export function verdictForm(id, vid) {
  const v = vid ? verdictsOf(id).find(x => x.id === vid) : { viewer: 'both', reaction: 'loved', date: new Date().toISOString().slice(0, 10) };
  return `<form data-form="verdict" data-id="${esc(id)}" data-v="${esc(vid || '')}">
    <h2>${vid ? 'Edit verdict' : 'Log a verdict'}</h2>
    <fieldset class="seg"><legend>Who watched</legend>${Object.entries(VIEWER).map(([k, l]) => `<label><input type="radio" name="viewer" value="${k}"${v.viewer === k ? ' checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
    <label>Reaction<select name="reaction">${opt(Object.entries(REACTION), v.reaction)}</select></label>
    <label>Note<textarea name="note" rows="3" placeholder="e.g. he loved it until the mystery was solved">${esc(v.note || '')}</textarea></label>
    <label>Date<input type="date" name="date" value="${esc(v.date || '')}"></label>
    <label class="check"><input type="checkbox" name="markDone" checked> Mark it done on the together list</label>
    <div class="actions">${vid ? '<button type="button" class="btn ghost danger" data-act="remove-verdict">Delete verdict</button>' : ''}<button class="btn">Save verdict</button></div>
  </form>`;
}
export function pitchForm(id) {
  return `<form data-form="pitch" data-id="${esc(id)}"><h2>Pitch for Tristan</h2>
    <label><span class="sr">Pitch</span><textarea name="pitch" rows="4" placeholder="One line: why he’d like it">${esc(pitchOf(id) || '')}</textarea></label>
    <div class="actions"><button class="btn">Save pitch</button></div></form>`;
}
export function noteForm(id, text) {
  const t = title(id);
  const tpl = `---\ntitle: ${t?.title || ''}\n---\n\n**Before you watch.** \n\n**The people.** \n\n**After you watch.** \n\n**Diary questions.** (1)  (2)  (3) \n`;
  return `<form data-form="note" data-id="${esc(id)}" class="tall"><h2>Film-school notes</h2>
    <p class="hint">Markdown. “After you watch” is hidden behind a spoiler tap.</p>
    <textarea name="text" rows="18">${esc(text || tpl)}</textarea>
    <div class="actions"><button class="btn">Save notes</button></div></form>`;
}
export function removeTitleForm(id) {
  const t = title(id), es = entriesOf(id), vs = verdictsOf(id), p = pitchOf(id);
  return `<form data-form="remove-title" data-id="${esc(id)}">
    <h2>Remove ${esc(t.title)}?</h2>
    <p>This takes it off ${es.length === 1 ? 'the list it is on' : `all ${es.length} lists it is on`}${es.length ? ` — ${es.map(e => esc(TIER[e.tier] || e.section)).filter((v, i, a) => a.indexOf(v) === i).join(', ')}` : ''}${p ? ', and deletes the pitch' : ''}.</p>
    ${vs.length ? `<label class="check"><input type="checkbox" name="verdicts"> Also delete ${vs.length} verdict${vs.length > 1 ? 's' : ''} (${vs.map(v => esc(VIEWER[v.viewer])).join(', ')})</label>
      <p class="hint">Verdicts are your record of what you watched and what you thought. Leave this unticked to keep them.</p>` : ''}
    <p class="hint">The title itself stays in your data, so it can be added again later. Letterboxd history is untouched.</p>
    <div class="actions"><button type="button" class="btn ghost" data-act="close-sheet">Keep it</button><button class="btn danger-solid">Remove</button></div>
  </form>`;
}
export function matchForm(id) {
  return `<form data-form="match" data-id="${esc(id)}"><h2>Fix the match</h2>
    <p class="hint">Find it on themoviedb.org and paste the page link, e.g. https://www.themoviedb.org/movie/603.</p>
    <label>TMDB link<input name="url" inputmode="url" placeholder="https://www.themoviedb.org/…"></label>
    <div class="actions"><button type="button" class="btn ghost" data-act="no-match">It’s not on TMDB</button><button class="btn">Save</button></div></form>`;
}
export function addForm() {
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Add a film or show</h1></header>
    <form data-form="add" class="page-form">
      <label>Title<input name="title" required autocomplete="off"></label>
      <label>Year<input name="year" inputmode="numeric" pattern="\\d{4}" placeholder="Optional, helps the lookup"></label>
      <fieldset class="seg"><legend>Kind</legend><label><input type="radio" name="kind" value="film" checked><span>Film</span></label><label><input type="radio" name="kind" value="series"><span>Series</span></label><label><input type="radio" name="kind" value=""><span>Not sure</span></label></fieldset>
      <label>List<select name="tier">${opt([['B', 'Together'], ['B?', 'Test together'], ['M', 'Solo'], ['T', 'Tristan’s queue'], ['W', 'Store picks']], 'B')}</select></label>
      <label>Energy<select name="energy">${opt([['', 'Not set'], ['light', 'Light night'], ['dense', 'Dense night'], ['heavy', 'Heavy token']], 'dense')}</select></label>
      <label>Shelf<input name="section" list="sections" placeholder="e.g. Comedies"></label>${sectionList()}
      <label>Pitch for Tristan<textarea name="pitch" rows="3" placeholder="Optional"></textarea></label>
      <div class="actions"><button class="btn">Add</button></div>
      <p class="hint">The poster, credits and links are looked up on TMDB within a few minutes.</p>
    </form>`;
}
export function settings(auth, build, radarrError) {
  const base = radarrBase();
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Settings</h1></header>
    <h2>Radarr</h2>
    <form data-form="radarr" class="page-form">
      <label>Radarr address<input name="url" type="url" inputmode="url" value="${esc(base)}" placeholder="https://radarr.example.com" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      ${radarrError ? `<p class="error" role="alert">${esc(radarrError)}</p>` : ''}
      <div class="actions left"><button class="btn">Save</button>${base ? '<button type="button" class="btn ghost" data-act="radarr-clear">Remove</button>' : ''}</div>
      <p class="hint">The one you open Radarr with in a browser. Kept on this device only and used just to build “Open in Radarr” links; the app never connects to Radarr. Which films are on disk comes from the weekly sync in the data repo.</p>
    </form>
    <h2>Data</h2>
    <dl class="kv"><dt>Data repo</dt><dd>${esc(auth?.repo || '')} (${esc(auth?.branch || 'main')})</dd><dt>Token</dt><dd>…${esc((auth?.token || '').slice(-6))}</dd><dt>App version</dt><dd>${esc(build || '—')}</dd></dl>
    <div class="actions left"><button class="btn ghost" data-act="reload">Reload data</button><button class="btn ghost danger" data-act="signout">Sign out on this device</button></div>
    <p class="hint">Signing out removes the token, the Radarr address and the offline copy from this device only.</p>`;
}
export function login(cfg, error) {
  return `<main class="login">
    <h1>Film School</h1>
    <p class="lede">Your watchlists live in a private GitHub repo. Connect this device with a token that can read and write it.</p>
    <form data-form="login" class="page-form">
      <label>Data repo<input name="repo" value="${esc(cfg.repo)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <label>GitHub token<input name="token" type="password" autocomplete="off" required placeholder="github_pat_…"></label>
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
      <div class="actions"><button class="btn">Connect</button></div>
    </form>
    <details class="prose"><summary>How to make the token</summary><ol>
      <li>On GitHub: Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token.</li>
      <li>Repository access: Only select repositories, then pick <strong>${esc(cfg.repo.split('/')[1] || 'your data repo')}</strong>.</li>
      <li>Permissions: Contents, Read and write.</li>
      <li>Copy the token and paste it here. It stays on this device.</li></ol></details>
  </main>`;
}
export function leader() {
  return `<div class="leader" role="status" aria-label="Loading your lists"><div class="leader-ring"><span class="leader-n">8</span></div><p>Threading the projector</p></div>`;
}
