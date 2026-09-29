// ============================================================================
// WidgetBridge — 웹뷰의 «내 종목» 목록을 홈 화면 위젯(App Group)에 넘기는 앱 내 플러그인
// ----------------------------------------------------------------------------
// 웹: src/lib/app/widgetBridge.ts 가 Capacitor.isPluginAvailable('WidgetBridge') 일 때만 부른다
//     (옛 바이너리엔 이 플러그인이 없어서 웹은 아무 일도 하지 않는다).
// 등록: MainViewController.capacitorDidLoad() → bridge.registerPluginInstance(WidgetBridgePlugin())
//     (앱 타깃 안의 플러그인은 capacitor.config.json packageClassList 로 자동 등록되지 않는다 — cap sync 가 덮어쓴다)
// ============================================================================

import Foundation
import UIKit
import Capacitor
import WidgetKit

@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setWatchlist", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLogos", returnType: CAPPluginReturnPromise),
    ]

    /** 같은 목록이 잇달아 와도(앱 시작·언어 자리 잡기) 위젯을 몇 번씩 다시 그리지 않게 — 바뀌었거나 5분이 지났을 때만 */
    private var lastReload = Date.distantPast
    private let maxLogoBytes = 300_000

    override public func load() {
        #if DEBUG
        seedFromLaunchArguments()
        #endif
    }

    #if DEBUG
    /**
     * 디버그 빌드 전용 — 운영 웹에 브리지가 나가기 전에 시뮬레이터에서 위젯을 확인한다(릴리스 바이너리엔 없다).
     *   xcrun simctl launch booted com.signumhq.app -SGWidgetSeed NVDA,MU,AAPL,TSLA,SPY,MSFT -SGWidgetLocale ko
     *   빈 목록: -SGWidgetSeed -
     */
    private func seedFromLaunchArguments() {
        let args = UserDefaults.standard
        guard let raw = args.string(forKey: "SGWidgetSeed") else { return }
        let loc = args.string(forKey: "SGWidgetLocale") ?? "ko"
        let tickers = raw == "-" ? [] : raw.split(separator: ",").map { String($0) }
        let table: [String: [String]] = [
            "NVDA": ["엔비디아", "NVIDIA", "エヌビディア"], "MU": ["마이크론", "Micron", "マイクロン"],
            "AAPL": ["애플", "Apple", "アップル"], "TSLA": ["테슬라", "Tesla", "テスラ"],
            "SPY": ["S&P 500 ETF", "S&P 500 ETF", "S&P500 ETF"], "MSFT": ["마이크로소프트", "Microsoft", "マイクロソフト"],
            "AMZN": ["아마존", "Amazon", "アマゾン"], "META": ["메타", "Meta Platforms", "メタ"],
        ]
        let idx = loc == "ko" ? 0 : loc == "ja" ? 2 : 1
        var names: [String: String] = [:]
        for t in tickers { if let n = table[t.uppercased()] { names[t.uppercased()] = n[idx] } }
        SignumWidgetShared.writeWatchlist(tickers: tickers, names: names, locale: loc, updatedAt: Date().timeIntervalSince1970 * 1000,
                                          holidays: [], earlyCloses: [])
        WidgetCenter.shared.reloadAllTimelines()
    }
    #endif

    @objc func setWatchlist(_ call: CAPPluginCall) {
        let tickers = call.getArray("tickers", String.self) ?? []
        var names: [String: String] = [:]
        if let obj = call.getObject("names") {
            for (k, v) in obj { if let s = v as? String { names[k] = s } }
        }
        let changed = SignumWidgetShared.writeWatchlist(
            tickers: tickers,
            names: names,
            locale: call.getString("locale"),
            updatedAt: call.getDouble("updatedAt"),
            holidays: call.getArray("holidays", String.self) ?? [],
            earlyCloses: call.getArray("earlyCloses", String.self) ?? []
        )
        let reloaded = reloadIfNeeded(force: changed)
        call.resolve(["stored": min(tickers.count, SignumWidgetShared.maxItems), "changed": changed, "reloaded": reloaded])
    }

    @objc func setLogos(_ call: CAPPluginCall) {
        guard let logos = call.getObject("logos") else {
            call.reject("logos is required")
            return
        }
        var saved = 0
        for (k, v) in logos.prefix(24) {
            guard SignumWidgetShared.normalizeTicker(k) != nil, let b64 = v as? String, b64.count <= maxLogoBytes * 4 / 3 + 8,
                  let data = Data(base64Encoded: b64), data.count <= maxLogoBytes,
                  data.starts(with: [0x89, 0x50, 0x4E, 0x47]),              // PNG 서명
                  let img = UIImage(data: data), img.size.width >= 16, img.size.height >= 16 else { continue }
            if SignumWidgetShared.writeLogo(ticker: k, png: data) { saved += 1 }
        }
        if saved > 0 { _ = reloadIfNeeded(force: true) }
        call.resolve(["saved": saved])
    }

    private func reloadIfNeeded(force: Bool) -> Bool {
        guard force || Date().timeIntervalSince(lastReload) > 300 else { return false }
        lastReload = Date()
        WidgetCenter.shared.reloadAllTimelines()
        return true
    }
}
