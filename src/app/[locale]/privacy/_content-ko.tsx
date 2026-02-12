import { ReactNode } from 'react';
import {
    Shield, Database, Target, Clock, Lock, Mail,
    UserCheck, Globe, Cookie, Server, Eye, AlertTriangle, FileText, Trash2
} from 'lucide-react';
import { PrivacySection, PrivacyMeta } from './_content-en';

export const meta: PrivacyMeta = {
    pageTitle: '개인정보처리방침',
    lastUpdated: '최종 수정일: 2026-02-12',
    intro: 'SIGNUM HQ(이하 \'서비스\')는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」 및 관련 법령을 준수합니다. 본 방침을 통해 이용자의 개인정보가 어떻게 수집·이용·보관·파기되는지 안내합니다.',
    effectiveDate: '본 개인정보처리방침은 ',
    effectiveDateBold: '2026년 2월 12일',
    backLink: '← 로그인으로 돌아가기',
    importantBadge: '중요 항목',
};

export const sections: PrivacySection[] = [
    {
        icon: FileText,
        color: 'text-slate-400',
        title: '제1조 (목적)',
        content: (
            <p>본 개인정보처리방침은 SIGNUM HQ(이하 &apos;서비스&apos;)가 이용자의 개인정보를 어떻게 수집, 이용, 보관, 파기하는지를 설명하며, 「개인정보 보호법」 및 관련 법령을 준수합니다.</p>
        ),
    },
    {
        icon: Database,
        color: 'text-cyan-400',
        title: '제2조 (수집하는 개인정보)',
        highlight: true,
        content: (
            <div className="space-y-4">
                <div>
                    <p className="font-semibold text-white mb-2">1. 이메일 가입 시</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>필수:</strong> 이메일 주소, 비밀번호(암호화 저장)</li>
                    </ul>
                </div>
                <div>
                    <p className="font-semibold text-white mb-2">2. Google OAuth 가입 시</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>필수:</strong> 이메일 주소, 이름, 프로필 이미지 URL</li>
                        <li>Google에서 제공하는 OAuth 토큰 (서비스 인증 목적)</li>
                    </ul>
                </div>
                <div>
                    <p className="font-semibold text-white mb-2">3. 서비스 이용 과정에서 자동 수집</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>접속 IP 주소, 브라우저 종류 및 버전, 기기 정보</li>
                        <li>접속 일시, 서비스 이용 기록, 방문 페이지</li>
                        <li>쿠키(Cookie) 및 세션 정보</li>
                    </ul>
                </div>
            </div>
        ),
    },
    {
        icon: Target,
        color: 'text-amber-400',
        title: '제3조 (개인정보의 이용 목적)',
        content: (
            <div className="space-y-2">
                <p>수집된 개인정보는 다음의 목적으로만 이용됩니다:</p>
                <ol className="list-decimal list-inside space-y-2 mt-3">
                    <li><strong>회원 관리:</strong> 가입 의사 확인, 본인 식별 및 인증, 회원자격 유지·관리</li>
                    <li><strong>서비스 제공:</strong> 데이터 분석 서비스, AI 리포트, 시그널 알림 등 콘텐츠 제공</li>
                    <li><strong>유료 서비스:</strong> 구독 관리, 결제 처리, 요금 정산</li>
                    <li><strong>서비스 개선:</strong> 이용 통계 분석, 서비스 품질 향상, 신규 기능 개발</li>
                    <li><strong>고객 지원:</strong> 문의 응대, 공지사항 전달, 분쟁 처리</li>
                    <li><strong>안전 관리:</strong> 부정 이용 방지, 비인가 접근 탐지, 시스템 보안 유지</li>
                </ol>
            </div>
        ),
    },
    {
        icon: Eye,
        color: 'text-rose-400',
        title: '제4조 (개인정보의 제3자 제공)',
        highlight: true,
        content: (
            <div className="space-y-3">
                <p>회사는 원칙적으로 이용자의 개인정보를 <strong>제3자에게 제공하지 않습니다.</strong> 다만, 다음의 경우 예외로 합니다:</p>
                <ol className="list-decimal list-inside space-y-2 mt-3">
                    <li><strong>이용자의 사전 동의</strong>가 있는 경우</li>
                    <li>법령에 의해 <strong>수사기관의 요청</strong>이 있는 경우</li>
                    <li>통계 작성, 학술 연구 등의 목적으로 <strong>특정 개인을 식별할 수 없는 형태</strong>로 제공하는 경우</li>
                </ol>
            </div>
        ),
    },
    {
        icon: Server,
        color: 'text-violet-400',
        title: '제5조 (개인정보 처리 위탁 및 국외 이전)',
        highlight: true,
        content: (
            <div className="space-y-4">
                <p>회사는 서비스 운영을 위해 다음과 같이 개인정보 처리를 위탁하고 있습니다:</p>
                <div className="overflow-x-auto mt-3">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="py-2 pr-4 text-white font-semibold">수탁업체</th>
                                <th className="py-2 pr-4 text-white font-semibold">위탁 업무</th>
                                <th className="py-2 text-white font-semibold">서버 위치</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-400">
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">Supabase Inc.</td>
                                <td className="py-2 pr-4">회원 인증, 데이터베이스 관리</td>
                                <td className="py-2">미국 (AWS)</td>
                            </tr>
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">Vercel Inc.</td>
                                <td className="py-2 pr-4">웹 서비스 호스팅 및 배포</td>
                                <td className="py-2">미국</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Google LLC</td>
                                <td className="py-2 pr-4">OAuth 인증, 분석(Analytics)</td>
                                <td className="py-2">미국</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="mt-3">상기 업체들은 업계 표준 수준의 <strong>보안 인증(SOC 2, ISO 27001)</strong>을 보유하고 있으며, 회사는 개인정보 보호를 위한 계약을 체결하고 있습니다.</p>
            </div>
        ),
    },
    {
        icon: Clock,
        color: 'text-emerald-400',
        title: '제6조 (개인정보의 보유 및 파기)',
        content: (
            <div className="space-y-4">
                <p><strong>원칙:</strong> 이용 목적 달성 시 지체 없이 파기합니다. 다만, 관련 법령에 따라 일정 기간 보관이 필요한 경우 아래와 같이 보관합니다:</p>
                <div className="overflow-x-auto mt-3">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="py-2 pr-4 text-white font-semibold">보관 항목</th>
                                <th className="py-2 pr-4 text-white font-semibold">보관 기간</th>
                                <th className="py-2 text-white font-semibold">근거 법령</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-400">
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">계약·구독 관련 기록</td>
                                <td className="py-2 pr-4 text-white font-medium">5년</td>
                                <td className="py-2">전자상거래법</td>
                            </tr>
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">대금 결제 및 재화 공급 기록</td>
                                <td className="py-2 pr-4 text-white font-medium">5년</td>
                                <td className="py-2">전자상거래법</td>
                            </tr>
                            <tr className="border-b border-white/[0.04]">
                                <td className="py-2 pr-4">소비자 불만·분쟁 처리 기록</td>
                                <td className="py-2 pr-4 text-white font-medium">3년</td>
                                <td className="py-2">전자상거래법</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">접속 로그 기록</td>
                                <td className="py-2 pr-4 text-white font-medium">3개월</td>
                                <td className="py-2">통신비밀보호법</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="mt-2"><strong>파기 방법:</strong> 전자 파일은 복구 불가능한 방법으로 영구 삭제하며, 종이 문서(있는 경우)는 분쇄 또는 소각합니다.</p>
            </div>
        ),
    },
    {
        icon: UserCheck,
        color: 'text-indigo-400',
        title: '제7조 (이용자의 권리와 행사 방법)',
        content: (
            <div className="space-y-3">
                <p>이용자(또는 법정대리인)는 다음의 권리를 행사할 수 있습니다:</p>
                <ol className="list-decimal list-inside space-y-2 mt-3">
                    <li><strong>열람권:</strong> 본인의 개인정보 처리 현황을 열람 요청할 수 있습니다.</li>
                    <li><strong>정정·삭제권:</strong> 개인정보의 오류에 대해 정정 또는 삭제를 요청할 수 있습니다.</li>
                    <li><strong>처리 정지권:</strong> 개인정보 처리의 정지를 요청할 수 있습니다.</li>
                    <li><strong>동의 철회권:</strong> 개인정보 수집·이용에 대한 동의를 언제든지 철회할 수 있습니다.</li>
                    <li><strong>데이터 이동권(Data Portability):</strong> 본인의 데이터를 구조화된 형식으로 제공받을 수 있습니다.</li>
                </ol>
                <p className="mt-3">상기 권리는 서비스 내 설정 또는 이메일(<a href="mailto:contact@signumhq.com" className="text-cyan-400 hover:underline">contact@signumhq.com</a>)을 통해 행사할 수 있으며, 회사는 지체 없이 조치합니다.</p>
            </div>
        ),
    },
    {
        icon: Cookie,
        color: 'text-orange-400',
        title: '제8조 (쿠키 및 추적 기술)',
        content: (
            <div className="space-y-3">
                <ol className="list-decimal list-inside space-y-3">
                    <li>
                        <strong>쿠키의 사용 목적:</strong> 회사는 이용자의 로그인 상태 유지, 서비스 이용 환경 개선, 이용 통계 수집을 위해 쿠키를 사용합니다.
                    </li>
                    <li>
                        <strong>쿠키의 종류:</strong>
                        <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-slate-400">
                            <li><strong className="text-slate-200">필수 쿠키:</strong> 로그인 인증, 세션 유지 (Supabase Auth)</li>
                            <li><strong className="text-slate-200">분석 쿠키:</strong> 서비스 이용 패턴 분석 (비식별화 처리)</li>
                            <li><strong className="text-slate-200">기능 쿠키:</strong> 언어 설정, 다크 모드 등 사용자 환경 설정 저장</li>
                        </ul>
                    </li>
                    <li><strong>쿠키 거부:</strong> 이용자는 브라우저 설정을 통해 쿠키를 거부할 수 있으나, 이 경우 <strong>로그인 등 일부 서비스 이용에 제한</strong>이 있을 수 있습니다.</li>
                </ol>
            </div>
        ),
    },
    {
        icon: Lock,
        color: 'text-rose-400',
        title: '제9조 (개인정보의 안전성 확보 조치)',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>암호화:</strong> 비밀번호는 <strong>단방향 암호화(bcrypt)</strong>하여 저장하며, 전송 구간은 <strong>TLS 1.2 이상</strong>으로 암호화합니다.</li>
                <li><strong>접근 통제:</strong> 개인정보에 대한 접근 권한을 최소화하며, 관리자 접근 시 인증 절차를 거칩니다.</li>
                <li><strong>보안 모니터링:</strong> 무단 접근 또는 유출 방지를 위해 보안 시스템을 운영하며, 이상 탐지 시 즉시 대응합니다.</li>
                <li><strong>정기 점검:</strong> 개인정보 보호를 위해 정기적으로 보안 취약점 점검을 실시합니다.</li>
            </ol>
        ),
    },
    {
        icon: Shield,
        color: 'text-teal-400',
        title: '제10조 (개인정보 보호책임자)',
        content: (
            <div className="space-y-3">
                <p>회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 이용자의 불만 및 피해 구제를 위해 아래와 같이 개인정보 보호책임자를 지정하고 있습니다:</p>
                <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <ul className="space-y-2 text-sm">
                        <li><strong>직위:</strong> 대표</li>
                        <li><strong>이메일:</strong> <a href="mailto:contact@signumhq.com" className="text-cyan-400 hover:underline">contact@signumhq.com</a></li>
                    </ul>
                </div>
                <div className="mt-4">
                    <p className="text-xs text-slate-400">기타 개인정보 침해에 대한 신고 및 상담:</p>
                    <ul className="list-disc list-inside space-y-1 mt-2 text-xs text-slate-400">
                        <li>개인정보침해신고센터: <strong className="text-slate-300">privacy.kisa.or.kr / 118</strong></li>
                        <li>대검찰청 사이버수사과: <strong className="text-slate-300">spo.go.kr / 1301</strong></li>
                        <li>경찰청 사이버안전국: <strong className="text-slate-300">cyberbureau.police.go.kr / 182</strong></li>
                    </ul>
                </div>
            </div>
        ),
    },
    {
        icon: Globe,
        color: 'text-sky-400',
        title: '제11조 (개인정보처리방침의 변경)',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>본 개인정보처리방침은 법령, 정책 또는 보안 기술의 변경에 따라 개정될 수 있습니다.</li>
                <li>개정 시 서비스 내 공지 또는 이메일을 통해 <strong>변경 사항과 시행 일자를 7일 전에 안내</strong>합니다.</li>
                <li>중요한 변경(수집 항목 추가, 제3자 제공 변경 등)의 경우 <strong>30일 전에 안내</strong>하며, 필요 시 이용자의 <strong>재동의</strong>를 받습니다.</li>
            </ol>
        ),
    },
];
