// ============================================================================
// «내 종목» 위젯 — 앱과 위젯 확장이 함께 쓰는 저장소 (두 타깃에 모두 컴파일된다)
// ----------------------------------------------------------------------------
// 앱(웹뷰)의 목록은 localStorage 에만 있다 → WidgetBridgePlugin 이 여기(App Group)에 적고,
// 위젯 확장(SignumWidget)이 읽는다. 설계서: .agent/product/WIDGET-PLAN-2026-09-29.md
//
//   UserDefaults(suiteName: group.com.signumhq.app)
//     wl.tickers      [String]   앱 목록 순서 그대로
//     wl.names        [String:String]  앞쪽 종목 이름(앱 언어)
//     wl.locale       "ko"|"en"|"ja"   앱에서 고른 언어
//     wl.updatedAt    Double(ms)       웹이 목록을 만든 시각
//     wl.syncedAt     Double(s)        네이티브가 받은 시각 — 없으면 «새 앱을 아직 안 열었다»
//     wl.holidays / wl.earlyCloses [String]  휴장·조기 폐장(ET 날짜) — 앱이 넘긴 달력
//   <컨테이너>/WidgetLogos/<TICKER>.png   로고(앱이 그린 그대로 · 없으면 위젯이 받아 만든다)
//   <컨테이너>/widget-quotes.json         마지막으로 잘 받은 가격(네트워크 실패 때 흐리게 보여 준다)
// ============================================================================

import Foundation

enum SignumWidgetShared {
    static let appGroup = "group.com.signumhq.app"
    static let widgetKind = "SignumWatchlistWidget"
    static let urlScheme = "signumhq-app"
    /** 앱이 담을 수 있는 상한(웹 MAX_ITEMS) */
    static let maxItems = 100

    enum Key {
        static let tickers = "wl.tickers"
        static let names = "wl.names"
        static let locale = "wl.locale"
        static let updatedAt = "wl.updatedAt"
        static let syncedAt = "wl.syncedAt"
        static let holidays = "wl.holidays"
        static let earlyCloses = "wl.earlyCloses"
        static let logoMiss = "wl.logoMiss"
    }

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }

    static var logoDirectory: URL? {
        guard let base = containerURL else { return nil }
        let dir = base.appendingPathComponent("WidgetLogos", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    static func logoURL(for ticker: String) -> URL? {
        guard let t = normalizeTicker(ticker) else { return nil }
        return logoDirectory?.appendingPathComponent("\(t).png")
    }

    static var quotesURL: URL? { containerURL?.appendingPathComponent("widget-quotes.json") }

    /** 웹 normalizeTicker 와 같은 규칙 — 미국 상장 티커 모양(BRK.B·BF-B 포함)만 */
    static func normalizeTicker(_ raw: String) -> String? {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard (1...10).contains(t.count), let first = t.unicodeScalars.first,
              CharacterSet.uppercaseLetters.contains(first), first.isASCII else { return nil }
        for s in t.unicodeScalars {
            let ok = (s.value >= 65 && s.value <= 90) || (s.value >= 48 && s.value <= 57) || s == "." || s == "-"
            if !ok { return nil }
        }
        return t
    }

    static func isDateString(_ s: String) -> Bool {
        guard s.count == 10 else { return false }
        let parts = s.split(separator: "-")
        return parts.count == 3 && parts[0].count == 4 && parts[1].count == 2 && parts[2].count == 2
            && parts.allSatisfy { $0.allSatisfy(\.isNumber) }
    }

    struct Snapshot {
        var tickers: [String]
        var names: [String: String]
        var locale: String?
        var syncedAt: Date?
        var holidays: [String]
        var earlyCloses: [String]
    }

    static func readSnapshot() -> Snapshot {
        let d = defaults
        let tickers = (d?.stringArray(forKey: Key.tickers) ?? []).compactMap(normalizeTicker)
        let names = (d?.dictionary(forKey: Key.names) as? [String: String]) ?? [:]
        let synced = d?.object(forKey: Key.syncedAt) as? Double
        return Snapshot(
            tickers: tickers,
            names: names,
            locale: d?.string(forKey: Key.locale),
            syncedAt: synced.map { Date(timeIntervalSince1970: $0) },
            holidays: d?.stringArray(forKey: Key.holidays) ?? [],
            earlyCloses: d?.stringArray(forKey: Key.earlyCloses) ?? []
        )
    }

    /// 목록을 적는다. 바뀐 것이 있으면 true(위젯을 다시 그릴 까닭).
    @discardableResult
    static func writeWatchlist(tickers: [String], names: [String: String], locale: String?, updatedAt: Double?,
                               holidays: [String], earlyCloses: [String]) -> Bool {
        guard let d = defaults else { return false }
        var seen = Set<String>()
        let clean = tickers.compactMap(normalizeTicker).filter { seen.insert($0).inserted }.prefix(maxItems)
        let list = Array(clean)
        var cleanNames: [String: String] = [:]
        for (k, v) in names {
            guard let t = normalizeTicker(k), seen.contains(t) else { continue }
            let n = v.trimmingCharacters(in: .whitespacesAndNewlines)
            if !n.isEmpty { cleanNames[t] = String(n.prefix(40)) }
        }
        let loc = ["ko", "en", "ja"].contains(locale ?? "") ? locale : nil
        let hol = holidays.filter(isDateString).sorted()
        let early = earlyCloses.filter(isDateString).sorted()

        let changed = (d.stringArray(forKey: Key.tickers) ?? []) != list
            || ((d.dictionary(forKey: Key.names) as? [String: String]) ?? [:]) != cleanNames
            || d.string(forKey: Key.locale) != loc
            || d.object(forKey: Key.syncedAt) == nil
        d.set(list, forKey: Key.tickers)
        d.set(cleanNames, forKey: Key.names)
        if let loc { d.set(loc, forKey: Key.locale) }
        if let updatedAt { d.set(updatedAt, forKey: Key.updatedAt) }
        if !hol.isEmpty { d.set(hol, forKey: Key.holidays) }
        if !early.isEmpty { d.set(early, forKey: Key.earlyCloses) }
        d.set(Date().timeIntervalSince1970, forKey: Key.syncedAt)
        return changed
    }

    /// PNG 한 장을 적는다(검사는 부르는 쪽이 한다). 같은 바이트면 false.
    @discardableResult
    static func writeLogo(ticker: String, png: Data) -> Bool {
        guard let url = logoURL(for: ticker) else { return false }
        if let old = try? Data(contentsOf: url), old == png { return false }
        do {
            try png.write(to: url, options: .atomic)
            clearLogoMiss(ticker)
            return true
        } catch {
            return false
        }
    }

    /// 로고를 못 받은(SVG·실패) 종목 — 하루 동안 다시 묻지 않는다
    static func logoMissAt(_ ticker: String) -> Date? {
        guard let t = normalizeTicker(ticker), let m = defaults?.dictionary(forKey: Key.logoMiss) as? [String: Double],
              let at = m[t] else { return nil }
        return Date(timeIntervalSince1970: at)
    }

    static func noteLogoMiss(_ ticker: String) {
        guard let t = normalizeTicker(ticker), let d = defaults else { return }
        var m = (d.dictionary(forKey: Key.logoMiss) as? [String: Double]) ?? [:]
        m[t] = Date().timeIntervalSince1970
        if m.count > 200 { m = Dictionary(uniqueKeysWithValues: m.sorted { $0.value > $1.value }.prefix(120).map { ($0.key, $0.value) }) }
        d.set(m, forKey: Key.logoMiss)
    }

    static func clearLogoMiss(_ ticker: String) {
        guard let t = normalizeTicker(ticker), let d = defaults,
              var m = d.dictionary(forKey: Key.logoMiss) as? [String: Double], m[t] != nil else { return }
        m.removeValue(forKey: t)
        d.set(m, forKey: Key.logoMiss)
    }

    static func tickerURL(_ ticker: String) -> URL {
        let t = normalizeTicker(ticker) ?? ""
        return URL(string: "\(urlScheme)://ticker/\(t)") ?? watchlistURL
    }

    static let watchlistURL = URL(string: "signumhq-app://watchlist")!
}
