import { ReactNode } from 'react';
import {
    Shield, Database, Target, Clock, Lock, Mail,
    UserCheck, Globe, Cookie, Server, Eye, AlertTriangle, FileText
} from 'lucide-react';
import { PrivacySection, PrivacyMeta } from './_content-en';

export const meta: PrivacyMeta = {
    pageTitle: 'プライバシーポリシー',
    lastUpdated: '最終更新日: 2026年2月12日',
    intro: 'SIGNUM HQ（以下「サービス」）は、利用者の個人情報を重視し、「個人情報の保護に関する法律（個人情報保護法）」および関連法令を遵守します。本ポリシーでは、利用者の個人情報の収集・利用・保管・廃棄について説明します。',
    effectiveDate: '本プライバシーポリシーは',
    effectiveDateBold: '2026年2月12日',
    backLink: '← ログインに戻る',
    importantBadge: '重要項目',
};

export const sections: PrivacySection[] = [
    {
        icon: FileText,
        color: 'text-slate-400',
        title: '第1条（目的）',
        content: (
            <p>本プライバシーポリシーは、SIGNUM HQ（以下「サービス」）が利用者の個人情報をどのように収集、利用、保管、廃棄するかを説明し、「個人情報保護法」および関連法令を遵守することを目的とします。</p>
        ),
    },
    {
        icon: Database,
        color: 'text-cyan-400',
        title: '第2条（収集する個人情報）',
        highlight: true,
        content: (
            <div className="space-y-4">
                <div>
                    <p className="font-semibold text-white mb-2">1. メール登録時</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>必須：</strong> メールアドレス、パスワード（暗号化保存）</li>
                    </ul>
                </div>
                <div>
                    <p className="font-semibold text-white mb-2">2. Google OAuth 登録時</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>必須：</strong> メールアドレス、氏名、プロフィール画像URL</li>
                        <li>Googleから提供されるOAuthトークン（サービス認証目的）</li>
                    </ul>
                </div>
                <div>
                    <p className="font-semibold text-white mb-2">3. サービス利用過程で自動収集</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>接続IPアドレス、ブラウザの種類およびバージョン、端末情報</li>
                        <li>接続日時、サービス利用記録、訪問ページ</li>
                        <li>Cookie およびセッション情報</li>
                    </ul>
                </div>
            </div>
        ),
    },
    {
        icon: Target,
        color: 'text-amber-400',
        title: '第3条（個人情報の利用目的）',
        content: (
            <div className="space-y-2">
                <p>収集された個人情報は、以下の目的にのみ利用されます：</p>
                <ol className="list-decimal list-inside space-y-2 mt-3">
                    <li><strong>会員管理：</strong> 加入意思確認、本人識別・認証、会員資格の維持・管理</li>
                    <li><strong>サービス提供：</strong> データ分析サービス、AIレポート、シグナルアラートなどのコンテンツ提供</li>
                    <li><strong>有料サービス：</strong> サブスクリプション管理、決済処理、料金精算</li>
                    <li><strong>サービス改善：</strong> 利用統計分析、サービス品質向上、新機能開発</li>
                    <li><strong>カスタマーサポート：</strong> お問い合わせ対応、お知らせ伝達、紛争処理</li>
                    <li><strong>安全管理：</strong> 不正利用防止、不正アクセス検知、システムセキュリティ維持</li>
                </ol>
            </div>
        ),
    },
    {
        icon: Eye,
        color: 'text-rose-400',
        title: '第4条（個人情報の第三者提供）',
        highlight: true,
        content: (
            <div className="space-y-3">
                <p>当社は原則として利用者の個人情報を<strong>第三者に提供しません。</strong>ただし、以下の場合は例外とします：</p>
                <ol className="list-decimal list-inside space-y-2 mt-3">
                    <li>利用者の<strong>事前同意</strong>がある場合</li>
                    <li>法令により<strong>捜査機関の要請</strong>がある場合</li>
                    <li>統計作成、学術研究等の目的で<strong>特定の個人を識別できない形態</strong>で提供する場合</li>
                </ol>
            </div>
        ),
    },
    {
        icon: Server,
        color: 'text-violet-400',
        title: '第5条（個人情報処理の委託および国外移転）',
        highlight: true,
        content: (
            <div className="space-y-4">
                <p>当社はサービス運営のために、以下の通り個人情報処理を委託しています：</p>
                <div className="overflow-x-auto mt-3">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="py-2 pr-4 text-white font-semibold">委託先</th>
                                <th className="py-2 pr-4 text-white font-semibold">委託業務</th>
                                <th className="py-2 text-white font-semibold">サーバー所在地</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-400">
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">Supabase Inc.</td>
                                <td className="py-2 pr-4">会員認証、データベース管理</td>
                                <td className="py-2">米国（AWS）</td>
                            </tr>
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">Vercel Inc.</td>
                                <td className="py-2 pr-4">ウェブサービスのホスティング・配信</td>
                                <td className="py-2">米国</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Google LLC</td>
                                <td className="py-2 pr-4">OAuth認証、アナリティクス</td>
                                <td className="py-2">米国</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="mt-3">上記の事業者は業界標準レベルの<strong>セキュリティ認証（SOC 2、ISO 27001）</strong>を保有しており、当社は個人情報保護のための契約を締結しています。</p>
            </div>
        ),
    },
    {
        icon: Clock,
        color: 'text-emerald-400',
        title: '第6条（個人情報の保有および廃棄）',
        content: (
            <div className="space-y-4">
                <p><strong>原則：</strong> 利用目的達成時に遅滞なく廃棄します。ただし、関連法令により一定期間保管が必要な場合は以下の通り保管します：</p>
                <div className="overflow-x-auto mt-3">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="py-2 pr-4 text-white font-semibold">保管項目</th>
                                <th className="py-2 pr-4 text-white font-semibold">保管期間</th>
                                <th className="py-2 text-white font-semibold">根拠法令</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-400">
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">契約・サブスクリプション関連記録</td>
                                <td className="py-2 pr-4 text-white font-medium">5年</td>
                                <td className="py-2">電子商取引法</td>
                            </tr>
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">代金決済・財貨供給記録</td>
                                <td className="py-2 pr-4 text-white font-medium">5年</td>
                                <td className="py-2">電子商取引法</td>
                            </tr>
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">消費者不満・紛争処理記録</td>
                                <td className="py-2 pr-4 text-white font-medium">3年</td>
                                <td className="py-2">電子商取引法</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">接続ログ記録</td>
                                <td className="py-2 pr-4 text-white font-medium">3ヶ月</td>
                                <td className="py-2">通信秘密保護法</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="mt-2"><strong>廃棄方法：</strong> 電子ファイルは復旧不可能な方法で永久削除し、紙の文書（ある場合）は裁断または焼却します。</p>
            </div>
        ),
    },
    {
        icon: UserCheck,
        color: 'text-indigo-400',
        title: '第7条（利用者の権利と行使方法）',
        content: (
            <div className="space-y-3">
                <p>利用者（または法定代理人）は以下の権利を行使できます：</p>
                <ol className="list-decimal list-inside space-y-2 mt-3">
                    <li><strong>閲覧権：</strong> 自身の個人情報の処理状況を閲覧請求できます。</li>
                    <li><strong>訂正・削除権：</strong> 個人情報の誤りに対して訂正または削除を請求できます。</li>
                    <li><strong>処理停止権：</strong> 個人情報処理の停止を請求できます。</li>
                    <li><strong>同意撤回権：</strong> 個人情報の収集・利用に対する同意をいつでも撤回できます。</li>
                    <li><strong>データ移行権：</strong> 自身のデータを構造化された形式で提供を受けることができます。</li>
                </ol>
                <p className="mt-3">上記の権利はサービス内の設定またはメール（<a href="mailto:contact@signumhq.com" className="text-cyan-400 hover:underline">contact@signumhq.com</a>）を通じて行使でき、当社は遅滞なく対応します。</p>
            </div>
        ),
    },
    {
        icon: Cookie,
        color: 'text-orange-400',
        title: '第8条（Cookieおよびトラッキング技術）',
        content: (
            <div className="space-y-3">
                <ol className="list-decimal list-inside space-y-3">
                    <li>
                        <strong>Cookieの使用目的：</strong> 当社は利用者のログイン状態の維持、サービス利用環境の改善、利用統計の収集のためにCookieを使用します。
                    </li>
                    <li>
                        <strong>Cookieの種類：</strong>
                        <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-slate-400">
                            <li><strong className="text-slate-200">必須Cookie：</strong> ログイン認証、セッション維持（Supabase Auth）</li>
                            <li><strong className="text-slate-200">分析Cookie：</strong> サービス利用パターン分析（非識別化処理）</li>
                            <li><strong className="text-slate-200">機能Cookie：</strong> 言語設定、ダークモードなどユーザー環境設定の保存</li>
                        </ul>
                    </li>
                    <li><strong>Cookieの拒否：</strong> 利用者はブラウザ設定を通じてCookieを拒否できますが、この場合<strong>ログインなど一部サービスの利用に制限</strong>がある場合があります。</li>
                </ol>
            </div>
        ),
    },
    {
        icon: Lock,
        color: 'text-rose-400',
        title: '第9条（個人情報の安全性確保措置）',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>暗号化：</strong> パスワードは<strong>一方向暗号化（bcrypt）</strong>で保存し、通信区間は<strong>TLS 1.2以上</strong>で暗号化します。</li>
                <li><strong>アクセス制御：</strong> 個人情報へのアクセス権限を最小限に抑え、管理者アクセス時は認証手続きを経ます。</li>
                <li><strong>セキュリティモニタリング：</strong> 不正アクセスまたは漏洩防止のためにセキュリティシステムを運用し、異常検知時は即座に対応します。</li>
                <li><strong>定期点検：</strong> 個人情報保護のために定期的にセキュリティ脆弱性検査を実施します。</li>
            </ol>
        ),
    },
    {
        icon: Shield,
        color: 'text-teal-400',
        title: '第10条（個人情報保護責任者）',
        content: (
            <div className="space-y-3">
                <p>当社は個人情報処理に関する業務を総括して責任を持ち、利用者の不満および被害救済のため、以下の通り個人情報保護責任者を指定しています：</p>
                <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <ul className="space-y-2 text-sm">
                        <li><strong>職位：</strong> 代表取締役</li>
                        <li><strong>メール：</strong> <a href="mailto:contact@signumhq.com" className="text-cyan-400 hover:underline">contact@signumhq.com</a></li>
                    </ul>
                </div>
            </div>
        ),
    },
    {
        icon: Globe,
        color: 'text-sky-400',
        title: '第11条（プライバシーポリシーの変更）',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>本プライバシーポリシーは、法令、政策またはセキュリティ技術の変更に応じて改定される場合があります。</li>
                <li>改定時はサービス内のお知らせまたはメールで<strong>変更事項と施行日を7日前に案内</strong>します。</li>
                <li>重要な変更（収集項目の追加、第三者提供の変更等）の場合は<strong>30日前に案内</strong>し、必要に応じて利用者の<strong>再同意</strong>を取得します。</li>
            </ol>
        ),
    },
];
