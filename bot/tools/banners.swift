// Фоны (баннеры) экранов бота: bot/assets/banners/<имя>.jpg, 1280×720.
// Стиль — как аватарка бота: ночной фон, неон оранжевый слева и синий справа.
// Запуск: swift bot/tools/banners.swift  (только macOS, без зависимостей)
import AppKit

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let out = root.appendingPathComponent("assets/banners")
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
let logo = NSImage(contentsOf: root.appendingPathComponent("avatar.jpg"))!

let W: CGFloat = 1280, H: CGFloat = 720
let orange = NSColor(red: 1, green: 0.55, blue: 0.05, alpha: 1)
let blue = NSColor(red: 0.1, green: 0.6, blue: 1, alpha: 1)

// имя файла, значок, заголовок, подпись
let screens: [(String, String, String, String)] = [
  ("home", "👑", "KOVRIX", "Донать быстро — играй красиво"),
  ("register", "📝", "Регистрация", "ID и код для входа — за 10 секунд"),
  ("profile", "👤", "Мой профиль", "ID, код и вход на сайт"),
  ("orders", "📦", "Мои заказы", "Статус каждого доната и аккаунта"),
  ("download", "📲", "Приложение", "Android · iPhone · Windows · Mac"),
  ("gift", "🎁", "Подарок", "Звёзды Telegram или перевод на карту"),
  ("invite", "👥", "Пригласи друга", "Друзья по ссылке — награда тебе"),
  ("help", "💬", "Помощь", "Ответы на частые вопросы"),
  ("staff", "🛠", "Команда", "Заявки, статистика, KovriX A"),
  ("update", "🔄", "Обновление", "Новая версия Kovrix уже здесь"),
  ("news", "📢", "Новости", "Свежее от команды Kovrix"),
]

func glow(_ ctx: CGContext, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ c: NSColor, _ a: CGFloat) {
  let colors = [c.withAlphaComponent(a).cgColor, c.withAlphaComponent(0).cgColor] as CFArray
  let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
  ctx.drawRadialGradient(g, startCenter: CGPoint(x: x, y: y), startRadius: 0, endCenter: CGPoint(x: x, y: y), endRadius: r, options: [])
}

func draw(_ icon: String, _ title: String, _ subtitle: String) -> NSBitmapImageRep {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H), bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                             bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let ctx = NSGraphicsContext.current!.cgContext

  // ночной фон
  let bg = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [
    NSColor(red: 0.02, green: 0.03, blue: 0.08, alpha: 1).cgColor,
    NSColor(red: 0.05, green: 0.07, blue: 0.19, alpha: 1).cgColor,
  ] as CFArray, locations: [0, 1])!
  ctx.drawLinearGradient(bg, start: CGPoint(x: 0, y: 0), end: CGPoint(x: W, y: H), options: [])

  // сетка точек
  NSColor(white: 1, alpha: 0.05).setFill()
  for gx in stride(from: CGFloat(20), to: W, by: 40) {
    for gy in stride(from: CGFloat(20), to: H, by: 40) {
      NSBezierPath(ovalIn: NSRect(x: gx, y: gy, width: 3, height: 3)).fill()
    }
  }

  glow(ctx, 260, 360, 560, orange, 0.55)
  glow(ctx, 1180, 620, 620, blue, 0.5)
  glow(ctx, 900, 0, 420, NSColor(red: 0.5, green: 0.2, blue: 1, alpha: 1), 0.25)

  // неоновые полосы по диагонали
  func streak(_ x: CGFloat, _ c: NSColor, _ w: CGFloat, _ a: CGFloat) {
    ctx.saveGState()
    ctx.setShadow(offset: .zero, blur: 18, color: c.cgColor)
    ctx.setStrokeColor(c.withAlphaComponent(a).cgColor)
    ctx.setLineWidth(w)
    ctx.move(to: CGPoint(x: x, y: -20))
    ctx.addLine(to: CGPoint(x: x + 420, y: H + 20))
    ctx.strokePath()
    ctx.restoreGState()
  }
  streak(-220, orange, 4, 0.8)
  streak(-170, orange, 1.5, 0.5)
  streak(860, blue, 4, 0.8)
  streak(915, blue, 1.5, 0.5)
  streak(1010, blue, 1, 0.35)

  // логотип в светящейся рамке
  let box = NSRect(x: 80, y: (H - 400) / 2, width: 400, height: 400)
  ctx.saveGState()
  ctx.setShadow(offset: .zero, blur: 60, color: orange.withAlphaComponent(0.9).cgColor)
  NSColor.black.setFill()
  NSBezierPath(roundedRect: box, xRadius: 64, yRadius: 64).fill()
  ctx.restoreGState()
  ctx.saveGState()
  NSBezierPath(roundedRect: box, xRadius: 64, yRadius: 64).addClip()
  logo.draw(in: box)
  ctx.restoreGState()

  // текст справа
  let left: CGFloat = 540, width = W - left - 60
  func text(_ s: String, _ font: NSFont, _ color: NSColor, _ y: CGFloat, kern: CGFloat = 0, shadow: NSColor? = nil) {
    let p = NSMutableParagraphStyle()
    p.lineBreakMode = .byTruncatingTail
    var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .kern: kern, .paragraphStyle: p]
    if let shadow {
      let sh = NSShadow()
      sh.shadowColor = shadow
      sh.shadowBlurRadius = 24
      attrs[.shadow] = sh
    }
    NSAttributedString(string: s, attributes: attrs).draw(in: NSRect(x: left, y: y, width: width, height: font.pointSize * 1.4))
  }
  // заголовок уменьшается, пока не влезет
  var size: CGFloat = 92
  while size > 40 {
    let w = NSAttributedString(string: title, attributes: [.font: NSFont.systemFont(ofSize: size, weight: .black)]).size().width
    if w <= width { break }
    size -= 4
  }
  text(icon, NSFont.systemFont(ofSize: 72), .white, 420)
  // на главном заголовок и так KOVRIX — сверху вместо него слоган
  text(title == "KOVRIX" ? "ДОНАТ · АККАУНТЫ · 24/7" : "KOVRIX", NSFont.systemFont(ofSize: 26, weight: .heavy), orange, 382, kern: 8)
  text(title, NSFont.systemFont(ofSize: size, weight: .black), .white, 382 - size * 1.3, shadow: blue)
  text(subtitle, NSFont.systemFont(ofSize: 32, weight: .semibold), NSColor(red: 0.75, green: 0.82, blue: 1, alpha: 1), 382 - size * 1.3 - 58)

  // полоса снизу: оранжевый → синий
  let bar = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [orange.cgColor, blue.cgColor] as CFArray, locations: [0, 1])!
  ctx.saveGState()
  ctx.addPath(CGPath(roundedRect: CGRect(x: left, y: 150, width: 260, height: 8), cornerWidth: 4, cornerHeight: 4, transform: nil))
  ctx.clip()
  ctx.drawLinearGradient(bar, start: CGPoint(x: left, y: 0), end: CGPoint(x: left + 260, y: 0), options: [])
  ctx.restoreGState()

  NSGraphicsContext.restoreGraphicsState()
  return rep
}

for (name, icon, title, subtitle) in screens {
  let data = draw(icon, title, subtitle).representation(using: .jpeg, properties: [.compressionFactor: 0.88])!
  try! data.write(to: out.appendingPathComponent("\(name).jpg"))
  print("\(name).jpg")
}
