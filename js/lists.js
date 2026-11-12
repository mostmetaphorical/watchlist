// The watchlists: Together, Solo, Tristan's queue, Store picks and Film school.
import { S, title } from './store.js';
import { esc, md, frontMatter } from './md.js';
import { onShelf, row, shelf, empty, filters, sortEntries, kindOk, visible, watchedOf, watchedShelf, orderSections, syncNote, rollButton, PLAY_RESET_DAYS, playedOn } from './parts.js';

// ---------------------------------------------------------------- Together
const NIGHTS = [['all', 'Any night'], ['light', 'Light'], ['dense', 'Dense'], ['heavy', 'Heavy'], ['test', 'Test']];
const GROUPS = [['light', 'Light nights', 'Easy to start, easy to stop.'], ['dense', 'Dense nights', 'Full attention, worth it.'],
  ['heavy', 'Heavy tokens', 'Ration these. Both opt in.'], ['test', 'Test together', 'One episode or twenty minutes, then decide.']];
export function together(ui) {
  const all = S.cur.entries.filter(e => onShelf(e) && (e.tier === 'B' || e.tier === 'B?'));
  const vis = visible(all, ui);
  const groupOf = (e) => e.tier === 'B?' ? 'test' : e.energy || 'light';
  const count = (g) => vis.filter(e => g === 'all' || groupOf(e) === g).length;
  const gone = watchedOf(all, ui).filter(e => ui.night === 'all' || groupOf(e) === ui.night);

  const rowsFor = (g, sub, collapsible) => {
    const list = sortEntries(vis.filter(e => groupOf(e) === g), ui);
    if (!list.length) return '';
    const sections = orderSections([...new Set(list.map(e => e.section))]);
    if (!sub || ui.sort !== 'curated' || sections.length < 2)
      return `<div class="rows">${list.map(e => row(e.t, { entry: e })).join('')}</div>`;
    return sections.map(sec => {
      const label = esc(/^(Light nights|Dense nights|Heavy tokens|Test together)$/.test(sec) ? 'Other picks' : sec);
      const rows = list.filter(e => e.section === sec);
      const inner = `<div class="rows">${rows.map(e => row(e.t, { entry: e })).join('')}</div>`;
      // inside a collapsed group these would be collapsibles within a collapsible, so keep them plain
      return collapsible
        ? shelf(ui, `vibe:${g}:${sec}`, `${label} <span class="count">${rows.length}</span>`, inner, true, 'shelf sub')
        : `<h3>${label}</h3>${inner}`;
    }).join('');
  };

  let body;
  if (ui.night === 'all') {
    body = GROUPS.map(([g, name, hint]) => {
      const n = count(g); if (!n) return '';
      return shelf(ui, 'night:' + g, `${name} <span class="count">${n}</span>`,
        `<p class="hint">${hint}</p>${rowsFor(g, true, false)}`, g === 'light').replace('class="group shelf"', `class="group shelf" data-energy="${g}"`);
    }).join('');
  } else {
    const [, name, hint] = GROUPS.find(x => x[0] === ui.night) || [];
    body = `<section class="group" data-energy="${ui.night}"><h2>${esc(name || '')} <span class="count">${count(ui.night)}</span></h2>
      <p class="hint">${esc(hint || '')}</p>${rowsFor(ui.night, true, true)}</section>`;
  }

  return `<header class="view-head"><h1>Together</h1>${rollButton('together')}${syncNote()}</header>
    <div class="vibes" role="tablist" aria-label="What kind of night?">
      ${NIGHTS.map(([v, l]) => `<button type="button" role="tab" aria-selected="${ui.night === v}" data-act="night" data-v="${v}" data-energy="${v === 'all' ? '' : v}"><span>${l}</span><span class="n-count">${count(v)}</span></button>`).join('')}
    </div>
    ${filters(ui, ['kind'])}
    ${body || empty(gone.length ? 'Everything here is watched. It’s all in Watched below.' : 'Nothing here yet.')}
    ${watchedShelf(ui, 'together:' + ui.night, gone)}`;
}

// ---------------------------------------------------------------- Solo + Tristan
export function solo(ui) {
  const all = S.cur.entries.filter(e => onShelf(e) && e.tier === 'M');
  const vis = visible(all, ui);
  const order = orderSections([...new Set(all.map(e => e.section))]);
  const body = order.map(s => {
    const list = sortEntries(vis.filter(e => e.section === s), ui);
    if (!list.length) return '';
    return shelf(ui, 'solo:' + s, `${esc(s)} <span class="count">${list.length}</span>`,
      `<div class="rows">${list.map(e => row(e.t, { entry: e, pitch: false })).join('')}</div>`, order.indexOf(s) === 0);
  }).join('');
  return `<header class="view-head"><h1>Solo</h1>${rollButton('solo')}${syncNote()}</header>${filters(ui, ['kind'])}${body || empty('Nothing left on your solo shelves.')}
    ${watchedShelf(ui, 'solo', watchedOf(all, ui), { pitch: false })}`;
}
const sinceText = (d) => {
  const days = Math.floor((Date.now() - Date.parse(d)) / 86400000);
  const left = PLAY_RESET_DAYS - days;
  return `Played ${days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'} · back in ${left} day${left === 1 ? '' : 's'}`;
};
function storeRow(e, played) {
  const t = title(e.t); if (!t) return '';
  return `<div class="srow${played ? ' is-played' : ''}">
    <button class="tick" data-act="${played ? 'unplay' : 'play'}" data-t="${esc(e.t)}" aria-pressed="${!!played}"
      aria-label="${played ? 'Put back on the list' : 'Mark as played'}">${played ? '✓' : ''}</button>
    ${row(e.t, { entry: e, pitch: false, marks: false })}
    ${played ? `<div class="played-meta"><span>${esc(sinceText(played))}</span><button class="linkish" data-act="drop-store" data-t="${esc(e.t)}">Remove</button></div>` : ''}
  </div>`;
}
export function store(ui) {
  const all = S.cur.entries.filter(e => onShelf(e) && e.tier === 'W');
  const kindOk = (e) => ui.kind === 'all' || !ui.kind || (title(e.t)?.kind || 'film') === ui.kind;
  const live = all.filter(e => kindOk(e) && !playedOn(e));
  const done = all.filter(e => kindOk(e) && playedOn(e)).sort((a, b) => String(b.played).localeCompare(String(a.played)));
  const order = []; for (const e of all) if (!order.includes(e.section)) order.push(e.section);
  const body = order.map(sec => {
    const list = sortEntries(live.filter(e => e.section === sec), ui);
    if (!list.length) return '';
    return shelf(ui, 'store:' + sec, `${esc(sec)} <span class="count">${list.length}</span>`,
      `<div class="rows store">${list.map(e => storeRow(e, null)).join('')}</div>`);
  }).join('');
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Store picks</h1>${syncNote()}</header>
    <p class="lede">What to put on the screens during a We Luv Video shift. Tick one when you play it; it drops to the bottom and comes back in six months.</p>
    ${all.length ? filters(ui, ['kind']) + body : empty('Nothing here yet. Open any film and choose “Add to a list”, or paste a list into the chat.')}
    ${done.length ? shelf(ui, 'store:played', `Played <span class="count">${done.length}</span>`,
      `<p class="hint">Back on the list automatically after six months. Remove one to keep it off for good.</p>
       <div class="rows store">${done.map(e => storeRow(e, playedOn(e))).join('')}</div>`, true, 'group shelf played') : ''}
    ${(S.cur.storeRules || []).length ? `<section class="group avoid"><h2>What to avoid</h2><ul>${S.cur.storeRules.map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>` : ''}`;
}

export function tristan(ui) {
  const all = S.cur.entries.filter(e => onShelf(e) && e.tier === 'T');
  const vis = sortEntries(visible(all, ui), ui);
  return `<header class="view-head"><a class="back" href="#/more">More</a><h1>Tristan’s queue</h1>${syncNote()}</header>
    <p class="lede">For when you’re travelling: universe-loyalty picks and Moffat. Things he’ll enjoy and you won’t.</p>
    ${filters(ui, [])}<div class="rows">${vis.map(e => row(e.t, { entry: e })).join('') || empty('His queue is empty.')}</div>
    ${watchedShelf(ui, 'tristan', watchedOf(all, ui))}`;
}

// ---------------------------------------------------------------- Film school
export function school(ui, vols) {
  const queue = S.cur.entries.filter(e => onShelf(e) && e.section === 'Film school' && e.note !== 'Volume 1' && !/^Volume \d+/.test(e.note || ''));
  const vis = sortEntries(visible(queue, ui), ui);
  return `<header class="view-head"><h1>Film school</h1>${syncNote()}</header>
    ${shelf(ui, 'school:volumes', 'Volumes', `<div class="vols">${vols.map(v => `<a class="vol" href="#/school/${v.n}"><span class="vol-n">Vol. ${v.n}</span><span class="vol-t">${esc(v.title)}</span><span class="vol-p">${v.seen} of ${v.films.length} watched</span></a>`).join('') || '<p class="hint">No volumes yet.</p>'}</div>
    <p class="hint">New volumes appear here when their notes are added to the data repo.</p>`)}
    ${shelf(ui, 'school:syllabus', `On the syllabus <span class="count">${vis.length}</span>`,
      `<p class="hint">Not yet in a volume.</p>${filters(ui, [])}<div class="rows">${vis.map(e => row(e.t, { entry: e })).join('')}</div>`)}
    ${watchedShelf(ui, 'school', watchedOf(queue, ui))}`;
}
export function volume(n, text) {
  if (!text) return `<header class="view-head"><a class="back" href="#/school">Film school</a><h1>Volume ${esc(n)}</h1></header>${empty('This volume isn’t in the data repo yet.')}`;
  const { meta, body } = frontMatter(text);
  const [intro, outro] = body.split(/\n---\n/);
  const films = (meta.films || []).map(id => title(id)).filter(Boolean);
  return `<header class="view-head"><a class="back" href="#/school">Film school</a><h1>Vol. ${esc(meta.number)}: ${esc(meta.title)}</h1></header>
    <details class="prose intro"><summary>Read the introduction</summary>${md(intro)}</details>
    <ol class="rows numbered">${films.map((t, i) => `<li>${row(t.id, { pitch: false })}</li>`).join('')}</ol>
    ${outro ? `<details class="prose intro"><summary>How to use the diary</summary>${md(outro)}</details>` : ''}`;
}
