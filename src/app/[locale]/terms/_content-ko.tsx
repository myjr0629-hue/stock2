import { ReactNode } from 'react';
import {
    AlertTriangle, Scale, Ban, CreditCard, RefreshCw, Shield,
    Database, Users, LogOut, CloudOff, FileText, Gavel, BookOpen
} from 'lucide-react';
import { TermsSection, TermsMeta } from './_content-en';

export const meta: TermsMeta = {
    pageTitle: 'SIGNUM HQ 서비스 이용약관',
    lastUpdated: '최종 수정일: 2026-02-12',
    intro: '본 약관은 SIGNUM HQ 서비스의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항을 규정합니다. 서비스를 이용함으로써 본 약관에 동의하신 것으로 간주됩니다.',
    effectiveDate: '부칙: 본 약관은 ',
    effectiveDateBold: '2026년 2월 12일',
    backLink: '← 로그인으로 돌아가기',
};

export const sections: TermsSection[] = [
    {
        icon: BookOpen,
        color: 'text-slate-400',
        title: '제1조 (목적)',
        content: (
            <p>본 약관은 SIGNUM HQ(이하 &apos;서비스&apos;)의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>
        ),
    },
    {
        icon: FileText,
        color: 'text-indigo-400',
        title: '제2조 (용어의 정의)',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>&quot;서비스&quot;</strong>란 단말기(PC, 모바일 등)에 상관없이 회원이 이용할 수 있는 SIGNUM HQ의 모든 데이터, AI 분석, 시각화 자료를 의미합니다.</li>
                <li><strong>&quot;회원&quot;</strong>이란 본 약관에 동의하고 회사가 제공하는 절차를 완료하여 서비스 이용 계약을 체결한 자를 말합니다.</li>
                <li><strong>&quot;Tactical Order&quot;</strong>란 알고리즘에 의해 산출된 특정 시장 상황에 대한 통계적 시그널(예: BUY, HOLD, SELL 등)을 지칭하며, 이는 <strong>단순 참고용일 뿐 실제 매매 지시가 아님</strong>을 의미합니다.</li>
                <li><strong>&quot;프리미엄 서비스&quot;</strong>란 유료 구독을 통해 제공되는 고급 데이터 분석, 실시간 시그널, AI 리포트 등 부가 서비스를 의미합니다.</li>
            </ol>
        ),
    },
    {
        icon: AlertTriangle,
        color: 'text-amber-400',
        title: '제3조 (금융 정보의 성격 및 투자 면책)',
        highlight: true,
        content: (
            <ol className="list-decimal list-inside space-y-3">
                <li><strong>단순 정보 제공:</strong> SIGNUM HQ에서 제공되는 모든 데이터, 분석 및 정보(Gamma Exposure, Options Flow, Max Pain, Dark Pool Tracker, Alpha Score, Tactical Order 등 포함)는 <strong>과거 데이터에 기반한 통계적 참고 자료일 뿐이며, 특정 종목의 매수 또는 매도를 권유하거나 투자 자문을 구성하지 않습니다.</strong></li>
                <li><strong>투자 책임:</strong> 금융 투자는 원금 손실의 위험이 따르며, <strong>모든 투자 결정에 따른 손익의 책임은 전적으로 이용자 본인에게 있습니다.</strong> 회사는 회원이 서비스에 게재된 정보에 의존하여 행한 투자 결과에 대해 어떠한 법적 책임도 지지 않습니다.</li>
                <li><strong>비인가 투자자문:</strong> 본 서비스는 「자본시장과 금융투자업에 관한 법률」에 의한 투자자문업, 투자일임업 또는 그와 유사한 금융 서비스를 제공하지 않으며, <strong>회사는 금융위원회에 등록된 투자자문업자가 아닙니다.</strong></li>
                <li><strong>과거 성과 비보장:</strong> 서비스에서 제시되는 과거 데이터 기반의 통계 수치, 백테스트 결과, 알파 스코어 등은 <strong>미래의 투자 성과를 보장하거나 예측하는 것이 아닙니다.</strong></li>
            </ol>
        ),
    },
    {
        icon: Ban,
        color: 'text-rose-400',
        title: '제4조 (서비스 이용 제한 및 금지 행위)',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>계정 공유 금지:</strong> 회원의 계정은 본인만 사용할 수 있으며, 타인에게 양도, 대여, 공유할 수 없습니다.</li>
                <li><strong>데이터 크롤링 금지:</strong> 회사의 사전 서면 허락 없이 로봇, 스파이더, 스크래퍼 등 자동화된 수단을 이용하여 서비스의 데이터를 수집, 가공, 재배포하는 행위를 엄격히 금지합니다.</li>
                <li><strong>역공학 금지:</strong> 서비스의 소스 코드, 알고리즘, 분석 로직을 역컴파일, 디컴파일, 역설계하거나 이를 시도하는 행위를 금지합니다.</li>
                <li><strong>불법 행위 금지:</strong> 서비스에서 제공된 정보를 이용하여 시세 조종, 내부자 거래 등 관련 법령에 위반되는 행위를 하는 것을 금지합니다.</li>
                <li><strong>허위 정보 유포 금지:</strong> 서비스를 이용하여 허위 또는 오해를 유발하는 정보를 유포하는 행위를 금지합니다.</li>
                <li><strong>위반 시 조치:</strong> 상기 금지 행위 위반 시, 회사는 <strong>사전 통보 없이 해당 회원의 서비스 이용을 즉시 정지 또는 계약을 해지</strong>할 수 있으며, 이로 인한 손해에 대해 민·형사상 법적 조치를 취할 수 있습니다.</li>
            </ol>
        ),
    },
    {
        icon: CreditCard,
        color: 'text-emerald-400',
        title: '제5조 (구독 및 결제)',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>회사는 유료 서비스(Premium, Pro 등)를 제공하며, 각 구독 등급별 이용 범위와 요금은 서비스 내에 별도로 공지합니다.</li>
                <li>정기 구독의 경우, 회원이 구독 기간 만료 전까지 별도로 해지 신청을 하지 않을 경우 <strong>매월 또는 매년 자동으로 결제가 갱신</strong>됩니다.</li>
                <li>회사는 구독 요금을 변경할 수 있으며, 변경 시 최소 30일 전에 서비스 내 공지 또는 이메일을 통해 안내합니다. 변경된 요금은 다음 갱신 주기부터 적용됩니다.</li>
            </ol>
        ),
    },
    {
        icon: RefreshCw,
        color: 'text-cyan-400',
        title: '제6조 (서비스의 변경 및 중단)',
        content: (
            <ol className="list-decimal list-inside space-y-3">
                <li><strong>서비스 변경:</strong> 회사는 운영상, 기술상의 필요에 따라 서비스의 전부 또는 일부를 변경할 수 있습니다.</li>
                <li>
                    <strong>서비스 중단:</strong> 다음 각 호의 사유로 서비스 제공이 일시적으로 중단될 수 있으며, <strong>이로 인한 손해에 대해 회사는 책임을 지지 않습니다.</strong>
                    <ul className="list-disc list-inside ml-4 mt-2 space-y-1 text-slate-400">
                        <li>시스템 정기 점검, 서버 증설 및 교체 등 계획된 작업</li>
                        <li>천재지변, 전쟁, 정부 규제, 거래소 긴급 중단 등 불가항력적 사유</li>
                        <li>제3자 데이터 제공업체(API)의 장애 또는 서비스 중단</li>
                        <li>전기통신사업법에 의한 기간통신사업자의 서비스 중단</li>
                    </ul>
                </li>
                <li><strong>서비스 종료:</strong> 회사가 사업상의 이유로 서비스를 영구 종료하는 경우, 최소 30일 전에 공지하며, 유료 서비스 이용 중인 회원에게는 잔여 구독 기간에 해당하는 금액을 일할 계산하여 환불합니다.</li>
            </ol>
        ),
    },
    {
        icon: CreditCard,
        color: 'text-teal-400',
        title: '제7조 (청약 철회 및 환불 정책)',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>디지털 콘텐츠의 특성:</strong> 본 서비스는 결제 즉시 프리미엄 데이터와 분석 리포트에 접근 가능한 &apos;디지털 콘텐츠&apos;에 해당합니다.</li>
                <li><strong>환불 제한:</strong> 「전자상거래 등에서의 소비자보호에 관한 법률」에 의거하여, 회원이 유료 데이터 조회, 리포트 열람, 또는 서비스에 1회 이상 접속하여 데이터를 소비한 경우 <strong>서비스의 가치가 이용된 것으로 간주하여 환불이 제한</strong>될 수 있습니다.</li>
                <li><strong>예외:</strong> 결제 후 7일 이내에 서비스 접속 및 데이터 열람 이력이 전혀 없는 경우에 한하여 전액 환불이 가능합니다.</li>
                <li><strong>환불 절차:</strong> 환불 요청은 서비스 내 문의 또는 이메일(<a href="mailto:contact@signumhq.com" className="text-cyan-400 hover:underline">contact@signumhq.com</a>)을 통해 신청할 수 있으며, 회사는 요청 접수일로부터 영업일 기준 7일 이내에 처리합니다.</li>
            </ol>
        ),
    },
    {
        icon: Shield,
        color: 'text-violet-400',
        title: '제8조 (지적재산권)',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>서비스 내의 모든 디자인, 텍스트, 차트, 알고리즘, 데이터 시각화, 상표(<strong>SIGNUM HQ, Alpha Engine, Tactical Order</strong> 등) 및 기타 콘텐츠는 <strong>회사의 지적재산</strong>이며, 저작권법 및 관련 법률에 의해 보호됩니다.</li>
                <li>회원은 회사의 사전 서면 동의 없이 서비스의 콘텐츠를 <strong>영리 목적으로 이용하거나 제3자에게 제공, 복제, 배포할 수 없습니다.</strong></li>
                <li>회원이 서비스 이용 과정에서 작성한 게시물(있는 경우)의 저작권은 해당 회원에게 귀속되나, 회사는 서비스 운영 목적 범위 내에서 이를 이용할 수 있습니다.</li>
            </ol>
        ),
    },
    {
        icon: Database,
        color: 'text-sky-400',
        title: '제9조 (데이터 보증 면책 및 제3자 데이터)',
        highlight: true,
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>무보증:</strong> 회사는 서비스의 정확성, 완전성, 적시성 또는 특정 목적에의 적합성을 보장하지 않으며, <strong>서비스는 &quot;있는 그대로(AS-IS)&quot; 제공</strong>됩니다.</li>
                <li><strong>시스템 장애:</strong> 시스템 오류, 데이터 지연, 네트워크 장애, 또는 기타 기술적 문제로 인한 정보의 누락, 오류 및 이로 인한 손해에 대해 회사는 법적 책임을 지지 않습니다.</li>
                <li><strong>제3자 데이터:</strong> 서비스에서 제공되는 시세, 옵션, 지수 등의 데이터는 제3자 데이터 제공업체(거래소, 데이터 벤더 등)로부터 수신되며, <strong>회사는 해당 데이터의 정확성, 완전성, 실시간성을 보증하지 않습니다.</strong></li>
                <li><strong>데이터 지연:</strong> 실시간으로 표시되는 데이터라 하더라도 실제 시장 데이터와 시간 차이가 발생할 수 있으며, 이로 인해 발생하는 손해에 대해 회사는 책임을 지지 않습니다.</li>
            </ol>
        ),
    },
    {
        icon: Scale,
        color: 'text-orange-400',
        title: '제10조 (손해배상의 제한)',
        highlight: true,
        content: (
            <ol className="list-decimal list-inside space-y-3">
                <li><strong>최대 배상 한도:</strong> 회사의 귀책 사유로 인해 회원에게 손해가 발생한 경우, 회사의 배상 범위는 <strong>해당 회원이 손해 발생일 직전 3개월간 회사에 납부한 서비스 이용료 총액을 초과하지 않습니다.</strong> 무료 이용자의 경우 회사의 배상 책임은 없습니다.</li>
                <li><strong>간접 손해 면책:</strong> 회사는 서비스 이용과 관련하여 발생한 <strong>간접 손해, 특별 손해, 결과적 손해, 징벌적 손해, 일실 이익 또는 기대 이익의 상실에 대해 책임을 지지 않습니다.</strong></li>
                <li><strong>투자 손실 면책:</strong> 회원이 서비스에서 제공한 정보를 참고하여 내린 투자 결정으로 인한 <strong>금전적 손실에 대해 회사는 어떠한 경우에도 책임을 지지 않습니다.</strong></li>
            </ol>
        ),
    },
    {
        icon: Users,
        color: 'text-rose-400',
        title: '제11조 (연령 제한)',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>본 서비스는 <strong>만 18세 이상</strong>의 이용자만 사용할 수 있습니다.</li>
                <li>서비스 가입 및 이용 시 이용자는 만 18세 이상임을 보증하며, 미성년자가 법정대리인의 동의 없이 서비스를 이용하거나 성년자로 가장하여 발생한 문제에 대해 <strong>회사는 책임을 지지 않으며, 해당 이용 계약은 취소</strong>될 수 있습니다.</li>
            </ol>
        ),
    },
    {
        icon: LogOut,
        color: 'text-pink-400',
        title: '제12조 (계정 해지 및 탈퇴)',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li><strong>회원 탈퇴:</strong> 회원은 언제든지 서비스 내 설정 또는 이메일(<a href="mailto:contact@signumhq.com" className="text-cyan-400 hover:underline">contact@signumhq.com</a>)을 통해 탈퇴를 요청할 수 있으며, 회사는 요청 접수 후 지체 없이 처리합니다.</li>
                <li><strong>데이터 삭제:</strong> 탈퇴 시 회원의 개인정보는 관계 법령에 의해 보존이 요구되는 정보를 제외하고 지체 없이 파기합니다.</li>
                <li><strong>회사에 의한 해지:</strong> 회원이 본 약관을 위반하거나, 서비스의 정상적인 운영을 방해하는 경우, 회사는 사전 통보 후(긴급한 경우 사후 통보) <strong>이용 계약을 해지</strong>할 수 있습니다.</li>
                <li><strong>유료 서비스 해지 시:</strong> 유료 구독 해지 시 이미 결제된 기간까지는 서비스를 정상 이용할 수 있으며, 다음 결제 주기부터 과금이 중단됩니다.</li>
            </ol>
        ),
    },
    {
        icon: CloudOff,
        color: 'text-gray-400',
        title: '제13조 (불가항력)',
        content: (
            <p>천재지변, 전쟁, 테러, 폭동, 정부의 행위, 법령의 변경, 거래소의 긴급 조치, 전력 공급 중단, 통신 장애 또는 기타 <strong>회사의 통제 범위를 벗어난 사유</strong>로 인해 서비스 제공이 불가능한 경우, 회사는 이에 대한 <strong>책임을 지지 않으며 서비스 제공 의무가 면제</strong>됩니다.</p>
        ),
    },
    {
        icon: FileText,
        color: 'text-purple-400',
        title: '제14조 (약관의 개정)',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>회사는 관련 법령에 위배되지 않는 범위 내에서 본 약관을 변경할 수 있습니다.</li>
                <li>약관 변경 시, 적용 일자 및 변경 사유를 명시하여 적용 일자 <strong>7일 전부터</strong>(회원에게 불리한 변경의 경우 <strong>30일 전부터</strong>) 서비스 내 공지 또는 이메일을 통해 안내합니다.</li>
                <li>회원이 변경된 약관의 적용 일자까지 거부 의사를 표시하지 않고 서비스를 계속 이용하는 경우, <strong>변경된 약관에 동의한 것으로 간주</strong>합니다.</li>
                <li>변경된 약관에 동의하지 않는 회원은 서비스 이용을 중단하고 탈퇴할 수 있습니다.</li>
            </ol>
        ),
    },
    {
        icon: Gavel,
        color: 'text-amber-300',
        title: '제15조 (준거법 및 분쟁의 해결)',
        content: (
            <ol className="list-decimal list-inside space-y-2">
                <li>본 약관의 해석 및 적용에 관하여는 <strong>대한민국 법</strong>을 준거법으로 합니다.</li>
                <li>본 약관과 관련하여 발생한 모든 분쟁은 <strong>회사의 본점 소재지를 관할하는 법원</strong>을 제1심 전속 관할 법원으로 합니다.</li>
                <li>해외에서 서비스를 이용하는 회원도 본 약관에 동의함으로써 <strong>대한민국 법률의 적용 및 대한민국 법원의 관할에 동의</strong>한 것으로 간주합니다.</li>
            </ol>
        ),
    },
];
