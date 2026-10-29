// Общий рекламный ролик: Kovrix — приложение, сайт и Telegram-бот. 1080×1920,
// ~46 с, со своей музыкой. Приложение и сайт — настоящие снимки экрана
// (builds/brand/shots: эмулятор Android и Chrome), бот — кадры ролика
// scripts/art/bot-video (builds/brand/bot-clip.mp4).
//   bash scripts/art.sh bot-video      — сначала, если бот менялся
//   bash scripts/art.sh promo-video    → ads/кибер/видео-сайт-приложение-бот.mp4
import AppKit
import AVFoundation

let W: CGFloat = 1080, H: CGFloat = 1920
let DURATION = 46.0
let outDir = "ads/кибер"
let output = "\(outDir)/видео-сайт-приложение-бот.mp4"
let shots = "builds/brand/shots"
let botClip = "builds/brand/bot-clip.mp4"
for need in [botClip, "\(shots)/app-1-home.png", "\(shots)/site-1-home.png"] where !fm.fileExists(atPath: need) {
  print("Нет \(need): сначала снимки экрана и bash scripts/art.sh bot-video")
  exit(1)
}

func image(_ name: String) -> CGImage {
  let rep = NSBitmapImageRep(data: try! Data(contentsOf: URL(fileURLWithPath: "\(shots)/\(name).png")))!
  return rep.cgImage!
}
let app = ["app-1-home", "app-2-games", "app-3-gems", "app-4-minigames", "app-5-rain"].map(image)
let site = ["site-1-home", "site-2-game", "site-3-play"].map(image)

// ——— кадры бота: из готового ролика, с телефоном по центру ———
let botAsset = AVURLAsset(url: URL(fileURLWithPath: botClip))
let botFrames = AVAssetImageGenerator(asset: botAsset)
botFrames.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 60)
botFrames.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 60)
// телефон в ролике бота: x 180…900, y 50…1550 (снизу), то есть сверху 370…1870
let botPhone = CGRect(x: 168, y: 358, width: 744, height: 1524)
func botFrame(at seconds: Double) -> CGImage? {
  guard let frame = try? botFrames.copyCGImage(at: CMTime(seconds: seconds, preferredTimescale: 600), actualTime: nil) else { return nil }
  return frame.cropping(to: botPhone)
}

// ——— сценарий (секунды) ———
let appFrom: CGFloat = 3, siteFrom: CGFloat = 17.5, botFrom: CGFloat = 29, outro: CGFloat = 40.5
let cuts = [appFrom, siteFrom, botFrom, outro]
// экраны приложения и когда они появляются
let appScreens: [CGFloat] = [3.4, 6.6, 9.4, 12.2, 14.6]
// касания пальцем перед сменой экрана: доля ширины и высоты снимка
let appTaps: [(CGFloat, CGFloat, CGFloat)] = [(6.3, 0.5, 0.5), (9.1, 0.19, 0.55), (11.9, 0.92, 0.11), (14.3, 0.19, 0.31)]
let siteScreens: [CGFloat] = [18.0, 21.8, 25.3]
let siteTaps: [(CGFloat, CGFloat, CGFloat)] = [(21.5, 0.29, 0.39), (25.0, 0.07, 0.11)]

struct Section { let from: CGFloat; let to: CGFloat; let n: String; let title: String; let sub: String; let points: [String] }
let sections = [
  Section(from: appFrom, to: siteFrom, n: "1", title: "Приложение", sub: "Kovrix для Android — скачай в боте",
          points: ["Цены в сомони", "Мини-игры", "Статус заказа"]),
  Section(from: siteFrom, to: botFrom, n: "2", title: "Сайт", sub: "kovrixtj.web.app — iPhone и компьютер",
          points: ["Без установки", "Вход по ID, номеру или Gmail", "Те же цены и игры"]),
  Section(from: botFrom, to: outro, n: "3", title: "Telegram-бот", sub: "@Kovrixtj_bot — заказ прямо в чате",
          points: ["Меню всегда под рукой", "Промокод дня", "Ответ поддержки — сюда"]),
]

// ——— рисование ———
func rounded(_ r: CGRect, _ radius: CGFloat) -> CGPath { CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil) }

// сменяющиеся снимки: новый въезжает справа
func slideshow(_ c: CGContext, _ images: [CGImage], starts: [CGFloat], _ t: CGFloat, in r: CGRect) {
  guard let i = starts.lastIndex(where: { $0 <= t }) else {
    c.draw(images[0], in: r)
    return
  }
  let k = easeOut(span(t, starts[i], starts[i] + 0.45))
  if i > 0 && k < 1 { c.draw(images[i - 1], in: r.offsetBy(dx: -r.width * k * 0.3, dy: 0)) }
  c.saveGState()
  c.setAlpha(i == 0 ? k : 1)
  c.draw(images[i], in: r.offsetBy(dx: i == 0 ? 0 : r.width * (1 - k), dy: 0))
  c.restoreGState()
}

func finger(_ c: CGContext, _ t: CGFloat, taps: [(CGFloat, CGFloat, CGFloat)], in r: CGRect) {
  for (at, fx, fy) in taps {
    let d = t - at
    guard d > -0.25, d < 0.45 else { continue }
    let p = CGPoint(x: r.minX + r.width * fx, y: r.maxY - r.height * fy)
    let k = clamp((d + 0.25) / 0.7)
    let radius = 28 + 46 * k
    c.setFillColor(NSColor(white: 1, alpha: 0.35 * (1 - k)).cgColor)
    c.fillEllipse(in: CGRect(x: p.x - radius, y: p.y - radius, width: radius * 2, height: radius * 2))
    c.setFillColor(NSColor(white: 1, alpha: d < 0.1 ? 0.6 : 0.6 * (1 - k)).cgColor)
    c.fillEllipse(in: CGRect(x: p.x - 24, y: p.y - 24, width: 48, height: 48))
  }
}

// телефон: корпус с переливом и экран; content рисует экран в rect
func phone(_ c: CGContext, _ r: CGRect, _ content: (CGRect) -> Void) {
  c.saveGState()
  c.setShadow(offset: CGSize(width: 0, height: -30), blur: 60, color: NSColor(white: 0, alpha: 0.8).cgColor)
  c.addPath(rounded(r, 80))
  c.setFillColor(rgb(0x15151f).cgColor)
  c.fillPath()
  c.restoreGState()
  c.saveGState()
  c.addPath(rounded(r, 80))
  c.setLineWidth(6)
  c.replacePathWithStrokedPath()
  c.clip()
  c.drawLinearGradient(gradient([violetLight, rgb(0x2a2a40), lime]), start: CGPoint(x: r.minX, y: r.maxY), end: CGPoint(x: r.maxX, y: r.minY), options: [])
  c.restoreGState()
  let screen = r.insetBy(dx: 16, dy: 16)
  c.saveGState()
  c.addPath(rounded(screen, 66))
  c.clip()
  content(screen)
  c.restoreGState()
}

// ноутбук: экран с рамкой и основание
func laptop(_ c: CGContext, _ screen: CGRect, _ content: (CGRect) -> Void) {
  let frame = screen.insetBy(dx: -22, dy: -22)
  c.saveGState()
  c.setShadow(offset: CGSize(width: 0, height: -24), blur: 50, color: NSColor(white: 0, alpha: 0.8).cgColor)
  c.addPath(rounded(frame, 26))
  c.setFillColor(rgb(0x15151f).cgColor)
  c.fillPath()
  c.restoreGState()
  c.saveGState()
  c.addPath(rounded(frame, 26))
  c.setLineWidth(4)
  c.replacePathWithStrokedPath()
  c.clip()
  c.drawLinearGradient(gradient([violetLight, rgb(0x2a2a40), lime]), start: CGPoint(x: frame.minX, y: frame.maxY), end: CGPoint(x: frame.maxX, y: frame.minY), options: [])
  c.restoreGState()
  c.saveGState()
  c.addPath(rounded(screen, 8))
  c.clip()
  content(screen)
  c.restoreGState()
  c.setFillColor(NSColor.black.cgColor)
  c.fillEllipse(in: CGRect(x: frame.midX - 5, y: frame.maxY - 15, width: 10, height: 10))
  // основание
  let base = CGMutablePath()
  base.move(to: CGPoint(x: frame.minX - 60, y: frame.minY - 34))
  base.addLine(to: CGPoint(x: frame.maxX + 60, y: frame.minY - 34))
  base.addLine(to: CGPoint(x: frame.maxX, y: frame.minY))
  base.addLine(to: CGPoint(x: frame.minX, y: frame.minY))
  base.closeSubpath()
  c.addPath(base)
  c.setFillColor(rgb(0x262636).cgColor)
  c.fillPath()
  c.setFillColor(rgb(0x3a3a52).cgColor)
  c.fill(CGRect(x: frame.midX - 90, y: frame.minY - 12, width: 180, height: 8))
}

// подпись раздела сверху и пункты снизу
func caption(_ c: CGContext, _ s: Section, _ t: CGFloat) {
  let k = easeOut(span(t, s.from + 0.1, s.from + 0.5)) * (1 - span(t, s.to - 0.3, s.to))
  guard k > 0 else { return }
  let cx = W / 2, dy = (1 - k) * 40
  c.saveGState()
  c.setAlpha(k)
  let chip = CGRect(x: cx - 60, y: 1810 + dy, width: 120, height: 52)
  c.addPath(rounded(chip, 26))
  c.setFillColor(lime.cgColor)
  c.fillPath()
  text("\(s.n) / 3", size: 28, weight: .black, color: ink, at: CGPoint(x: cx, y: chip.minY + 10), align: "center")
  c.restoreGState()
  text(s.title.uppercased(), size: 84, weight: .black, at: CGPoint(x: cx, y: 1690 + dy), align: "center", kern: 2, alpha: k)
  text(s.sub, size: 40, weight: .bold, color: soft, at: CGPoint(x: cx, y: 1630 + dy), align: "center", alpha: k)
}

func points(_ c: CGContext, _ s: Section, _ t: CGFloat, y: CGFloat) {
  let out = 1 - span(t, s.to - 0.3, s.to)
  for (i, p) in s.points.enumerated() {
    let k = easeOut(span(t, s.from + 0.6 + CGFloat(i) * 0.25, s.from + 1.0 + CGFloat(i) * 0.25)) * out
    guard k > 0 else { continue }
    let label = NSAttributedString(string: p, attributes: [.font: NSFont.systemFont(ofSize: 34, weight: .heavy)])
    let w = label.size().width + 90
    let r = CGRect(x: W / 2 - w / 2, y: y - CGFloat(i) * 78 + (1 - k) * 30, width: w, height: 62)
    c.saveGState()
    c.setAlpha(k)
    c.addPath(rounded(r, 31))
    c.setFillColor(cardColor.withAlphaComponent(0.9).cgColor)
    c.fillPath()
    c.addPath(rounded(r, 31))
    c.setStrokeColor(lime.withAlphaComponent(0.5).cgColor)
    c.setLineWidth(2)
    c.strokePath()
    text("✓", size: 32, weight: .black, color: lime, at: CGPoint(x: r.minX + 26, y: r.minY + 12))
    text(p, size: 34, weight: .heavy, at: CGPoint(x: r.minX + 66, y: r.minY + 11))
    c.restoreGState()
  }
}

let appPhone = CGRect(x: 250, y: 300, width: 580, height: 1210)
let siteScreen = CGRect(x: 70, y: 820, width: 940, height: 588)
let botPhoneRect = CGRect(x: 232, y: 300, width: 616, height: 1262)

func frame(_ c: CGContext, _ t: CGFloat) {
  stage(c, t, width: W, height: H)
  let cx = W / 2

  if t < appFrom + 0.5 {
    // вступление
    let fade = 1 - span(t, appFrom - 0.2, appFrom + 0.3)
    c.saveGState()
    c.setAlpha(fade)
    let s = spring(span(t, 0.1, 0.9))
    c.saveGState()
    c.translateBy(x: cx, y: 1230)
    c.rotate(by: (1 - s) * 0.5)
    c.scaleBy(x: 0.2 + 0.8 * s, y: 0.2 + 0.8 * s)
    gem(c, center: .zero, width: 500, halo: 0.6)
    c.restoreGState()
    let w = easeOut(span(t, 0.7, 1.2))
    wordmark(c, size: 160, at: CGPoint(x: cx, y: 700 - (1 - w) * 50), align: "center", alpha: w)
    text("Приложение · Сайт · Бот", size: 58, weight: .heavy, at: CGPoint(x: cx, y: 590), align: "center", alpha: span(t, 1.1, 1.5))
    text("Донат в игры — как тебе удобнее", size: 44, weight: .bold, color: soft, at: CGPoint(x: cx, y: 515), align: "center", alpha: span(t, 1.5, 1.9))
    c.restoreGState()
  }

  // 1. приложение
  if t >= appFrom && t < siteFrom + 0.6 {
    let inK = easeOut(span(t, appFrom, appFrom + 0.7)), outK = easeOut(span(t, siteFrom - 0.2, siteFrom + 0.4))
    c.saveGState()
    c.translateBy(x: -outK * 1100, y: -(1 - inK) * 1500)
    phone(c, appPhone) { r in
      slideshow(c, app, starts: appScreens, t, in: r)
      finger(c, t, taps: appTaps, in: r)
    }
    c.restoreGState()
    caption(c, sections[0], t)
    points(c, sections[0], t, y: 200)
  }

  // 2. сайт на ноутбуке
  if t >= siteFrom - 0.4 && t < botFrom + 0.6 {
    let inK = easeOut(span(t, siteFrom - 0.2, siteFrom + 0.5)), outK = easeOut(span(t, botFrom - 0.2, botFrom + 0.4))
    c.saveGState()
    c.translateBy(x: (1 - inK) * 1200 - outK * 1200, y: 0)
    laptop(c, siteScreen) { r in
      slideshow(c, site, starts: siteScreens, t, in: r)
      finger(c, t, taps: siteTaps, in: r)
    }
    c.restoreGState()
    caption(c, sections[1], t)
    points(c, sections[1], t, y: 620)
    // адрес сайта крупно
    let a = span(t, siteFrom + 1.4, siteFrom + 1.8) * (1 - span(t, botFrom - 0.3, botFrom))
    pill(c, "kovrixtj.web.app", center: CGPoint(x: cx, y: 1500), height: 96, fill: violet, color: .white, alpha: a)
  }

  // 3. бот — кадры из ролика бота
  if t >= botFrom - 0.4 && t < outro + 0.6 {
    let inK = easeOut(span(t, botFrom - 0.2, botFrom + 0.5)), outK = easeOut(span(t, outro - 0.2, outro + 0.4))
    // 4,4…21 с ролика бота: меню, цены, заказ на сайте внутри Telegram
    let src = 4.4 + Double(max(0, t - botFrom)) * 1.42
    if let img = botFrame(at: src) {
      c.saveGState()
      c.translateBy(x: (1 - inK) * 1200 - outK * 1200, y: 0)
      c.draw(img, in: botPhoneRect)
      c.restoreGState()
    }
    caption(c, sections[2], t)
    points(c, sections[2], t, y: 200)
  }

  if t >= outro {
    // финал: всё вместе — телефон, ноутбук, бот; логотип и кнопка
    let a = t - outro
    let k = easeOut(span(a, 0, 0.6))
    c.saveGState()
    c.setAlpha(k)
    // ноутбук по центру, телефоны по бокам
    c.saveGState()
    c.translateBy(x: cx, y: 1360)
    c.scaleBy(x: 0.6, y: 0.6)
    c.translateBy(x: -540, y: -1100)
    laptop(c, siteScreen) { r in c.draw(site[0], in: r) }
    c.restoreGState()
    for (i, side) in [-1.0, 1.0].enumerated() {
      c.saveGState()
      c.translateBy(x: cx + CGFloat(side) * 360, y: 1250)
      c.rotate(by: CGFloat(-side) * 0.12)
      c.scaleBy(x: 0.42, y: 0.42)
      c.translateBy(x: -290, y: -605)
      if i == 0 {
        phone(c, CGRect(x: 0, y: 0, width: 580, height: 1210)) { r in c.draw(app[0], in: r) }
      } else if let img = botFrame(at: 6.8) {
        c.draw(img, in: CGRect(x: -18, y: -26, width: 616, height: 1262))
      }
      c.restoreGState()
    }
    c.restoreGState()
    let w = easeOut(span(a, 0.5, 0.9))
    wordmark(c, size: 150, at: CGPoint(x: cx, y: 760 - (1 - w) * 40), align: "center", alpha: w)
    text("Приложение · Сайт · Бот", size: 46, weight: .heavy, color: soft, at: CGPoint(x: cx, y: 680), align: "center", alpha: span(a, 0.7, 1.1))
    let b = spring(span(a, 0.9, 1.5))
    pill(c, "@Kovrixtj_bot", center: CGPoint(x: cx, y: 500), height: 140, scale: max(0.01, b) * (1 + 0.04 * sin(a * 2 * .pi * 2)), alpha: clamp(b * 2))
    text("kovrixtj.web.app · Android — в боте", size: 42, weight: .bold, color: violetLight, at: CGPoint(x: cx, y: 340), align: "center", alpha: span(a, 1.3, 1.7))
  }

  flashes(c, t, cuts: cuts, seconds: CGFloat(DURATION), width: W, height: H)
}

let silent = "\(outDir)/.promo-tmp.mov"
renderVideo(silent, width: Int(W), height: Int(H), seconds: DURATION, draw: frame)

// ——— звук ———
let mix = Mixer(seconds: DURATION)
mix.riser(0, Double(appFrom))
mix.chime(0.1, 1318.5, pan: -0.3)
mix.chime(0.75, 1760, pan: 0.3)
mix.chime(1.15, 2093, pan: 0.3)
mix.beat(from: Double(appFrom), to: Double(outro), soft: true)
mix.beat(from: Double(outro), to: DURATION - 0.3)
for cut in cuts { mix.whoosh(Double(cut)) }
mix.boom(Double(outro))
for (at, _, _) in appTaps + siteTaps { mix.tap(Double(at)) }
// нажатия в части с ботом — те же, что в ролике бота, со сдвигом
for src in [9.4, 12.6, 15.3, 17.9, 18.9, 20.2] { mix.tap(Double(botFrom) + (src - 4.4) / 1.42) }
mix.coin(Double(botFrom) + (20.35 - 4.4) / 1.42)
let audio = "\(outDir)/.promo-audio-tmp.wav"
mix.wav(audio)
mux(video: silent, audio: audio, output: output, seconds: DURATION)
