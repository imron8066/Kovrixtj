// Собирает все русские строки приложений и сайтов — для словаря переводов
// (src/shared/i18n/strings.json). Запуск: node scripts/i18n-extract.js
// Печатает строки, которых в словаре ещё нет.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const RU = /[А-Яа-яЁё]/;
const found = new Set();
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const add = (s) => {
  s = norm(s);
  if (RU.test(s)) found.add(s);
};

// HTML внутри шаблона сайта: текст между тегами — отдельные строки
const addHtml = (s) => {
  for (const part of s.split(/<[^>]*>/)) {
    // вложенный шаблон уже разобран отдельно
    add(part.replace(/\$\{[^}]*\}?/g, '{0}'));
  }
};

function template(node, sf) {
  // `текст ${x} текст` → «текст {0} текст»
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  let out = node.head.text;
  node.templateSpans.forEach((span, i) => {
    out += `{${i}}` + span.literal.text;
  });
  return out;
}

function walk(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const web = file.includes(`${path.sep}web${path.sep}`);
  const visit = (node) => {
    if (ts.isStringLiteral(node)) {
      // регулярные выражения ошибок и ключи не нужны
      if (!ts.isImportDeclaration(node.parent)) web && /</.test(node.text) ? addHtml(node.text) : add(node.text);
    } else if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const t = template(node, sf);
      if (web && /</.test(t)) addHtml(t);
      else add(t.replace(/\{\d+\}/g, (m, i) => m));
    } else if (ts.isJsxText(node)) {
      add(node.text);
    } else if (ts.isJsxElement(node)) {
      // <Text>Был в сети: {date}</Text> → «Был в сети: {0}»
      const kids = node.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
      if (kids.length > 1 && kids.every((c) => ts.isJsxText(c) || ts.isJsxExpression(c)) && kids.some((c) => ts.isJsxText(c) && RU.test(c.text))) {
        let i = 0;
        add(kids.map((c) => (ts.isJsxText(c) ? c.text : `{${i++}}`)).join(''));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const files = (dir, exts) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? files(p, exts) : exts.some((x) => p.endsWith(x)) ? [p] : [];
});

[...files(path.join(root, 'src'), ['.ts', '.tsx']), ...['web/shared/core.js', 'web/user/app.js', 'web/admin/app.js'].map((f) => path.join(root, f))]
  .filter((f) => !f.includes(`${path.sep}i18n`))
  .forEach(walk);
// статичные куски страниц сайта
for (const f of ['web/user/index.html', 'web/admin/index.html']) addHtml(fs.readFileSync(path.join(root, f), 'utf8'));

let dict = {};
try { dict = require(path.join(root, 'src/shared/i18n/strings.json')); } catch { /* словаря ещё нет */ }
const missing = [...found].filter((s) => !dict[s]).sort();
if (process.argv.includes('--json')) console.log(JSON.stringify(missing, null, 1));
else console.error(`Строк всего: ${found.size}, без перевода: ${missing.length}`);
