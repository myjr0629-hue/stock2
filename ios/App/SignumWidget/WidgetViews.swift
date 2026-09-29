// ============================================================================
// «내 종목» 위젯 — 화면. 대시보드 «내 종목» 카드(dSurf)와 같은 남색·금색 하트 · 새 색·새 모양 없음
//   색·굵기 출처: src/components/app/watchlist/watchlist.module.css (.dSurf · .dRow · .pm*) · dash9 .e9SectT
// ============================================================================

import WidgetKit
import SwiftUI

enum Palette {
    static func hex(_ v: UInt32, _ a: Double = 1) -> Color {
        Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255).opacity(a)
    }
    static let bgTop = hex(0x111b2e)
    static let bgBottom = hex(0x0a1220)
    static let gold = hex(0xfbbf24)
    static let goldStroke = hex(0xf59e0b)
    static let text = hex(0xf8fafc)
    static let name = hex(0x8ea3c2)
    static let price = hex(0xdbe5f1)
    static let priceSmall = hex(0x9fb0c8)
    static let up = hex(0x34d399)
    static let down = hex(0xf87171)
    static let flat = hex(0x94a3b8)
    static let slate = hex(0x94a3b8)
    static let tick = hex(0x71859f)
    static let cyan = hex(0x22d3ee)
    static let ring = hex(0x0e1727)
    static let mapLabel = hex(0x7489ab)
    static let separator = Color.white.opacity(0.055)
    static let emptyText = hex(0x9fb4d0)
    static let pillText = hex(0xeef2f7)

    static func direction(_ d: Int) -> Color { d > 0 ? up : d < 0 ? down : flat }
}

// MARK: - 바탕(dSurf)

struct CardBackground: View {
    var body: some View {
        ZStack {
            // linear-gradient(158deg, #111b2e, #0a1220)
            LinearGradient(colors: [Palette.bgTop, Palette.bgBottom],
                           startPoint: UnitPoint(x: 0.31, y: 0.04), endPoint: UnitPoint(x: 0.69, y: 0.96))
            // 청 rgba(56,102,180,.24) at 14% 0% · 보라 rgba(88,58,168,.22) at 92% 96% · 왼쪽 위 금빛 rgba(251,191,36,.07)
            EllipticalGradient(colors: [Color(red: 56 / 255, green: 102 / 255, blue: 180 / 255).opacity(0.24), .clear],
                               center: UnitPoint(x: 0.14, y: 0), startRadiusFraction: 0, endRadiusFraction: 0.62)
            EllipticalGradient(colors: [Color(red: 88 / 255, green: 58 / 255, blue: 168 / 255).opacity(0.22), .clear],
                               center: UnitPoint(x: 0.92, y: 0.96), startRadiusFraction: 0, endRadiusFraction: 0.66)
            EllipticalGradient(colors: [Palette.gold.opacity(0.07), .clear],
                               center: .topLeading, startRadiusFraction: 0, endRadiusFraction: 0.5)
            // 안쪽 금색 머리카락선 + 위쪽 빛(inset 0 1px 0 rgba(255,255,255,.06))
            ContainerRelativeShape()
                .strokeBorder(LinearGradient(colors: [Color.white.opacity(0.07), Palette.gold.opacity(0.10), Palette.gold.opacity(0.07)],
                                             startPoint: .top, endPoint: .bottom), lineWidth: 1)
        }
    }
}

extension View {
    /** iOS 17+ containerBackground · 그 전은 직접 칠한다. 여백은 위젯이 직접 둔다(contentMarginsDisabled) */
    @ViewBuilder
    func widgetCard(accessory: Bool, padding: EdgeInsets) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            if accessory {
                self.containerBackground(for: .widget) { Color.clear }
            } else {
                self.padding(padding).containerBackground(for: .widget) { CardBackground() }
            }
        } else {
            if accessory {
                self
            } else {
                self.padding(padding).frame(maxWidth: .infinity, maxHeight: .infinity).background(CardBackground())
            }
        }
    }

    @ViewBuilder
    func accentableIfAvailable() -> some View {
        if #available(iOSApplicationExtension 16.0, *) { self.widgetAccentable() } else { self }
    }
}

// MARK: - 하트(앱 WlIcon heart 경로 그대로)

struct HeartShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 12, y: 19.85))
        p.addCurve(to: CGPoint(x: 4.07, y: 11.12), control1: CGPoint(x: 10.14, y: 18.18), control2: CGPoint(x: 5.9, y: 14.56))
        p.addArc(center: CGPoint(x: 7.95, y: 9.05), radius: 4.4,
                 startAngle: .radians(atan2(11.12 - 9.05, 4.07 - 7.95)), endAngle: .radians(atan2(7.33 - 9.05, 12 - 7.95)), clockwise: false)
        p.addArc(center: CGPoint(x: 16.05, y: 9.05), radius: 4.4,
                 startAngle: .radians(atan2(7.33 - 9.05, 12 - 16.05)), endAngle: .radians(atan2(11.12 - 9.05, 19.93 - 16.05)), clockwise: false)
        p.addCurve(to: CGPoint(x: 12, y: 19.85), control1: CGPoint(x: 18.1, y: 14.56), control2: CGPoint(x: 13.86, y: 18.18))
        p.closeSubpath()
        // 경로 상자(3.55…20.45 × 4.65…19.85)를 rect 가운데에 맞춘다
        let bx: CGFloat = 3.55, by: CGFloat = 4.65, bw: CGFloat = 16.9, bh: CGFloat = 15.2
        let s = min(rect.width / bw, rect.height / bh)
        let tx = rect.minX + (rect.width - bw * s) / 2 - bx * s
        let ty = rect.minY + (rect.height - bh * s) / 2 - by * s
        return p.applying(CGAffineTransform(a: s, b: 0, c: 0, d: s, tx: tx, ty: ty))
    }
}

struct GoldHeart: View {
    var size: CGFloat = 13
    var body: some View {
        ZStack {
            HeartShape().fill(Palette.gold)
            HeartShape().stroke(Palette.goldStroke, lineWidth: max(0.6, size / 14))
        }
        .frame(width: size, height: size * 0.9)
        .accentableIfAvailable()
    }
}

// MARK: - 머리

struct WidgetHeader: View {
    let title: String
    let basis: String?
    var titleSize: CGFloat = 13.5

    var body: some View {
        HStack(spacing: 5) {
            GoldHeart(size: titleSize * 0.95)
            Text(title)
                .font(.system(size: titleSize, weight: .heavy))
                .kerning(-0.3)
                .foregroundColor(Palette.text)
                .lineLimit(1)
                .layoutPriority(1)
            Spacer(minLength: 4)
            if let basis {
                Text(basis)
                    .font(.system(size: 9.5, weight: .semibold))
                    .monospacedDigit()
                    .foregroundColor(Palette.name)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
    }
}

// MARK: - 포지셔닝 바: 풋 플로어(왼끝) ─ ◆맥스 페인 ─ ●가격 ─ 콜 월(오른끝)

struct PositionBar: View {
    let g: MapGeometry
    /** 큰 위젯: 바 아래 양 끝에 풋 플로어·콜 월 숫자 */
    let labels: Bool

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let trackY: CGFloat = labels ? 4 : max(0, geo.size.height / 2 - 2)
            let pxX = w * CGFloat(g.px)
            let mpX = w * CGFloat(g.mp)
            let bandLeft = min(pxX, mpX)
            let bandW = abs(pxX - mpX)
            ZStack(alignment: .topLeading) {
                Capsule().fill(Palette.slate.opacity(0.17)).frame(width: w, height: 4).offset(y: trackY)
                // ◆→● 띠: ● 쪽이 짙고 ◆ 쪽으로 옅어진다(금색 아님 — C6)
                Rectangle()
                    .fill(LinearGradient(colors: [Palette.slate.opacity(0.5), Palette.slate.opacity(0.12)],
                                         startPoint: g.mp <= g.px ? .trailing : .leading,
                                         endPoint: g.mp <= g.px ? .leading : .trailing))
                    .frame(width: bandW, height: 4)
                    .offset(x: bandLeft, y: trackY)
                RoundedRectangle(cornerRadius: 1).fill(Palette.tick).frame(width: 2, height: 10).offset(x: -1, y: trackY - 3)
                RoundedRectangle(cornerRadius: 1).fill(Palette.tick).frame(width: 2, height: 10).offset(x: w - 1, y: trackY - 3)
                // ◆ 맥스 페인
                ZStack {
                    RoundedRectangle(cornerRadius: 2).fill(Palette.ring).frame(width: 10, height: 10)
                    RoundedRectangle(cornerRadius: 1.5).fill(Palette.gold).frame(width: 7, height: 7)
                        .shadow(color: Palette.gold.opacity(0.45), radius: 3)
                }
                .rotationEffect(.degrees(45))
                .frame(width: 14, height: 14)
                .offset(x: mpX - 7, y: trackY + 2 - 7)
                // ● 가격
                ZStack {
                    Circle().fill(Palette.ring).frame(width: 13, height: 13)
                    Circle().fill(Palette.cyan).frame(width: 9, height: 9)
                        .shadow(color: Palette.cyan.opacity(0.65), radius: 4)
                }
                .frame(width: 13, height: 13)
                .offset(x: pxX - 6.5, y: trackY + 2 - 6.5)
                if labels {
                    HStack(spacing: 0) {
                        Text(Fmt.level(g.pf))
                        Spacer(minLength: 4)
                        Text(Fmt.level(g.cw))
                    }
                    .font(.system(size: 9, weight: .semibold))
                    .monospacedDigit()
                    .foregroundColor(Palette.mapLabel)
                    .lineLimit(1)
                    .frame(width: w)
                    .offset(y: trackY + 9)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - 행

struct ListRow: View {
    let row: RowModel
    let large: Bool
    var redactNumbers = false

    var body: some View {
        HStack(spacing: large ? 9 : 8) {
            TickerLogo(ticker: row.ticker, image: row.logo, size: large ? 24 : 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(row.ticker)
                    .font(.system(size: 13, weight: .heavy))
                    .kerning(-0.2)
                    .foregroundColor(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                if let n = row.name, !n.isEmpty {
                    Text(n)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Palette.name)
                        .lineLimit(1)
                }
            }
            .frame(width: large ? 86 : 76, alignment: .leading)
            ZStack {
                if let g = row.map {
                    PositionBar(g: g, labels: large)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: large ? 24 : 14)
            VStack(alignment: .trailing, spacing: 1) {
                Text(row.priceText)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Palette.price)
                Text(row.pctText.isEmpty ? " " : row.pctText)
                    .font(.system(size: 11.5, weight: .heavy))
                    .foregroundColor(Palette.direction(row.direction))
            }
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(minWidth: 60, alignment: .trailing)
            .redacted(reason: redactNumbers ? .placeholder : [])
        }
        .opacity(row.dim ? 0.5 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(row.accessibilityText))
    }
}

struct SmallRow: View {
    let row: RowModel
    var redactNumbers = false

    var body: some View {
        HStack(spacing: 7) {
            TickerLogo(ticker: row.ticker, image: row.logo, size: 20)
            VStack(alignment: .leading, spacing: 0) {
                Text(row.ticker)
                    .font(.system(size: 12.5, weight: .heavy))
                    .kerning(-0.2)
                    .foregroundColor(Palette.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(row.priceText)
                    .font(.system(size: 10, weight: .semibold))
                    .monospacedDigit()
                    .foregroundColor(Palette.priceSmall)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .redacted(reason: redactNumbers ? .placeholder : [])
            }
            Spacer(minLength: 2)
            Text(row.pctText.isEmpty ? (row.price == nil ? "—" : "") : row.pctText)
                .font(.system(size: 11.5, weight: .heavy))
                .monospacedDigit()
                .foregroundColor(Palette.direction(row.direction))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .layoutPriority(1)
                .redacted(reason: redactNumbers ? .placeholder : [])
        }
        .opacity(row.dim ? 0.5 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(row.accessibilityText))
    }
}

struct RowSeparator: View {
    var body: some View { Rectangle().fill(Palette.separator).frame(height: 0.5) }
}

// MARK: - 빈 상태

struct EmptyStateView: View {
    let entry: WatchlistEntry
    let compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: entry.text.title, basis: nil, titleSize: compact ? 13 : 13.5)
            Spacer(minLength: 6)
            Text(entry.state == .notSynced ? entry.text.notSynced : entry.text.empty)
                .font(.system(size: compact ? 11.5 : 12, weight: .medium))
                .foregroundColor(Palette.emptyText)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Text(entry.text.openApp)
                .font(.system(size: 11.5, weight: .heavy))
                .foregroundColor(Palette.pillText)
                .padding(.horizontal, 12)
                .frame(height: 28)
                .background(Capsule().fill(Color.white.opacity(0.045)))
                .overlay(Capsule().strokeBorder(Color.white.opacity(0.07), lineWidth: 1))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - 크기별

struct SmallWidgetView: View {
    let entry: WatchlistEntry

    var body: some View {
        if entry.state != .rows {
            EmptyStateView(entry: entry, compact: true)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                WidgetHeader(title: entry.text.title, basis: nil, titleSize: 13)
                    .padding(.bottom, 5)
                ForEach(Array(entry.rows.prefix(3).enumerated()), id: \.element.id) { i, r in
                    if i > 0 { RowSeparator() }
                    SmallRow(row: r, redactNumbers: entry.isSample).frame(maxHeight: 36)
                }
                Spacer(minLength: 0)
            }
        }
    }
}

struct ListWidgetView: View {
    let entry: WatchlistEntry
    let large: Bool

    var body: some View {
        if entry.state != .rows {
            EmptyStateView(entry: entry, compact: false)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Link(destination: SignumWidgetShared.watchlistURL) {
                    WidgetHeader(title: entry.text.title, basis: entry.basis)
                }
                .padding(.bottom, large ? 6 : 3)
                ForEach(Array(entry.rows.prefix(large ? 6 : 3).enumerated()), id: \.element.id) { i, r in
                    if i > 0 { RowSeparator() }
                    Link(destination: r.url) {
                        ListRow(row: r, large: large, redactNumbers: entry.isSample)
                            .frame(maxHeight: large ? 50 : 40)
                            .contentShape(Rectangle())
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

@available(iOSApplicationExtension 16.0, *)
struct AccessoryWidgetView: View {
    let entry: WatchlistEntry

    var body: some View {
        if entry.state != .rows {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    HeartShape().fill(Color.primary).frame(width: 11, height: 10)
                    Text(entry.text.title).font(.system(size: 13, weight: .heavy)).widgetAccentable()
                }
                Text(entry.state == .notSynced ? entry.text.notSynced : entry.text.empty)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(entry.rows.prefix(3)) { r in
                    HStack(spacing: 4) {
                        Text(r.ticker).font(.system(size: 13, weight: .heavy)).widgetAccentable().lineLimit(1)
                        Spacer(minLength: 2)
                        Text(r.arrowPct).font(.system(size: 13, weight: .semibold)).monospacedDigit().lineLimit(1)
                    }
                    .opacity(r.dim ? 0.6 : 1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct WatchlistWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WatchlistEntry

    var body: some View {
        if #available(iOSApplicationExtension 16.0, *), family == .accessoryRectangular {
            AccessoryWidgetView(entry: entry)
                .widgetCard(accessory: true, padding: EdgeInsets())
                .widgetURL(SignumWidgetShared.watchlistURL)
        } else {
            content
                .widgetCard(accessory: false, padding: padding)
                .widgetURL(SignumWidgetShared.watchlistURL)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .systemSmall: SmallWidgetView(entry: entry)
        case .systemLarge: ListWidgetView(entry: entry, large: true)
        default: ListWidgetView(entry: entry, large: false)
        }
    }

    private var padding: EdgeInsets {
        switch family {
        case .systemSmall: return EdgeInsets(top: 13, leading: 13, bottom: 11, trailing: 13)
        case .systemLarge: return EdgeInsets(top: 15, leading: 16, bottom: 12, trailing: 16)
        default: return EdgeInsets(top: 12, leading: 15, bottom: 9, trailing: 15)
        }
    }
}
