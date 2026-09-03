#!/usr/bin/env python3
# ============================================================================
# asc_signum_16_locales — SIGNUM 1.6 의 스토어 로케일을 3 → 12 로 넓힌다.
# ----------------------------------------------------------------------------
# 왜 (2026-09-03):
#   SIGNUM 은 132개국에 배포되는데 스토어 로케일이 en/ja/ko **3개뿐**이었다.
#   UC·WIM 은 12개다. 주력앱만 뒤처진 이유는 단순했다 — 그 둘은 제출 큐에 올랐을 때
#   로케일을 넣었고, SIGNUM 1.5 는 페이월 건이라 ASO 를 안 건드렸다.
#
# 순서가 중요하다. 빌드부터 올리고 제출하면 «3개 로케일 그대로» 심사에 들어간다.
#   ① 이 스크립트로 버전 1.6 생성 + 로케일 12개 채우기      ← 여기
#   ② scripts/asc_upload_screenshots.py 로 신규 9개 로케일 스크린샷
#   ③ 빌드·업로드 (ios-release.sh 의 아카이브~업로드 구간)
#   ④ scripts/ios_submit.py 로 빌드 연결 + 제출
#
# ⚠️ 로케일 하나라도 다음 5가지가 비면 **버전 전체**가 409 로 막힌다:
#      appInfoLocalization        → name · subtitle · privacyPolicyUrl
#      appStoreVersionLocalization→ description · keywords · whatsNew · supportUrl
#      appScreenshotSet           → 최소 1세트(APP_IPHONE_65)
#    그리고 어느 로케일인지 애플은 **안 알려준다**.
#
# ⚠️ 구독 앱이라 설명에 «자동갱신 고지 + EULA/개인정보 링크»가 있어야 한다(3.1.2).
#    기존 en/ja/ko 와 같은 형식을 9개 언어에 그대로 맞춘다.
#
# 사용: python3 scripts/asc_signum_16_locales.py [--dry]
# ============================================================================
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

APP = "6783130444"
VERSION = "1.6"
SUPPORT = "https://www.signumhq.com"
TERMS = "https://www.signumhq.com/en/app-view/terms"
PRIVACY = "https://www.signumhq.com/en/app-view/privacy"

# 구독 고지 — 언어별. 애플 3.1.2 가 요구한다.
SUB = {
    "de-DE": f"SIGNUM Pro ist ein monatlich automatisch verlängerbares Abo, das Werbung entfernt. Die Abbuchung erfolgt bei Kaufbestätigung über den Apple-Account; die Verlängerung erfolgt automatisch, sofern nicht spätestens 24 Stunden vor Ende gekündigt wird. Verwaltung und Kündigung in den Apple-Account-Einstellungen.\nNutzungsbedingungen (EULA): {TERMS}\nDatenschutz: {PRIVACY}",
    "es-ES": f"SIGNUM Pro es una suscripción mensual de renovación automática que elimina los anuncios. El cargo se realiza en la cuenta de Apple al confirmar la compra y se renueva automáticamente salvo cancelación 24 horas antes del fin del periodo. Puedes gestionarla o cancelarla en los ajustes de tu cuenta de Apple.\nTérminos de uso (EULA): {TERMS}\nPrivacidad: {PRIVACY}",
    "fr-FR": f"SIGNUM Pro est un abonnement mensuel à renouvellement automatique qui supprime les publicités. Le montant est débité du compte Apple à la confirmation de l'achat et se renouvelle automatiquement sauf résiliation au moins 24 heures avant la fin de la période. Gestion et résiliation dans les réglages du compte Apple.\nConditions d'utilisation (EULA) : {TERMS}\nConfidentialité : {PRIVACY}",
    "id": f"SIGNUM Pro adalah langganan bulanan perpanjangan otomatis yang menghilangkan iklan. Pembayaran ditagihkan ke akun Apple saat pembelian dikonfirmasi dan diperpanjang otomatis kecuali dibatalkan 24 jam sebelum periode berakhir. Kelola atau batalkan di pengaturan akun Apple.\nSyarat penggunaan (EULA): {TERMS}\nPrivasi: {PRIVACY}",
    "it": f"SIGNUM Pro è un abbonamento mensile a rinnovo automatico che rimuove la pubblicità. L'addebito avviene sull'account Apple alla conferma dell'acquisto e si rinnova automaticamente salvo disdetta almeno 24 ore prima della fine del periodo. Gestione e disdetta nelle impostazioni dell'account Apple.\nTermini d'uso (EULA): {TERMS}\nPrivacy: {PRIVACY}",
    "pt-BR": f"O SIGNUM Pro é uma assinatura mensal de renovação automática que remove os anúncios. A cobrança é feita na conta Apple na confirmação da compra e renova automaticamente, salvo cancelamento 24 horas antes do fim do período. Gerencie ou cancele nos ajustes da conta Apple.\nTermos de uso (EULA): {TERMS}\nPrivacidade: {PRIVACY}",
    "vi": f"SIGNUM Pro là gói đăng ký hằng tháng tự động gia hạn, giúp ẩn quảng cáo. Khoản phí được tính vào tài khoản Apple khi xác nhận mua và tự động gia hạn trừ khi hủy trước khi kỳ hạn kết thúc 24 giờ. Quản lý hoặc hủy trong phần cài đặt tài khoản Apple.\nĐiều khoản sử dụng (EULA): {TERMS}\nQuyền riêng tư: {PRIVACY}",
    "zh-Hant": f"SIGNUM Pro 為每月自動續訂的訂閱，可移除廣告。確認購買時由 Apple 帳戶扣款，除非在期間結束前 24 小時取消，否則自動續訂。可於 Apple 帳戶設定中管理或取消。\n使用條款（EULA）：{TERMS}\n隱私權政策：{PRIVACY}",
}
SUB["es-MX"] = SUB["es-ES"]

BODY = {
    "de-DE": """Ob du deine erste Aktie verfolgst oder täglich Optionen handelst — SIGNUM HQ macht den US-Markt lesbar. Kostenlos.

An jedem Handelstag verwandelt KI rohe Marktdaten in eine klare Lesart, die du in Minuten schaffst: was sich bewegt hat, warum, und welches Geld dahintersteckt.

■ Vorbörse und Nachbörse
Wer sich vor der Eröffnung und nach dem Schluss bewegt hat — und was dahintersteckt.

■ Quartalszahlen-Kalender
Wer vor der Eröffnung oder nach dem Schluss berichtet, mit Datum und erwartetem EPS.

■ KI-Sektorbericht
Alle 10 Sektoren, ein Tagesabschlussbericht und ein Morgen-Briefing.

■ Optionsstruktur
GEX (Gamma-Exposure), Put/Call-Ratio, Max Pain, Call Walls und Put Floors.

■ Kapitalfluss
Dark-Pool-Anteil, große Blocktrades, Netto-Prämie.

Hinweis: Diese App dient der Information und Bildung, sie ist keine Anlageberatung.""",
    "es-ES": """Tanto si sigues tu primera acción como si operas opciones a diario, SIGNUM HQ hace que el mercado estadounidense se entienda. Gratis.

Cada día de mercado, la IA convierte datos brutos en una lectura clara que terminas en minutos: qué se movió, por qué, y qué dinero había detrás.

■ Premercado y after hours
Quién se movió antes de la apertura y después del cierre, y por qué.

■ Calendario de resultados
Quién publica antes de abrir o tras el cierre, con la fecha y el BPA estimado.

■ Informe de sectores con IA
Los 10 sectores, un informe de cierre diario y un resumen matinal.

■ Estructura de opciones
GEX (exposición gamma), ratio put/call, max pain, muros de calls y suelos de puts.

■ Flujo de dinero
Porcentaje en dark pool, grandes bloques y prima neta.

Aviso: esta app es informativa y educativa; no es asesoramiento de inversión.""",
    "fr-FR": """Que vous suiviez votre première action ou que vous tradiez des options chaque jour, SIGNUM HQ rend le marché américain lisible. Gratuit.

Chaque jour de Bourse, l'IA transforme des données brutes en une lecture claire, terminée en quelques minutes : ce qui a bougé, pourquoi, et quel argent était derrière.

■ Avant-Bourse et après-Bourse
Qui a bougé avant l'ouverture et après la clôture, et pourquoi.

■ Calendrier des résultats
Qui publie avant l'ouverture ou après la clôture, avec la date et le BPA attendu.

■ Rapport sectoriel par IA
Les 10 secteurs, un rapport de clôture quotidien et un briefing du matin.

■ Structure des options
GEX (exposition gamma), ratio put/call, max pain, murs de calls et planchers de puts.

■ Flux de capitaux
Part en dark pool, blocs importants, prime nette.

Avertissement : cette app est informative et pédagogique, ce n'est pas un conseil en investissement.""",
    "id": """Baik Anda baru mengikuti satu saham atau memperdagangkan opsi setiap hari, SIGNUM HQ membuat pasar AS mudah dibaca. Gratis.

Setiap hari bursa, AI mengubah data mentah menjadi bacaan jelas yang selesai dalam beberapa menit: apa yang bergerak, mengapa, dan uang di baliknya.

■ Pramarket dan after hours
Siapa yang bergerak sebelum pembukaan dan setelah penutupan, beserta alasannya.

■ Kalender laba
Siapa yang merilis sebelum pembukaan atau setelah penutupan, dengan tanggal dan perkiraan EPS.

■ Laporan sektor dengan AI
Seluruh 10 sektor, laporan penutupan harian dan ringkasan pagi.

■ Struktur opsi
GEX (gamma exposure), rasio put/call, max pain, call wall dan put floor.

■ Aliran dana
Persentase dark pool, transaksi blok besar, premi bersih.

Catatan: aplikasi ini bersifat informatif dan edukatif, bukan nasihat investasi.""",
    "it": """Che tu stia seguendo la tua prima azione o facendo trading di opzioni ogni giorno, SIGNUM HQ rende il mercato USA leggibile. Gratis.

Ogni giorno di borsa l'IA trasforma i dati grezzi in una lettura chiara che finisci in pochi minuti: cosa si è mosso, perché, e quale denaro c'era dietro.

■ Pre-mercato e after hours
Chi si è mosso prima dell'apertura e dopo la chiusura, e perché.

■ Calendario degli utili
Chi pubblica prima dell'apertura o dopo la chiusura, con data ed EPS atteso.

■ Report settoriale con IA
Tutti e 10 i settori, un report di chiusura giornaliero e un briefing mattutino.

■ Struttura delle opzioni
GEX (gamma exposure), rapporto put/call, max pain, call wall e put floor.

■ Flusso di denaro
Quota dark pool, grandi blocchi, premio netto.

Avvertenza: questa app è informativa ed educativa, non è consulenza finanziaria.""",
    "pt-BR": """Se você acompanha sua primeira ação ou opera opções todo dia, o SIGNUM HQ torna o mercado dos EUA legível. Grátis.

A cada pregão, a IA transforma dados brutos em uma leitura clara que você termina em minutos: o que se moveu, por quê, e qual dinheiro estava por trás.

■ Pré-mercado e pós-mercado
Quem se moveu antes da abertura e depois do fechamento, e por quê.

■ Calendário de balanços
Quem divulga antes da abertura ou após o fechamento, com data e LPA esperado.

■ Relatório setorial com IA
Os 10 setores, um relatório de fechamento diário e um resumo matinal.

■ Estrutura de opções
GEX (exposição gama), razão put/call, max pain, paredes de call e pisos de put.

■ Fluxo de dinheiro
Percentual em dark pool, grandes blocos, prêmio líquido.

Aviso: este app é informativo e educacional, não é recomendação de investimento.""",
    "vi": """Dù bạn đang theo dõi cổ phiếu đầu tiên hay giao dịch quyền chọn mỗi ngày, SIGNUM HQ giúp bạn đọc được thị trường Mỹ. Miễn phí.

Mỗi phiên giao dịch, AI biến dữ liệu thô thành một bản đọc rõ ràng trong vài phút: điều gì đã biến động, vì sao, và dòng tiền phía sau.

■ Trước giờ mở cửa và sau giờ đóng cửa
Cổ phiếu nào biến động ngoài phiên chính, và vì sao.

■ Lịch báo cáo lợi nhuận
Ai công bố trước giờ mở hay sau giờ đóng, kèm ngày và EPS dự phóng.

■ Báo cáo ngành bằng AI
Cả 10 ngành, báo cáo đóng cửa hằng ngày và bản tin buổi sáng.

■ Cấu trúc quyền chọn
GEX (gamma exposure), tỷ lệ put/call, max pain, call wall và put floor.

■ Dòng tiền
Tỷ trọng dark pool, giao dịch khối lớn, phí ròng.

Lưu ý: ứng dụng mang tính thông tin và giáo dục, không phải lời khuyên đầu tư.""",
    "zh-Hant": """無論你剛開始看第一檔股票，還是每天交易選擇權，SIGNUM HQ 讓美股變得看得懂。免費。

每個交易日，AI 把原始市場數據變成幾分鐘就能讀完的解讀：什麼在動、為什麼動、背後的資金是誰。

■ 盤前與盤後
開盤前和收盤後誰在動，以及背後的原因。

■ 財報行事曆
哪些公司在開盤前或收盤後公布，附日期與預估每股盈餘。

■ AI 類股報告
全部 10 個類股，每日收盤報告與早盤簡報。

■ 選擇權結構
GEX（Gamma 曝險）、Put/Call 比、最大痛點、Call Wall 與 Put Floor。

■ 資金流向
暗池成交比重、大單交易、淨權利金。

注意：本 App 提供資訊與教育參考，並非投資建議。""",
}
BODY["es-MX"] = BODY["es-ES"]

# 이름 30자 · 부제 30자 · 키워드 100자 — 넘으면 애플이 조용히 거부한다.
FIELDS = {
    "de-DE":   ("SIGNUM HQ: US-Aktien Zahlen", "Vorbörse, Nachbörse, Kalender",
                "Aktien,USA,Börse,Quartalszahlen,Vorbörse,Nachbörse,Optionen,Dark Pool,Nasdaq,Tesla,gratis"),
    "es-ES":   ("SIGNUM HQ: Premercado EEUU", "Preapertura, cierre y agenda",
                "acciones,EEUU,bolsa,resultados,premercado,after hours,opciones,dark pool,Nasdaq,gratis"),
    "es-MX":   ("SIGNUM HQ: Premercado EEUU", "Preapertura, cierre y agenda",
                "acciones,EEUU,bolsa,resultados,premercado,after hours,opciones,dark pool,Nasdaq,gratis"),
    "fr-FR":   ("SIGNUM HQ: Préouverture US", "Avant-Bourse, après-Bourse",
                "actions,US,bourse,résultats,préouverture,after hours,options,dark pool,Nasdaq,gratuit"),
    "id":      ("SIGNUM HQ: Pramarket Saham AS", "Pramarket, after hours, laba",
                "saham,AS,bursa,laba,pramarket,after hours,opsi,dark pool,Nasdaq,Tesla,gratis"),
    "it":      ("SIGNUM HQ: Pre-mercato USA", "Pre e after hours, calendario",
                "azioni,USA,borsa,utili,pre-mercato,after hours,opzioni,dark pool,Nasdaq,gratis"),
    "pt-BR":   ("SIGNUM HQ: Pré-mercado EUA", "Pré e pós-mercado, agenda",
                "ações,EUA,bolsa,balanços,pré-mercado,after hours,opções,dark pool,Nasdaq,grátis"),
    "vi":      ("SIGNUM HQ: Chứng khoán Mỹ", "Trước giờ mở, sau giờ, lịch",
                "cổ phiếu,Mỹ,chứng khoán,báo cáo,trước giờ mở,sau giờ,quyền chọn,dark pool,Nasdaq"),
    "zh-Hant": ("SIGNUM HQ: 美股盤前財報", "盤前、盤後、財報日曆與資金流",
                "美股,財報,盤前,盤後,選擇權,暗池,那斯達克,特斯拉,免費,即時,股票,投資,行事曆,美國股市,大戶,成交量,個股,道瓊,標普,籌碼,新聞,盤中"),
}

WN = {
    "de-DE": "Store-Informationen in weiteren Sprachen und kleinere Verbesserungen.",
    "es-ES": "Información de la tienda en más idiomas y mejoras menores.",
    "es-MX": "Información de la tienda en más idiomas y mejoras menores.",
    "fr-FR": "Informations de la boutique dans plus de langues et améliorations mineures.",
    "id": "Informasi toko dalam lebih banyak bahasa dan perbaikan kecil.",
    "it": "Informazioni dello store in più lingue e miglioramenti minori.",
    "pt-BR": "Informações da loja em mais idiomas e pequenas melhorias.",
    "vi": "Thông tin cửa hàng ở nhiều ngôn ngữ hơn và các cải tiến nhỏ.",
    "zh-Hant": "商店資訊新增更多語言，並修正細節。",
}

# 기존 3개 로케일의 키워드 — 남는 자리를 채운다. 기존 항목은 **하나도 빼지 않는다**
# (실적 관련 #1 두 개가 거기서 나온다). ⛔ 어닝콜·주가알림은 기능이 없어 넣지 않는다.
KEYWORD_ADD = {
    "ko": ",장마감,종목분석,실시간주가",
    "ja": ",決算,時間外取引",
}


def check_lengths() -> bool:
    ok = True
    for loc, (name, sub, kw) in FIELDS.items():
        for label, val, lim in (("name", name, 30), ("subtitle", sub, 30), ("keywords", kw, 100)):
            mark = "✓" if len(val) <= lim else "✗ 초과"
            if len(val) > lim:
                ok = False
            print(f"  {loc:8} {label:9} {len(val):3}/{lim}  {mark}  {val[:44]}")
    return ok


def main() -> None:
    dry = "--dry" in sys.argv
    print("길이 검사")
    if not check_lengths():
        sys.exit("✗ 한도를 넘는 항목이 있다 — 고치기 전에는 올리지 않는다")
    if dry:
        print("\n(--dry: 여기까지)")
        return

    # ---- 1. 버전 1.6 확보 ----
    vs = call("GET", f"/apps/{APP}/appStoreVersions?limit=10")["data"]
    ver = next((v["id"] for v in vs if v["attributes"]["versionString"] == VERSION), None)
    if not ver:
        r = call("POST", "/appStoreVersions", {"data": {
            "type": "appStoreVersions",
            "attributes": {"platform": "IOS", "versionString": VERSION},
            "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})
        if "__error__" in r:
            sys.exit(f"✗ 버전 생성 실패: {r['body'][:300]}")
        ver = r["data"]["id"]
        print(f"\n✓ 버전 {VERSION} 생성 {ver}")
    else:
        print(f"\n  버전 {VERSION} 이미 있음 {ver}")

    # ---- 2. 편집 가능한 appInfo 찾기 ----
    infos = call("GET", f"/apps/{APP}/appInfos?limit=10")["data"]
    editable = next((i for i in infos
                     if i["attributes"].get("appStoreState") not in ("READY_FOR_SALE", "REPLACED_WITH_NEW_VERSION")), None)
    if not editable:
        sys.exit("✗ 편집 가능한 appInfo 가 없다 — 버전 생성 후 잠시 뒤 다시 실행")
    info_id = editable["id"]
    print(f"  appInfo {info_id} state={editable['attributes'].get('appStoreState')}")

    have_info = {l["attributes"]["locale"]: l["id"]
                 for l in call("GET", f"/appInfos/{info_id}/appInfoLocalizations?limit=50")["data"]}
    have_ver = {l["attributes"]["locale"]: l["id"]
                for l in call("GET", f"/appStoreVersions/{ver}/appStoreVersionLocalizations?limit=50")["data"]}

    # ---- 3. 신규 9개 로케일 ----
    # ⚠️ appInfoLocalization 을 만들면 애플이 appStoreVersionLocalization 을
    #    **자동으로 같이 만든다**. 그래서 미리 읽어둔 목록으로 POST 하면
    #    409 DUPLICATE 로 막힌다 — 로케일마다 만든 «직후에» 다시 확인한다.
    for loc, (name, sub, kw) in FIELDS.items():
        if loc in have_info:
            r = call("PATCH", f"/appInfoLocalizations/{have_info[loc]}", {"data": {
                "type": "appInfoLocalizations", "id": have_info[loc],
                "attributes": {"name": name, "subtitle": sub, "privacyPolicyUrl": PRIVACY}}})
        else:
            r = call("POST", "/appInfoLocalizations", {"data": {
                "type": "appInfoLocalizations",
                "attributes": {"locale": loc, "name": name, "subtitle": sub, "privacyPolicyUrl": PRIVACY},
                "relationships": {"appInfo": {"data": {"type": "appInfos", "id": info_id}}}}})
        info_ok = "__error__" not in r

        attrs = {"description": BODY[loc] + "\n\n" + SUB[loc], "keywords": kw,
                 "whatsNew": WN[loc], "supportUrl": SUPPORT}
        if loc not in have_ver:      # 방금 자동 생성됐을 수 있다 — 다시 읽는다
            have_ver = {l["attributes"]["locale"]: l["id"] for l in
                        call("GET", f"/appStoreVersions/{ver}/appStoreVersionLocalizations?limit=50")["data"]}
        if loc in have_ver:
            r2 = call("PATCH", f"/appStoreVersionLocalizations/{have_ver[loc]}", {"data": {
                "type": "appStoreVersionLocalizations", "id": have_ver[loc], "attributes": attrs}})
        else:
            r2 = call("POST", "/appStoreVersionLocalizations", {"data": {
                "type": "appStoreVersionLocalizations",
                "attributes": {"locale": loc, **attrs},
                "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": ver}}}}})
        ver_ok = "__error__" not in r2
        print(f"  {loc:8} appInfo {'✓' if info_ok else '✗ ' + r.get('body','')[:120]}"
              f"   version {'✓' if ver_ok else '✗ ' + r2.get('body','')[:120]}")

    # ---- 4. 기존 ko/ja 키워드에 남는 자리 채우기 ----
    for loc, add in KEYWORD_ADD.items():
        lid = have_ver.get(loc)
        if not lid:
            print(f"  {loc:8} (버전 로케일 없음 — 건너뜀)")
            continue
        cur = call("GET", f"/appStoreVersionLocalizations/{lid}")["data"]["attributes"].get("keywords") or ""
        # 여러 번 돌려도 안전해야 한다 — 이미 붙었으면 건드리지 않는다.
        if all(t in cur.split(",") for t in add.strip(",").split(",")):
            print(f"  {loc:8} 키워드 이미 반영됨 ({len(cur)}/100)")
            continue
        new = cur + add
        if len(new) > 100:
            print(f"  {loc:8} 키워드 {len(cur)}+{len(add)} = {len(new)} > 100 — 건너뜀")
            continue
        r = call("PATCH", f"/appStoreVersionLocalizations/{lid}", {"data": {
            "type": "appStoreVersionLocalizations", "id": lid, "attributes": {"keywords": new}}})
        print(f"  {loc:8} 키워드 {len(cur)} → {len(new)}/100 {'✓' if '__error__' not in r else '✗'}")

    print("\n다음: ② 스크린샷(asc_upload_screenshots.py) → ③ 빌드·업로드 → ④ ios_submit.py")


if __name__ == "__main__":
    main()
