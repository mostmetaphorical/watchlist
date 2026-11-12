// The list pages: Together, Solo, Store picks, Tristan's queue and Film school.
// Each takes the remembered view options (ui: sort, kind, night…) and returns HTML.
import { S, title } from './store.js';
import { esc, md, frontMatter } from './md.js';
import {
  onShelf, row, rows, shelf, heading, empty, filters, sortEntries, kindOk, visible, watchedOf, watchedShelf,
  orderSections, shelfLabel, syncNote, rollButton, PLAY_RESET_DAYS, playedOn,
} from './parts.js';

const onList = (tiers) => S.cur.entries.filter(e => onShelf(e) && tiers.includes(e.tier));
const sectionsOf = (list) => orderSections([...new Set(list.map(e => e.section))]);

// ---------------------------------------------------------------- Together
// Grouped by the kind of night it needs, then by shelf (Sci-fi, Comedies…).
const NIGHTS = [['all', 'Any night'], ['light', 'Light'], ['dense', 'Dense'], ['heavy', 'Heavy'], ['test', 'Test']];
const GROUPS = {
  light: ['Light nights', 'Easy to start, easy to stop.'],
  dense: ['Dense nights', 'Full attention, worth it.'],
  heavy: ['Heavy tokens', 'Ration these. Both opt in.'],
  test: ['Test together', 'One episode or twenty minutes, then decide.'],
};
const nightOf = (e) => e.tier === 'B?' ? 'test' : e.energy || 'light';

export function together(ui) {
  const all = onList(['B', 'B?']);
  const vis = visible(all, ui);
  const count = (night) => vis.filter(e => night === 'all' || nightOf(e) === night).length;
  const watched = watchedOf(all, ui).filter(e => ui.night === 'all' || nightOf(e) === ui.night);

  // The rows for one night, split by shelf. When every night is shown, each night
  // is already a collapsible group, so its shelves get plain subheadings; when one
  // night is picked, its shelves are collapsible themselves.
  const nightBody = (night, collapsible) => {
    const list = sortEntries(vis.filter(e => nightOf(e) === night), ui);
    const sections = sectionsOf(list);
    if (ui.sort !== 'curated' || sections.length < 2) return list.length ? rows(list) : '';
    return sections.map(sec => {
      const here = list.filter(e => e.section === sec);
      return collapsible
        ? shelf(ui, `vibe:${night}:${sec}`, heading(shelfLabel(sec), here.length), rows(here), { cls: 'shelf sub' })
        : `<h3>${esc(shelfLabel(sec))}</h3>${rows(here)}`;
    }).join('');
  };

  let body;
  if (ui.night === 'all') {
    body = Object.entries(GROUPS).map(([night, [name, hint]]) => count(night)
      ? shelf(ui, 'night:' + night, heading(name, count(night)), `<p class="hint">${hint}</p>${nightBody(night, false)}`,
        { open: night === 'light', attrs: ` data-energy="${night}"` })
      : '').join('');
  } else {
    const [name, hint] = GROUPS[ui.night] || ['', ''];
    body = `<section class="group" data-energy="${esc(ui.night)}"><h2>${heading(name, count(ui.night))}</h2>
      <p class="hint">${esc(hint)}</p>${nightBody(ui.night, true)}</section>`;
  }

  return `<header class="view-head"><h1>Together</h1>${rollButton('together')}${syncNote()}</header>
    <div class="vibes" role="tablist" aria-label="What kind of night?">
      ${NIGHTS.map(([v, l]) => `<button type="button" role="tab" aria-selected="${ui.night === v}" data-act="night" data-v="${v}" data-energy="${v === 'all' ? '' : v}"><span>${l}</span><span class="n-count">${count(v)}</span></button>`).join('')}
    </div>
    ${filters(ui, { kind: true })}
    ${body || empty(watched.length ? 'Everything here is watched. It’s all in Watched below.' : 'Nothing here yet.')}
    ${watchedShelf(ui, 'together:' + ui.night, watched)}`;
}

// ---------------------------------------------------------------- Solo
// One collapsible shelf per section; only the first starts open.
export function solo(ui) {
  const all = onList(['M']);
  const vis = visible(all, ui);
  const sections = sectionsOf(all);
  const body = sections.map((sec, i) => {
    const list = sortEntries(vis.filter(e => e.section === sec), ui);
    return list.length ? shelf(ui, 'solo:' + sec, heading(sec, list.length), rows(list, { pitch: false }), { open: i === 0 }) : '';
  }).join('');
  return `<header class="view-head"><h1>Solo</h1>${rollButton('solo')}${syncNote()}</header>
    ${filters(ui, { kind: true })}
    ${body || empty('Nothing left on your solo shelves.')}
    ${watchedShelf(ui, 'solo', watchedOf(all, ui), { pitch: false })}`;
}

// ---------------------------------------------------------------- Store picks
// Films to put on the screens at work. A ticked one sits in Played for six months
// (PLAY_RESET_DAYS), then comes back on its own.
function playedText(date) {
  const days = Math.floor((Date.now() - Date.parse(date)) / 86400000);
  const left = PLAY_RESET_DAYS - days;
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `Played ${when} · back in ${left} day${left === 1 ? '' : 's'}`;
}
function storeRow(e, played) {
  if (!title(e.t)) return '';
  return `<div class="srow${played ? ' is-played' : ''}">
    <button class="tick" data-act="${played ? 'unplay' : 'play'}" data-t="${esc(e.t)}" aria-pressed="${!!played}"
      aria-label="${played ? 'Put back on the list' : 'Mark as played'}">${played ? '✓' : ''}</button>
    ${row(e.t, { entry: e, pitch: false, marks: false })}
    ${played ? `<div class="played-meta"><span>${esc(playedText(played))}</span><button class="linkish" data-act="drop-store" data-t="${esc(e.t)}">Remove</button></div>` : ''}
  </div>`;
}
const storeRows = (list) => `<div class="rows store">${list.map(e => storeRow(e, playedOn(e))).join('')}</div>`;

export function store(ui) {
  const all = onList(['W']);
  const live = all.filter(e => kindOk(e, ui) && !playedOn(e));
  const played = all.filter(e => kindOk(e, ui) && playedOn(e)).sort((a, b) => String(b.played).localeCompare(String(a.played)));
  const body = sectionsOf(all).map(sec => {
    const list = sortEntries(live.filter(e => e.section === sec), ui);
    return list.length ? shelf(ui, 'store:' + sec, heading(sec, list.length), storeRows(list)) : '';
  }).join('');
  const rules = S.cur.storeRules || [];
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Store picks</h1>${syncNote()}</header>
    <p class="lede">What to put on the screens during a We Luv Video shift. Tick one when you play it; it drops to the bottom and comes back in six months.</p>
    ${all.length ? filters(ui, { kind: true }) + body : empty('Nothing here yet. Open any film and choose “Add to a list”, or paste a list into the chat.')}
    ${played.length ? shelf(ui, 'store:played', heading('Played', played.length),
      `<p class="hint">Back on the list automatically after six months. Remove one to keep it off for good.</p>${storeRows(played)}`,
      { cls: 'group shelf played' }) : ''}
    ${rules.length ? `<section class="group avoid"><h2>What to avoid</h2><ul>${rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>` : ''}`;
}

// ---------------------------------------------------------------- Tristan's queue
export function tristan(ui) {
  const all = onList(['T']);
  const vis = sortEntries(visible(all, ui), ui);
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Tristan’s queue</h1>${syncNote()}</header>
    <p class="lede">For when you’re travelling: universe-loyalty picks and Moffat. Things he’ll enjoy and you won’t.</p>
    ${filters(ui)}${vis.length ? rows(vis) : `<div class="rows">${empty('His queue is empty.')}</div>`}
    ${watchedShelf(ui, 'tristan', watchedOf(all, ui))}`;
}

// ---------------------------------------------------------------- Film school
// vols comes from main.js: [{ n, title, films, seen }] read from notes/volume-N.md.
// The syllabus is everything in the "Film school" section not yet placed in a volume.
export function school(ui, vols) {
  const queue = S.cur.entries.filter(e => onShelf(e) && e.section === 'Film school' && !/^Volume \d+/.test(e.note || ''));
  const vis = sortEntries(visible(queue, ui), ui);
  const volCard = (v) => `<a class="vol" href="#/school/${v.n}"><span class="vol-n">Vol. ${v.n}</span><span class="vol-t">${esc(v.title)}</span><span class="vol-p">${v.seen} of ${v.films.length} watched</span></a>`;
  return `<header class="view-head"><h1>Film school</h1>${syncNote()}</header>
    ${shelf(ui, 'school:volumes', 'Volumes', `<div class="vols">${vols.map(volCard).join('') || '<p class="hint">No volumes yet.</p>'}</div>
    <p class="hint">New volumes appear here when their notes are added to the data repo.</p>`)}
    ${shelf(ui, 'school:syllabus', heading('On the syllabus', vis.length), `<p class="hint">Not yet in a volume.</p>${filters(ui)}${rows(vis)}`)}
    ${watchedShelf(ui, 'school', watchedOf(queue, ui))}`;
}

// One volume: its introduction, the ten films in order, and the diary guide.
// The note file has front matter (number, title, films) and two parts split by a line of ---.
export function volume(n, text) {
  if (!text) return `<header class="view-head"><a class="back" href="#/school">Film school</a><h1>Volume ${esc(n)}</h1></header>${empty('This volume isn’t in the data repo yet.')}`;
  const { meta, body } = frontMatter(text);
  const [intro, outro] = body.split(/\n---\n/);
  const films = (meta.films || []).filter(id => title(id));
  return `<header class="view-head"><a class="back" href="#/school">Film school</a><h1>Vol. ${esc(meta.number)}: ${esc(meta.title)}</h1></header>
    <details class="prose intro"><summary>Read the introduction</summary>${md(intro)}</details>
    <ol class="rows numbered">${films.map(id => `<li>${row(id, { pitch: false })}</li>`).join('')}</ol>
    ${outro ? `<details class="prose intro"><summary>How to use the diary</summary>${md(outro)}</details>` : ''}`;
}
