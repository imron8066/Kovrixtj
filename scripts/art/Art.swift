// Общее для картинок и видео KovriX (стиль «Кибер»): цвета, логотип-алмаз,
// фон, надписи, кнопки. Программы в соседних папках запускает scripts/art.sh.
import AppKit

// ——— цвета (как тема 'cyber' в src/shared/theme.ts) ———
func rgb(_ hex: Int, _ a: CGFloat = 1) -> NSColor {
  NSColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
          blue: CGFloat(hex & 255) / 255, alpha: a)
}
let night = rgb(0x07070c)
let ink = rgb(0x0b0b14)
let cardColor = rgb(0x12121c)
let lineColor = rgb(0x23233a)
let lime = rgb(0xb6ff2e)
let limeLight = rgb(0xf0ffc4)
let limeDeep = rgb(0x4f8a00)
let violet = rgb(0x7c3aed)
let violetLight = rgb(0xa66bff)
let cyan = rgb(0x35c8ff)
let cyanLight = rgb(0xd6f4ff)
let cyanDeep = rgb(0x0a5f88)
let red = rgb(0xff3d57)
let soft = NSColor(white: 0.86, alpha: 1)

// цвета камня: светлая, основная и тёмная грани; ring — кольцо-орбита
struct Gem { let light: NSColor; let mid: NSColor; let deep: NSColor; let ring: NSColor }
let userGem = Gem(light: limeLight, mid: lime, deep: limeDeep, ring: violetLight)
let adminGem = Gem(light: cyanLight, mid: cyan, deep: cyanDeep, ring: red)

let fm = FileManager.default
let space = CGColorSpaceCreateDeviceRGB()

func canvas(_ w: Int, _ h: Int, _ draw: (CGContext) -> Void) -> NSBitmapImageRep {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                             colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let c = NSGraphicsContext.current!.cgContext
  c.setShouldAntialias(true)
  c.interpolationQuality = .high
  draw(c)
  NSGraphicsContext.restoreGraphicsState()
  return rep
}

func save(_ rep: NSBitmapImageRep, _ path: String, jpeg: Bool = false) {
  try? fm.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
  let data = jpeg
    ? rep.representation(using: .jpeg, properties: [.compressionFactor: 0.92])!
    : rep.representation(using: .png, properties: [:])!
  try! data.write(to: URL(fileURLWithPath: path))
  print(path)
}

func gradient(_ colors: [NSColor]) -> CGGradient {
  CGGradient(colorsSpace: space, colors: colors.map { $0.cgColor } as CFArray, locations: nil)!
}

func glow(_ c: CGContext, _ color: NSColor, at p: CGPoint, radius: CGFloat, alpha: CGFloat) {
  guard alpha > 0, radius > 0 else { return }
  c.drawRadialGradient(gradient([color.withAlphaComponent(alpha), color.withAlphaComponent(0)]),
                       startCenter: p, startRadius: 0, endCenter: p, endRadius: radius, options: [])
}

// фон «Кибер»: почти чёрный, фиолетовое пятно сверху слева, цветное снизу справа,
// тонкая сетка как на экране
func backdrop(_ c: CGContext, _ rect: CGRect, accent: NSColor = lime, grid: Bool = true) {
  c.setFillColor(night.cgColor)
  c.fill(rect)
  let m = max(rect.width, rect.height)
  glow(c, violet, at: CGPoint(x: rect.minX + rect.width * 0.18, y: rect.maxY - rect.height * 0.12), radius: m * 0.75, alpha: 0.55)
  glow(c, accent, at: CGPoint(x: rect.maxX - rect.width * 0.1, y: rect.minY + rect.height * 0.05), radius: m * 0.55, alpha: 0.14)
  if grid {
    let step = m / 18
    c.setStrokeColor(NSColor(white: 1, alpha: 0.035).cgColor)
    c.setLineWidth(max(1, m / 900))
    var x = rect.minX
    while x <= rect.maxX { c.move(to: CGPoint(x: x, y: rect.minY)); c.addLine(to: CGPoint(x: x, y: rect.maxY)); x += step }
    var y = rect.minY
    while y <= rect.maxY { c.move(to: CGPoint(x: rect.minX, y: y)); c.addLine(to: CGPoint(x: rect.maxX, y: y)); y += step }
    c.strokePath()
  }
}

func poly(_ c: CGContext, _ pts: [CGPoint], fill: NSColor) {
  c.beginPath()
  c.addLines(between: pts)
  c.closePath()
  c.setFillColor(fill.cgColor)
  c.fillPath()
}

// грань с переливом: цвет from в точке a переходит в to в точке b
func facet(_ c: CGContext, _ pts: [CGPoint], _ from: NSColor, _ to: NSColor, _ a: CGPoint, _ b: CGPoint) {
  c.saveGState()
  c.beginPath()
  c.addLines(between: pts)
  c.closePath()
  c.clip()
  c.drawLinearGradient(gradient([from, to]), start: a, end: b, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
  c.restoreGState()
}

// контур буквы для заливки градиентом
func glyphPath(_ letter: String, font: NSFont) -> CGPath {
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: letter, attributes: [.font: font]))
  let runs = CTLineGetGlyphRuns(line) as! [CTRun]
  let path = CGMutablePath()
  for run in runs {
    let count = CTRunGetGlyphCount(run)
    var glyphs = [CGGlyph](repeating: 0, count: count)
    var points = [CGPoint](repeating: .zero, count: count)
    CTRunGetGlyphs(run, CFRange(location: 0, length: count), &glyphs)
    CTRunGetPositions(run, CFRange(location: 0, length: count), &points)
    for (g, p) in zip(glyphs, points) {
      if let gp = CTFontCreatePathForGlyph(font as CTFont, g, nil) {
        path.addPath(gp, transform: CGAffineTransform(translationX: p.x, y: p.y))
      }
    }
  }
  return path
}

// четырёхлучевая искра
func sparkle(_ c: CGContext, at p: CGPoint, size s: CGFloat, alpha: CGFloat = 1) {
  guard alpha > 0 else { return }
  glow(c, .white, at: p, radius: s * 1.1, alpha: 0.55 * alpha)
  let path = CGMutablePath()
  path.move(to: CGPoint(x: p.x, y: p.y + s))
  path.addQuadCurve(to: CGPoint(x: p.x + s, y: p.y), control: p)
  path.addQuadCurve(to: CGPoint(x: p.x, y: p.y - s), control: p)
  path.addQuadCurve(to: CGPoint(x: p.x - s, y: p.y), control: p)
  path.addQuadCurve(to: CGPoint(x: p.x, y: p.y + s), control: p)
  c.addPath(path)
  c.setFillColor(NSColor.white.withAlphaComponent(alpha).cgColor)
  c.fillPath()
}

// кольцо-орбита вокруг камня; front — передняя половина (рисуется поверх камня)
func orbit(_ c: CGContext, center o: CGPoint, width w: CGFloat, colors g: Gem, front: Bool) {
  c.saveGState()
  c.translateBy(x: o.x, y: o.y - w * 0.12)
  c.rotate(by: -0.32)
  let r = CGRect(x: -w * 0.8, y: -w * 0.2, width: w * 1.6, height: w * 0.4)
  // задняя половина — сверху эллипса, передняя — снизу
  c.clip(to: front ? CGRect(x: -w, y: -w, width: w * 2, height: w) : CGRect(x: -w, y: 0, width: w * 2, height: w))
  c.addEllipse(in: r)
  c.setLineWidth(w * (front ? 0.045 : 0.03))
  c.replacePathWithStrokedPath()
  c.clip()
  let a = front ? 1.0 : 0.55
  c.drawLinearGradient(gradient([g.ring.withAlphaComponent(a), g.mid.withAlphaComponent(a), NSColor.white.withAlphaComponent(a)]),
                       start: CGPoint(x: -w * 0.8, y: 0), end: CGPoint(x: w * 0.8, y: 0), options: [])
  c.restoreGState()
}

// Логотип: гранёный алмаз с переливом граней, буквой K с фаской,
// кольцом-орбитой и искрой. center — середина пояса камня, w — ширина.
func gem(_ c: CGContext, center o: CGPoint, width w: CGFloat, colors g: Gem = userGem,
         letter: Bool = true, ring: Bool = true, halo: CGFloat = 0.5) {
  let P = { (x: CGFloat, y: CGFloat) in CGPoint(x: o.x + x * w, y: o.y + y * w) }
  let tl = P(-0.28, 0.28), tr = P(0.28, 0.28), gl = P(-0.5, 0.05), gr = P(0.5, 0.05)
  let bottom = P(0, -0.62)
  let t1 = P(-0.1, 0.28), t2 = P(0.1, 0.28)
  let q1 = P(-0.3, 0.05), q2 = P(-0.1, 0.05), q3 = P(0.1, 0.05), q4 = P(0.3, 0.05)

  glow(c, g.mid, at: P(0, -0.05), radius: w * 1.0, alpha: halo)
  if ring { orbit(c, center: o, width: w, colors: g, front: false) }

  // тень под камнем
  c.saveGState()
  c.setShadow(offset: CGSize(width: 0, height: -w * 0.04), blur: w * 0.1, color: NSColor(white: 0, alpha: 0.65).cgColor)
  poly(c, [tl, tr, gr, bottom, gl], fill: g.deep)
  c.restoreGState()

  let top = P(0, 0.28), mid = P(0, 0.05), low = P(0, -0.62)
  let mixLM = g.light.blended(withFraction: 0.45, of: g.mid)!
  let mixMD = g.mid.blended(withFraction: 0.45, of: g.deep)!
  // корона: пять граней, свет падает слева сверху
  facet(c, [gl, tl, q1], g.light, g.mid, tl, gl)
  facet(c, [tl, t1, q2, q1], g.light, mixLM, top, mid)
  facet(c, [t1, t2, q3, q2], .white, g.light, top, mid)
  facet(c, [t2, tr, q4, q3], mixLM, g.mid, top, mid)
  facet(c, [tr, gr, q4], g.mid, mixMD, tr, gr)
  // павильон: клинья к острию, от светлого слева к тёмному справа
  facet(c, [gl, q1, bottom], g.mid, mixMD, mid, low)
  facet(c, [q1, q2, bottom], g.light, g.mid, mid, low)
  facet(c, [q2, q3, bottom], mixLM, g.mid, mid, low)
  facet(c, [q3, q4, bottom], g.mid, g.deep, mid, low)
  facet(c, [q4, gr, bottom], mixMD, g.deep.blended(withFraction: 0.4, of: .black)!, mid, low)

  // рёбра: светлые тонкие линии
  c.setStrokeColor(NSColor(white: 1, alpha: 0.5).cgColor)
  c.setLineWidth(max(1, w * 0.008))
  c.setLineJoin(.round)
  c.beginPath()
  c.move(to: gl); c.addLine(to: gr)
  for (a, b) in [(tl, q1), (t1, q1), (t1, q2), (t2, q3), (t2, q4), (tr, q4), (q1, bottom), (q2, bottom), (q3, bottom), (q4, bottom)] {
    c.move(to: a); c.addLine(to: b)
  }
  c.strokePath()
  // яркий кант по контуру
  c.beginPath()
  c.addLines(between: [gl, tl, tr, gr, bottom])
  c.closePath()
  c.setStrokeColor(NSColor(white: 1, alpha: 0.85).cgColor)
  c.setLineWidth(max(1, w * 0.016))
  c.strokePath()

  // буква K с фаской: тёмная заливка с переливом и светлый верхний край
  if letter {
    let font = NSFont.systemFont(ofSize: w * 0.6, weight: .black)
    let path = glyphPath("K", font: font)
    let box = path.boundingBoxOfPath
    var move = CGAffineTransform(translationX: o.x - box.midX, y: o.y - w * 0.06 - box.midY)
    let placed = path.copy(using: &move)!
    let b = placed.boundingBoxOfPath
    c.saveGState()
    c.setShadow(offset: CGSize(width: 0, height: -w * 0.012), blur: w * 0.02, color: NSColor(white: 1, alpha: 0.5).cgColor)
    c.addPath(placed)
    c.setFillColor(ink.cgColor)
    c.fillPath()
    c.restoreGState()
    c.saveGState()
    c.addPath(placed)
    c.clip()
    c.drawLinearGradient(gradient([rgb(0x2c2c44), ink, rgb(0x000000)]), start: CGPoint(x: b.midX, y: b.maxY), end: CGPoint(x: b.midX, y: b.minY), options: [])
    c.restoreGState()
  }

  if ring { orbit(c, center: o, width: w, colors: g, front: true) }
  sparkle(c, at: P(0.36, 0.38), size: w * 0.09)
  sparkle(c, at: P(-0.33, 0.2), size: w * 0.045, alpha: 0.85)
}

// знак в круге: аватар, логотип на сайте и в приложении
func badge(_ c: CGContext, _ size: CGFloat, colors g: Gem = userGem) {
  let r = CGRect(x: 0, y: 0, width: size, height: size)
  c.saveGState()
  c.addEllipse(in: r)
  c.clip()
  backdrop(c, r, accent: violet, grid: false)
  glow(c, g.mid, at: CGPoint(x: size / 2, y: size * 0.55), radius: size * 0.5, alpha: 0.12)
  c.restoreGState()
  // кольцо с переливом от фиолетового к цвету камня
  c.saveGState()
  c.addEllipse(in: r.insetBy(dx: size * 0.03, dy: size * 0.03))
  c.setLineWidth(size * 0.022)
  c.replacePathWithStrokedPath()
  c.clip()
  c.drawLinearGradient(gradient([g.ring, g.mid]), start: CGPoint(x: 0, y: size), end: CGPoint(x: size, y: 0), options: [])
  c.restoreGState()
  gem(c, center: CGPoint(x: size / 2, y: size * 0.6), width: size * 0.58, colors: g)
}

// значок приложения: квадрат во весь размер (углы скругляет телефон)
func appIcon(_ c: CGContext, _ size: CGFloat, colors g: Gem, admin: Bool) {
  backdrop(c, CGRect(x: 0, y: 0, width: size, height: size), accent: g.mid, grid: true)
  gem(c, center: CGPoint(x: size / 2, y: size * 0.6), width: size * 0.58, colors: g)
  if admin { adminMark(c, size) }
}

// красная плашка «A» в углу — у KovriX A
func adminMark(_ c: CGContext, _ size: CGFloat) {
  let d = size * 0.3
  let r = CGRect(x: size * 0.64, y: size * 0.06, width: d, height: d)
  c.setFillColor(red.cgColor)
  c.fillEllipse(in: r)
  c.setStrokeColor(night.cgColor)
  c.setLineWidth(size * 0.025)
  c.strokeEllipse(in: r)
  let font = NSFont.systemFont(ofSize: d * 0.62, weight: .black)
  let str = NSAttributedString(string: "A", attributes: [.font: font, .foregroundColor: NSColor.white])
  let s = str.size()
  str.draw(at: CGPoint(x: r.midX - s.width / 2, y: r.midY - s.height / 2))
}

@discardableResult
func text(_ s: String, size: CGFloat, weight: NSFont.Weight = .black, color: NSColor = .white,
          at p: CGPoint, align: String = "left", kern: CGFloat = 0, alpha: CGFloat = 1) -> CGFloat {
  guard alpha > 0 else { return 0 }
  let font = NSFont.systemFont(ofSize: size, weight: weight)
  let str = NSAttributedString(string: s, attributes: [
    .font: font, .foregroundColor: color.withAlphaComponent(color.alphaComponent * alpha), .kern: kern,
  ])
  let w = str.size().width
  let x = align == "center" ? p.x - w / 2 : align == "right" ? p.x - w : p.x
  str.draw(at: CGPoint(x: x, y: p.y))
  return w
}

// надпись KOVRIX: белое KOVRI + лаймовый X, с мягким свечением
func wordmark(_ c: CGContext, size: CGFloat, at p: CGPoint, align: String = "left", alpha: CGFloat = 1, shine: Bool = true) {
  guard alpha > 0 else { return }
  let font = NSFont.systemFont(ofSize: size, weight: .black)
  let kern = size * 0.04
  var attrs: [NSAttributedString.Key: Any] = [.font: font, .kern: kern]
  if shine {
    let shadow = NSShadow()
    shadow.shadowColor = lime.withAlphaComponent(0.6 * alpha)
    shadow.shadowBlurRadius = size * 0.22
    attrs[.shadow] = shadow
  }
  var white = attrs, green = attrs
  white[.foregroundColor] = NSColor.white.withAlphaComponent(alpha)
  green[.foregroundColor] = lime.withAlphaComponent(alpha)
  let a = NSAttributedString(string: "KOVRI", attributes: white)
  let b = NSAttributedString(string: "X", attributes: green)
  let w = a.size().width + b.size().width
  let x = align == "center" ? p.x - w / 2 : p.x
  a.draw(at: CGPoint(x: x, y: p.y))
  b.draw(at: CGPoint(x: x + a.size().width, y: p.y))
}

// кнопка как в приложении: лаймовая, со свечением
func pill(_ c: CGContext, _ label: String, center p: CGPoint, height h: CGFloat, fill: NSColor = lime, color: NSColor = ink,
          scale: CGFloat = 1, alpha: CGFloat = 1) {
  guard alpha > 0, scale > 0 else { return }
  c.saveGState()
  c.setAlpha(alpha)
  c.translateBy(x: p.x, y: p.y)
  c.scaleBy(x: scale, y: scale)
  let font = NSFont.systemFont(ofSize: h * 0.42, weight: .black)
  let str = NSAttributedString(string: label, attributes: [.font: font, .foregroundColor: color])
  let s = str.size()
  let r = CGRect(x: -s.width / 2 - h * 0.6, y: -h / 2, width: s.width + h * 1.2, height: h)
  glow(c, fill, at: .zero, radius: r.width * 0.62, alpha: 0.38)
  c.addPath(CGPath(roundedRect: r, cornerWidth: h * 0.3, cornerHeight: h * 0.3, transform: nil))
  c.setFillColor(fill.cgColor)
  c.fillPath()
  str.draw(at: CGPoint(x: -s.width / 2, y: -s.height / 2))
  c.restoreGState()
}

// ——— цены — из src/shared/games.ts (обычные; по промокоду дня ещё дешевле) ———
let gamesSource = (try? String(contentsOfFile: "src/shared/games.ts", encoding: .utf8)) ?? ""
func price(_ title: String) -> String {
  let re = try! NSRegularExpression(pattern: "title: '\(NSRegularExpression.escapedPattern(for: title))', price: ([0-9.]+)")
  let m = re.firstMatch(in: gamesSource, range: NSRange(gamesSource.startIndex..., in: gamesSource))
  return m.flatMap { Range($0.range(at: 1), in: gamesSource).map { String(gamesSource[$0]) } } ?? "—"
}

// ——— анимация ———
func clamp(_ v: CGFloat) -> CGFloat { min(1, max(0, v)) }
// доля пути от a до b секунд
func span(_ t: CGFloat, _ a: CGFloat, _ b: CGFloat) -> CGFloat { clamp((t - a) / (b - a)) }
func easeOut(_ x: CGFloat) -> CGFloat { 1 - pow(1 - x, 3) }
// пружина с перелётом
func spring(_ x: CGFloat) -> CGFloat {
  if x <= 0 { return 0 }
  if x >= 1 { return 1 }
  return 1 - exp(-6 * x) * cos(9 * x)
}
