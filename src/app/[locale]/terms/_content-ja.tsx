import { ReactNode } from 'react';
import Link from 'next/link';
import {
    AlertTriangle, Scale, Ban, CreditCard, RefreshCw, Shield,
    Database, Users, LogOut, CloudOff, FileText, Gavel, BookOpen, Globe
} from 'lucide-react';
import { TermsSection, TermsMeta } from './_content-en';

export const meta: TermsMeta = {
    pageTitle: 'SIGNUM HQ 利用規約',
    lastUpdated: '最終更新日: 2026年2月12日',
    intro: '本利用規約（以下「本規約」）は、SIGNUM HQ（以下「サービス」）の利用に関して、当社とユーザー（以下「会員」）との間の権利、義務および責任事項を定めることを目的とします。サービスを利用することにより、本規約に同意したものとみなされます。',
    effectiveDate: '本規約は',
    effectiveDateBold: '2026年2月12日',
    backLink: '← ログインに戻る',
};

export const sections: TermsSection[] = [
    {
        icon: BookOpen,
        color: 'text-slate-400',
        title: '第1条（目的）',
        content: (
            <p>本規約は、SIGNUM HQ（以下「当社」）が提供するサービスの利用に関して、当社と会員との間の権利、義務および責任事項を規定することを目的とします。</p>
        ),
    },
    {
        icon: FileText,
        color: 'text-indigo-400',
        title: '第2条（用語の定義）',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>「サービス」</strong>とは、端末（PC、モバイルなど）を問わず、会員が利用できるSIGNUM HQの全てのデータ、AI分析、ビジュアライゼーションを意味します。</li>
                <li><strong>「会員」</strong>とは、本規約に同意し、当社が定める手続きを完了してサービス利用契約を締結した者をいいます。</li>
                <li><strong>「Tactical Order」</strong>とは、アルゴリズムにより算出された特定の市場状況に対する統計的シグナル（例：BUY、HOLD、SELLなど）を指し、これは<strong>参考情報に過ぎず、実際の売買指示ではありません。</strong></li>
                <li><strong>「プレミアムサービス」</strong>とは、有料サブスクリプションを通じて提供される高度なデータ分析、リアルタイムシグナル、AIレポートなどの付加サービスを意味します。</li>
            </ol>
        ),
    },
    {
        icon: AlertTriangle,
        color: 'text-amber-400',
        title: '第3条（金融情報の性質および投資免責）',
        highlight: true,
        content: (
            <ol className="list-decimal list-inside space-y-3">
                <li><strong>情報提供のみ：</strong> SIGNUM HQで提供される全てのデータ、分析および情報（Gamma Exposure、Options Flow、Max Pain、Dark Pool Tracker、Alpha Score、Tactical Orderなどを含む）は、<strong>過去のデータに基づく統計的参考資料に過ぎず、特定の銘柄の売買を勧誘したり投資助言を構成するものではありません。</strong></li>
                <li><strong>投資責任：</strong> 金融投資には元本損失のリスクが伴います。<strong>全ての投資判断とその損益の責任は利用者本人にあります。</strong>当社は、会員がサービスに掲載された情報に依拠して行った投資結果について、いかなる法的責任も負いません。</li>
                <li><strong>非登録投資助言業者：</strong> 本サービスは、<strong>金融商品取引法に基づく投資助言・代理業、投資運用業</strong>またはそれに類する金融サービスを提供するものではなく、当社は金融庁に登録された投資助言業者ではありません。</li>
                <li><strong>過去の実績は将来を保証しない：</strong> サービスで提示される過去データに基づく統計数値、バックテスト結果、アルファスコアなどは、<strong>将来の投資成果を保証または予測するものではありません。</strong></li>
            </ol>
        ),
    },
    {
        icon: Ban,
        color: 'text-rose-400',
        title: '第4条（サービス利用制限および禁止行為）',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>アカウント共有禁止：</strong> 会員のアカウントは本人のみが使用でき、他者への譲渡、貸与、共有はできません。</li>
                <li><strong>データスクレイピング禁止：</strong> 当社の事前の書面許可なく、ロボット、スパイダー、スクレイパーなどの自動化された手段を用いてサービスのデータを収集、加工、再配布する行為を厳禁します。</li>
                <li><strong>リバースエンジニアリング禁止：</strong> サービスのソースコード、アルゴリズム、分析ロジックの逆コンパイル、逆アセンブル、リバースエンジニアリングまたはその試みを禁止します。</li>
                <li><strong>違法行為禁止：</strong> サービスで提供された情報を利用した相場操縦、インサイダー取引など、関連法令に違反する行為を禁止します。</li>
                <li><strong>虚偽情報流布禁止：</strong> サービスを利用して虚偽または誤解を招く情報を流布する行為を禁止します。</li>
                <li><strong>違反時の措置：</strong> 上記禁止行為に違反した場合、当社は<strong>事前通知なく当該会員のサービス利用を即時停止または契約を解除</strong>でき、これによる損害について法的措置を講じることができます。</li>
            </ol>
        ),
    },
    {
        icon: CreditCard,
        color: 'text-emerald-400',
        title: '第5条（サブスクリプションおよび決済）',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>当社は有料サービス（Premium、Proなど）を提供し、各サブスクリプション等級別の利用範囲と料金はサービス内で別途告知します。</li>
                <li>定期サブスクリプションの場合、会員が期間満了前に別途解約申請をしない限り、<strong>毎月または毎年自動的に決済が更新</strong>されます。</li>
                <li>当社はサブスクリプション料金を変更できます。変更時は最低30日前にサービス内告知またはメールで案内します。変更後の料金は次の更新サイクルから適用されます。</li>
            </ol>
        ),
    },
    {
        icon: RefreshCw,
        color: 'text-cyan-400',
        title: '第6条（サービスの変更および中断）',
        content: (
            <ol className="list-decimal list-inside space-y-3">
                <li><strong>サービス変更：</strong> 当社は運営上、技術上の必要に応じてサービスの全部または一部を変更できます。</li>
                <li>
                    <strong>サービス中断：</strong> 以下の事由によりサービス提供が一時的に中断される場合があり、<strong>これによる損害について当社は責任を負いません。</strong>
                    <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-slate-400">
                        <li>システム定期点検、サーバー増設・交換などの計画作業</li>
                        <li>天災地変、戦争、政府規制、取引所の緊急停止などの不可抗力的事由</li>
                        <li>第三者データプロバイダー（API）の障害またはサービス中断</li>
                        <li>電気通信事業者のサービス中断</li>
                    </ul>
                </li>
                <li><strong>サービス終了：</strong> 当社が事業上の理由でサービスを永久終了する場合、最低30日前に告知し、有料会員には残余サブスクリプション期間分の金額を日割計算して返金します。</li>
            </ol>
        ),
    },
    {
        icon: CreditCard,
        color: 'text-teal-400',
        title: '第7条（返金ポリシー）',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>デジタルコンテンツの特性：</strong> 本サービスは決済と同時にプレミアムデータと分析レポートにアクセス可能な「デジタルコンテンツ」に該当します。</li>
                <li><strong>返金制限：</strong> 特定商取引法に基づき、会員が有料データの閲覧、レポートの閲覧、またはサービスに1回以上接続してデータを消費した場合、<strong>サービスの価値が利用されたものとみなし、返金が制限される</strong>場合があります。</li>
                <li><strong>例外：</strong> 決済後7日以内にサービスへのアクセスおよびデータ閲覧履歴が全くない場合に限り、全額返金が可能です。</li>
                <li><strong>返金手続き：</strong> 返金リクエストはサービス内のお問い合わせまたはメール（<a href="mailto:contact@signumhq.com" className="text-cyan-400 hover:underline">contact@signumhq.com</a>）から申請でき、当社は受領日から営業日基準7日以内に処理します。</li>
            </ol>
        ),
    },
    {
        icon: Shield,
        color: 'text-violet-400',
        title: '第8条（知的財産権）',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>サービス内の全てのデザイン、テキスト、チャート、アルゴリズム、データビジュアライゼーション、商標（<strong>SIGNUM HQ、Alpha Engine、Tactical Order</strong>など）およびその他のコンテンツは<strong>当社の知的財産</strong>であり、著作権法および関連法律により保護されます。</li>
                <li>会員は当社の事前書面同意なくサービスのコンテンツを<strong>営利目的で利用し、または第三者に提供、複製、配布することはできません。</strong></li>
                <li>会員がサービス利用過程で作成した投稿物（ある場合）の著作権は当該会員に帰属しますが、当社はサービス運営目的の範囲内でこれを利用できます。</li>
            </ol>
        ),
    },
    {
        icon: Database,
        color: 'text-sky-400',
        title: '第9条（データ保証免責および第三者データ）',
        highlight: true,
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>無保証：</strong> 当社はサービスの正確性、完全性、適時性または特定目的への適合性を保証せず、<strong>サービスは「現状のまま（AS-IS）」で提供</strong>されます。</li>
                <li><strong>システム障害：</strong> システムエラー、データ遅延、ネットワーク障害、またはその他の技術的問題による情報の欠落、エラーおよびこれによる損害について当社は法的責任を負いません。</li>
                <li><strong>第三者データ：</strong> サービスで提供される相場、オプション、指数などのデータは第三者データプロバイダー（取引所、データベンダーなど）から取得されており、<strong>当社は当該データの正確性、完全性、リアルタイム性を保証しません。</strong></li>
                <li><strong>データ遅延：</strong> リアルタイムで表示されるデータであっても実際の市場データとの時間差が生じる可能性があり、これにより発生する損害について当社は責任を負いません。</li>
            </ol>
        ),
    },
    {
        icon: Scale,
        color: 'text-orange-400',
        title: '第10条（損害賠償の制限）',
        highlight: true,
        content: (
            <ol className="list-decimal list-inside space-y-3">
                <li><strong>賠償上限額：</strong> 当社の帰責事由により会員に損害が発生した場合、当社の賠償範囲は<strong>当該会員が損害発生日直前3ヶ月間に当社に支払ったサービス利用料総額を超えません。</strong>無料利用者の場合、当社の賠償責任はありません。</li>
                <li><strong>間接損害免責：</strong> 当社はサービス利用に関連して発生した<strong>間接損害、特別損害、結果的損害、懲罰的損害、逸失利益または期待利益の喪失について責任を負いません。</strong></li>
                <li><strong>投資損失免責：</strong> 会員がサービスで提供した情報を参考にして行った投資判断による<strong>金銭的損失について、当社はいかなる場合においても責任を負いません。</strong></li>
            </ol>
        ),
    },
    {
        icon: Users,
        color: 'text-rose-400',
        title: '第11条（年齢制限）',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>本サービスは<strong>18歳以上</strong>の利用者のみご利用いただけます。</li>
                <li>サービスの登録および利用時に、利用者は18歳以上であることを保証するものとし、未成年者が法定代理人の同意なくサービスを利用した場合に生じた問題について<strong>当社は責任を負わず、当該利用契約は取消される</strong>場合があります。</li>
            </ol>
        ),
    },
    {
        icon: LogOut,
        color: 'text-pink-400',
        title: '第12条（アカウント解約および退会）',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>会員退会：</strong> 会員はいつでもサービス内の設定またはメール（<a href="mailto:contact@signumhq.com" className="text-cyan-400 hover:underline">contact@signumhq.com</a>）を通じて退会を申請でき、当社は遅滞なく処理します。</li>
                <li><strong>データ削除：</strong> 退会時、会員の個人情報は関連法令により保存が必要な情報を除き遅滞なく廃棄します。</li>
                <li><strong>当社による解約：</strong> 会員が本規約に違反した場合、またはサービスの正常な運営を妨害した場合、当社は事前通知後（緊急の場合は事後通知）<strong>利用契約を解除</strong>できます。</li>
                <li><strong>有料サービス解約時：</strong> 有料サブスクリプション解約時、既に決済された期間まではサービスを正常に利用でき、次の決済サイクルから課金が停止されます。</li>
            </ol>
        ),
    },
    {
        icon: CloudOff,
        color: 'text-gray-400',
        title: '第13条（不可抗力）',
        content: (
            <p>天災地変、戦争、テロ、暴動、政府の行為、法令の変更、取引所の緊急措置、電力供給の中断、通信障害またはその他<strong>当社の支配範囲を超えた事由</strong>によりサービス提供が不可能な場合、当社はこれに対する<strong>責任を負わず、サービス提供義務が免除</strong>されます。</p>
        ),
    },
    {
        icon: FileText,
        color: 'text-purple-400',
        title: '第14条（規約の改定）',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>当社は関連法令に違反しない範囲内で本規約を変更できます。</li>
                <li>規約変更時、適用日および変更理由を明示し、適用日<strong>7日前から</strong>（会員に不利な変更の場合<strong>30日前から</strong>）サービス内告知またはメールで案内します。</li>
                <li>会員が変更された規約の適用日までに拒否の意思を表示せず、サービスを継続利用した場合、<strong>変更された規約に同意したものとみなします。</strong></li>
                <li>変更された規約に同意しない会員はサービスの利用を中断し、退会することができます。</li>
            </ol>
        ),
    },
    {
        icon: Gavel,
        color: 'text-amber-300',
        title: '第15条（準拠法および紛争の解決）',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>本規約の解釈および適用に関しては、<strong>大韓民国の法律</strong>を準拠法とします。</li>
                <li>本規約に関連して発生した全ての紛争は、<strong>当社の本店所在地を管轄する裁判所</strong>を第一審専属管轄裁判所とします。</li>
                <li>海外からサービスを利用する会員も、本規約に同意することにより、<strong>大韓民国の法律の適用および大韓民国の裁判所の管轄に同意</strong>したものとみなされます。</li>
            </ol>
        ),
    },
];
