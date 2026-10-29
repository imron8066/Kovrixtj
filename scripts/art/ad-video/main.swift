// Видеореклама KovriX 9:16 (1080×1920, 15 с, 30 кадров/с) в стиле «Кибер»
// со своей музыкой: бит 120 BPM, «вжух» на сменах сцен и удар на финале.
// Без чужих логотипов, персонажей и музыки — годится для платной рекламы.
// Сцены: логотип → алмазы с ценами → ваучеры и пропуск → промокод дня → бот.
//   bash scripts/art.sh ad-video        → ads/кибер/видео-реклама.mp4
import AppKit

let W = 1080, H = 1920
let DURATION = 15.0
let outDir = "ads/кибер"
let output = "\(outDir)/видео-реклама.mp4"
try? fm.createDirectory(atPath: outDir, withIntermediateDirectories: true)

// ——— сцены (секунды) ———
let cuts: [CGFloat] = [2.6, 6.4, 9.6, 12.4]

func frame(_ c: CGContext, _ t: CGFloat) {
  stage(c, t, width: CGFloat(W), height: CGFloat(H))
  let cx = CGFloat(W) / 2

  if t < cuts[0] {
    // 1. логотип выпрыгивает, кольцо света, название и девиз
    let ring = span(t, 0.1, 1.3)
    let rr = 120 + 700 * easeOut(ring)
    c.setStrokeColor(lime.withAlphaComponent(0.9 * (1 - ring)).cgColor)
    c.setLineWidth(10)
    c.strokeEllipse(in: CGRect(x: cx - rr, y: 1280 - rr, width: rr * 2, height: rr * 2))
    let s = spring(span(t, 0.1, 0.9))
    c.saveGState()
    c.translateBy(x: cx, y: 1280)
    c.rotate(by: (1 - s) * 0.5)
    c.scaleBy(x: 0.2 + 0.8 * s, y: 0.2 + 0.8 * s)
    c.setAlpha(clamp(s * 1.5))
    gem(c, center: .zero, width: 560)
    c.restoreGState()
    let w = easeOut(span(t, 0.9, 1.4))
    wordmark(c, size: 170, at: CGPoint(x: cx, y: 640 - (1 - w) * 60), align: "center", alpha: w)
    let m = easeOut(span(t, 1.3, 1.8))
    text("Донать быстро — играй красиво", size: 54, weight: .heavy, color: soft, at: CGPoint(x: cx, y: 550 - (1 - m) * 40), align: "center", alpha: m)
  } else if t < cuts[1] {
    // 2. алмазы
    let a = t - cuts[0]
    slam(c, "АЛМАЗЫ", size: 190, x: cx, y: 1500, appear: span(a, 0, 0.35))
    text("Free Fire — быстро и честно", size: 50, weight: .bold, color: soft, at: CGPoint(x: cx, y: 1420), align: "center", alpha: span(a, 0.3, 0.6))
    let rows = [("💎 110", price("110 алмазов")), ("💎 341", price("341 алмаз")), ("💎 572", price("572 алмаза")),
                ("💎 1166", price("1166 алмазов")), ("💎 2398", price("2398 алмазов"))]
    for (i, row) in rows.enumerated() {
      priceRow(c, row.0, row.1, y: 1200 - CGFloat(i) * 150, appear: span(a, 0.4 + CGFloat(i) * 0.18, 0.75 + CGFloat(i) * 0.18))
    }
    text("🏷 По промокоду дня — ещё дешевле", size: 46, weight: .heavy, color: violetLight, at: CGPoint(x: cx, y: 360), align: "center", alpha: span(a, 1.6, 2.0))
  } else if t < cuts[2] {
    // 3. ваучеры и пропуск
    let a = t - cuts[1]
    slam(c, "ВАУЧЕРЫ", size: 170, x: cx, y: 1540, appear: span(a, 0, 0.35))
    slam(c, "И ПРОПУСК", size: 150, color: lime, x: cx, y: 1370, appear: span(a, 0.2, 0.55))
    let rows = [("🎟 Неделя Лайт", price("Ваучер на неделю Лайт")), ("🎟 Неделя", price("Ваучер на неделю")),
                ("🎟 Месяц", price("Ваучер на месяц")), ("🎫 Пропуск 6 LVL", price("Пропуск прокачки 6 LVL"))]
    for (i, row) in rows.enumerated() {
      priceRow(c, row.0, row.1, y: 1120 - CGFloat(i) * 150, appear: span(a, 0.5 + CGFloat(i) * 0.18, 0.85 + CGFloat(i) * 0.18))
    }
    text("Подтверждение — в течение дня", size: 46, weight: .bold, color: soft, at: CGPoint(x: cx, y: 420), align: "center", alpha: span(a, 1.5, 1.9))
  } else if t < cuts[3] {
    // 4. промокод дня: билет влетает с поворотом
    let a = t - cuts[2]
    slam(c, "ПРОМОКОД", size: 150, x: cx, y: 1540, appear: span(a, 0, 0.35))
    slam(c, "ДНЯ", size: 250, color: lime, x: cx, y: 1250, appear: span(a, 0.15, 0.5))
    let k = spring(span(a, 0.45, 1.25))
    c.saveGState()
    c.translateBy(x: cx + (1 - k) * 900, y: 980)
    c.rotate(by: -0.06 - (1 - k) * 0.6)
    c.setAlpha(clamp(k * 2))
    let r = CGRect(x: -400, y: -150, width: 800, height: 300)
    glow(c, violet, at: .zero, radius: 560, alpha: 0.6)
    c.addPath(CGPath(roundedRect: r, cornerWidth: 40, cornerHeight: 40, transform: nil))
    c.setFillColor(violet.cgColor)
    c.fillPath()
    c.setStrokeColor(NSColor(white: 1, alpha: 0.5).cgColor)
    c.setLineWidth(6)
    c.setLineDash(phase: 0, lengths: [24, 16])
    c.stroke(r.insetBy(dx: 26, dy: 26))
    c.setLineDash(phase: 0, lengths: [])
    // точки кода загораются по очереди
    let dots = Int(span(a, 1.1, 2.0) * 6)
    text("🏷 " + String(repeating: "● ", count: dots) + String(repeating: "○ ", count: 6 - dots), size: 84, at: CGPoint(x: 0, y: -50), align: "center")
    c.restoreGState()
    text("Каждый день — новый код", size: 58, weight: .heavy, at: CGPoint(x: cx, y: 640), align: "center", alpha: span(a, 1.2, 1.6))
    text("и цены ниже обычных", size: 58, weight: .heavy, color: soft, at: CGPoint(x: cx, y: 565), align: "center", alpha: span(a, 1.4, 1.8))
    text("Код — в боте, кнопка «🏷 Промокод»", size: 44, weight: .bold, color: violetLight, at: CGPoint(x: cx, y: 440), align: "center", alpha: span(a, 1.7, 2.1))
  } else {
    // 5. финал: логотип пульсирует, кнопка бота
    let a = t - cuts[3]
    let s = spring(span(a, 0, 0.7))
    let pulse = 1 + 0.03 * sin(a * 2 * .pi * 2)
    c.saveGState()
    c.translateBy(x: cx, y: 1400)
    c.scaleBy(x: (0.3 + 0.7 * s) * pulse, y: (0.3 + 0.7 * s) * pulse)
    gem(c, center: .zero, width: 520, halo: 0.6)
    c.restoreGState()
    let w = easeOut(span(a, 0.3, 0.7))
    wordmark(c, size: 160, at: CGPoint(x: cx, y: 830 - (1 - w) * 50), align: "center", alpha: w)
    text("Алмазы · Ваучеры · Пропуск", size: 50, weight: .heavy, color: soft, at: CGPoint(x: cx, y: 740), align: "center", alpha: span(a, 0.5, 0.9))
    let b = spring(span(a, 0.7, 1.3))
    pill(c, "@Kovrixtj_bot", center: CGPoint(x: cx, y: 520), height: 150, scale: max(0.01, b) * (1 + 0.04 * sin(a * 2 * .pi * 2)), alpha: clamp(b * 2))
    text("kovrixtj.web.app", size: 50, weight: .bold, color: violetLight, at: CGPoint(x: cx, y: 340), align: "center", alpha: span(a, 1.1, 1.5))
  }

  flashes(c, t, cuts: cuts, seconds: CGFloat(DURATION), width: CGFloat(W), height: CGFloat(H))
}

let silent = "\(outDir)/.video-tmp.mov"
renderVideo(silent, width: W, height: H, seconds: DURATION, draw: frame)

// ——— музыка ———
let mix = Mixer(seconds: DURATION)
let start = Double(cuts[0])
mix.riser(0, start)
mix.chime(0.1, 1318.5, pan: -0.3)
mix.chime(0.95, 1760, pan: 0.3)
mix.chime(1.35, 2093, pan: 0.3)
mix.add(0.1, 1.2, { (t: Double) -> Double in sin(2 * .pi * (60 + 120 * exp(-t * 8)) * t) * 0.5 * exp(-t * 4) })
mix.beat(from: start, to: DURATION - 0.3)
for cut in cuts { mix.whoosh(Double(cut)) }
mix.boom(Double(cuts[3]))
mix.chime(Double(cuts[3]), 1760, pan: 0.2)
let audio = "\(outDir)/.audio-tmp.wav"
mix.wav(audio)
mux(video: silent, audio: audio, output: output, seconds: DURATION)
