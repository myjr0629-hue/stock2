'use strict';
// 2026-10-17 원장 78키·channels.json 163 ID·플랫폼 대장 173 ID 대조.
// P번호와 플랫폼명을 함께 확인한다. 접두어·부분 문자열로 귀속을 추측하지 않는다.
const PLAN_CHANNELS = {
    P01: ['X 미국·일본', ['x_us', 'x_jp', 'x_reply', 'x_reply_jp', 'x_pin', 'x_communities']],
    P02: ['Bluesky', ['bluesky', 'bluesky_starter_pack', 'bluesky_feeds', 'bluesky_own_feed', 'bluesky_reply', 'bluesky_buildinpublic', 'bluesky_pt', 'bluesky_earnings_feeds', 'bluesky_pin', 'bluesky_jp', 'bluesky_kr']],
    P03: ['Threads', ['threads', 'threads_reply', 'threads_jp', 'threads_kr', 'threads_pin', 'threads_reply_jp', 'threads_reply_kr', 'threads_communities', 'threads_fediverse']],
    P04: ['Instagram', ['instagram']], P05: ['Pinterest', ['pinterest']],
    P06: ['Reddit', ['reddit', 'wsb_earnings_thread']], P07: ['TikTok', ['tiktok']], P08: ['YouTube', ['youtube']],
    P09: ['note', ['note', 'note_odai', 'note_magazine', 'note_joint_magazine', 'note_pin', 'note_kojin']],
    P10: ['Medium', ['medium', 'medium_publications', 'medium_pin']],
    P11: ['LinkedIn', ['linkedin', 'linkedin_articles', 'linkedin_groups', 'linkedin_newsletter', 'linkedin_comment']],
    P12: ['Quora', ['quora', 'quora_space', 'quora_spaces_share', 'quora_jp', 'quora_de', 'quora_pin']],
    P13: ['GitHub', ['github', 'github_pages', 'github_pages_congress', 'congress_member_pages', 'indexnow_ghpages', 'github_pages_finra', 'gsc_ghpages', 'github_pages_finra_i18n', 'github_topics', 'github_awesome_ko', 'apd_core', 'awesome_quant', 'awesome_investing_lists', 'awesome_financial_data_apis']],
    P14: ['Indie Hackers', ['indiehackers', 'indiehackers_comment']], P15: ['OKKY', ['okky']],
    P16: ['GeekNews', ['geeknews', 'geeknews_comment']], P17: ['에펨코리아', ['fmkorea']], P18: ['브런치', ['brunch']],
    P19: ['Qiita', ['qiita']], P20: ['Zenn', ['zenn']], P21: ['Hugging Face', ['hf_datasets', 'hf_spaces']],
    P22: ['네이버지식iN', ['naver_kin']], P23: ['네이버블로그', ['naver_blog', 'naver_topic_feed']], P24: ['티스토리', ['tistory']],
    P31: ['미국주식이미래다', ['naver_cafe']], P33: ['디스콰이엇', ['disquiet']],
    P35: ['Tsukutta', ['tsukutta']], P36: ['AlternativeTo', ['alternativeto']], P39: ['Product Hunt', ['producthunt']],
    P40: ['FindUpApp', ['findupapp']],
    P47: ['App Store', ['aso', 'apple_featuring', 'apple_iap_events', 'apple_whats_new', 'apple_cpp', 'apple_ppo', 'apple_app_preview', 'apple_cpp_channels', 'apple_promoted_iap', 'apple_cpp_keywords', 'apple_review_reply']],
    P48: ['Google Play', ['play_promotional_content', 'play_custom_listings', 'play_listing_experiments', 'play_short_description', 'play_app_tags', 'google_play_featuring']],
    P49: ['Galaxy Store', ['galaxy_store']], P52: ['Aptoide Connect', ['aptoide']], P53: ['ONE store', ['onestore']],
    P54: ['Microsoft Store PWA', ['microsoft_store_pwa']], P55: ['Amazon Appstore', ['amazon_appstore']],
    P57: ['AppVillage', ['app_village']], P65: ['はてなブログ·ブックマーク', ['hatena_bookmark']], P72: ['mybest', ['mybest_jp']],
    P94: ['dev.to', ['devto']], P111: ['Substack', ['substack_notes']], P112: ['Telegram', ['telegram_kr']],
    P113: ['LINE公式·오픈채팅', ['line_official_jp']], P117: ['Discord', ['discord_usstock']],
    P118: ['SmartNews', ['smartnews']], P119: ['Apple News', ['apple_news']], P120: ['PRLog', ['free_press_release']],
    P121: ["There's An AI For That", ['taaft']], P122: ['Bing Webmaster', ['bing_webmaster']], P123: ['Daum검색등록', ['daum_search']],
    P124: ['Google검색·Dataset Search·News', ['google_dataset_search', 'google_news', 'seo', 'seo_darkpool', 'seo_uc', 'seo_sg', 'seo_wim']],
    P128: ['StockTwits', ['stocktwits']], P129: ['Buffer', ['buffer']], P130: ['Hacker News', ['hackernews']],
    P131: ['Mastodon', ['mastodon']], P132: ['DC인사이드', ['dcinside']], P133: ['TradingView Ideas', ['tradingview_ideas']],
    P136: ['みんかぶ', ['minkabu']], P137: ['Yahoo!知恵袋', ['chiebukuro']],
    P153: ['Lobsters', ['lobsters']], P154: ['Tildes', ['tildes']], P155: ['Digg', ['digg']], P173: ['MacRumors', ['macrumors']],
};
// 값은 channels.json ID 또는 채널 파일에 없는 플랫폼 대장의 P번호다.
const LEDGER_ALIASES = {
    note_jp: 'note', x_post: 'x_us', quora_en: 'quora', directory: 'directories',
    disquiet_product: 'disquiet', asamo_reply: 'P25',
    clien: 'P27', clien_comment: 'P27', clien_jp: 'P27',
    ppomppu: 'P28', ruliweb: 'P32', kojindev: 'P34',
};
// 게시 그리드의 기존 필터와 별개로 최근 게시 귀속을 제외하는 정확한 키와 이유.
const EXCLUDED_LEDGER_CHANNELS = {
    correction: '여러 플랫폼 게시물의 정정 기록이며 새 게시 원천이 아님',
    diff_kit_1012: '게시 준비용 차이 묶음이며 공개 게시가 아님',
    indexnow: '검색 색인 제출이며 공개 게시가 아님',
    naver_search_advisor: '검색 색인 제출이며 공개 게시가 아님',
    learning_scan: '내부 기술 조사 기록이며 공개 게시가 아님',
    media: '매체 공통 기록으로 공개 주소와 단일 플랫폼 귀속이 없음',
};
module.exports = { PLAN_CHANNELS, LEDGER_ALIASES, EXCLUDED_LEDGER_CHANNELS };
