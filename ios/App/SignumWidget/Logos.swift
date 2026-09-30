// ============================================================================
// «내 종목» 위젯 — 로고: 앱이 그리는 그대로(AppTickerLogo)
// ----------------------------------------------------------------------------
// ① 앱(웹뷰)이 브리지로 넘긴 PNG(원형·테두리까지 그려진 최종 모습) — 가장 먼저 쓴다
// ② 없으면 /api/logo/<T>?v=3 를 받아 같은 규칙으로 만든다:
//      불투명 정사각 아이콘 → 원을 꽉 채움(cover) · 투명·가로형 마크 → 밝은 칩 위에 12% 여백(contain)
//    SVG(AMZN 큐레이션·이니셜 폴백)는 위젯이 못 그린다 → 하루 동안 다시 묻지 않고 ③
// ③ 이니셜 칩 — 서버 폴백(initialChipSvg)과 같은 색(hashHue)·같은 글자 크기를 SwiftUI 로
// ============================================================================

import Foundation
import UIKit
import SwiftUI

enum LogoStore {
    static let px: CGFloat = 96

    static func image(for ticker: String) -> UIImage? {
        guard let url = SignumWidgetShared.logoURL(for: ticker), let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }

    /** 없는 로고만 받는다(병렬 · 전체 시간 상한). 받은 것이 있으면 true */
    @discardableResult
    static func ensure(_ tickers: [String], budget: TimeInterval = 6) async -> Bool {
        let now = Date()
        let missing = tickers.filter { t in
            guard let url = SignumWidgetShared.logoURL(for: t) else { return false }
            if FileManager.default.fileExists(atPath: url.path) { return false }
            if let miss = SignumWidgetShared.logoMissAt(t), now.timeIntervalSince(miss) < 24 * 3600 { return false }
            return true
        }
        guard !missing.isEmpty else { return false }
        return await withTaskGroup(of: Bool.self) { group in
            for t in missing.prefix(8) {
                group.addTask { await fetchOne(t, timeout: budget) }
            }
            var any = false
            for await ok in group { any = any || ok }
            return any
        }
    }

    private static func fetchOne(_ ticker: String, timeout: TimeInterval) async -> Bool {
        guard let t = SignumWidgetShared.normalizeTicker(ticker),
              let enc = t.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(WatchlistAPI.base)/api/logo/\(enc)?v=3") else { return false }
        var req = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: timeout)
        req.setValue("image/png,image/jpeg,image/*;q=0.8", forHTTPHeaderField: "Accept")
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            let type = (resp as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type")?.lowercased() ?? ""
            guard (resp as? HTTPURLResponse)?.statusCode == 200, !type.contains("svg"),
                  let img = UIImage(data: data), img.size.width >= 8, let png = chipPNG(from: img) else {
                SignumWidgetShared.noteLogoMiss(t)
                return false
            }
            return SignumWidgetShared.writeLogo(ticker: t, png: png)
        } catch {
            return false   // 네트워크 실패는 «없음»으로 굳히지 않는다 — 다음 갱신에 다시
        }
    }

    /** AppTickerLogo.decideFit — 거의 정사각이고 네 모서리가 불투명하면 앱 아이콘(꽉 채움) */
    static func isOpaqueSquare(_ img: UIImage) -> Bool {
        guard let cg = img.cgImage, cg.height > 0 else { return false }
        let ar = Double(cg.width) / Double(cg.height)
        guard ar >= 0.82 && ar <= 1.22 else { return false }
        let n = 12
        var pixels = [UInt8](repeating: 0, count: n * n * 4)
        let ok: Bool = pixels.withUnsafeMutableBytes { buf -> Bool in
            guard let ctx = CGContext(data: buf.baseAddress, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.interpolationQuality = .medium
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: n, height: n))
            return true
        }
        guard ok else { return false }
        return [0, n - 1, n * (n - 1), n * n - 1].allSatisfy { pixels[$0 * 4 + 3] > 245 }
    }

    /** 원형 칩 PNG(테두리 포함) — 앱 로고와 같은 모습 */
    static func chipPNG(from img: UIImage, size: CGFloat = px) -> Data? {
        let cover = isOpaqueSquare(img)
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        fmt.opaque = false
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size), format: fmt)
        return renderer.pngData { ctx in
            let rect = CGRect(x: 0, y: 0, width: size, height: size)
            let cg = ctx.cgContext
            cg.saveGState()
            cg.addEllipse(in: rect)
            cg.clip()
            if cover {
                img.draw(in: rect)
            } else {
                let colors = [UIColor(white: 1, alpha: 0.97).cgColor,
                              UIColor(red: 224 / 255, green: 231 / 255, blue: 240 / 255, alpha: 0.92).cgColor] as CFArray
                if let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
                    let c = CGPoint(x: size * 0.35, y: size * 0.25)
                    cg.drawRadialGradient(grad, startCenter: c, startRadius: 0, endCenter: c, endRadius: size, options: [.drawsAfterEndLocation])
                }
                let pad = max(2, (size * 0.12).rounded())
                let box = size - pad * 2
                let w = max(1, img.size.width), h = max(1, img.size.height)
                let s = min(box / w, box / h)
                let dw = w * s, dh = h * s
                img.draw(in: CGRect(x: (size - dw) / 2, y: (size - dh) / 2, width: dw, height: dh))
            }
            cg.restoreGState()
            let lw = size / 22
            cg.setLineWidth(lw)
            cg.setStrokeColor(UIColor(white: 1, alpha: cover ? 0.10 : 0.16).cgColor)
            cg.strokeEllipse(in: rect.insetBy(dx: lw / 2, dy: lw / 2))
        }
    }

    /** 갤러리 미리보기용 — 위젯 번들에 든 원본(Assets: logo-NVDA …)을 같은 규칙으로 */
    static func bundledSample(_ ticker: String) -> UIImage? {
        guard let raw = UIImage(named: "logo-\(ticker)"), let png = chipPNG(from: raw) else { return nil }
        return UIImage(data: png)
    }
}

// MARK: - 이니셜 칩(서버 initialChipSvg 와 같은 색)

enum InitialChipStyle {
    /** 서버 hashHue — h = (h*31 + code) >>> 0, % 360 */
    static func hue(_ symbol: String) -> Int {
        var h: UInt32 = 0
        for u in symbol.utf16 { h = h &* 31 &+ UInt32(u) }
        return Int(h % 360)
    }

    static func hsl(_ h: Double, _ s: Double, _ l: Double) -> Color {
        let c = (1 - abs(2 * l - 1)) * s
        let hp = h / 60
        let x = c * (1 - abs(hp.truncatingRemainder(dividingBy: 2) - 1))
        var (r, g, b) = (0.0, 0.0, 0.0)
        switch hp {
        case 0..<1: (r, g, b) = (c, x, 0)
        case 1..<2: (r, g, b) = (x, c, 0)
        case 2..<3: (r, g, b) = (0, c, x)
        case 3..<4: (r, g, b) = (0, x, c)
        case 4..<5: (r, g, b) = (x, 0, c)
        default: (r, g, b) = (c, 0, x)
        }
        let m = l - c / 2
        return Color(red: r + m, green: g + m, blue: b + m)
    }

    /** 라우트와 같은 글자 정리(BRK.B → BRKB) */
    static func symbol(_ ticker: String) -> String {
        String(ticker.uppercased().unicodeScalars.filter { ($0.value >= 65 && $0.value <= 90) || ($0.value >= 48 && $0.value <= 57) }.map(Character.init))
    }
}

struct InitialChip: View {
    let ticker: String

    var body: some View {
        GeometryReader { geo in
            let s = min(geo.size.width, geo.size.height)
            let pad = max(2, (s * 0.12).rounded())
            let inner = s - pad * 2
            let sym = InitialChipStyle.symbol(ticker)
            let label = String(sym.prefix(4))
            let hue = Double(InitialChipStyle.hue(sym))
            let fs: CGFloat = label.count >= 4 ? 25 : label.count == 3 ? 30 : label.count == 2 ? 36 : 42
            ZStack {
                Circle().fill(RadialGradient(colors: [Color.white.opacity(0.97), Color(red: 224 / 255, green: 231 / 255, blue: 240 / 255).opacity(0.92)],
                                             center: UnitPoint(x: 0.35, y: 0.25), startRadius: 0, endRadius: s))
                RoundedRectangle(cornerRadius: inner * 0.24, style: .continuous)
                    .fill(LinearGradient(colors: [InitialChipStyle.hsl(hue, 0.60, 0.44),
                                                  InitialChipStyle.hsl((hue + 26).truncatingRemainder(dividingBy: 360), 0.58, 0.26)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: inner, height: inner)
                Text(label)
                    .font(.system(size: inner * fs / 100, weight: .heavy))
                    .kerning(-inner / 100)
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .frame(width: inner * 0.92)
                Circle().strokeBorder(Color.white.opacity(0.16), lineWidth: max(0.5, s / 22))
            }
            .frame(width: s, height: s)
        }
    }
}

/** 행의 로고 — 파일이 있으면 그 그림, 없으면 이니셜 칩 */
struct TickerLogo: View {
    let ticker: String
    let image: UIImage?
    let size: CGFloat

    var body: some View {
        Group {
            if let image {
                let img = Image(uiImage: image).resizable().interpolation(.high).antialiased(true)
                if #available(iOSApplicationExtension 18.0, *) {
                    // 틴트 홈 화면: 로고가 흰 원으로 뭉개지지 않게 흑백으로
                    img.widgetAccentedRenderingMode(.desaturated)
                } else {
                    img
                }
            } else {
                InitialChip(ticker: ticker)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
