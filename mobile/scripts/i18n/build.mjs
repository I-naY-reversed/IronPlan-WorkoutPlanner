import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { translate } from 'google-translate-api-x';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LANGS = ['fr', 'ru'];
const DIRS = ['src/app', 'src/components', 'src/domain'];
const SKIP = /__tests__|__sim__|\.test\.|\.sim\./;

const files = DIRS.flatMap((d) => fs.readdirSync(path.join(ROOT, d), { recursive: true }).map((f) => path.join(ROOT, d, f)))
  .filter((f) => /\.(ts|tsx)$/.test(f) && !SKIP.test(f));

const keys = new Set();
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const uiLike = (s) => /[A-Za-z]{2}/.test(s) && (/ /.test(s) || /^[A-Z][a-z]/.test(s)) && !/^[@./#]|https?:|\.(png|ttf|json)$/.test(s);
const add = (s) => { s = clean(s); if (uiLike(s.replace(/\{\d+\}/g, ''))) keys.add(s); };

function visit(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
  if (ts.isJsxText(node)) add(node.text);
  if ((ts.isJsxElement(node) || ts.isJsxFragment(node)) && node.children.some(ts.isJsxExpression) && node.children.some((c) => ts.isJsxText(c) && c.text.trim())
    && node.children.every((c) => ts.isJsxText(c) || ts.isJsxExpression(c))) {
    let i = 0;
    add(node.children.map((c) => (ts.isJsxText(c) ? c.text.replace(/\s*\n\s*/g, '') : c.expression ? `{${i++}}` : '')).join(''));
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const p = node.parent;
    if (!(ts.isPropertyAssignment(p) && p.name === node) && !ts.isLiteralTypeNode(p) && !ts.isElementAccessExpression(p)) add(node.text);
  }
  if (ts.isTemplateExpression(node)) add(node.head.text + node.templateSpans.map((s, i) => `{${i}}${s.literal.text}`).join(''));
  ts.forEachChild(node, visit);
}
for (const f of files) visit(ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
const harvested = path.join(ROOT, 'scripts/i18n/harvested.json');
if (fs.existsSync(harvested)) for (const k of JSON.parse(fs.readFileSync(harvested, 'utf8'))) keys.add(k);
console.log(`${keys.size} strings from ${files.length} files`);
if (process.argv.includes('--dry')) process.exit(0);

const OVERRIDES = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n/overrides.json'), 'utf8'));
const TERM_FIXES = {
  fr: [[/\b[Uu]n ensemble\b/g, 'une série'], [/\bl'ensemble\b/g, 'la série'], [/\bL'ensemble\b/g, 'La série'], [/\bensembles\b/g, 'séries'], [/\bensemble\b/g, 'série'], [/\bEnsembles?\b/g, (m) => (m.endsWith('s') ? 'Séries' : 'Série')]],
  ru: [[/набор/g, 'подход'], [/Набор/g, 'Подход']],
};
const holes = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join();
for (const lang of LANGS) {
  const file = path.join(ROOT, 'src/i18n', `${lang}.json`);
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const out = Object.fromEntries([...keys].filter((k) => k in old).map((k) => [k, old[k]]));
  const todo = [...keys].filter((k) => !(k in old));
  let dropped = 0;
  for (let i = 0; i < todo.length; i += 40) {
    const batch = todo.slice(i, i + 40);
    const res = await translate(batch, { from: 'en', to: lang, forceBatch: true, rejectOnPartialFail: false });
    res.forEach((r, j) => {
      const t = r?.text?.trim();
      if (t && holes(t) === holes(batch[j])) out[batch[j]] = t;
      else dropped++;
    });
    process.stdout.write(`\r${lang}: ${Math.min(i + 40, todo.length)}/${todo.length}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  for (const k of Object.keys(out)) for (const [re, to] of TERM_FIXES[lang]) out[k] = out[k].replace(re, to);
  Object.assign(out, Object.fromEntries(Object.entries(OVERRIDES[lang] ?? {})));
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`\n${lang}: ${Object.keys(sorted).length} entries (${todo.length} new, ${dropped} dropped for placeholder mismatch)`);
}
