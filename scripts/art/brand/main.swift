// Логотип KovriX и всё, что из него делается: значки Android (клиент и
// KovriX A), iOS, сайта, аватар бота, картинки Google Play, обложки игр
// и реклама в ads/кибер/.
//   bash scripts/art.sh brand            — всё сразу
//   bash scripts/art.sh brand preview    — только builds/brand/ для просмотра
import AppKit

let previewOnly = CommandLine.arguments.dropFirst().first == "preview"

// ——— файлы ———
let preview = "builds/brand"
save(canvas(1024, 1024) { badge($0, 1024) }, "\(preview)/logo-1024.png")
save(canvas(1024, 1024) { appIcon($0, 1024, colors: userGem, admin: false) }, "\(preview)/icon-1024.png")
save(canvas(1024, 1024) { appIcon($0, 1024, colors: adminGem, admin: true) }, "\(preview)/icon-admin-1024.png")
if previewOnly { exit(0) }

// значок Android: передний план (алмаз в безопасной зоне 66 из 108 dp),
// фон и одноцветный вариант для тем Android 13
func androidSet(_ res: String, colors g: Gem, admin: Bool) {
  let dens: [(String, CGFloat)] = [("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)]
  for (name, k) in dens {
    let dir = "\(res)/mipmap-\(name)"
    let big = Int(108 * k), small = Int(48 * k)
    let B = CGFloat(big)
    save(canvas(big, big) { c in
      gem(c, center: CGPoint(x: B / 2, y: B * 0.56), width: B * 0.44, colors: g)
      if admin {
        c.saveGState()
        c.translateBy(x: B * 0.13, y: B * 0.15)
        c.scaleBy(x: 0.6, y: 0.6)
        adminMark(c, B)
        c.restoreGState()
      }
    }, "\(dir)/ic_launcher_foreground.png")
    save(canvas(big, big) { backdrop($0, CGRect(x: 0, y: 0, width: B, height: B), accent: g.mid) }, "\(dir)/ic_launcher_background.png")
    save(canvas(big, big) { c in
      let w = B * 0.44, o = CGPoint(x: B / 2, y: B * 0.56)
      let P = { (x: CGFloat, y: CGFloat) in CGPoint(x: o.x + x * w, y: o.y + y * w) }
      poly(c, [P(-0.27, 0.27), P(0.27, 0.27), P(0.5, 0.04), P(0, -0.62), P(-0.5, 0.04)], fill: .white)
      c.setBlendMode(.clear)
      let font = NSFont.systemFont(ofSize: w * 0.62, weight: .black)
      let str = NSAttributedString(string: "K", attributes: [.font: font, .foregroundColor: NSColor.black])
      let s = str.size()
      str.draw(at: CGPoint(x: o.x - s.width / 2, y: o.y - w * 0.05 - s.height / 2 + font.descender * -0.5))
    }, "\(dir)/ic_launcher_monochrome.png")
    let S = CGFloat(small)
    save(canvas(small, small) { c in
      c.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: S, height: S), cornerWidth: S * 0.22, cornerHeight: S * 0.22, transform: nil))
      c.clip()
      appIcon(c, S, colors: g, admin: admin)
    }, "\(dir)/ic_launcher.png")
    save(canvas(small, small) { c in
      c.addEllipse(in: CGRect(x: 0, y: 0, width: S, height: S))
      c.clip()
      appIcon(c, S, colors: g, admin: admin)
    }, "\(dir)/ic_launcher_round.png")
  }
}

// iOS не принимает значок 1024 с прозрачностью — сохраняем без альфы
func opaque(_ rep: NSBitmapImageRep, _ path: String) {
  let flat = canvas(rep.pixelsWide, rep.pixelsHigh) { c in
    c.setFillColor(night.cgColor)
    c.fill(CGRect(x: 0, y: 0, width: rep.pixelsWide, height: rep.pixelsHigh))
    c.draw(rep.cgImage!, in: CGRect(x: 0, y: 0, width: rep.pixelsWide, height: rep.pixelsHigh))
  }
  let jpg = flat.representation(using: .jpeg, properties: [.compressionFactor: 1])!
  let png = NSBitmapImageRep(data: jpg)!.representation(using: .png, properties: [:])!
  try! png.write(to: URL(fileURLWithPath: path))
  print(path)
}

func iosSet(_ dir: String, colors g: Gem, admin: Bool) {
  let sizes: [(String, Int)] = [("20@2x", 40), ("20@3x", 60), ("29@2x", 58), ("29@3x", 87), ("40@2x", 80),
                                ("40@3x", 120), ("60@2x", 120), ("60@3x", 180), ("1024", 1024)]
  for (name, px) in sizes {
    opaque(canvas(px, px) { appIcon($0, CGFloat(px), colors: g, admin: admin) }, "\(dir)/AppIcon-\(name).png")
  }
}

androidSet("android/app/src/main/res", colors: userGem, admin: false)
// у клиентской сборки свои значки (src/user/res) — они главнее main
androidSet("android/app/src/user/res", colors: userGem, admin: false)
androidSet("android/app/src/admin/res", colors: adminGem, admin: true)
let xcassets = (try! fm.contentsOfDirectory(atPath: "ios")).map { "ios/\($0)/Images.xcassets" }.first { fm.fileExists(atPath: $0) }!
iosSet("\(xcassets)/AppIcon.appiconset", colors: userGem, admin: false)
iosSet("\(xcassets)/AppIconAdmin.appiconset", colors: adminGem, admin: true)

// логотип в приложении и на сайте, значки сайта
let logo = canvas(480, 480) { badge($0, 480) }
save(logo, "src/shared/assets/logo.png")
save(logo, "web/shared/logo.png")
for (name, px, g, admin) in [("icon-192", 192, userGem, false), ("icon-512", 512, userGem, false),
                             ("icon-admin-192", 192, adminGem, true), ("icon-admin-512", 512, adminGem, true),
                             ("apple-touch-icon", 180, userGem, false), ("apple-touch-icon-admin", 180, adminGem, true)] {
  opaque(canvas(px, px) { appIcon($0, CGFloat(px), colors: g, admin: admin) }, "web/shared/\(name).png")
}
// maskable: телефон сам режет край, алмаз — в середине
for px in [192, 512] {
  let P = CGFloat(px)
  opaque(canvas(px, px) { c in
    backdrop(c, CGRect(x: 0, y: 0, width: P, height: P))
    gem(c, center: CGPoint(x: P / 2, y: P * 0.56), width: P * 0.44, colors: userGem)
  }, "web/shared/icon-\(px)-maskable.png")
}
for (name, g, admin) in [("favicon", userGem, false), ("favicon-admin", adminGem, true)] {
  save(canvas(64, 64) { c in
    if admin { appIcon(c, 64, colors: g, admin: true) } else {
      gem(c, center: CGPoint(x: 32, y: 40), width: 58, colors: g)
    }
  }, "builds/brand/\(name)-64.png")
  let sips = Process()
  sips.executableURL = URL(fileURLWithPath: "/usr/bin/sips")
  sips.arguments = ["-z", "32", "32", "-s", "format", "ico", "builds/brand/\(name)-64.png", "--out", "web/shared/\(name).ico"]
  sips.standardOutput = FileHandle.nullDevice
  try! sips.run()
  sips.waitUntilExit()
}

// аватар бота (Telegram сам делает круг)
let avatar = canvas(640, 640) { c in
  backdrop(c, CGRect(x: 0, y: 0, width: 640, height: 640), grid: false)
  gem(c, center: CGPoint(x: 320, y: 372), width: 400, colors: userGem)
}
save(avatar, "bot/avatar.jpg", jpeg: true)
save(avatar, "bot/assets/avatar.jpg", jpeg: true)

// ——— Google Play ———
opaque(canvas(512, 512) { appIcon($0, 512, colors: userGem, admin: false) }, "builds/play/icon-512.png")
save(canvas(1024, 500) { c in
  backdrop(c, CGRect(x: 0, y: 0, width: 1024, height: 500))
  gem(c, center: CGPoint(x: 230, y: 290), width: 300, colors: userGem)
  wordmark(c, size: 112, at: CGPoint(x: 420, y: 250))
  _ = text("Донат в игры", size: 46, weight: .heavy, color: lime, at: CGPoint(x: 426, y: 180))
  _ = text("💎 Алмазы · 🎟 Ваучеры · 🎫 Пропуск", size: 30, weight: .semibold, color: NSColor(white: 0.88, alpha: 1), at: CGPoint(x: 428, y: 118))
  _ = text("🏷 Промокод каждый день", size: 30, weight: .semibold, color: NSColor(white: 0.88, alpha: 1), at: CGPoint(x: 428, y: 70))
}, "builds/play/feature-1024x500.jpg", jpeg: true)

// ——— реклама: ads/кибер/ ———
let ads = "ads/кибер"

// карточка со строками «товар — цена»
func priceCard(_ c: CGContext, _ rect: CGRect, rows: [(String, String)]) {
  c.addPath(CGPath(roundedRect: rect, cornerWidth: 36, cornerHeight: 36, transform: nil))
  c.setFillColor(rgb(0x12121c, 0.92).cgColor)
  c.fillPath()
  c.addPath(CGPath(roundedRect: rect, cornerWidth: 36, cornerHeight: 36, transform: nil))
  c.setStrokeColor(rgb(0x2c2c48).cgColor)
  c.setLineWidth(3)
  c.strokePath()
  let rowH = rect.height / CGFloat(rows.count)
  for (i, row) in rows.enumerated() {
    let y = rect.maxY - rowH * CGFloat(i) - rowH / 2 - 26
    _ = text(row.0, size: 46, weight: .bold, at: CGPoint(x: rect.minX + 44, y: y))
    _ = text("\(row.1) смн", size: 50, weight: .black, color: lime, at: CGPoint(x: rect.maxX - 44, y: y), align: "right")
    if i > 0 {
      c.setFillColor(rgb(0x23233a).cgColor)
      c.fill(CGRect(x: rect.minX + 40, y: rect.maxY - rowH * CGFloat(i) - 1.5, width: rect.width - 80, height: 3))
    }
  }
}

func header(_ c: CGContext, _ W: CGFloat, top: CGFloat) {
  gem(c, center: CGPoint(x: 112, y: top - 40), width: 96, colors: userGem)
  wordmark(c, size: 58, at: CGPoint(x: 182, y: top - 76))
}

// 1. алмазы, пост 1:1
save(canvas(1080, 1080) { c in
  backdrop(c, CGRect(x: 0, y: 0, width: 1080, height: 1080))
  header(c, 1080, top: 1010)
  _ = text("АЛМАЗЫ", size: 140, at: CGPoint(x: 70, y: 770))
  _ = text("Free Fire — быстро и честно", size: 44, weight: .bold, color: soft, at: CGPoint(x: 76, y: 712))
  gem(c, center: CGPoint(x: 950, y: 850), width: 170, colors: userGem, letter: false)
  priceCard(c, CGRect(x: 70, y: 250, width: 940, height: 420), rows: [
    ("💎 110", price("110 алмазов")), ("💎 341", price("341 алмаз")),
    ("💎 572", price("572 алмаза")), ("💎 1166", price("1166 алмазов"))])
  _ = text("🏷 По промокоду дня — ещё дешевле", size: 40, weight: .heavy, color: violetLight, at: CGPoint(x: 540, y: 175), align: "center")
  pill(c, "@Kovrixtj_bot", center: CGPoint(x: 540, y: 95), height: 96)
}, "\(ads)/1-алмазы-пост.png")

// 2. ваучеры и пропуск, пост 1:1
save(canvas(1080, 1080) { c in
  backdrop(c, CGRect(x: 0, y: 0, width: 1080, height: 1080))
  header(c, 1080, top: 1010)
  _ = text("ВАУЧЕРЫ", size: 120, at: CGPoint(x: 70, y: 790))
  _ = text("И ПРОПУСК", size: 120, color: lime, at: CGPoint(x: 70, y: 660))
  priceCard(c, CGRect(x: 70, y: 230, width: 940, height: 400), rows: [
    ("🎟 Неделя Лайт", price("Ваучер на неделю Лайт")), ("🎟 Неделя", price("Ваучер на неделю")),
    ("🎟 Месяц", price("Ваучер на месяц")), ("🎫 Пропуск 6 LVL", price("Пропуск прокачки 6 LVL"))])
  _ = text("Подтверждение — в течение дня", size: 38, weight: .bold, color: soft, at: CGPoint(x: 540, y: 160), align: "center")
  pill(c, "Заказать в KOVRIX", center: CGPoint(x: 540, y: 85), height: 92)
}, "\(ads)/2-ваучеры-пропуск-пост.png")

// 3. как заказать, сторис 9:16
save(canvas(1080, 1920) { c in
  backdrop(c, CGRect(x: 0, y: 0, width: 1080, height: 1920))
  gem(c, center: CGPoint(x: 540, y: 1520), width: 470, colors: userGem)
  wordmark(c, size: 150, at: CGPoint(x: 540, y: 1060), align: "center")
  _ = text("Донать быстро — играй красиво", size: 50, weight: .heavy, color: soft, at: CGPoint(x: 540, y: 990), align: "center")
  let steps = ["Выбери алмазы, ваучер или пропуск", "Введи промокод дня — будет дешевле", "Оплати картой и пришли чек"]
  for (i, step) in steps.enumerated() {
    let y = CGFloat(800 - i * 150)
    c.setFillColor(lime.cgColor)
    c.fillEllipse(in: CGRect(x: 90, y: y - 10, width: 96, height: 96))
    _ = text("\(i + 1)", size: 58, color: ink, at: CGPoint(x: 138, y: y + 2), align: "center")
    _ = text(step, size: 44, weight: .bold, at: CGPoint(x: 216, y: y + 12))
  }
  pill(c, "@Kovrixtj_bot", center: CGPoint(x: 540, y: 270), height: 130)
  _ = text("kovrixtj.web.app", size: 44, weight: .bold, color: violetLight, at: CGPoint(x: 540, y: 140), align: "center")
}, "\(ads)/3-как-заказать-сторис.png")

// 4. промокод дня, сторис 9:16
save(canvas(1080, 1920) { c in
  backdrop(c, CGRect(x: 0, y: 0, width: 1080, height: 1920))
  header(c, 1080, top: 1840)
  _ = text("ПРОМОКОД", size: 170, at: CGPoint(x: 540, y: 1420), align: "center")
  _ = text("ДНЯ", size: 230, color: lime, at: CGPoint(x: 540, y: 1150), align: "center")
  // билет
  let t = CGRect(x: 140, y: 720, width: 800, height: 300)
  c.saveGState()
  c.translateBy(x: t.midX, y: t.midY)
  c.rotate(by: -0.06)
  let r = CGRect(x: -t.width / 2, y: -t.height / 2, width: t.width, height: t.height)
  glow(c, violet, at: .zero, radius: 520, alpha: 0.6)
  c.addPath(CGPath(roundedRect: r, cornerWidth: 40, cornerHeight: 40, transform: nil))
  c.setFillColor(violet.cgColor)
  c.fillPath()
  c.setStrokeColor(NSColor(white: 1, alpha: 0.5).cgColor)
  c.setLineWidth(6)
  c.setLineDash(phase: 0, lengths: [24, 16])
  c.stroke(r.insetBy(dx: 26, dy: 26))
  c.setLineDash(phase: 0, lengths: [])
  _ = text("🏷  • • • • • •", size: 96, at: CGPoint(x: 0, y: -60), align: "center")
  c.restoreGState()
  _ = text("Каждый день — новый код", size: 56, weight: .heavy, at: CGPoint(x: 540, y: 560), align: "center")
  _ = text("и цены ниже обычных", size: 56, weight: .heavy, color: soft, at: CGPoint(x: 540, y: 485), align: "center")
  _ = text("Код — в боте, кнопка «🏷 Промокод»", size: 42, weight: .bold, color: violetLight, at: CGPoint(x: 540, y: 380), align: "center")
  pill(c, "@Kovrixtj_bot", center: CGPoint(x: 540, y: 220), height: 130)
}, "\(ads)/4-промокод-дня-сторис.png")

// 5. мини-игры, пост 4:5
save(canvas(1080, 1350) { c in
  backdrop(c, CGRect(x: 0, y: 0, width: 1080, height: 1350))
  header(c, 1080, top: 1280)
  _ = text("ИГРАЙ,", size: 130, at: CGPoint(x: 70, y: 1010))
  _ = text("ПОКА ЖДЁШЬ", size: 130, color: lime, at: CGPoint(x: 70, y: 870))
  _ = text("заказ — мини-игры прямо в KOVRIX", size: 44, weight: .bold, color: soft, at: CGPoint(x: 76, y: 800))
  let cards = [("💎", "Алмазный\nдождь", lime), ("🧠", "Знаток", violetLight), ("🃏", "Найди\nпару", cyan)]
  for (i, card) in cards.enumerated() {
    let r = CGRect(x: 70 + CGFloat(i) * 320, y: 260, width: 290, height: 440)
    c.saveGState()
    c.translateBy(x: r.midX, y: r.midY)
    c.rotate(by: CGFloat(i - 1) * -0.07)
    let local = CGRect(x: -r.width / 2, y: -r.height / 2, width: r.width, height: r.height)
    glow(c, card.2, at: .zero, radius: 260, alpha: 0.3)
    c.addPath(CGPath(roundedRect: local, cornerWidth: 34, cornerHeight: 34, transform: nil))
    c.setFillColor(rgb(0x12121c).cgColor)
    c.fillPath()
    c.addPath(CGPath(roundedRect: local, cornerWidth: 34, cornerHeight: 34, transform: nil))
    c.setStrokeColor(card.2.cgColor)
    c.setLineWidth(5)
    c.strokePath()
    _ = text(card.0, size: 130, weight: .regular, at: CGPoint(x: 0, y: 20), align: "center")
    let lines = card.1.split(separator: "\n")
    for (j, line) in lines.enumerated() {
      _ = text(String(line), size: 44, weight: .black, at: CGPoint(x: 0, y: -90 - CGFloat(j) * 52), align: "center")
    }
    c.restoreGState()
  }
  pill(c, "Рекорды и награды — в «Топе»", center: CGPoint(x: 540, y: 120), height: 96)
}, "\(ads)/5-мини-игры-пост.png")

// 6. логотип, пост 1:1 — он же картинка при входе на сайте (web/shared/poster.jpg)
func logoPoster(_ c: CGContext, _ W: CGFloat) {
  let k = W / 1080
  c.scaleBy(x: k, y: k)
  backdrop(c, CGRect(x: 0, y: 0, width: 1080, height: 1080))
  gem(c, center: CGPoint(x: 540, y: 660), width: 520, colors: userGem)
  wordmark(c, size: 140, at: CGPoint(x: 540, y: 190), align: "center")
  _ = text("Донать быстро — играй красиво", size: 46, weight: .heavy, color: soft, at: CGPoint(x: 540, y: 120), align: "center")
}
save(canvas(1080, 1080) { logoPoster($0, 1080) }, "\(ads)/6-логотип-пост.png")
save(canvas(1024, 1024) { logoPoster($0, 1024) }, "web/shared/poster.jpg", jpeg: true)

// ——— обложки игр 16:9 (1280×720): свой рисунок в цветах игры, без логотипов
// и персонажей самих игр. Free Fire — обложка из логотипа владельца, её не трогаем.
// Внизу место под подпись («По ID игрока»), сверху — под пометку «Не работает».
struct Cover { let id: String; let name: String; let tag: String; let icon: String; let c1: Int; let c2: Int }
let covers = [
  Cover(id: "black_russia", name: "Black\nRussia", tag: "BR", icon: "🚘", c1: 0xff4d4d, c2: 0x5c0a0a),
  Cover(id: "pubg_mobile", name: "PUBG\nMobile", tag: "PUBG", icon: "🪖", c1: 0xf2c230, c2: 0x6b4a00),
  Cover(id: "fc_mobile", name: "FC\nMobile", tag: "FC", icon: "⚽", c1: 0x3ddc84, c2: 0x0b3d24),
  Cover(id: "efootball", name: "eFootball", tag: "eF", icon: "🏆", c1: 0x4d7cff, c2: 0x0c1d5c),
  Cover(id: "clash_of_clans", name: "Clash\nof Clans", tag: "CoC", icon: "🏰", c1: 0xffc83d, c2: 0x6b3a00),
  Cover(id: "clash_royale", name: "Clash\nRoyale", tag: "CR", icon: "👑", c1: 0x3fa9ff, c2: 0x0a2f66),
  Cover(id: "standoff2", name: "Standoff 2", tag: "SO2", icon: "🎯", c1: 0x5b8cff, c2: 0x14235e),
]

func hexagon(_ center: CGPoint, _ r: CGFloat) -> CGPath {
  let path = CGMutablePath()
  for i in 0..<6 {
    let a = CGFloat(i) * .pi / 3 + .pi / 6
    let p = CGPoint(x: center.x + cos(a) * r, y: center.y + sin(a) * r)
    if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
  }
  path.closeSubpath()
  return path
}

func cover(_ c: CGContext, _ g: Cover) {
  let W: CGFloat = 1280, H: CGFloat = 720
  let c1 = rgb(g.c1), c2 = rgb(g.c2)
  // фон: тёмный с цветом игры, свет справа, косые полосы, сетка
  c.drawLinearGradient(gradient([c2.blended(withFraction: 0.55, of: night)!, night]), start: CGPoint(x: W, y: H), end: CGPoint(x: 0, y: 0), options: [])
  glow(c, c1, at: CGPoint(x: W * 0.78, y: H * 0.55), radius: 560, alpha: 0.55)
  glow(c, violet, at: CGPoint(x: 0, y: H), radius: 600, alpha: 0.35)
  c.saveGState()
  c.setStrokeColor(c1.withAlphaComponent(0.08).cgColor)
  c.setLineWidth(26)
  var x: CGFloat = -H
  while x < W { c.move(to: CGPoint(x: x, y: 0)); c.addLine(to: CGPoint(x: x + H, y: H)); x += 90 }
  c.strokePath()
  c.restoreGState()
  c.setStrokeColor(NSColor(white: 1, alpha: 0.035).cgColor)
  c.setLineWidth(1.5)
  for gx in stride(from: CGFloat(0), through: W, by: 64) { c.move(to: CGPoint(x: gx, y: 0)); c.addLine(to: CGPoint(x: gx, y: H)) }
  for gy in stride(from: CGFloat(0), through: H, by: 64) { c.move(to: CGPoint(x: 0, y: gy)); c.addLine(to: CGPoint(x: W, y: gy)) }
  c.strokePath()
  // крупный бледный тег на фоне
  text(g.tag, size: 380, weight: .black, color: c1.withAlphaComponent(0.1), at: CGPoint(x: W + 30, y: 120), align: "right")

  // значок-шестигранник с иконкой
  let hc = CGPoint(x: 960, y: 390), hr: CGFloat = 200
  glow(c, c1, at: hc, radius: 330, alpha: 0.45)
  c.saveGState()
  c.setShadow(offset: CGSize(width: 0, height: -14), blur: 30, color: NSColor(white: 0, alpha: 0.6).cgColor)
  c.addPath(hexagon(hc, hr))
  c.setFillColor(cardColor.withAlphaComponent(0.92).cgColor)
  c.fillPath()
  c.restoreGState()
  c.saveGState()
  c.addPath(hexagon(hc, hr))
  c.setLineWidth(14)
  c.replacePathWithStrokedPath()
  c.clip()
  c.drawLinearGradient(gradient([.white, c1, c2]), start: CGPoint(x: hc.x - hr, y: hc.y + hr), end: CGPoint(x: hc.x + hr, y: hc.y - hr), options: [])
  c.restoreGState()
  c.addPath(hexagon(hc, hr - 26))
  c.setStrokeColor(c1.withAlphaComponent(0.35).cgColor)
  c.setLineWidth(3)
  c.strokePath()
  text(g.icon, size: 190, weight: .regular, at: CGPoint(x: hc.x, y: hc.y - 118), align: "center")
  sparkle(c, at: CGPoint(x: hc.x + 150, y: hc.y + 170), size: 30)

  // название игры: до двух строк, под ним полоса цвета игры
  let lines = g.name.split(separator: "\n").map(String.init)
  let size: CGFloat = lines.count > 1 ? 118 : 108
  let font = NSFont.systemFont(ofSize: size, weight: .black)
  let shadow = NSShadow()
  shadow.shadowColor = NSColor(white: 0, alpha: 0.55)
  shadow.shadowOffset = NSSize(width: 0, height: -6)
  shadow.shadowBlurRadius = 12
  var y: CGFloat = lines.count > 1 ? 400 : 330
  for line in lines {
    NSAttributedString(string: line.uppercased(), attributes: [.font: font, .foregroundColor: NSColor.white, .shadow: shadow, .kern: 2])
      .draw(at: CGPoint(x: 70, y: y))
    y -= size * 1.02
  }
  c.setFillColor(c1.cgColor)
  c.addPath(CGPath(roundedRect: CGRect(x: 74, y: y + size * 0.62, width: 150, height: 14), cornerWidth: 7, cornerHeight: 7, transform: nil))
  c.fillPath()
}

for g in covers {
  let rep = canvas(1280, 720) { cover($0, g) }
  save(rep, "src/shared/assets/games/\(g.id).jpg", jpeg: true)
  save(rep, "web/shared/games/\(g.id).jpg", jpeg: true)
}

// ——— картинка к рассылке обновления (бот шлёт её вместе с APK) ———
// версия — из src/shared/config.ts
let configSource = (try? String(contentsOfFile: "src/shared/config.ts", encoding: .utf8)) ?? ""
let versionName = configSource.range(of: #"name: '([0-9.]+)'"#, options: .regularExpression)
  .map { String(configSource[$0]).replacingOccurrences(of: "name: '", with: "").replacingOccurrences(of: "'", with: "") } ?? ""
save(canvas(1280, 720) { c in
  backdrop(c, CGRect(x: 0, y: 0, width: 1280, height: 720))
  gem(c, center: CGPoint(x: 1010, y: 400), width: 360, colors: userGem)
  text("ОБНОВЛЕНИЕ", size: 64, weight: .black, color: soft, at: CGPoint(x: 70, y: 560), kern: 3)
  wordmark(c, size: 120, at: CGPoint(x: 66, y: 430))
  text(versionName, size: 120, weight: .black, color: lime, at: CGPoint(x: 600, y: 430))
  let lines = ["Новый стиль «Кибер» и логотип", "Мини-игры — в приложении, на сайте и в боте", "Видео в объявлениях · обложки игр"]
  for (i, line) in lines.enumerated() {
    let y = CGFloat(320 - i * 70)
    c.setFillColor(lime.cgColor)
    c.fillEllipse(in: CGRect(x: 74, y: y + 12, width: 16, height: 16))
    text(line, size: 36, weight: .bold, at: CGPoint(x: 106, y: y))
  }
  pill(c, "Скачать в @Kovrixtj_bot", center: CGPoint(x: 330, y: 90), height: 84)
}, "ads/кибер/обновление-\(versionName).jpg", jpeg: true)
