// ============================================================================
// «내 종목» 위젯 — 데이터: 공개 API · 레벨 정의 검사 · ET 달력 · 숫자 모양
// ----------------------------------------------------------------------------
// 가격은 앱 공용 시세 요청(/api/live/quotes — 앱 전체가 쓰는 한 줄기)에서, 옵션 레벨만 기존 묶음 요청
// (/api/watchlist/batch?mode=price)에서 받는다. 새 서버 경로는 없다(대표 9/30 «즐겨찾기가 별도로 운용할 이유가 없다»).
// 웹의 판정을 그대로 옮겼다(숫자를 지어내지 않는다):
//   레벨 검사  = src/lib/app/watchlistInsights.ts checkLevels (출처 구조 한 벌 · 정의 · 2거래일 이상 늦으면 숨김)
//   가격 없음  = useWatchlistData parseRealtime (가격 0 이하 → «못 받음», 0.00% 로 그리지 않는다)
//   숫자 모양  = fmtPrice · fmtSignedPct(2) · fmtLevel · 마이너스 U+2212
// ============================================================================

import Foundation

// MARK: - 값

struct QuoteRow: Codable, Hashable {
    let ticker: String
    var price: Double?
    var changePct: Double?
    var session: String?
    var callWall: Double?
    var putFloor: Double?
    var maxPain: Double?
    var gammaFlip: Double?
    var levelsSource: String?
    var hasLevelsMeta: Bool
    var levelsChainDate: String?
    var levelsDropped: [String]?
    /** 이 값을 받은 시각 — 기준 라벨·흐림 판정은 «지금»이 아니라 이 시각으로 */
    var receivedAt: Date?
}

struct QuoteSnapshot: Codable {
    var rows: [String: QuoteRow]
    var fetchedAt: Date
}

// MARK: - ET 달력

struct MarketCalendar {
    /** 2026–27 NYSE 휴장(웹 marketCalendar.ts 와 같다) — 앱이 브리지로 새 표를 넘기면 그것을 쓴다 */
    static let builtInHolidays: Set<String> = [
        "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
        "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
        "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
        "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
    ]
    static let builtInEarlyCloses: Set<String> = ["2026-11-27", "2026-12-24", "2027-11-26"]

    let holidays: Set<String>
    let earlyCloses: Set<String>
    private let cal: Calendar

    init(holidays: [String] = [], earlyCloses: [String] = []) {
        self.holidays = holidays.isEmpty ? Self.builtInHolidays : Set(holidays)
        self.earlyCloses = earlyCloses.isEmpty ? Self.builtInEarlyCloses : Set(earlyCloses)
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/New_York") ?? TimeZone(secondsFromGMT: -5 * 3600)!
        c.locale = Locale(identifier: "en_US_POSIX")
        cal = c
    }

    func etDate(_ d: Date) -> String {
        let c = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    func etMinutes(_ d: Date) -> Int {
        let c = cal.dateComponents([.hour, .minute], from: d)
        return ((c.hour ?? 0) % 24) * 60 + (c.minute ?? 0)
    }

    private func parts(_ s: String) -> (Int, Int, Int)? {
        let p = s.split(separator: "-").compactMap { Int($0) }
        return p.count == 3 ? (p[0], p[1], p[2]) : nil
    }

    /** 0=일 … 6=토 (날짜 문자열만 본다 — 타임존 변환 없음) */
    func weekday(_ s: String) -> Int {
        guard let (y, m, d) = parts(s) else { return 1 }
        var g = Calendar(identifier: .gregorian)
        g.timeZone = TimeZone(identifier: "UTC")!
        guard let date = g.date(from: DateComponents(year: y, month: m, day: d)) else { return 1 }
        return g.component(.weekday, from: date) - 1
    }

    func shift(_ s: String, _ delta: Int) -> String {
        guard let (y, m, d) = parts(s) else { return s }
        var g = Calendar(identifier: .gregorian)
        g.timeZone = TimeZone(identifier: "UTC")!
        guard let base = g.date(from: DateComponents(year: y, month: m, day: d)),
              let x = g.date(byAdding: .day, value: delta, to: base) else { return s }
        let c = g.dateComponents([.year, .month, .day], from: x)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }

    func isTradingDay(_ s: String) -> Bool {
        let w = weekday(s)
        return w != 0 && w != 6 && !holidays.contains(s)
    }

    func closeMinutes(_ s: String) -> Int { earlyCloses.contains(s) ? 13 * 60 : 16 * 60 }

    func prevTradingDay(_ s: String) -> String {
        var x = shift(s, -1)
        var i = 0
        while i < 12 && !isTradingDay(x) { x = shift(x, -1); i += 1 }
        return x
    }

    func nextTradingDay(_ s: String) -> String {
        var x = shift(s, 1)
        var i = 0
        while i < 12 && !isTradingDay(x) { x = shift(x, 1); i += 1 }
        return x
    }

    /** 마지막으로 끝난 정규장 날짜 */
    func lastCompletedSession(_ now: Date) -> String {
        let d = etDate(now)
        if isTradingDay(d) && etMinutes(now) >= closeMinutes(d) { return d }
        return prevTradingDay(d)
    }

    /** 옵션 체인 판본이 적어도 이 날짜여야 한다(ET 06:00 경계 · 웹 expectedChainDate) */
    func expectedChainDate(_ now: Date) -> String {
        let d = etDate(now.addingTimeInterval(-6 * 3600))
        let effective = isTradingDay(d) ? d : nextTradingDay(d)
        return prevTradingDay(effective)
    }

    /** 2거래일 이상 늦었나(웹 isTooStaleLevels) */
    func isTooStaleLevels(_ chainDate: String, now: Date) -> Bool {
        guard SignumWidgetShared.isDateString(String(chainDate.prefix(10))) else { return false }
        return String(chainDate.prefix(10)) < prevTradingDay(expectedChainDate(now))
    }

    func isRegularOpen(_ now: Date) -> Bool {
        let d = etDate(now)
        let m = etMinutes(now)
        return isTradingDay(d) && m >= 9 * 60 + 30 && m < closeMinutes(d)
    }

    /**
     * 다음 갱신 — 정규장 15분 · 프리마켓 60분(개장 1분 뒤로 당김) · 장 마감 직후 한 번(종가 확정) · 그 밖 60분.
     * 하루 약 40회로 WidgetKit 예산 안.
     */
    func nextRefresh(after now: Date) -> Date {
        let d = etDate(now)
        let m = etMinutes(now)
        if isTradingDay(d) {
            let close = closeMinutes(d)
            if m >= 570 && m < close { return now.addingTimeInterval(15 * 60) }
            if m >= 240 && m < 570 {
                let untilOpen = Double(570 - m) * 60 + 60
                return now.addingTimeInterval(min(3600, max(15 * 60, untilOpen)))
            }
            if m >= close && m < close + 25 { return now.addingTimeInterval(20 * 60) }
        }
        return now.addingTimeInterval(3600)
    }
}

// MARK: - 레벨 검사(웹 checkLevels)

struct MapGeometry: Hashable {
    /** 0~1 — 풋 플로어(0) ~ 콜 월(1) 사이 자리 */
    let px: Double
    let mp: Double
    let pf: Double
    let cw: Double
    let maxPain: Double
    let mpClamped: Bool
}

enum Levels {
    static let callWallMax = 1.2, putFloorMin = 0.8, gammaFlip = 0.15, maxPainBand = 0.2

    static func pos(_ v: Double?) -> Double? {
        guard let v, v.isFinite, v > 0 else { return nil }
        return v
    }

    /** 지도를 그려도 되면 기하, 아니면 nil(바 생략) */
    static func geometry(_ r: QuoteRow, now: Date, cal: MarketCalendar) -> MapGeometry? {
        guard r.hasLevelsMeta, let S = pos(r.price), r.levelsSource == "structure" else { return nil }
        guard let pf = pos(r.putFloor), let cw = pos(r.callWall), let mp = pos(r.maxPain) else { return nil }
        let eps = S * 1e-9
        guard cw > S && cw <= S * callWallMax + eps else { return nil }
        guard pf < S && pf >= S * putFloorMin - eps else { return nil }
        guard abs(mp - S) <= S * maxPainBand + eps else { return nil }
        if let gf = pos(r.gammaFlip), abs(gf - S) > S * gammaFlip + eps { return nil }
        if let cd = r.levelsChainDate, SignumWidgetShared.isDateString(String(cd.prefix(10))),
           cal.isTooStaleLevels(cd, now: now) { return nil }
        let span = cw - pf
        let at = { (x: Double) -> Double in span > 0 ? (x - pf) / span : 0.5 }
        let clamp = { (x: Double) -> Double in min(1, max(0, x)) }
        let rawMp = at(mp)
        return MapGeometry(px: clamp(at(S)), mp: clamp(rawMp), pf: pf, cw: cw, maxPain: mp, mpClamped: rawMp < 0 || rawMp > 1)
    }
}

// MARK: - 숫자 모양

enum Fmt {
    static let minus = "\u{2212}"

    private static func number(_ n: Double, min: Int, max: Int) -> String {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.minimumFractionDigits = min
        f.maximumFractionDigits = max
        f.roundingMode = .halfUp
        return f.string(from: NSNumber(value: n)) ?? String(format: "%.2f", n)
    }

    /** $1,053.98 — 10만 달러 이상은 소수점 없이 */
    static func price(_ n: Double) -> String {
        let digits = n >= 100_000 ? 0 : 2
        return "$" + number(n, min: digits, max: digits)
    }

    /** 가격만(달러 기호 없이) — 좁은 칸 */
    static func priceBare(_ n: Double) -> String {
        let digits = n >= 100_000 ? 0 : 2
        return number(n, min: digits, max: digits)
    }

    /** +1.78% · −2.50% · 0.00% */
    static func pct(_ x: Double, digits: Int = 2) -> String {
        let p = pow(10.0, Double(digits))
        let r = (x * p).rounded() / p
        let abs = String(format: "%.\(digits)f", Swift.abs(r))
        if r > 0 { return "+\(abs)%" }
        if r < 0 { return "\(minus)\(abs)%" }
        return "\(abs)%"
    }

    /** 1,100 · 337.5 (끝의 0 은 지운다) */
    static func level(_ n: Double) -> String { number(n, min: 0, max: 2) }
}

// MARK: - 공개 API

enum WatchlistAPI {
    static let base = "https://www.signumhq.com"

    private static func num(_ v: Any?) -> Double? {
        if let d = v as? Double, d.isFinite { return d }
        if let n = v as? NSNumber { let d = n.doubleValue; return d.isFinite ? d : nil }
        return nil
    }

    static func parse(_ data: Data) -> [String: QuoteRow] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let results = root["results"] as? [[String: Any]] else { return [:] }
        var out: [String: QuoteRow] = [:]
        for r in results {
            guard let t = (r["ticker"] as? String).flatMap(SignumWidgetShared.normalizeTicker),
                  let rt = r["realtime"] as? [String: Any] else { continue }
            let px = num(rt["price"])
            let got = (px ?? 0) > 0
            out[t] = QuoteRow(
                ticker: t,
                price: got ? px : nil,
                changePct: got ? num(rt["changePct"]) : nil,
                session: rt["session"] as? String,
                callWall: num(rt["callWall"]),
                putFloor: num(rt["putFloor"]),
                maxPain: num(rt["maxPain"]),
                gammaFlip: num(rt["gammaFlipLevel"]),
                levelsSource: rt["levelsSource"] as? String,
                hasLevelsMeta: rt.keys.contains("levelsSource"),
                levelsChainDate: rt["levelsChainDate"] as? String,
                levelsDropped: rt["levelsDropped"] as? [String]
            )
        }
        return out
    }

    static func fetch(_ tickers: [String], timeout: TimeInterval = 12, now: Date = Date()) async throws -> [String: QuoteRow] {
        guard !tickers.isEmpty else { return [:] }
        var comps = URLComponents(string: "\(base)/api/watchlist/batch")!
        comps.queryItems = [URLQueryItem(name: "mode", value: "price"), URLQueryItem(name: "tickers", value: tickers.joined(separator: ","))]
        var req = URLRequest(url: comps.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else { throw URLError(.badServerResponse) }
        var rows = parse(data)
        if rows.isEmpty { throw URLError(.cannotParseResponse) }
        for k in rows.keys { rows[k]?.receivedAt = now }
        return rows
    }

    /**
     * 앱 공용 시세(/api/live/quotes) — 가격·등락·세션. 정규장 밖 price 는 마지막 정규장 종가(앱 화면과 같은 뜻).
     * 프리마켓에 day 바가 비면 changePercent 가 null 로 온다(라우트 주석: «클라이언트는 묶음 값으로 폴백») → nil 로 둔다.
     */
    static func parseLive(_ data: Data, now: Date) -> [String: QuoteRow] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let map = root["data"] as? [String: Any] else { return [:] }
        let topSession = root["session"] as? String
        var out: [String: QuoteRow] = [:]
        for (k, v) in map {
            guard let t = SignumWidgetShared.normalizeTicker(k), let q = v as? [String: Any] else { continue }
            let px = num(q["price"])
            let got = (px ?? 0) > 0
            let rawSession = (q["session"] as? String) ?? topSession
            out[t] = QuoteRow(
                ticker: t,
                price: got ? px : nil,
                changePct: got ? num(q["changePercent"]) : nil,
                session: rawSession == "regular" ? "reg" : rawSession,
                callWall: nil, putFloor: nil, maxPain: nil, gammaFlip: nil,
                levelsSource: nil, hasLevelsMeta: false, levelsChainDate: nil, levelsDropped: nil,
                receivedAt: got ? now : nil
            )
        }
        return out
    }

    static func fetchLive(_ tickers: [String], timeout: TimeInterval = 10, now: Date = Date()) async throws -> [String: QuoteRow] {
        guard !tickers.isEmpty else { return [:] }
        var comps = URLComponents(string: "\(base)/api/live/quotes")!
        comps.queryItems = [URLQueryItem(name: "symbols", value: tickers.joined(separator: ","))]
        var req = URLRequest(url: comps.url!, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else { throw URLError(.badServerResponse) }
        let rows = parseLive(data, now: now)
        if rows.values.allSatisfy({ $0.price == nil }) { throw URLError(.cannotParseResponse) }
        return rows
    }

    /**
     * 가격·등락은 공용 시세가 이긴다(앱 다른 화면과 같은 숫자). 레벨·세션 없는 칸은 묶음 값으로 채운다.
     * 공용 시세가 못 준 종목(가격 0 · 등락 null)은 묶음 값을 그대로 쓴다 — 지어내지 않고 «있는 값»만.
     */
    static func merge(live: [String: QuoteRow]?, batch: [String: QuoteRow]?, tickers: [String]) -> [String: QuoteRow] {
        var out: [String: QuoteRow] = [:]
        for t in tickers {
            let l = live?[t], b = batch?[t]
            guard var row = b ?? l else { continue }
            if let l, let p = l.price {
                row.price = p
                row.changePct = l.changePct ?? (b?.changePct)
                row.session = l.session ?? b?.session
                row.receivedAt = l.receivedAt ?? b?.receivedAt
            }
            out[t] = row
        }
        return out
    }

    // 마지막으로 잘 받은 값(네트워크 실패 때 흐리게)
    static func loadCache() -> QuoteSnapshot? {
        guard let url = SignumWidgetShared.quotesURL, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(QuoteSnapshot.self, from: data)
    }

    static func saveCache(_ rows: [String: QuoteRow], at: Date) {
        guard let url = SignumWidgetShared.quotesURL else { return }
        var merged = loadCache()?.rows ?? [:]
        for (k, v) in rows { merged[k] = v }
        // 목록에서 빠진 종목이 끝없이 쌓이지 않게 — 지금 목록 + 이번에 받은 것만
        let keep = Set(SignumWidgetShared.readSnapshot().tickers).union(rows.keys)
        merged = merged.filter { keep.contains($0.key) }
        if let data = try? JSONEncoder().encode(QuoteSnapshot(rows: merged, fetchedAt: at)) {
            try? data.write(to: url, options: .atomic)
        }
    }
}

// MARK: - 언어

enum WLLocale: String {
    case ko, en, ja

    /** 앱에서 고른 언어(브리지) → 기기 언어 → 영어 */
    static func resolve(_ saved: String?) -> WLLocale {
        if let s = saved, let l = WLLocale(rawValue: s) { return l }
        let pref = (Locale.preferredLanguages.first ?? "en").prefix(2).lowercased()
        return WLLocale(rawValue: String(pref)) ?? .en
    }
}

struct WLText {
    let title: String
    let empty: String
    let notSynced: String
    let openApp: String

    static func of(_ l: WLLocale) -> WLText {
        switch l {
        case .ko: return WLText(title: "내 종목", empty: "앱에서 ♡ 로 담으면 여기 보입니다",
                                notSynced: "앱을 열면 내 종목이 여기 보입니다", openApp: "앱 열기")
        case .ja: return WLText(title: "マイ銘柄", empty: "アプリで♡を押すとここに表示されます",
                                notSynced: "アプリを開くとマイ銘柄がここに表示されます", openApp: "アプリを開く")
        case .en: return WLText(title: "My Watchlist", empty: "Tap ♡ in the app to see stocks here",
                                notSynced: "Open the app to see your watchlist here", openApp: "Open app")
        }
    }

    private static let weekdays: [WLLocale: [String]] = [
        .ko: ["일", "월", "화", "수", "목", "금", "토"],
        .ja: ["日", "月", "火", "水", "木", "金", "土"],
        .en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    ]

    /** 머리 오른쪽 기준 — «9/29 장중 · 23:42» · «9/28(월) 종가» (웹 priceBasisLabel 과 같은 말) */
    static func basis(session: String?, at: Date, cal: MarketCalendar, loc: WLLocale) -> String {
        func md(_ d: String) -> String {
            let p = d.split(separator: "-").compactMap { Int($0) }
            return p.count == 3 ? "\(p[1])/\(p[2])" : d
        }
        if session == "reg" {
            let f = DateFormatter()
            f.locale = Locale(identifier: loc == .ko ? "ko_KR" : loc == .ja ? "ja_JP" : "en_US")
            f.dateFormat = loc == .en ? "h:mm a" : "HH:mm"
            let time = f.string(from: at)
            let d = md(cal.etDate(at))
            switch loc {
            case .ko: return "\(d) 장중 · \(time)"
            case .ja: return "\(d) 取引中 · \(time)"
            case .en: return "Intraday · \(time)"
            }
        }
        let d = cal.lastCompletedSession(at)
        let wd = weekdays[loc]?[cal.weekday(d)] ?? ""
        switch loc {
        case .ko: return "\(md(d))(\(wd)) 종가"
        case .ja: return "\(md(d))(\(wd)) 終値"
        case .en: return "\(wd) \(md(d)) close"
        }
    }
}
