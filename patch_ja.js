const fs = require('fs');
const file = 'src/messages/ja.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

if (!data.portfolioGuide) {
    data.portfolioGuide = {
        subtitle: "ポートフォリオの各指標と画面構成要素を詳細に案内します。",
        cards: {
            alphaScore: {
                meaning: "AIが収益性とリスクを総合分析した最終スコア",
                desc: {
                    a: "90-100: 最上位クラス、積極保有",
                    b: "80-89: 優秀クラス、保有維持",
                    c: "70-79: 普通クラス、トレンド確認用",
                    d: "60-69: 注意クラス、比率縮小を検討",
                    f: "0-59: 危険クラス、売却検討"
                }
            },
            signalBadge: {
                badge: "AI意見",
                meaning: "現時点の売買意見",
                add: "積極買い/比率拡大",
                hold: "現在の比率を維持",
                watch: "様子見推奨",
                trim: "比率縮小/利益確定"
            },
            confidence: {
                badge: "AI確信度",
                meaning: "AIシグナルに対するデータの信頼度",
                high: "データの一致度が高く、シグナルを信頼",
                mid: "一部混在、分割アプローチ",
                low: "安定したシグナルなし、保守的アプローチ"
            },
            sparkline: {
                badge: "5D Flow",
                meaning: "直近5日間の短期モメンタムの流れ",
                descIntro: "線の色を通じて短期トレンドを直感的に把握します。",
                uptrend: "緑線: 短期上昇トレンド",
                downtrend: "赤線: 短期下落トレンド",
                sideways: "灰線: 方向性なし (横ばい)"
            }
        }
    };
    fs.writeFileSync(file, JSON.stringify(data, null, 4));
    console.log('portfolioGuide added successfully to JA');
} else {
    console.log('portfolioGuide already exists in JA');
}
