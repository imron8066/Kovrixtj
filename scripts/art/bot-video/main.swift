// Видео про Telegram-бота @Kovrixtj_bot: телефон с чатом, где по очереди
// показаны все функции — меню, цены, заказ на сайте внутри Telegram,
// промокод дня, статус заказа, поддержка и «Ещё». 1080×1920, ~44 с, музыка
// и звуки нажатий — свои (scripts/art/Video.swift). Тексты — как у бота
// (bot/bot.js), цены — из src/shared/games.ts.
//   bash scripts/art.sh bot-video [файл]   → builds/brand/bot-clip.mp4
import AppKit

let W: CGFloat = 1080, H: CGFloat = 1920
let DURATION = 44.0
let outDir = "ads/кибер"
// куда писать: по умолчанию — заготовка для общего ролика (scripts/art/promo-video)
let output = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "builds/brand/bot-clip.mp4"
try? fm.createDirectory(atPath: outDir, withIntermediateDirectories: true)

// ——— телефон и экран ———
let phone = CGRect(x: 180, y: 50, width: 720, height: 1500)
let screenRect = phone.insetBy(dx: 18, dy: 18)
let statusH: CGFloat = 54, barH: CGFloat = 104
let inputH: CGFloat = 92
let base: CGFloat = 27
let logoImage = NSImage(contentsOfFile: "src/shared/assets/logo.png")!

let P110 = price("110 алмазов"), P341 = price("341 алмаз"), P572 = price("572 алмаза"), P1166 = price("1166 алмазов")
let P2398 = price("2398 алмазов"), P6160 = price("6160 алмазов")
let ORDER = "D-48213"
let LINE = "▰▰▰▰▰▰▰▰▰▰▰▰▰▰"

// ——— текст с разметкой: **жирный**, ~~зачёркнутый~~, [[код]] — лаймовым ———
func rich(_ s: String, size: CGFloat = base, color: NSColor = .white) -> NSAttributedString {
  let out = NSMutableAttributedString()
  let normal = NSFont.systemFont(ofSize: size, weight: .regular)
  let bold = NSFont.systemFont(ofSize: size, weight: .heavy)
  let mono = NSFont.monospacedSystemFont(ofSize: size * 0.95, weight: .bold)
  let para = NSMutableParagraphStyle()
  para.lineSpacing = size * 0.18
  var rest = Substring(s)
  while !rest.isEmpty {
    let marks = ["**", "~~", "[["]
    let next = marks.compactMap { m in rest.range(of: m).map { (m, $0) } }.min { $0.1.lowerBound < $1.1.lowerBound }
    guard let (mark, r) = next else {
      out.append(NSAttributedString(string: String(rest), attributes: [.font: normal, .foregroundColor: color, .paragraphStyle: para]))
      break
    }
    out.append(NSAttributedString(string: String(rest[..<r.lowerBound]), attributes: [.font: normal, .foregroundColor: color, .paragraphStyle: para]))
    let close = mark == "[[" ? "]]" : mark
    let after = rest[r.upperBound...]
    let end = after.range(of: close)!
    let inner = String(after[..<end.lowerBound])
    var attrs: [NSAttributedString.Key: Any] = [.paragraphStyle: para]
    switch mark {
    case "**": attrs[.font] = bold; attrs[.foregroundColor] = color
    case "~~": attrs[.font] = normal; attrs[.foregroundColor] = NSColor(white: 0.55, alpha: 1); attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
    default: attrs[.font] = mono; attrs[.foregroundColor] = lime
    }
    out.append(NSAttributedString(string: inner, attributes: attrs))
    rest = after[end.upperBound...]
  }
  // черта под заголовком — лаймовая
  let str = out.string as NSString
  var search = NSRange(location: 0, length: str.length)
  while true {
    let found = str.range(of: LINE, options: [], range: search)
    if found.location == NSNotFound { break }
    out.addAttribute(.foregroundColor, value: lime, range: found)
    search = NSRange(location: found.upperBound, length: str.length - found.upperBound)
  }
  return out
}

func textHeight(_ s: NSAttributedString, width: CGFloat) -> CGFloat {
  ceil(s.boundingRect(with: CGSize(width: width, height: 10000), options: [.usesLineFragmentOrigin, .usesFontLeading]).height)
}

func roundRect(_ c: CGContext, _ r: CGRect, _ radius: CGFloat, fill: NSColor? = nil, stroke: NSColor? = nil, width: CGFloat = 2) {
  let path = CGPath(roundedRect: r, cornerWidth: min(radius, r.width / 2), cornerHeight: min(radius, r.height / 2), transform: nil)
  if let fill = fill { c.addPath(path); c.setFillColor(fill.cgColor); c.fillPath() }
  if let stroke = stroke { c.addPath(path); c.setStrokeColor(stroke.cgColor); c.setLineWidth(width); c.strokePath() }
}

func label(_ s: String, in r: CGRect, size: CGFloat, weight: NSFont.Weight = .bold, color: NSColor = .white) {
  let str = NSAttributedString(string: s, attributes: [.font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color])
  let sz = str.size()
  str.draw(at: CGPoint(x: r.midX - sz.width / 2, y: r.midY - sz.height / 2))
}

// ——— сценарий ———
enum Kind { case bot, user, intro }
struct Msg {
  let id: Int
  let at: CGFloat
  let kind: Kind
  let text: String
  var buttons: [[String]] = []
}

var nextId = 0
var msgs: [Msg] = []
@discardableResult
func say(_ at: CGFloat, _ kind: Kind, _ text: String, _ buttons: [[String]] = []) -> Int {
  nextId += 1
  msgs.append(Msg(id: nextId, at: at, kind: kind, text: text, buttons: buttons))
  return nextId
}

// меню снизу (как KB в bot/bot.js)
let mainKB = [["💎 Алмазы", "🎟 Ваучеры", "🎫 Пропуск"], ["📦 Заказы", "👤 Профиль", "🏷 Промокод"], ["⭐ Отзывы", "💬 Поддержка", "☰ Ещё"]]
let packsKB = [["110 💎 — \(P110) смн", "341 💎 — \(P341) смн"], ["572 💎 — \(P572) смн", "1166 💎 — \(P1166) смн"],
               ["2398 💎 — \(P2398) смн", "6160 💎 — \(P6160) смн"], ["⬅️ Меню", "💰 Цены"]]
// какое меню видно с какого момента
let keyboards: [(CGFloat, [[String]])] = [(0, []), (6.6, mainKB), (10.3, packsKB), (22.3, mainKB)]
func keyboardAt(_ t: CGFloat) -> [[String]] { keyboards.last { $0.0 <= t }!.1 }

// нажатия: по кнопке меню снизу, по кнопке под сообщением или в окне заказа
enum Target { case kb(Int, Int), inline(Int, Int, Int), sheet(String) }
var taps: [(CGFloat, Target)] = []

// сцена 1: старт и меню
say(4.6, .user, "/start")
say(5.3, .intro, "")
say(6.3, .bot, "**💎 KOVRIX** · привет, Игрок!\n\(LINE)\n🆔 [[482913]]\n\n💎 Выберите внизу, что купить — алмазы, ваучер или пропуск.")
// сцена 2: алмазы
taps.append((9.4, .kb(0, 0)))
say(9.6, .user, "💎 Алмазы")
say(10.2, .bot, "**💎 АЛМАЗЫ** · Free Fire\n\(LINE)\nВыберите внизу 👇 Цены в сомони.")
// сцена 3: пакет и заказ на сайте внутри Telegram
taps.append((12.6, .kb(0, 0)))
say(12.8, .user, "110 💎 — \(P110) смн")
let card = say(13.4, .bot, "**110 АЛМАЗОВ** · Free Fire\n\(LINE)\n💰 Цена: **\(P110) смн**\n\nНажмите «Оформить» — впишите Player ID, оплатите и приложите чек.",
               [["🛒 Оформить заказ"], ["🏷 Промокод"]])
taps.append((15.3, .inline(card, 0, 0)))
let sheetOpen: CGFloat = 15.5, sheetClose: CGFloat = 21.3
taps.append((17.9, .sheet("promo")))
taps.append((18.9, .sheet("visa")))
taps.append((20.2, .sheet("pay")))
// сцена 4: промокод дня
taps.append((21.9, .kb(3, 0)))
say(22.1, .user, "⬅️ Меню")
taps.append((23.0, .kb(1, 2)))
say(23.2, .user, "🏷 Промокод")
say(23.8, .bot, "**🏷 ПРОМОКОД FREE FIRE**: [[DONIX10]]\n\(LINE)\n⏳ До 23:59 · один раз на аккаунт\n\n110 💎 — **9** смн ~~\(P110)~~\n341 💎 — **27** смн ~~\(P341)~~\n572 💎 — **41** смн ~~\(P572)~~\n1166 💎 — **80** смн ~~\(P1166)~~",
    [["💎 Алмазы", "🎟 Ваучеры", "🎫 Пропуск"]])
// сцена 5: статус заказа
let pushAt: CGFloat = 27.3
say(27.6, .bot, "✅ Заказ **\(ORDER)**: 110 алмазов — донат зачислен ✅")
taps.append((29.4, .kb(1, 0)))
say(29.6, .user, "📦 Заказы")
let ordersMsg = say(30.2, .bot, "**📦 МОИ ЗАКАЗЫ** · 1 из 1\n\(LINE)\n✅ · **\(ORDER)** · 110 алмазов · 9 TJS", [["🎮 Новый заказ", "🔄"], ["⬅️ Меню"]])
_ = ordersMsg
// сцена 6: поддержка
taps.append((32.5, .kb(2, 1)))
say(32.7, .user, "💬 Поддержка")
say(33.3, .bot, "**💬 ПОДДЕРЖКА**\n\(LINE)\nНапишите вопрос одним сообщением — ответ придёт сюда.", [["❓ Частые вопросы", "💬 Чат в приложении"]])
say(34.4, .user, "Можно оплатить через Алиф?")
say(35.2, .bot, "💬 **Поддержка:** да! Алиф, Visa и Эсхата — номер карты покажем при заказе 👌")
// сцена 7: «Ещё»
taps.append((36.4, .kb(2, 2)))
say(36.6, .user, "☰ Ещё")
let more = say(37.2, .bot, "**☰ ЕЩЁ**\n\(LINE)\nВсё остальное — тут 👇",
               [["💰 Все цены", "🎁 Подарить"], ["🔑 Новый код", "🌐 Сайт без пароля"], ["👥 Пригласить", "📲 Скачать"]])

// подписи над телефоном
struct Caption { let from: CGFloat; let to: CGFloat; let title: String; let sub: String }
let captions = [
  Caption(from: 3.5, to: 9.2, title: "Меню всегда под рукой", sub: "Нажми /start — кнопки внизу экрана"),
  Caption(from: 9.2, to: 12.4, title: "Цены в одно нажатие", sub: "Алмазы, ваучеры, пропуск — в сомони"),
  Caption(from: 12.4, to: 21.6, title: "Заказ прямо в Telegram", sub: "Player ID → промокод → оплата → чек"),
  Caption(from: 21.6, to: 27.1, title: "Промокод дня", sub: "Каждый день — цены ниже обычных"),
  Caption(from: 27.1, to: 32.3, title: "Статус приходит сам", sub: "Бот напишет, когда алмазы зачислены"),
  Caption(from: 32.3, to: 36.2, title: "Поддержка в чате", sub: "Ответ придёт прямо сюда"),
  Caption(from: 36.2, to: 40, title: "И это не всё", sub: "Подарки, друзья, сайт без пароля, приложение"),
]
let phoneIn: CGFloat = 3.5, outro: CGFloat = 40

// ——— рисование экрана ———
var tapPoints: [Int: CGPoint] = [:]

func keyboardHeight(_ kb: [[String]]) -> CGFloat { kb.isEmpty ? 0 : CGFloat(kb.count) * 80 + 20 }

func drawKeyboard(_ c: CGContext, _ kb: [[String]], _ r: CGRect, _ t: CGFloat) {
  guard !kb.isEmpty else { return }
  c.setFillColor(rgb(0x101019).cgColor)
  c.fill(r)
  for (i, row) in kb.enumerated() {
    let rowY = r.maxY - 10 - CGFloat(i + 1) * 80
    let w = (r.width - 16 - CGFloat(row.count - 1) * 8) / CGFloat(row.count)
    for (j, key) in row.enumerated() {
      let kr = CGRect(x: r.minX + 8 + CGFloat(j) * (w + 8), y: rowY + 6, width: w, height: 68)
      roundRect(c, kr, 14, fill: rgb(0x22223a), stroke: rgb(0x2e2e4a), width: 1.5)
      label(key, in: kr, size: row.count > 2 ? 23 : 24, weight: .semibold)
      for (n, tap) in taps.enumerated() {
        if case let .kb(ti, tj) = tap.1, ti == i, tj == j, abs(tap.0 - t) < 0.8, kb == keyboardAt(tap.0) { tapPoints[n] = CGPoint(x: kr.midX, y: kr.midY) }
      }
    }
  }
}

// пузырь сообщения; возвращает высоту
func bubbleHeight(_ m: Msg, width: CGFloat) -> CGFloat {
  if m.kind == .intro { return 300 }
  let s = rich(m.text)
  let h = textHeight(s, width: width - 44) + 34
  return h + CGFloat(m.buttons.count) * 72
}

func drawBubble(_ c: CGContext, _ m: Msg, _ r: CGRect, _ t: CGFloat) {
  let k = spring(span(t, m.at, m.at + 0.35))
  c.saveGState()
  let anchor = CGPoint(x: m.kind == .user ? r.maxX : r.minX, y: r.minY)
  c.translateBy(x: anchor.x, y: anchor.y)
  c.scaleBy(x: 0.6 + 0.4 * k, y: 0.6 + 0.4 * k)
  c.translateBy(x: -anchor.x, y: -anchor.y)
  c.setAlpha(clamp(k * 1.5))
  let textBox = CGRect(x: r.minX, y: r.minY + CGFloat(m.buttons.count) * 72, width: r.width, height: r.height - CGFloat(m.buttons.count) * 72)
  switch m.kind {
  case .user:
    roundRect(c, textBox, 26, fill: rgb(0x4a2d93))
  case .bot:
    roundRect(c, textBox, 26, fill: rgb(0x1a1a2b), stroke: rgb(0x2a2a44), width: 1.5)
  case .intro:
    roundRect(c, textBox, 26, fill: night, stroke: rgb(0x2a2a44), width: 1.5)
    c.saveGState()
    c.addPath(CGPath(roundedRect: textBox.insetBy(dx: 6, dy: 6), cornerWidth: 22, cornerHeight: 22, transform: nil))
    c.clip()
    let local = CGRect(x: textBox.minX, y: textBox.minY + 60, width: textBox.width, height: textBox.height - 60)
    glow(c, lime, at: CGPoint(x: local.midX, y: local.midY + 20), radius: 200, alpha: 0.25)
    // заставка: логотип выпрыгивает
    let s = spring(span(t, m.at + 0.1, m.at + 0.8))
    let side = 150 * (0.3 + 0.7 * s)
    logoImage.draw(in: CGRect(x: local.midX - side / 2, y: local.midY + 10 - side / 2 + 20, width: side, height: side))
    wordmark(c, size: 40, at: CGPoint(x: local.midX, y: local.minY + 8), align: "center", alpha: span(t, m.at + 0.5, m.at + 0.9), shine: false)
    c.restoreGState()
    text("💎 Kovrix — донать быстро, играй красиво", size: 22, weight: .semibold, at: CGPoint(x: textBox.minX + 22, y: textBox.minY + 18))
  }
  if m.kind != .intro {
    rich(m.text).draw(with: CGRect(x: textBox.minX + 22, y: textBox.minY + 16, width: textBox.width - 44, height: textBox.height - 32),
                      options: [.usesLineFragmentOrigin, .usesFontLeading])
  }
  // кнопки под сообщением
  for (i, row) in m.buttons.enumerated() {
    let y = r.minY + CGFloat(m.buttons.count - 1 - i) * 72
    let w = (r.width - CGFloat(row.count - 1) * 8) / CGFloat(row.count)
    for (j, b) in row.enumerated() {
      let br = CGRect(x: r.minX + CGFloat(j) * (w + 8), y: y + 6, width: w, height: 62)
      // в «Ещё» кнопки по очереди подсвечиваются
      let lit = m.id == more && t > m.at + 0.6 && Int((t - m.at - 0.6) / 0.4) % 6 == i * 2 + j
      roundRect(c, br, 16, fill: lit ? lime.withAlphaComponent(0.25) : NSColor(white: 1, alpha: 0.08), stroke: lit ? lime : nil, width: 2)
      label(b, in: br, size: 23, weight: .semibold)
      for (n, tap) in taps.enumerated() {
        if case let .inline(id, ti, tj) = tap.1, id == m.id, ti == i, tj == j { tapPoints[n] = CGPoint(x: br.midX, y: br.midY) }
      }
    }
  }
  c.restoreGState()
}

// окно заказа (сайт внутри Telegram)
func drawSheet(_ c: CGContext, _ t: CGFloat, _ area: CGRect) {
  let open = easeOut(span(t, sheetOpen, sheetOpen + 0.45)) * (1 - easeOut(span(t, sheetClose - 0.4, sheetClose)))
  guard open > 0 else { return }
  c.setFillColor(NSColor(white: 0, alpha: 0.55 * open).cgColor)
  c.fill(area)
  let h = area.height * 0.86
  let r = CGRect(x: area.minX, y: area.minY - h * (1 - open), width: area.width, height: h)
  roundRect(c, CGRect(x: r.minX, y: r.minY, width: r.width, height: r.height + 30), 34, fill: night)
  c.saveGState()
  c.addPath(CGPath(roundedRect: CGRect(x: r.minX, y: r.minY, width: r.width, height: r.height + 30), cornerWidth: 34, cornerHeight: 34, transform: nil))
  c.clip()
  glow(c, violet, at: CGPoint(x: r.minX, y: r.maxY), radius: 500, alpha: 0.35)
  c.restoreGState()
  roundRect(c, CGRect(x: r.midX - 40, y: r.maxY - 22, width: 80, height: 8), 4, fill: NSColor(white: 1, alpha: 0.3))
  // шапка
  logoImage.draw(in: CGRect(x: r.minX + 28, y: r.maxY - 104, width: 58, height: 58))
  wordmark(c, size: 34, at: CGPoint(x: r.minX + 100, y: r.maxY - 94), shine: false)
  text("Free Fire", size: 24, weight: .semibold, color: soft, at: CGPoint(x: r.minX + 104, y: r.maxY - 124))
  text("✕", size: 34, weight: .bold, color: soft, at: CGPoint(x: r.maxX - 36, y: r.maxY - 94), align: "right")
  var y = r.maxY - 170
  let x0 = r.minX + 28, fw = r.width - 56
  func field(_ title: String, _ value: String, active: Bool, ok: String? = nil, height: CGFloat = 76) {
    text(title.uppercased(), size: 19, weight: .heavy, color: NSColor(white: 0.6, alpha: 1), at: CGPoint(x: x0 + 4, y: y), kern: 1.2)
    y -= height + 8
    let fr = CGRect(x: x0, y: y, width: fw, height: height)
    roundRect(c, fr, 16, fill: cardColor, stroke: active ? lime : lineColor, width: active ? 2.5 : 1.5)
    text(value, size: 27, weight: .bold, at: CGPoint(x: fr.minX + 20, y: fr.midY - 17))
    if let ok = ok { text(ok, size: 23, weight: .heavy, color: rgb(0x2fe39a), at: CGPoint(x: fr.maxX - 20, y: fr.midY - 15), align: "right") }
    y -= 30
  }
  field("Пакет", "💎 110 алмазов · \(P110) смн", active: true)
  // Player ID печатается по буквам
  let id = "512884301"
  let typed = Int(span(t, 16.2, 17.4) * CGFloat(id.count))
  let caret = t > 16.0 && t < 17.7 && Int(t * 3) % 2 == 0 ? "|" : ""
  field("Player ID", String(id.prefix(typed)) + caret, active: t > 16.0 && t < 17.7, ok: typed == id.count ? "✓ найден" : nil)
  field("Промокод", t > 17.6 ? "DONIX10" : "", active: t > 17.6 && t < 18.6, ok: t > 18.1 ? "✓ −1 смн" : nil)
  text("ОПЛАТА", size: 19, weight: .heavy, color: NSColor(white: 0.6, alpha: 1), at: CGPoint(x: x0 + 4, y: y), kern: 1.2)
  y -= 84
  let methods = ["Алиф", "Visa", "Эсхата"]
  let mw = (fw - 16) / 3
  for (i, name) in methods.enumerated() {
    let mr = CGRect(x: x0 + CGFloat(i) * (mw + 8), y: y, width: mw, height: 76)
    let on = name == "Visa" && t > 18.9
    roundRect(c, mr, 16, fill: on ? lime.withAlphaComponent(0.18) : cardColor, stroke: on ? lime : lineColor, width: on ? 2.5 : 1.5)
    label(name, in: mr, size: 25, weight: .heavy, color: on ? lime : .white)
    if name == "Visa" { sheetPoints["visa"] = CGPoint(x: mr.midX, y: mr.midY) }
  }
  if t > 19.0 {
    text("Карта: 4444 8888 1655 0242", size: 22, weight: .semibold, color: soft, at: CGPoint(x: x0 + 4, y: y - 38), alpha: span(t, 19.0, 19.3))
  }
  y -= 70
  field("Чек об оплате", t > 19.5 ? "📎 чек.jpg" : "📎 Прикрепить", active: false, ok: t > 19.5 ? "✓" : nil)
  sheetPoints["promo"] = CGPoint(x: x0 + fw / 2, y: r.maxY - 170 - 3 * (76 + 38) + 40)
  // итог и кнопка
  let promoOn = t > 18.1
  let total = promoOn ? "Итого: **9 смн** ~~\(P110)~~" : "Итого: **\(P110) смн**"
  rich(total, size: 30).draw(at: CGPoint(x: x0 + 4, y: r.minY + 150))
  let br = CGRect(x: x0, y: r.minY + 40, width: fw, height: 92)
  roundRect(c, br, 18, fill: lime)
  label(t > 20.35 ? "✅ ЗАКАЗ ОТПРАВЛЕН" : "ОТПРАВИТЬ ЗАКАЗ", in: br, size: 30, weight: .black, color: ink)
  sheetPoints["pay"] = CGPoint(x: br.midX, y: br.midY)
}
var sheetPoints: [String: CGPoint] = [:]

// пуш-уведомление сверху экрана
func drawPush(_ c: CGContext, _ t: CGFloat, _ s: CGRect) {
  let k = spring(span(t, pushAt, pushAt + 0.5)) * (1 - easeOut(span(t, pushAt + 2.6, pushAt + 3.0)))
  guard k > 0 else { return }
  let r = CGRect(x: s.minX + 16, y: s.maxY - 20 - 150 + (1 - k) * 200, width: s.width - 32, height: 150)
  c.saveGState()
  c.setShadow(offset: CGSize(width: 0, height: -8), blur: 24, color: NSColor(white: 0, alpha: 0.7).cgColor)
  roundRect(c, r, 30, fill: rgb(0x23233a, 0.97))
  c.restoreGState()
  roundRect(c, r, 30, stroke: lime.withAlphaComponent(0.6), width: 2)
  logoImage.draw(in: CGRect(x: r.minX + 20, y: r.maxY - 82, width: 58, height: 58))
  text("Kovrix", size: 24, weight: .heavy, at: CGPoint(x: r.minX + 94, y: r.maxY - 56))
  text("сейчас", size: 20, weight: .medium, color: soft, at: CGPoint(x: r.maxX - 22, y: r.maxY - 54), align: "right")
  rich("✅ Заказ **\(ORDER)**: 110 алмазов —\nдонат зачислен ✅", size: 24).draw(with: CGRect(x: r.minX + 94, y: r.minY + 14, width: r.width - 120, height: 80), options: [.usesLineFragmentOrigin])
}

func drawScreen(_ c: CGContext, _ t: CGFloat) {
  let s = screenRect
  c.saveGState()
  c.addPath(CGPath(roundedRect: s, cornerWidth: 70, cornerHeight: 70, transform: nil))
  c.clip()
  // обои чата
  c.setFillColor(rgb(0x0b0b13).cgColor)
  c.fill(s)
  glow(c, violet, at: CGPoint(x: s.minX, y: s.maxY - 300), radius: 600, alpha: 0.18)
  c.setFillColor(NSColor(white: 1, alpha: 0.025).cgColor)
  for gy in stride(from: s.minY, to: s.maxY, by: 46) {
    for gx in stride(from: s.minX + (Int(gy) % 92 == 0 ? 0 : 23), to: s.maxX, by: 46) { c.fillEllipse(in: CGRect(x: gx, y: gy, width: 5, height: 5)) }
  }

  let kb = keyboardAt(t)
  let kbH = keyboardHeight(kb)
  let kbRect = CGRect(x: s.minX, y: s.minY, width: s.width, height: kbH + 30)
  let inputRect = CGRect(x: s.minX, y: kbRect.maxY, width: s.width, height: inputH)
  let top = s.maxY - statusH - barH
  let chat = CGRect(x: s.minX, y: inputRect.maxY, width: s.width, height: top - inputRect.maxY)

  // сообщения: снизу вверх, старые уезжают вверх
  c.saveGState()
  c.clip(to: chat)
  var y = chat.minY + 16
  let shown = msgs.filter { $0.at <= t }.reversed()
  // плавный «доезд» ленты при новом сообщении
  if let last = shown.first {
    let k = easeOut(span(t, last.at, last.at + 0.3))
    y -= (1 - k) * (bubbleHeight(last, width: s.width * 0.8) + 14)
  }
  for m in shown {
    let w: CGFloat = m.kind == .user ? min(s.width * 0.72, rich(m.text).size().width + 44) : s.width * 0.8
    let h = bubbleHeight(m, width: w)
    let x = m.kind == .user ? s.maxX - 18 - w : s.minX + 18
    if y > chat.maxY { break }
    drawBubble(c, m, CGRect(x: x, y: y, width: w, height: h), t)
    y += h + 14
  }
  c.restoreGState()

  // поле ввода
  c.setFillColor(rgb(0x101019).cgColor)
  c.fill(inputRect)
  roundRect(c, CGRect(x: s.minX + 16, y: inputRect.minY + 16, width: 104, height: 60), 30, fill: lime)
  label("Сайт", in: CGRect(x: s.minX + 16, y: inputRect.minY + 16, width: 104, height: 60), size: 23, weight: .heavy, color: ink)
  let typing = t > 33.6 && t < 34.4
  let draft = typing ? String("Можно оплатить через Алиф?".prefix(Int(span(t, 33.6, 34.3) * 26))) : ""
  roundRect(c, CGRect(x: s.minX + 134, y: inputRect.minY + 16, width: s.width - 222, height: 60), 30, fill: rgb(0x1c1c2c))
  text(draft.isEmpty ? "Сообщение" : draft, size: 24, weight: .regular, color: draft.isEmpty ? NSColor(white: 0.5, alpha: 1) : .white,
       at: CGPoint(x: s.minX + 158, y: inputRect.minY + 30))
  text(typing ? "➤" : "🎙", size: 30, at: CGPoint(x: s.maxX - 46, y: inputRect.minY + 26), align: "center")
  drawKeyboard(c, kb, kbRect, t)

  // шапка чата
  let bar = CGRect(x: s.minX, y: top, width: s.width, height: barH + statusH)
  c.setFillColor(rgb(0x12121d).cgColor)
  c.fill(bar)
  c.setFillColor(lineColor.cgColor)
  c.fill(CGRect(x: s.minX, y: top, width: s.width, height: 1.5))
  text("9:41", size: 24, weight: .bold, at: CGPoint(x: s.minX + 70, y: s.maxY - 44))
  text("▂▄▆  📶  🔋", size: 18, weight: .bold, at: CGPoint(x: s.maxX - 60, y: s.maxY - 42), align: "right")
  text("‹", size: 54, weight: .regular, color: lime, at: CGPoint(x: s.minX + 22, y: top + 18))
  logoImage.draw(in: CGRect(x: s.minX + 62, y: top + 18, width: 68, height: 68))
  text("Kovrix", size: 29, weight: .heavy, at: CGPoint(x: s.minX + 146, y: top + 50))
  text("бот · @Kovrixtj_bot", size: 21, weight: .medium, color: NSColor(white: 0.6, alpha: 1), at: CGPoint(x: s.minX + 146, y: top + 20))

  drawSheet(c, t, CGRect(x: s.minX, y: s.minY, width: s.width, height: top - s.minY))
  drawPush(c, t, s)

  // касания пальцем: круг, расходящийся от кнопки
  for (n, tap) in taps.enumerated() {
    let d = t - tap.0
    guard d > -0.25, d < 0.45 else { continue }
    var p: CGPoint? = tapPoints[n]
    if case let .sheet(name) = tap.1 { p = sheetPoints[name] }
    guard let at = p else { continue }
    let k = clamp((d + 0.25) / 0.7)
    let r = 30 + 50 * k
    c.setFillColor(NSColor(white: 1, alpha: 0.35 * (1 - k)).cgColor)
    c.fillEllipse(in: CGRect(x: at.x - r, y: at.y - r, width: r * 2, height: r * 2))
    c.setFillColor(NSColor(white: 1, alpha: d < 0.1 ? 0.55 : 0.55 * (1 - k)).cgColor)
    c.fillEllipse(in: CGRect(x: at.x - 26, y: at.y - 26, width: 52, height: 52))
  }
  c.restoreGState()
}

func drawPhone(_ c: CGContext, _ t: CGFloat) {
  // корпус: тёмный, с переливом по краю
  c.saveGState()
  c.setShadow(offset: CGSize(width: 0, height: -30), blur: 60, color: NSColor(white: 0, alpha: 0.8).cgColor)
  roundRect(c, phone, 88, fill: rgb(0x15151f))
  c.restoreGState()
  c.saveGState()
  c.addPath(CGPath(roundedRect: phone, cornerWidth: 88, cornerHeight: 88, transform: nil))
  c.setLineWidth(6)
  c.replacePathWithStrokedPath()
  c.clip()
  c.drawLinearGradient(gradient([violetLight, rgb(0x2a2a40), lime]), start: CGPoint(x: phone.minX, y: phone.maxY), end: CGPoint(x: phone.maxX, y: phone.minY), options: [])
  c.restoreGState()
  drawScreen(c, t)
  // «островок» камеры
  roundRect(c, CGRect(x: phone.midX - 90, y: screenRect.maxY - 46, width: 180, height: 36), 18, fill: .black)
}

func frame(_ c: CGContext, _ t: CGFloat) {
  stage(c, t, width: W, height: H)
  let cx = W / 2

  if t < phoneIn + 0.6 {
    // вступление: логотип, название, «бот в Telegram»
    let fade = 1 - span(t, phoneIn - 0.2, phoneIn + 0.3)
    c.saveGState()
    c.setAlpha(fade)
    let s = spring(span(t, 0.1, 0.9))
    c.saveGState()
    c.translateBy(x: cx, y: 1230)
    c.rotate(by: (1 - s) * 0.5)
    c.scaleBy(x: 0.2 + 0.8 * s, y: 0.2 + 0.8 * s)
    gem(c, center: .zero, width: 520, halo: 0.6)
    c.restoreGState()
    let w = easeOut(span(t, 0.8, 1.3))
    wordmark(c, size: 160, at: CGPoint(x: cx, y: 700 - (1 - w) * 50), align: "center", alpha: w)
    text("Бот в Telegram", size: 64, weight: .heavy, at: CGPoint(x: cx, y: 590), align: "center", alpha: span(t, 1.2, 1.6))
    text("Всё — в одном чате. Смотри 👇", size: 46, weight: .bold, color: soft, at: CGPoint(x: cx, y: 510), align: "center", alpha: span(t, 1.6, 2.0))
    c.restoreGState()
  }

  if t >= phoneIn && t < outro + 0.6 {
    // телефон выезжает снизу, в конце уезжает вниз
    let inK = easeOut(span(t, phoneIn, phoneIn + 0.7))
    let outK = easeOut(span(t, outro - 0.1, outro + 0.5))
    c.saveGState()
    c.translateBy(x: 0, y: -(1 - inK) * 1600 - outK * 1700)
    drawPhone(c, t)
    c.restoreGState()

    // подпись над телефоном
    for (i, cap) in captions.enumerated() where t >= cap.from - 0.1 && t < cap.to + 0.1 {
      let k = easeOut(span(t, cap.from, cap.from + 0.4)) * (1 - span(t, cap.to - 0.25, cap.to))
      let dy = (1 - k) * 40
      let chip = CGRect(x: cx - 70, y: 1820 + dy, width: 140, height: 50)
      c.saveGState()
      c.setAlpha(k)
      roundRect(c, chip, 25, fill: lime)
      label("\(i + 1) / \(captions.count)", in: chip, size: 26, weight: .black, color: ink)
      c.restoreGState()
      text(cap.title, size: 72, weight: .black, at: CGPoint(x: cx, y: 1700 + dy), align: "center", alpha: k)
      text(cap.sub, size: 40, weight: .bold, color: soft, at: CGPoint(x: cx, y: 1630 + dy), align: "center", alpha: k)
    }
  }

  if t >= outro {
    // финал: логотип и кнопка бота
    let a = t - outro
    let s = spring(span(a, 0.2, 0.9))
    let pulse = 1 + 0.03 * sin(a * 2 * .pi * 2)
    c.saveGState()
    c.translateBy(x: cx, y: 1380)
    c.scaleBy(x: max(0.01, (0.3 + 0.7 * s) * pulse), y: max(0.01, (0.3 + 0.7 * s) * pulse))
    c.setAlpha(clamp(s * 2))
    gem(c, center: .zero, width: 520, halo: 0.6)
    c.restoreGState()
    let w = easeOut(span(a, 0.5, 0.9))
    wordmark(c, size: 160, at: CGPoint(x: cx, y: 830 - (1 - w) * 50), align: "center", alpha: w)
    text("Открой бота и нажми /start", size: 50, weight: .heavy, color: soft, at: CGPoint(x: cx, y: 740), align: "center", alpha: span(a, 0.7, 1.1))
    let b = spring(span(a, 0.9, 1.5))
    pill(c, "@Kovrixtj_bot", center: CGPoint(x: cx, y: 520), height: 150, scale: max(0.01, b) * (1 + 0.04 * sin(a * 2 * .pi * 2)), alpha: clamp(b * 2))
    text("kovrixtj.web.app", size: 50, weight: .bold, color: violetLight, at: CGPoint(x: cx, y: 340), align: "center", alpha: span(a, 1.3, 1.7))
  }

  flashes(c, t, cuts: [phoneIn, outro], seconds: CGFloat(DURATION), width: W, height: H)
}

let silent = "\(outDir)/.bot-video-tmp.mov"
renderVideo(silent, width: Int(W), height: Int(H), seconds: DURATION, draw: frame)

// ——— звук ———
let mix = Mixer(seconds: DURATION)
mix.riser(0, Double(phoneIn))
mix.chime(0.1, 1318.5, pan: -0.3)
mix.chime(0.85, 1760, pan: 0.3)
mix.chime(1.25, 2093, pan: 0.3)
mix.beat(from: Double(phoneIn), to: Double(outro), soft: true)
mix.beat(from: Double(outro), to: DURATION - 0.3)
mix.whoosh(Double(phoneIn))
mix.whoosh(Double(outro))
mix.boom(Double(outro))
for tap in taps { mix.tap(Double(tap.0)) }
for m in msgs where m.kind != .user { mix.pop(Double(m.at)) }
mix.coin(20.35)
mix.coin(Double(pushAt) + 0.1)
let audio = "\(outDir)/.bot-audio-tmp.wav"
mix.wav(audio)
mux(video: silent, audio: audio, output: output, seconds: DURATION)
