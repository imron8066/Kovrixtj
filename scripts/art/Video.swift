// Общее для видео KovriX: живой фон, анимированные заголовки, запись кадров
// в MP4, синтезатор музыки и звуков, склейка видео со звуком. Без ffmpeg —
// только AVFoundation, который есть на любом Mac.
import AppKit
import AVFoundation

// ——— фон: плывущие пятна света, сетка едет вниз, падают маленькие алмазы ———
struct Flake { let x: CGFloat; let speed: CGFloat; let size: CGFloat; let phase: CGFloat }
var seed: UInt64 = 7
// одинаковые «случайные» числа при каждом запуске
func rnd() -> CGFloat {
  seed = seed &* 6364136223846793005 &+ 1442695040888963407
  return CGFloat(seed >> 33) / CGFloat(UInt32.max >> 1)
}
let flakes = (0..<22).map { _ in Flake(x: rnd() * 1080, speed: 120 + rnd() * 260, size: 26 + rnd() * 46, phase: rnd() * 2400) }

func stage(_ c: CGContext, _ t: CGFloat, width W: CGFloat, height H: CGFloat) {
  c.setFillColor(night.cgColor)
  c.fill(CGRect(x: 0, y: 0, width: W, height: H))
  glow(c, violet, at: CGPoint(x: 200 + sin(t * 0.6) * 120, y: H - 220 + cos(t * 0.5) * 80), radius: 1300, alpha: 0.5)
  glow(c, lime, at: CGPoint(x: W - 130 + cos(t * 0.4) * 100, y: 150 + sin(t * 0.7) * 100), radius: 900, alpha: 0.14)
  let step: CGFloat = 60
  let off = (t * 40).truncatingRemainder(dividingBy: step)
  c.setStrokeColor(NSColor(white: 1, alpha: 0.04).cgColor)
  c.setLineWidth(2)
  var x: CGFloat = 0
  while x <= W { c.move(to: CGPoint(x: x, y: 0)); c.addLine(to: CGPoint(x: x, y: H)); x += step }
  var y = -off
  while y <= H { c.move(to: CGPoint(x: 0, y: y)); c.addLine(to: CGPoint(x: W, y: y)); y += step }
  c.strokePath()
  for f in flakes {
    let fy = H + 100 - (f.phase + t * f.speed).truncatingRemainder(dividingBy: H + 200)
    c.saveGState()
    c.setAlpha(0.22)
    gem(c, center: CGPoint(x: f.x * W / 1080, y: fy), width: f.size, letter: false, ring: false, halo: 0)
    c.restoreGState()
  }
}

// заголовок «влетает» из крупного с затуханием, по центру x
func slam(_ c: CGContext, _ s: String, size: CGFloat, color: NSColor = .white, x: CGFloat, y: CGFloat, appear: CGFloat) {
  guard appear > 0 else { return }
  let k = easeOut(appear)
  c.saveGState()
  c.translateBy(x: x, y: y)
  let sc = 1.6 - 0.6 * k
  c.scaleBy(x: sc, y: sc)
  text(s, size: size, color: color, at: .zero, align: "center", alpha: k)
  c.restoreGState()
}

// строка прайса: выезжает справа
func priceRow(_ c: CGContext, _ name: String, _ cost: String, x: CGFloat = 80, y: CGFloat, width: CGFloat = 920, appear: CGFloat) {
  let k = easeOut(appear)
  guard k > 0 else { return }
  let r = CGRect(x: x + (1 - k) * 700, y: y, width: width, height: 120)
  c.saveGState()
  c.setAlpha(k)
  c.addPath(CGPath(roundedRect: r, cornerWidth: 24, cornerHeight: 24, transform: nil))
  c.setFillColor(cardColor.withAlphaComponent(0.94).cgColor)
  c.fillPath()
  c.addPath(CGPath(roundedRect: r, cornerWidth: 24, cornerHeight: 24, transform: nil))
  c.setStrokeColor(rgb(0x2c2c48).cgColor)
  c.setLineWidth(3)
  c.strokePath()
  c.setFillColor(lime.cgColor)
  c.fill(CGRect(x: r.minX, y: r.minY + 24, width: 6, height: r.height - 48))
  text(name, size: 50, weight: .bold, at: CGPoint(x: r.minX + 40, y: r.minY + 30))
  text("\(cost) смн", size: 56, weight: .black, color: lime, at: CGPoint(x: r.maxX - 40, y: r.minY + 26), align: "right")
  c.restoreGState()
}

// вспышка на сменах сцен и затемнение в конце
func flashes(_ c: CGContext, _ t: CGFloat, cuts: [CGFloat], seconds: CGFloat, width W: CGFloat, height H: CGFloat) {
  for cut in cuts where abs(t - cut) < 0.12 {
    c.setFillColor(lime.withAlphaComponent(0.28 * (1 - abs(t - cut) / 0.12)).cgColor)
    c.fill(CGRect(x: 0, y: 0, width: W, height: H))
  }
  let end = span(t, seconds - 0.4, seconds)
  if end > 0 {
    c.setFillColor(night.withAlphaComponent(end).cgColor)
    c.fill(CGRect(x: 0, y: 0, width: W, height: H))
  }
}

// ——— запись кадров: H.264, без звука ———
func renderVideo(_ path: String, width W: Int, height H: Int, fps: Int32 = 30, seconds: Double,
                 draw: (CGContext, CGFloat) -> Void) {
  try? fm.removeItem(atPath: path)
  let writer = try! AVAssetWriter(outputURL: URL(fileURLWithPath: path), fileType: .mov)
  let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 6_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
  ])
  input.expectsMediaDataInRealTime = false
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H,
  ])
  writer.add(input)
  writer.startWriting()
  writer.startSession(atSourceTime: .zero)
  let frames = Int(seconds * Double(fps))
  for i in 0..<frames {
    while !input.isReadyForMoreMediaData { usleep(2000) }
    var buffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
    let pb = buffer!
    CVPixelBufferLockBaseAddress(pb, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: W, height: H, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: space,
                        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
    draw(ctx, CGFloat(i) / CGFloat(fps))
    NSGraphicsContext.restoreGraphicsState()
    CVPixelBufferUnlockBaseAddress(pb, [])
    adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
    if i % 150 == 0 { print("кадр \(i)/\(frames)") }
  }
  input.markAsFinished()
  let done = DispatchSemaphore(value: 0)
  writer.finishWriting { done.signal() }
  done.wait()
}

// ——— звук: свой синтезатор, 44,1 кГц стерео ———
final class Mixer {
  let rate = 44100
  let seconds: Double
  var left: [Float], right: [Float]
  private var noiseSeed: UInt32 = 1

  init(seconds: Double) {
    self.seconds = seconds
    left = [Float](repeating: 0, count: Int(seconds * 44100))
    right = left
  }

  // f(t) — звук от момента at длиной len секунд; pan < 0 — левее, > 0 — правее
  func add(_ at: Double, _ len: Double, pan: Float = 0, _ f: (Double) -> Double) {
    let start = Int(at * Double(rate))
    for n in 0..<Int(len * Double(rate)) where start + n < left.count && start + n >= 0 {
      let v = Float(f(Double(n) / Double(rate)))
      left[start + n] += v * (1 - max(0, pan))
      right[start + n] += v * (1 + min(0, pan))
    }
  }

  func noise() -> Double {
    noiseSeed = noiseSeed &* 1664525 &+ 1013904223
    return Double(noiseSeed >> 8) / Double(1 << 23) - 1
  }

  // бит 120 BPM в ля миноре (Am – F – C – G): бочка, хлопок, хэт, бас, арпеджио
  func beat(from: Double, to: Double, soft: Bool = false) {
    let step = 0.5
    let chords: [[Double]] = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]]
    let roots: [Double] = [55, 43.65, 65.41, 49]
    let gain = soft ? 0.7 : 1.0
    var b = from, n = 0
    while b < to - 0.05 {
      let bar = Int((b - from) / 2) % 4
      add(b, 0.35, { (t: Double) -> Double in
        let f: Double = 45 + 110 * exp(-t * 30)
        return sin(2 * .pi * f * t) * 0.85 * gain * exp(-t * 9)
      })
      if n % 2 == 1 { add(b, 0.2, { t in self.noise() * 0.3 * gain * exp(-t * 22) }) }
      add(b + step / 2, 0.06, pan: 0.4, { t in self.noise() * 0.12 * gain * exp(-t * 70) })
      for e in 0..<2 {
        let f = roots[bar] * (e == 1 ? 2 : 1)
        add(b + Double(e) * step / 2, step / 2, { (t: Double) -> Double in
          let saw: Double = 2 * (f * t - floor(f * t + 0.5))
          let tone: Double = saw * 0.2 + sin(2 * .pi * f * t) * 0.28
          return tone * gain * min(1, t * 200) * exp(-t * 5)
        })
      }
      for s in 0..<4 {
        let tone = chords[bar][(n * 4 + s) % 3] * 2
        add(b + Double(s) * step / 4, step / 4, pan: s % 2 == 0 ? -0.35 : 0.35, { (t: Double) -> Double in
          let v: Double = sin(2 * .pi * tone * t) * 0.085 + sin(2 * .pi * tone * 2 * t) * 0.028
          return v * gain * exp(-t * 14)
        })
      }
      b += step
      n += 1
    }
  }

  // нарастающий шум перед первым ударом
  func riser(_ at: Double, _ len: Double) {
    add(at, len, { (t: Double) -> Double in self.noise() * 0.12 * pow(t / len, 2) })
  }
  // колокольчик
  func chime(_ at: Double, _ f: Double, pan: Float = 0) {
    add(at, 1.4, pan: pan, { (t: Double) -> Double in
      sin(2 * .pi * f * t) * 0.16 * exp(-t * 4) + sin(2 * .pi * f * 2.01 * t) * 0.05 * exp(-t * 6)
    })
  }
  // «вжух» к моменту at
  func whoosh(_ at: Double) {
    add(at - 0.45, 0.55, { (t: Double) -> Double in
      let rise: Double = pow(t / 0.55, 2)
      let tail: Double = t < 0.5 ? 1 : (0.55 - t) / 0.05
      return self.noise() * 0.26 * rise * tail
    })
  }
  // низкий удар
  func boom(_ at: Double) {
    add(at, 2.2, { (t: Double) -> Double in
      let f: Double = 38 + 60 * exp(-t * 10)
      return sin(2 * .pi * f * t) * 0.8 * exp(-t * 2.2) + self.noise() * 0.18 * exp(-t * 12)
    })
  }
  // щелчок нажатия на кнопку
  func tap(_ at: Double) {
    add(at, 0.06, pan: 0.15, { (t: Double) -> Double in
      sin(2 * .pi * 2400 * t) * 0.22 * exp(-t * 90) + self.noise() * 0.08 * exp(-t * 200)
    })
  }
  // «пузырёк» нового сообщения: два тона вверх
  func pop(_ at: Double) {
    add(at, 0.09, pan: -0.1, { (t: Double) -> Double in sin(2 * .pi * 880 * t) * 0.16 * exp(-t * 30) })
    add(at + 0.07, 0.14, pan: -0.1, { (t: Double) -> Double in sin(2 * .pi * 1320 * t) * 0.16 * exp(-t * 25) })
  }
  // звон монет — оплата, выполненный заказ
  func coin(_ at: Double) {
    for (i, f) in [1975.5, 2637.0].enumerated() {
      add(at + Double(i) * 0.08, 0.5, pan: 0.2, { (t: Double) -> Double in sin(2 * .pi * f * t) * 0.14 * exp(-t * 7) })
    }
  }

  // WAV 16 бит стерео; мягкое ограничение громкости и затухание в конце
  func wav(_ path: String) {
    var pcm = Data(capacity: left.count * 4)
    for n in 0..<left.count {
      let t = Double(n) / Double(rate)
      let fade = Float(min(1, max(0, (seconds - t) / 0.6)))
      for v in [left[n], right[n]] {
        let s = Int16(max(-1, min(1, tanh(v * 0.9) * fade)) * 32000)
        withUnsafeBytes(of: s.littleEndian) { pcm.append(contentsOf: $0) }
      }
    }
    func le<T: FixedWidthInteger>(_ v: T) -> Data { withUnsafeBytes(of: v.littleEndian) { Data($0) } }
    var out = Data("RIFF".utf8)
    let header: [Data] = [
      le(UInt32(36 + pcm.count)), Data("WAVEfmt ".utf8), le(UInt32(16)), le(UInt16(1)), le(UInt16(2)),
      le(UInt32(rate)), le(UInt32(rate * 4)), le(UInt16(4)), le(UInt16(16)), Data("data".utf8), le(UInt32(pcm.count)),
    ]
    for part in header { out.append(part) }
    out.append(pcm)
    try! out.write(to: URL(fileURLWithPath: path))
  }
}

// ——— склейка видео и звука в MP4 (H.264 + AAC) ———
func mux(video: String, audio wav: String, output: String, seconds: Double) {
  // звук — в AAC встроенным afconvert, чтобы MP4 играл на любом телефоне
  let audio = wav.replacingOccurrences(of: ".wav", with: ".m4a")
  let conv = Process()
  conv.executableURL = URL(fileURLWithPath: "/usr/bin/afconvert")
  conv.arguments = ["-f", "m4af", "-d", "aac", "-b", "192000", wav, audio]
  try! conv.run()
  conv.waitUntilExit()
  try? fm.removeItem(atPath: wav)
  let comp = AVMutableComposition()
  let range = CMTimeRange(start: .zero, duration: CMTime(seconds: seconds, preferredTimescale: 600))
  // файлы держим в переменных: дорожка без своего файла не читается
  let videoAsset = AVURLAsset(url: URL(fileURLWithPath: video))
  let audioAsset = AVURLAsset(url: URL(fileURLWithPath: audio))
  let vt = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
  try! vt.insertTimeRange(range, of: videoAsset.tracks(withMediaType: .video)[0], at: .zero)
  let at = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
  try! at.insertTimeRange(range, of: audioAsset.tracks(withMediaType: .audio)[0], at: .zero)
  try? fm.removeItem(atPath: output)
  // видео и звук уже сжаты — только складываем в MP4
  let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetPassthrough)!
  export.outputURL = URL(fileURLWithPath: output)
  export.outputFileType = .mp4
  let done = DispatchSemaphore(value: 0)
  export.exportAsynchronously { done.signal() }
  done.wait()
  try? fm.removeItem(atPath: video)
  try? fm.removeItem(atPath: audio)
  if export.status != .completed {
    print("ошибка:", export.error?.localizedDescription ?? "неизвестно")
    exit(1)
  }
  print("готово:", output)
}
