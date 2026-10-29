// Анимированная заставка бота (как в приложении, src/shared/Splash.tsx):
// кольцо света расходится, логотип выпрыгивает с поворотом, следом
// название KOVRIX и девиз. Бот присылает её на /start.
// Запуск: swift scripts/intro-gif.swift bot/assets/intro.gif
import AppKit
import ImageIO
import UniformTypeIdentifiers

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "bot/assets/intro.gif"
let logo = NSImage(contentsOfFile: "src/shared/assets/logo.png")!
let size: CGFloat = 400
let frames = 40
let delay = 0.05
// цвета стиля «Кибер»: лайм, фиолетовый, почти чёрный
let fire = NSColor(red: 0.714, green: 1, blue: 0.18, alpha: 1)
let amber = NSColor(red: 0.651, green: 0.42, blue: 1, alpha: 1)
let night = NSColor(red: 0.027, green: 0.027, blue: 0.047, alpha: 1)

// пружина: быстро до 1 с небольшим перелётом
func spring(_ t: CGFloat) -> CGFloat {
  if t <= 0 { return 0 }
  if t >= 1 { return 1 }
  return 1 - exp(-6 * t) * cos(9 * t)
}
func clamp(_ v: CGFloat) -> CGFloat { min(1, max(0, v)) }

func frame(_ i: Int) -> CGImage {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                             colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let c = NSGraphicsContext.current!.cgContext
  let t = CGFloat(i) / CGFloat(frames - 1)
  c.setFillColor(night.cgColor)
  c.fill(CGRect(x: 0, y: 0, width: size, height: size))

  // свечение за логотипом
  let center = CGPoint(x: size / 2, y: size * 0.58)
  let space = CGColorSpaceCreateDeviceRGB()
  let glow = CGGradient(colorsSpace: space, colors: [fire.withAlphaComponent(0.35 * clamp(t * 3)).cgColor, fire.withAlphaComponent(0).cgColor] as CFArray, locations: [0, 1])!
  c.drawRadialGradient(glow, startCenter: center, startRadius: 0, endCenter: center, endRadius: size * 0.5, options: [])

  // кольцо: от 0.4 до 2.4 размера логотипа, гаснет
  let ringT = clamp(t / 0.6)
  let ringR = 70 * (0.4 + 2 * (1 - pow(1 - ringT, 3)))
  let ringA = ringT < 0.2 ? ringT / 0.2 * 0.9 : 0.9 * (1 - (ringT - 0.2) / 0.8)
  c.setStrokeColor(fire.withAlphaComponent(ringA).cgColor)
  c.setLineWidth(5)
  c.strokeEllipse(in: CGRect(x: center.x - ringR, y: center.y - ringR, width: ringR * 2, height: ringR * 2))

  // логотип
  let s = spring(clamp(t / 0.5))
  let scale = 0.3 + 0.7 * s
  let angle = (1 - s) * 25 * .pi / 180
  let side: CGFloat = 150 * scale
  c.saveGState()
  c.translateBy(x: center.x, y: center.y)
  c.rotate(by: angle)
  c.setAlpha(clamp(s * 1.5))
  let rect = CGRect(x: -side / 2, y: -side / 2, width: side, height: side)
  c.addEllipse(in: rect)
  c.clip()
  logo.draw(in: rect)
  c.restoreGState()

  // название и девиз выезжают снизу
  let words = clamp((t - 0.3) / 0.35)
  let shift = (1 - words) * 24
  let title = NSMutableAttributedString(string: "KOVRI", attributes: [
    .font: NSFont.systemFont(ofSize: 46, weight: .black), .foregroundColor: NSColor.white.withAlphaComponent(words), .kern: 4,
  ])
  title.append(NSAttributedString(string: "X", attributes: [
    .font: NSFont.systemFont(ofSize: 46, weight: .black), .foregroundColor: fire.withAlphaComponent(words), .kern: 4,
  ]))
  let shadow = NSShadow()
  shadow.shadowColor = fire.withAlphaComponent(0.8 * words)
  shadow.shadowBlurRadius = 16
  title.addAttribute(.shadow, value: shadow, range: NSRange(location: 0, length: title.length))
  let tw = title.size().width
  title.draw(at: CGPoint(x: (size - tw) / 2, y: size * 0.18 - shift))
  let motto = NSAttributedString(string: "Донать быстро — играй красиво", attributes: [
    .font: NSFont.systemFont(ofSize: 18, weight: .heavy), .foregroundColor: amber.withAlphaComponent(clamp((t - 0.4) / 0.35)),
  ])
  motto.draw(at: CGPoint(x: (size - motto.size().width) / 2, y: size * 0.1 - shift))

  NSGraphicsContext.restoreGraphicsState()
  return rep.cgImage!
}

let url = URL(fileURLWithPath: out)
let gif = CGImageDestinationCreateWithURL(url as CFURL, UTType.gif.identifier as CFString, frames, nil)!
CGImageDestinationSetProperties(gif, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)
for i in 0..<frames {
  // последний кадр держится дольше
  let hold = i == frames - 1 ? 1.5 : delay
  CGImageDestinationAddImage(gif, frame(i), [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: hold]] as CFDictionary)
}
CGImageDestinationFinalize(gif)
print("готово:", out)
