// Forms: the ones that slide up in the bottom sheet (list placement, verdict,
// pitch, notes, remove, fix match), and the Add, Settings and login pages.
// Each form has data-form="name"; main.js reads it on submit and saves.
import { IX, title, entriesOf, verdictsOf, pitchOf, today } from './store.js';
import { esc } from './md.js';
import { SERVER, savedBase, sonarrFromRadarr } from './avail.js';
import { TIER, ENERGY, REACTION, VIEWER, STATUS, options } from './parts.js';

// The choices shared by "Add to a list" and the Add page.
// "Let Claude decide" (S) leaves the list to the next curation run.
const LIST_CHOICES = [...['B', 'B?', 'M', 'T', 'W'].map(k => [k, TIER[k]]), ['S', 'Let Claude decide']];
const ENERGY_CHOICES = [['', 'Not set'], ...Object.entries(ENERGY)];
// Existing shelf names, offered as suggestions while typing a shelf.
const sectionList = () => `<datalist id="sections">${IX.sections.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>`;

// ---------------------------------------------------------------- bottom-sheet forms
// i is the entry's position among this title's entries; undefined means a new one.
export function entryForm(id, i) {
  const e = i === undefined ? { tier: 'B', energy: 'dense', section: '', status: 'queued' } : entriesOf(id)[i];
  return `<form data-form="entry" data-id="${esc(id)}" data-i="${i ?? ''}">
    <h2>${i === undefined ? 'Add to a list' : 'Edit list placement'}</h2>
    ${i === undefined ? `<div class="ask-sort"><p class="hint">Not sure which list? Claude picks it on the next curation run (Fridays and Sundays) and writes the pitch and the film-school notes. Anything in Note below is passed on as a hint.</p>
      <button type="button" class="btn ghost" data-act="ask-sort">Let Claude sort it</button></div>` : ''}
    <label>List<select name="tier">${options(LIST_CHOICES, e.tier)}</select></label>
    <label>Energy<select name="energy">${options(ENERGY_CHOICES, e.energy)}</select></label>
    <label>Shelf<input name="section" list="sections" value="${esc(e.section)}" placeholder="e.g. Comedies"></label>${sectionList()}
    <label>Status<select name="status">${options(Object.entries(STATUS), e.status || 'queued')}</select></label>
    <label>Note<input name="note" value="${esc(e.note || '')}" placeholder="Optional"></label>
    <label class="check"><input type="checkbox" name="star"${e.star ? ' checked' : ''}> Highest-confidence pick (★)</label>
    <div class="actions">${i !== undefined ? '<button type="button" class="btn ghost danger" data-act="remove-entry">Remove from this list</button>' : ''}<button class="btn">Save</button></div>
  </form>`;
}
// vid is the verdict's id when editing one; a new verdict defaults to "Together: Loved it", today.
export function verdictForm(id, vid) {
  const v = vid ? verdictsOf(id).find(x => x.id === vid) : { viewer: 'both', reaction: 'loved', date: today() };
  return `<form data-form="verdict" data-id="${esc(id)}" data-v="${esc(vid || '')}">
    <h2>${vid ? 'Edit verdict' : 'Log a verdict'}</h2>
    <fieldset class="seg"><legend>Who watched</legend>${Object.entries(VIEWER).map(([k, l]) => `<label><input type="radio" name="viewer" value="${k}"${v.viewer === k ? ' checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
    <label>Reaction<select name="reaction">${options(Object.entries(REACTION), v.reaction)}</select></label>
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
// A new note starts from the same four headings Claude's notes use.
export function noteForm(id, text) {
  const t = title(id);
  const tpl = `---\ntitle: ${t?.title || ''}\n---\n\n**Before you watch.** \n\n**The people.** \n\n**After you watch.** \n\n**Diary questions.** (1)  (2)  (3) \n`;
  return `<form data-form="note" data-id="${esc(id)}" class="tall"><h2>Film-school notes</h2>
    <p class="hint">Markdown. “After you watch” is hidden behind a spoiler tap.</p>
    <textarea name="text" rows="18">${esc(text || tpl)}</textarea>
    <div class="actions"><button class="btn">Save notes</button></div></form>`;
}
// Takes a title off every list. Verdicts are kept unless the box is ticked.
export function removeTitleForm(id) {
  const t = title(id), es = entriesOf(id), vs = verdictsOf(id), p = pitchOf(id);
  const lists = [...new Set(es.map(e => TIER[e.tier] || e.section))];
  const what = es.length ? `This takes it off ${es.length === 1 ? 'the list it is on' : `all ${es.length} lists it is on`} — ${esc(lists.join(', '))}`
    : 'This takes it off Unsorted';
  return `<form data-form="remove-title" data-id="${esc(id)}">
    <h2>Remove ${esc(t.title)}?</h2>
    <p>${what}${p ? ', and deletes the pitch' : ''}. The curation runs won’t suggest it again.</p>
    ${vs.length ? `<label class="check"><input type="checkbox" name="verdicts"> Also delete ${vs.length} verdict${vs.length > 1 ? 's' : ''} (${vs.map(v => esc(VIEWER[v.viewer])).join(', ')})</label>
      <p class="hint">Verdicts are your record of what you watched and what you thought. Leave this unticked to keep them.</p>` : ''}
    <p class="hint">The title itself stays in your data, and its page has a “Put it back” button. Letterboxd (watchlist, lists and history) is untouched.</p>
    <div class="actions"><button type="button" class="btn ghost" data-act="close-sheet">Keep it</button><button class="btn danger-solid">Remove</button></div>
  </form>`;
}
export function matchForm(id) {
  return `<form data-form="match" data-id="${esc(id)}"><h2>Fix the match</h2>
    <p class="hint">Find it on themoviedb.org and paste the page link, e.g. https://www.themoviedb.org/movie/603.</p>
    <label>TMDB link<input name="url" inputmode="url" placeholder="https://www.themoviedb.org/…"></label>
    <div class="actions"><button type="button" class="btn ghost" data-act="no-match">It’s not on TMDB</button><button class="btn">Save</button></div></form>`;
}
// ---------------------------------------------------------------- pages
export function addForm() {
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Add a film or show</h1></header>
    <form data-form="add" class="page-form">
      <label>Title<input name="title" required autocomplete="off"></label>
      <label>Year<input name="year" inputmode="numeric" pattern="\\d{4}" placeholder="Optional, helps the lookup"></label>
      <fieldset class="seg"><legend>Kind</legend><label><input type="radio" name="kind" value="film" checked><span>Film</span></label><label><input type="radio" name="kind" value="series"><span>Series</span></label><label><input type="radio" name="kind" value=""><span>Not sure</span></label></fieldset>
      <label>List<select name="tier">${options(LIST_CHOICES, 'B')}</select></label>
      <label>Energy<select name="energy">${options(ENERGY_CHOICES, 'dense')}</select></label>
      <label>Shelf<input name="section" list="sections" placeholder="e.g. Comedies"></label>${sectionList()}
      <label>Pitch for Tristan<textarea name="pitch" rows="3" placeholder="Optional"></textarea></label>
      <div class="actions"><button class="btn">Add</button></div>
      <p class="hint">The poster, credits and links are looked up on TMDB within a few minutes.</p>
    </form>`;
}
// auth is what gh.js keeps for this device: { repo, branch, token }. Only the
// token's last six characters are shown. serverError is a message from the last
// attempt to save the Radarr and Sonarr addresses.
export function settings(auth, build, serverError) {
  const radarr = savedBase('radarr'), sonarr = savedBase('sonarr'), guess = sonarrFromRadarr(radarr);
  const field = (app, value, placeholder) => `<label>${SERVER[app].name} address<input name="${app}" type="url" inputmode="url" value="${esc(value)}" placeholder="${esc(placeholder)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>`;
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Settings</h1></header>
    <h2>Radarr and Sonarr</h2>
    <form data-form="servers" class="page-form">
      ${field('radarr', radarr, 'https://radarr.example.com')}
      ${field('sonarr', sonarr, guess || 'https://sonarr.example.com')}
      ${guess && !sonarr ? '<p class="hint">Left empty, Sonarr uses the address shown, worked out from Radarr’s.</p>' : ''}
      ${serverError ? `<p class="error" role="alert">${esc(serverError)}</p>` : ''}
      <div class="actions left"><button class="btn">Save</button>${radarr || sonarr ? '<button type="button" class="btn ghost" data-act="servers-clear">Remove</button>' : ''}</div>
      <p class="hint">The ones you open Radarr and Sonarr with in a browser. Kept on this device only and used just to build links; the app never connects to either. What’s on disk comes from the weekly sync in the data repo.</p>
    </form>
    <h2>Data</h2>
    <dl class="kv"><dt>Data repo</dt><dd>${esc(auth?.repo || '')} (${esc(auth?.branch || 'main')})</dd><dt>Token</dt><dd>…${esc((auth?.token || '').slice(-6))}</dd><dt>App version</dt><dd>${esc(build || '—')}</dd></dl>
    <div class="actions left"><button class="btn ghost" data-act="reload">Reload data</button><button class="btn ghost danger" data-act="signout">Sign out on this device</button></div>
    <p class="hint">Signing out removes the token, the Radarr and Sonarr addresses and the offline copy from this device only.</p>`;
}
// First screen on a new device. cfg is config.js (the data repo's name).
export function login(cfg, error) {
  return `<main class="login">
    <h1>Watchlist</h1>
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
// When the lists couldn't be loaded. network is true when the connection
// dropped rather than GitHub saying no, so it doesn't offer to replace the token.
export function loadFailed(error, network) {
  return `<main class="login"><h1>Watchlist</h1><p class="error" role="alert">${esc(error)}</p>
    ${network ? '<p class="hint">The lists run to a few megabytes, so a weak signal can cut the download short. On a better connection it should open straight away.</p>' : ''}
    <div class="actions left"><button class="btn" data-act="reload">Try again</button>${network ? '' : '<button class="btn ghost" data-act="signout">Use a different token</button>'}</div>
    ${network ? '<p class="fine"><button class="linkish" data-act="signout">Sign out on this device</button></p>' : ''}</main>`;
}
// The loading screen: a film leader counting down while the data arrives.
export function leader() {
  return `<div class="leader" role="status" aria-label="Loading your lists"><div class="leader-ring"><span class="leader-n">8</span></div><p>Threading the projector</p></div>`;
}
