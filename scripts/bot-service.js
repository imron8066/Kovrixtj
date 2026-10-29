// Бот как служба macOS: запускается сам при входе в систему и поднимается
// заново, если упал. Запуск: npm run bot:on, остановка: npm run bot:off.
// Что бот пишет — в bot/bot.log. caffeinate не даёт Mac уснуть, пока
// бот работает (иначе бот молчит, пока Mac спит); с закрытой крышкой
// без зарядки Mac всё равно уснёт.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LABEL = 'tj.donix.bot';
const plist = path.join(os.homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const domain = `gui/${os.userInfo().uid}`;
const bot = path.join(__dirname, '../bot');
const log = path.join(bot, 'bot.log');

const launchctl = (...args) => {
  try {
    execFileSync('launchctl', args, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

const stop = () => launchctl('bootout', `${domain}/${LABEL}`);

if (process.argv[2] === 'off') {
  stop();
  fs.rmSync(plist, { force: true });
  console.log('Бот остановлен и убран из автозапуска.');
} else {
  const strings = (items) => items.map((item) => `<string>${item}</string>`).join('');
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  fs.writeFileSync(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>${strings(['/usr/bin/caffeinate', '-is', process.execPath, path.join(bot, 'bot.js')])}</array>
  <key>WorkingDirectory</key><string>${bot}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
</dict></plist>
`,
  );
  stop();
  if (!launchctl('bootstrap', domain, plist)) {
    console.error('Не удалось включить автозапуск. Запустите бота вручную: npm run bot');
    process.exit(1);
  }
  console.log(`Бот запущен и будет включаться сам. Журнал: ${log}`);
}
