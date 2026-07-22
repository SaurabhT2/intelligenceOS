/**
 * scripts/context/lib/merge-docs.mjs
 * Utilities for consolidating N independently-generated markdown documents
 * into one document: strip each document's own top-level title + generated-
 * file header note (the consolidated doc carries one of each, at the top),
 * then demote every remaining heading by a fixed number of levels so a
 * document's `#` becomes a subsection `##`/`###` in the merged output.
 */

/** Removes a document's leading `# Title` line and the very next
 * generated-file header-note blockquote line (if present), plus the blank
 * lines immediately around them. Leaves everything from the intro
 * paragraph onward untouched. */
export function stripDocHeader(md) {
  const lines = md.split('\n');
  let i = 0;
  // Skip a leading `# Title` line.
  if (lines[i]?.startsWith('# ')) i++;
  // Skip blank lines.
  while (lines[i] === '') i++;
  // Skip a `> **Generated file...` blockquote note (may wrap onto one line
  // since these are constructed as single strings without embedded newlines).
  if (lines[i]?.startsWith('>')) i++;
  while (lines[i] === '') i++;
  return lines.slice(i).join('\n').trim();
}

/** Demotes every markdown heading (`#`, `##`, ...) in `md` by `levels`. */
export function demoteHeadings(md, levels) {
  return md
    .split('\n')
    .map((line) => {
      const m = line.match(/^(#+)(\s.*)$/);
      if (!m) return line;
      return '#'.repeat(m[1].length + levels) + m[2];
    })
    .join('\n');
}

/** Full pipeline: strip a sub-document's own header, demote its headings so
 * its top-level `#` lands at `sectionLevel`, and wrap it under one new
 * section heading with `anchor`-friendly title. */
export function asSection(md, { title, sectionLevel = 2, note = null }) {
  const stripped = stripDocHeader(md);
  const demoted = demoteHeadings(stripped, sectionLevel - 1);
  const lines = [`${'#'.repeat(sectionLevel)} ${title}`, ''];
  if (note) { lines.push(note); lines.push(''); }
  lines.push(demoted);
  return lines.join('\n');
}

/** Builds a markdown table-of-contents from a list of `{ title, anchor }`. */
export function buildToc(entries) {
  const slug = (s) => s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  return entries.map((e) => `- [${e.title}](#${slug(e.title)})`).join('\n');
}
