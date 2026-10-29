// Сайт не умеет читать TypeScript, поэтому игры, цены, страны и ключи Firebase
// переписываются из src/shared в web/shared/data.js.
// Запуск: npm run web — после любой правки games.ts или config.ts.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function load(file) {
  const source = fs.readFileSync(path.join(root, 'src/shared', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', outputText)(
    module,
    module.exports,
    () => ({}),
  );
  return module.exports;
}

const config = load('config.ts');
const data = {
  firebase: config.FIREBASE,
  motto: config.MOTTO,
  botName: config.BOT_NAME,
  shareUrl: config.SHARE_URL,
  countries: config.COUNTRIES,
  currencies: config.CURRENCIES,
  payMethods: config.PAY_METHODS,
  payEmpty: config.PAY_EMPTY,
  perms: config.PERMS,
  receipt: config.RECEIPT,
  maxPhotos: config.MAX_PHOTOS,
  refreshMs: config.REFRESH_MS,
  chatMs: config.CHAT_MS,
  games: load('games.ts').GAMES,
  // мини-игры на сайте: вопросы викторины и карточки «Найди пару»
  quiz: load('minigames.ts').QUESTIONS,
  pairIcons: load('minigames.ts').PAIR_ICONS,
  // словарь переводов: «русская строка» → [таджикский, английский]
  strings: require(path.join(root, 'src/shared/i18n/strings.json')),
};

const out = path.join(root, 'web/shared/data.js');
fs.writeFileSync(
  out,
  '// Этот файл создаёт команда npm run web — не правьте его руками.\n' +
    `window.KOVRIX = ${JSON.stringify(data, null, 2)};\n`,
);
console.log(`Готово: ${path.relative(root, out)} (игр: ${data.games.length})`);
