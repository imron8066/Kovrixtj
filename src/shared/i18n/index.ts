import strings from './strings.json';

// Языки приложения. Текст в коде пишется по-русски, а перевод берётся
// из словаря strings.json: «русская строка» → [таджикский, английский].
// {0}, {1} в строке — то, что подставляется (имя, цена, номер).
// Новые строки без перевода остаются русскими; найти их:
// node scripts/i18n-extract.js --json
export type Lang = 'ru' | 'tg' | 'en';

export const LANGS: { key: Lang; name: string }[] = [
  { key: 'ru', name: 'Русский' },
  { key: 'tg', name: 'Тоҷикӣ' },
  { key: 'en', name: 'English' },
];

let lang: Lang = 'ru';
export const setLang = (next: Lang) => {
  lang = LANGS.some(l => l.key === next) ? next : 'ru';
};
export const getLang = () => lang;

type Pair = [string, string];
const exact = new Map<string, Pair>();
const patterns: { re: RegExp; slots: string[]; pair: Pair }[] = [];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const [ru, pair] of Object.entries(strings as unknown as Record<string, Pair>)) {
  const slots = ru.match(/\{\d+\}/g);
  if (!slots) {
    exact.set(ru, pair);
    continue;
  }
  patterns.push({
    re: new RegExp(
      `^${ru.split(/\{\d+\}/).map(escape).join('([\\s\\S]*?)')}$`,
    ),
    slots,
    pair,
  });
}
// сначала шаблоны, где больше постоянного текста: они точнее
const fixed = (re: RegExp) =>
  re.source.replace(/\(\[\\s\\S\]\*\?\)/g, '').length;
patterns.sort((a, b) => fixed(b.re) - fixed(a.re));

const RU = /[А-Яа-яЁё]/;
const pick = (pair: Pair) => (lang === 'tg' ? pair[0] : pair[1]);

// перевод одной строки; пробелы по краям сохраняются
export function t(text: string): string {
  if (lang === 'ru' || !text || !RU.test(text)) {
    return text;
  }
  const lead = text.match(/^\s*/)![0];
  const trail = text.match(/\s*$/)![0];
  const core = text.trim().replace(/\s+/g, ' ');
  const hit = exact.get(core);
  if (hit) {
    return lead + pick(hit) + trail;
  }
  for (const { re, slots, pair } of patterns) {
    const match = core.match(re);
    if (match) {
      let out = pick(pair);
      slots.forEach((slot, i) => {
        const part = match[i + 1];
        out = out.split(slot).join(exact.has(part) ? pick(exact.get(part)!) : part);
      });
      return lead + out + trail;
    }
  }
  return text;
}
