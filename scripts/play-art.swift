// Картинки для Google Play без чужих логотипов и персонажей:
// значок 512×512 и баннер 1024×500 в стиле «Королевский».
// Запуск: swift scripts/play-art.swift builds/play/store
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let gold = NSColor(red: 1, green: 0.773, blue: 0.2, alpha: 1)
let goldDeep = NSColor(red: 0.77, green: 0.5, blue: 0, alpha: 1)
let violet = NSColor(red: 0.576, green: 0.2, blue: 0.918, alpha: 1)
let night = NSColor(red: 0.043, green: 0.024, blue: 0.078, alpha: 1)

func image(_ w: Int, _ h: Int, _ draw: (CGContext) -> Void) -> NSBitmapImageRep {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                             colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  draw(NSGraphicsContext.current!.cgContext)
  NSGraphicsContext.restoreGraphicsState()
  return rep
}

func background(_ c: CGContext, _ w: CGFloat, _ h: CGFloat, glow: CGPoint) {
  c.setFillColor(night.cgColor)
  c.fill(CGRect(x: 0, y: 0, width: w, height: h))
  let space = CGColorSpaceCreateDeviceRGB()
  let purple = CGGradient(colorsSpace: space, colors: [violet.withAlphaComponent(0.75).cgColor, violet.withAlphaComponent(0).cgColor] as CFArray, locations: [0, 1])!
  c.drawRadialGradient(purple, startCenter: glow, startRadius: 0, endCenter: glow, endRadius: max(w, h) * 0.75, options: [])
  let warm = CGGradient(colorsSpace: space, colors: [gold.withAlphaComponent(0.35).cgColor, gold.withAlphaComponent(0).cgColor] as CFArray, locations: [0, 1])!
  let low = CGPoint(x: w * 0.85, y: 0)
  c.drawRadialGradient(warm, startCenter: low, startRadius: 0, endCenter: low, endRadius: max(w, h) * 0.6, options: [])
}

func text(_ s: String, size: CGFloat, weight: NSFont.Weight, color: NSColor, at p: CGPoint, center: Bool = false, shadow: Bool = true) {
  let font = NSFont.systemFont(ofSize: size, weight: weight)
  var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
  if shadow {
    let sh = NSShadow()
    sh.shadowColor = goldDeep
    sh.shadowOffset = NSSize(width: 0, height: -size * 0.06)
    sh.shadowBlurRadius = 0
    attrs[.shadow] = sh
  }
  let str = NSAttributedString(string: s, attributes: attrs)
  let w = str.size().width
  str.draw(at: CGPoint(x: center ? p.x - w / 2 : p.x, y: p.y))
}

// корона из трёх зубцов
func crown(_ c: CGContext, center: CGPoint, width: CGFloat) {
  let h = width * 0.55
  let x0 = center.x - width / 2, y0 = center.y
  c.setFillColor(gold.cgColor)
  c.beginPath()
  c.move(to: CGPoint(x: x0, y: y0))
  c.addLine(to: CGPoint(x: x0, y: y0 + h))
  c.addLine(to: CGPoint(x: x0 + width * 0.27, y: y0 + h * 0.45))
  c.addLine(to: CGPoint(x: center.x, y: y0 + h * 1.05))
  c.addLine(to: CGPoint(x: x0 + width * 0.73, y: y0 + h * 0.45))
  c.addLine(to: CGPoint(x: x0 + width, y: y0 + h))
  c.addLine(to: CGPoint(x: x0 + width, y: y0))
  c.closePath()
  c.fillPath()
  c.setFillColor(goldDeep.cgColor)
  c.fill(CGRect(x: x0, y: y0 - width * 0.09, width: width, height: width * 0.09))
}

func save(_ rep: NSBitmapImageRep, _ name: String, png: Bool) {
  let data = png ? rep.representation(using: .png, properties: [:])! : rep.representation(using: .jpeg, properties: [.compressionFactor: 0.92])!
  try! data.write(to: URL(fileURLWithPath: "\(out)/\(name)"))
  print("\(out)/\(name)")
}

// значок: большая золотая K с короной
let icon = image(512, 512) { c in
  background(c, 512, 512, glow: CGPoint(x: 256, y: 300))
  crown(c, center: CGPoint(x: 256, y: 392), width: 150)
  text("K", size: 330, weight: .black, color: gold, at: CGPoint(x: 256, y: 40), center: true)
}
// значок Google Play — без прозрачности
save(icon, "icon-512.png", png: true)

// баннер: значок слева, название и девиз справа
let feature = image(1024, 500) { c in
  background(c, 1024, 500, glow: CGPoint(x: 230, y: 260))
  crown(c, center: CGPoint(x: 230, y: 340), width: 120)
  text("K", size: 270, weight: .black, color: gold, at: CGPoint(x: 230, y: 40), center: true)
  text("KOVRIX", size: 118, weight: .black, color: .white, at: CGPoint(x: 420, y: 250), shadow: false)
  text("Донат в игры", size: 46, weight: .heavy, color: gold, at: CGPoint(x: 426, y: 180), shadow: false)
  text("💎 Алмазы · 🎟 Ваучеры · 🎫 Пропуск", size: 30, weight: .semibold, color: NSColor(white: 0.9, alpha: 1), at: CGPoint(x: 428, y: 118), shadow: false)
  text("🏷 Промокод каждый день", size: 30, weight: .semibold, color: NSColor(white: 0.9, alpha: 1), at: CGPoint(x: 428, y: 70), shadow: false)
}
save(feature, "feature-1024x500.jpg", png: false)
