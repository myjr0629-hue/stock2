# Medium EN #2 초안 (t086, 9/17 UTC 발행) — execCommand 단락 삽입용

## Title
What "priced in" doesn't tell you on a Fed day: reading dealer positioning instead of the headline

## Subtitle
Max pain, gamma flip and dealer gamma for SPY into the September monthly expiration — and how one free app screen shows it

## Body (1 paragraph per line)
Every FOMC day someone asks the same question: "the move is priced in, so why would the market fall?" The honest answer is that "priced in" describes the rate, not the day's range. The decision itself stops being news the moment futures fully price it; the path — the dot plot and the press conference — is where repricing happens, and the same headline number has produced sell-offs and rallies depending on the tone.

What I look at instead is where the other side is positioned, because that is measurable. Three numbers, all computed from the listed options chain:

1. Net dealer gamma. Into the 9/18 monthly expiration, SPY's net dealer gamma was clearly positive — roughly +$0.9B per 1% move. When dealers are long gamma, their hedging sells strength and buys weakness, which has historically compressed intraday ranges. When it is negative — as it was for NVDA, AAPL and AMD on the same day — hedging amplifies moves instead. It does not say "up" or "down"; it says what kind of day tends to happen.

2. Max pain. SPY closed near 758 with max pain at 755 — close enough that the pin zone is live. AMD, by contrast, sat at 504 with max pain at 420. A gap that wide is not a magnet; it is a footprint of where positions were opened during a rally. Treating every max pain level the same way is the most common mistake I see.

3. Walls. The call wall (largest call open interest) at 790 and the put floor (largest put open interest) at 620 frame where hedging pressure is heaviest. Whether price leaves that frame and holds outside it after the 2pm repricing is more informative than the rate decision itself.

[IMAGE: Command screen — /tmp/ego/shots/signum-cmd-en-1242x2688.png]

This is the Command screen in SIGNUM HQ, the free app I use to read one ticker at a time: price, dark pool share versus the market average, max pain, gamma flip, total premium, and a volatility read, in plain English. It is free on iOS and Android, no account needed, and the same levels for large caps are published daily as an open dataset on GitHub so anyone can check the numbers.

Caveats matter here. All of this is end-of-day open interest, so the levels shift after big days; the flip level in particular can move quickly around a repricing. None of it is a forecast. It is a description of where positioning is concentrated — which, on a Fed day, is the part of the picture that "priced in" leaves out.

## Links (툴바 link)
- app: https://www.signumhq.com/app?from=medium
- dataset: https://github.com/myjr0629-hue/options-market-structure-daily

## 체크
- 예측어 없음(«tends to», «has historically», 조건문만) · 앱 언급 한 단락 · 스크린샷 1장 · 9/16 Medium KR 과 언어·주제 비중복.
