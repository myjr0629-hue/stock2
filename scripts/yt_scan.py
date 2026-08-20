# -*- coding: utf-8 -*-
"""
yt_scan — 유튜브 금융 쇼츠 시장을 «쿼터 없이» 훑는다 (yt-dlp)

왜 API 를 안 쓰는가
-------------------
Data API 는 search.list 1회 100유닛, 하루 10,000 이 상한이라 넓게 훑으면 30~40질의에서 끝난다.
실제로 2026-08-20 에 소진했다. yt-dlp 는 유튜브를 직접 파싱하므로 상한이 없다.

방법 (3번의 실패에서 확정)
--------------------------
  ⛔ ytsearch:  롱폼 위주라 쇼츠가 거의 안 잡힌다 (28질의에 5편)
  ✔ 채널 /shorts 탭: 100% 쇼츠 + 조회수. 이걸 쓴다.

  ① 검색(짧은영상 필터)으로 «금융 쇼츠를 올리는 채널»을 모은다
  ② 각 채널의 /shorts 탭을 훑는다
  ③ 금융·영어만 남기고 조회수로 정렬 → 제목 패턴을 센다

⛔ 필터는 전부 실측에서 나왔다
  · 동음이의어  dark poolrooms(공포게임)·max pain rap(노래)·intel stock cooler(CPU쿨러)
  · 언어·지역   줌바 피트니스가 1위였다. 힌디·텔루구 머니 콘텐츠 대량 혼입
  · 도박성      pocket option·binary·casino — 우리와 무관하고 정책 위험

실행: python scripts/yt_scan.py [채널당개수=30]
출력: .agent/MARKET_SCAN.json
"""
import json, re, subprocess, sys, io, os
from collections import Counter

PER = int(sys.argv[1]) if len(sys.argv) > 1 else 30

DISCOVER = [
    "stock market explained", "options trading", "stock market news today",
    "investing explained", "wall street", "stock analysis", "day trading",
    "finance explained", "money and markets", "earnings report explained",
]

FIN = re.compile(r"\b(nasdaq|s&p|sp ?500|dow|russell|nvidia|nvda|tesla|tsla|amd|apple|aapl|"
                 r"palantir|pltr|micron|intel|broadcom|avgo|microsoft|msft|amazon|meta|google|"
                 r"earnings|fed|fomc|powell|cpi|ppi|inflation|treasury|yield|option|options|"
                 r"call|calls|put|puts|premarket|wall street|stock|stocks|share|shares|"
                 r"ticker|etf|spy|qqq|vix|squeeze|dividend|buffett|burry|market|invest|"
                 r"portfolio|bull|bear|rally|crash|recession|economy)\b", re.I)
BAD_SCRIPT = re.compile(r"[ऀ-ॿఀ-౿஀-௿一-鿿가-힯؀-ۿ]")
BAD_WORD = re.compile(r"\b(zumba|fitness|workout|nifty|sensex|crore|lakh|rupee|paisa|kabhi|"
                      r"andar|hota|nahin|upsc|india|indian|bse|nse|forex|binary|casino|"
                      r"betting|pocket ?option|quotex|iq ?option|onlyfans)\b", re.I)


def ytdlp(url, limit):
    try:
        p = subprocess.run(
            ["yt-dlp", url, "--flat-playlist", "--dump-json", "--playlist-end", str(limit),
             "--no-warnings", "--socket-timeout", "20"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=200)
    except subprocess.TimeoutExpired:
        return []
    out = []
    for line in (p.stdout or "").splitlines():
        line = line.strip()
        if line.startswith("{"):
            try: out.append(json.loads(line))
            except Exception: pass
    return out


# ── ① 채널 발굴 ─────────────────────────────────────────────────────────────
print("\n  ① 금융 쇼츠 채널 발굴")
chans = {}
for i, q in enumerate(DISCOVER, 1):
    u = f"https://www.youtube.com/results?search_query={q.replace(' ', '+')}&sp=EgIYAQ%3D%3D"
    for d in ytdlp(u, 25):
        h = d.get("uploader_id") or ""
        if h.startswith("@") and h not in chans:
            chans[h] = d.get("channel") or h
    print(f"  [{i:2}/{len(DISCOVER)}] {q[:28]:30s} 누적 채널 {len(chans)}")

# ── ② 채널별 /shorts 훑기 ───────────────────────────────────────────────────
print(f"\n  ② 채널 {len(chans)}곳의 /shorts 수집")
rows, seen = [], set()
for i, (h, name) in enumerate(chans.items(), 1):
    got = 0
    for d in ytdlp(f"https://www.youtube.com/{h}/shorts", PER):
        t, vc, u = d.get("title") or "", d.get("view_count"), d.get("url") or d.get("id") or ""
        if not t or vc is None or u in seen: continue
        if not FIN.search(t) or BAD_SCRIPT.search(t) or BAD_WORD.search(t): continue
        seen.add(u)
        rows.append(dict(ch=name, handle=h, title=t, views=int(vc), url=u))
        got += 1
    if got: print(f"  [{i:2}/{len(chans)}] {name[:26]:28s} 금융쇼츠 {got:3}편")

rows.sort(key=lambda r: -r["views"])
print(f"\n  수집 {len(rows)}편\n")
if not rows:
    print("  수집 0 — 필터나 발굴 단계 점검 필요"); sys.exit(0)

print("  ★ 조회수 상위 30편 — 사람들이 실제로 본 것")
print("  " + "-" * 100)
for r in rows[:30]:
    print(f"  {r['views']:>11,}  {r['title'][:62]:64s} {r['ch'][:22]}")

# ── ③ 패턴 ──────────────────────────────────────────────────────────────────
k = max(15, len(rows) // 5)
top, bot = rows[:k], rows[-k:]
PAT = {
    "숫자": r"\d", "물음표": r"\?", "2인칭 you/your": r"\byou(r)?\b",
    "금액 $": r"\$", "퍼센트 %": r"%", "느낌표": r"!",
    "부정·경고": r"\b(never|stop|don'?t|mistake|wrong|lose|lost|crash|warning|avoid|nobody|worst)\b",
    "비교 vs": r"\bvs\b|\bversus\b", "why 시작": r"^why\b", "how 시작": r"^how\b",
    "this/these": r"\b(this|these)\b",
    "고유명": r"\b(nvidia|tesla|amd|apple|palantir|micron|buffett|burry|powell|musk|trump)\b",
    "돈 액수 단위": r"\b\d+\s?(k|m|b|million|billion|trillion)\b",
}
rate = lambda l, p: round(100 * sum(bool(re.search(p, r["title"], re.I)) for r in l) / max(len(l), 1))
print(f"\n  제목 패턴 — 상위 {k}편 vs 하위 {k}편")
print("  " + "-" * 54)
print("  " + "패턴".ljust(20) + "상위".rjust(7) + "하위".rjust(8) + "차이".rjust(8))
for name, pat in sorted(PAT.items(), key=lambda x: -(rate(top, x[1]) - rate(bot, x[1]))):
    a, b = rate(top, pat), rate(bot, pat)
    d = a - b
    print(f"  {name.ljust(20)}{str(a)+'%':>7}{str(b)+'%':>8}{('+' if d>0 else '')+str(d):>8}")

print("\n  상위권 채널")
for c, n in Counter(r["ch"] for r in top).most_common(10):
    print(f"    {n:2}편  {c}")

os.makedirs(".agent", exist_ok=True)
io.open(".agent/MARKET_SCAN.json", "w", encoding="utf-8").write(
    json.dumps({"channels": len(chans), "collected": len(rows), "rows": rows},
               ensure_ascii=False, indent=2))
print("\n  → .agent/MARKET_SCAN.json\n")
