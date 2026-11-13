// Minimal markdown for notes: paragraphs, headings, lists, **bold**, *italic*,
// [links](url), and front matter. Text is escaped first and only http(s) links
// become <a>, so a note can't put its own HTML or scripts on the page.

// Escape text for use inside HTML, attributes included. Every view runs data through this.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The block between two "---" lines at the top of a note: "key: value" lines and
// "key:" followed by "  - item" lines. Returns { meta, body }.
export function frontMatter(text) {
  const m = String(text || '').match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text || '' };
  const meta = {}; let key = null;
  for (const line of m[1].split('\n')) {
    const li = line.match(/^\s+-\s+(.*)$/);
    if (li && key) { (meta[key] = Array.isArray(meta[key]) ? meta[key] : []).push(li[1].trim()); continue; }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) { key = kv[1]; meta[key] = kv[2].trim() === '' ? [] : kv[2].trim().replace(/^"(.*)"$/, '$1'); }
  }
  return { meta, body: text.slice(m[0].length) };
}

function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
}

// Markdown text -> HTML.
export function md(text) {
  const out = []; let list = null, para = [];
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushP(); flushL(); continue; }
    if (line.trim() === '---') { flushP(); flushL(); out.push('<hr>'); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushP(); flushL(); const n = Math.min(4, m[1].length + 1); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { flushP(); if (!list || list.tag !== 'ul') { flushL(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) { flushP(); if (!list || list.tag !== 'ol') { flushL(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    flushL(); para.push(line.trim());
  }
  flushP(); flushL();
  return out.join('\n');
}

// Split a film-school note into its labelled parts ("**Before you watch.** …").
// Returns [{label, body}] in order; text before the first label goes under "".
export function noteSections(body) {
  const parts = []; let cur = { label: '', body: [] };
  for (const para of String(body || '').trim().split(/\n{2,}/)) {   // trim: the body starts with the newline after the front matter
    const m = para.match(/^\*\*([^*]{2,40}?)\.?\*\*\s*([\s\S]*)$/);
    if (m && !/\n/.test(m[1])) { if (cur.label || cur.body.length) parts.push(cur); cur = { label: m[1].replace(/\.$/, ''), body: [m[2]] }; }
    else cur.body.push(para);
  }
  if (cur.label || cur.body.length) parts.push(cur);
  return parts.map(p => ({ label: p.label, body: p.body.join('\n\n').trim() }));
}
// "(1) foo (2) bar (3) baz" -> ["foo", "bar", "baz"]
export function splitQuestions(s) {
  const qs = String(s || '').split(/\(\d\)\s*/).map(x => x.trim()).filter(Boolean);
  return qs.length > 1 ? qs : null;
}
