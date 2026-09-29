// ============================================================================
// «내 종목» 홈 화면 위젯 — 위젯 정의 · 타임라인 · 불러오기
// 설계서: .agent/product/WIDGET-PLAN-2026-09-29.md
// ============================================================================

import WidgetKit
import SwiftUI

@main
struct SignumWidgetBundle: WidgetBundle {
    var body: some Widget {
        WatchlistWidget()
    }
}

struct WatchlistWidget: Widget {
    let kind = SignumWidgetShared.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WatchlistProvider()) { entry in
            WatchlistWidgetView(entry: entry)
        }
        .configurationDisplayName(Text("widget.name"))
        .description(Text("widget.description"))
        .supportedFamilies(Self.families)
        .contentMarginsDisabledIfAvailable()
    }

    static var families: [WidgetFamily] {
        if #available(iOSApplicationExtension 16.0, *) {
            return [.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular]
        }
        return [.systemSmall, .systemMedium, .systemLarge]
    }
}

extension WidgetConfiguration {
    /** 여백은 위젯이 직접 둔다(iOS 15~26 모두 같은 밀도) */
    func contentMarginsDisabledIfAvailable() -> some WidgetConfiguration {
        if #available(iOSApplicationExtension 17.0, *) {
            return self.contentMarginsDisabled()
        } else {
            return self
        }
    }
}

// MARK: - 항목

struct RowModel: Identifiable {
    var id: String { ticker }
    let ticker: String
    let name: String?
    let price: Double?
    let changePct: Double?
    let map: MapGeometry?
    let logo: UIImage?
    /** 오래된 값(네트워크 실패로 마지막 정상값을 보여 줌) — 앱 dStale 처럼 흐리게 */
    let dim: Bool

    var url: URL { SignumWidgetShared.tickerURL(ticker) }
    var priceText: String { price.map(Fmt.price) ?? "—" }
    var priceBareText: String { price.map(Fmt.priceBare) ?? "—" }
    var pctText: String { changePct.map { Fmt.pct($0) } ?? "" }
    var direction: Int { guard let c = changePct else { return 0 }; let r = (c * 100).rounded(); return r > 0 ? 1 : r < 0 ? -1 : 0 }
    /** 잠금화면(단색) — 색 대신 ▲▼ */
    var arrowPct: String {
        guard let c = changePct else { return price == nil ? "—" : "" }
        let body = String(format: "%.2f%%", abs((c * 100).rounded() / 100))
        return direction > 0 ? "▲\(body)" : direction < 0 ? "▼\(body)" : body
    }
    var accessibilityText: String {
        [ticker, name, price.map(Fmt.price), changePct.map { Fmt.pct($0) }].compactMap { $0 }.joined(separator: ", ")
    }
}

enum EntryState { case notSynced, empty, rows }

struct WatchlistEntry: TimelineEntry {
    let date: Date
    let state: EntryState
    let rows: [RowModel]
    let locale: WLLocale
    let basis: String?
    /** 갤러리 마지막 수단(값을 못 받음) — 가격 자리는 뼈대로 가린다(숫자를 지어 보여 주지 않는다) */
    var isSample = false
    var text: WLText { WLText.of(locale) }
}

// MARK: - 타임라인

struct WatchlistProvider: TimelineProvider {
    func placeholder(in context: Context) -> WatchlistEntry {
        WatchlistLoader.sample(family: context.family, locale: WLLocale.resolve(SignumWidgetShared.readSnapshot().locale), quotes: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (WatchlistEntry) -> Void) {
        Task {
            if context.isPreview {
                completion(await WatchlistLoader.preview(family: context.family))
            } else {
                completion(await WatchlistLoader.load(family: context.family))
            }
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WatchlistEntry>) -> Void) {
        Task {
            let now = Date()
            let entry = await WatchlistLoader.load(family: context.family, now: now)
            let snap = SignumWidgetShared.readSnapshot()
            let cal = MarketCalendar(holidays: snap.holidays, earlyCloses: snap.earlyCloses)
            completion(Timeline(entries: [entry], policy: .after(cal.nextRefresh(after: now))))
        }
    }
}

enum WatchlistLoader {
    static let sampleTickers = ["NVDA", "AAPL", "TSLA", "MU", "MSFT", "SPY"]

    static func rowLimit(_ family: WidgetFamily) -> Int {
        family == .systemLarge ? 6 : 3
    }

    /** 이보다 오래된 값은 흐리게 — 정규장은 갱신 15분이라 30분이면 두 번 놓친 것 · 그 밖은 3시간 */
    static func isStale(_ q: QuoteRow?, now: Date, cal: MarketCalendar) -> Bool {
        guard let at = q?.receivedAt else { return false }
        let limit: TimeInterval = cal.isRegularOpen(now) ? 30 * 60 : 3 * 3600
        return now.timeIntervalSince(at) > limit
    }

    static func load(family: WidgetFamily, now: Date = Date()) async -> WatchlistEntry {
        let snap = SignumWidgetShared.readSnapshot()
        let loc = WLLocale.resolve(snap.locale)
        guard snap.syncedAt != nil else {
            return WatchlistEntry(date: now, state: .notSynced, rows: [], locale: loc, basis: nil)
        }
        let tickers = Array(snap.tickers.prefix(rowLimit(family)))
        guard !tickers.isEmpty else {
            return WatchlistEntry(date: now, state: .empty, rows: [], locale: loc, basis: nil)
        }
        let cal = MarketCalendar(holidays: snap.holidays, earlyCloses: snap.earlyCloses)
        let quotes = await quotesFor(tickers, needLevels: family == .systemMedium || family == .systemLarge, now: now)
        await LogoStore.ensure(tickers)
        return entry(tickers: tickers, names: snap.names, quotes: quotes, cal: cal, loc: loc, now: now, logo: LogoStore.image(for:))
    }

    /**
     * 가격은 앱 공용 시세(/api/live/quotes), 바가 필요한 크기만 레벨(/api/watchlist/batch)을 함께 받는다.
     * 같은 순간 여러 위젯이 다시 그려도(목록 변경) 한 번만 묻는다 — 1분 안에 받은 값이 다 있으면 재사용.
     */
    static func quotesFor(_ tickers: [String], needLevels: Bool, now: Date) async -> [String: QuoteRow] {
        let cache = WatchlistAPI.loadCache()
        if let c = cache, tickers.allSatisfy({ t in
            guard let r = c.rows[t], let at = r.receivedAt, now.timeIntervalSince(at) < 60 else { return false }
            return !needLevels || r.hasLevelsMeta
        }) {
            return c.rows
        }
        async let liveTask = try? WatchlistAPI.fetchLive(tickers, now: now)
        async let batchTask: [String: QuoteRow]? = needLevels ? (try? WatchlistAPI.fetch(tickers, now: now)) : nil
        let live = await liveTask
        var batch = await batchTask
        // 공용 시세가 등락을 못 준 종목(프리마켓 바 없음)·실패 — 묶음 값으로 채운다(작은 위젯도)
        if batch == nil, live == nil || tickers.contains(where: { live?[$0]?.changePct == nil }) {
            batch = try? await WatchlistAPI.fetch(tickers, now: now)
        }
        guard live != nil || batch != nil else { return cache?.rows ?? [:] }
        let rows = WatchlistAPI.merge(live: live, batch: batch, tickers: tickers)
        WatchlistAPI.saveCache(rows, at: now)
        var merged = cache?.rows ?? [:]
        for (k, v) in rows { merged[k] = v }
        return merged
    }

    static func entry(tickers: [String], names: [String: String], quotes: [String: QuoteRow], cal: MarketCalendar,
                      loc: WLLocale, now: Date, logo: (String) -> UIImage?) -> WatchlistEntry {
        let rows = tickers.map { t -> RowModel in
            let q = quotes[t]
            return RowModel(
                ticker: t,
                name: names[t],
                price: q?.price,
                changePct: q?.changePct,
                map: q.flatMap { Levels.geometry($0, now: now, cal: cal) },
                logo: logo(t),
                dim: isStale(q, now: now, cal: cal)
            )
        }
        // 기준 라벨은 «가장 최근에 받은 행»의 세션 · 그 행을 받은 시각(웹 목록 머리말과 같은 규칙)
        let freshest = tickers.compactMap { quotes[$0] }.filter { $0.session != nil && $0.receivedAt != nil }
            .max { ($0.receivedAt ?? .distantPast) < ($1.receivedAt ?? .distantPast) }
        let basis = freshest.map { WLText.basis(session: $0.session, at: $0.receivedAt ?? now, cal: cal, loc: loc) }
        return WatchlistEntry(date: now, state: .rows, rows: rows, locale: loc, basis: basis)
    }

    /** 위젯 갤러리 — 내 목록이 있으면 그것, 없으면 대표 종목을 «실제 값»으로(못 받으면 자리표시) */
    static func preview(family: WidgetFamily) async -> WatchlistEntry {
        let snap = SignumWidgetShared.readSnapshot()
        if snap.syncedAt != nil && !snap.tickers.isEmpty {
            return await load(family: family)
        }
        let loc = WLLocale.resolve(snap.locale)
        let tickers = Array(sampleTickers.prefix(rowLimit(family)))
        async let live = try? WatchlistAPI.fetchLive(tickers, timeout: 4)
        async let batch = (family == .systemMedium || family == .systemLarge) ? (try? WatchlistAPI.fetch(tickers, timeout: 4)) : nil
        let (l, b) = await (live, batch)
        let quotes = (l == nil && b == nil) ? nil : WatchlistAPI.merge(live: l, batch: b, tickers: tickers)
        return sample(family: family, locale: loc, quotes: quotes)
    }

    /** 자리표시(시스템이 흐린 막대로 가린다) · 갤러리의 마지막 수단 */
    static func sample(family: WidgetFamily, locale: WLLocale, quotes: [String: QuoteRow]?) -> WatchlistEntry {
        let now = Date()
        let tickers = Array(sampleTickers.prefix(rowLimit(family)))
        let names: [String: [WLLocale: String]] = [
            "NVDA": [.ko: "엔비디아", .en: "NVIDIA", .ja: "エヌビディア"],
            "AAPL": [.ko: "애플", .en: "Apple", .ja: "アップル"],
            "TSLA": [.ko: "테슬라", .en: "Tesla", .ja: "テスラ"],
            "MU": [.ko: "마이크론", .en: "Micron", .ja: "マイクロン"],
            "MSFT": [.ko: "마이크로소프트", .en: "Microsoft", .ja: "マイクロソフト"],
            "SPY": [.ko: "S&P 500 ETF", .en: "S&P 500 ETF", .ja: "S&P500 ETF"],
        ]
        var q = quotes ?? [:]
        if q.isEmpty {
            // 시스템 자리표시 전용 모양(값은 가려진다) — 레벨은 없는 것으로 둔다(지도를 지어내지 않는다)
            let shape: [String: (Double, Double)] = ["NVDA": (230.37, 0.66), "AAPL": (333.39, -1.48), "TSLA": (352.67, -1.34),
                                                     "MU": (1072.78, 1.78), "MSFT": (512.40, 0.42), "SPY": (765.23, -0.05)]
            for t in tickers {
                let s = shape[t] ?? (100, 0)
                q[t] = QuoteRow(ticker: t, price: s.0, changePct: s.1, session: "closed", callWall: nil, putFloor: nil, maxPain: nil,
                                gammaFlip: nil, levelsSource: nil, hasLevelsMeta: false, levelsChainDate: nil, levelsDropped: nil,
                                receivedAt: now)
            }
        }
        let cal = MarketCalendar()
        var e = entry(tickers: tickers, names: names.mapValues { $0[locale] ?? "" }, quotes: q, cal: cal, loc: locale, now: now,
                      logo: LogoStore.bundledSample)
        e.isSample = (quotes ?? [:]).isEmpty
        return e
    }
}
