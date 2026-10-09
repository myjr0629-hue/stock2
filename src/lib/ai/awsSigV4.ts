/**
 * AWS SigV4 서명 — 의존성 없는 최소 구현(node:crypto).
 * Bedrock «Claude in Amazon Bedrock»(Messages API, `bedrock-mantle.{region}.api.aws/anthropic/v1/messages`)이
 * InvokeModel 이 아니라 별도 서비스(서명 서비스명 `bedrock-mantle`)라 AWS SDK 의 BedrockRuntimeClient 로는 못 부른다.
 * 서명 결과는 tests/llmLadder.test.ts 에서 @smithy/signature-v4 와 바이트 단위로 대조한다.
 */
import crypto from 'crypto';

export interface SigV4Input {
    method: string;
    host: string;
    path: string;           // 예: /anthropic/v1/messages
    query?: string;         // 정렬·인코딩이 끝난 쿼리(없으면 '')
    body: string;
    region: string;
    service: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    /** 서명에 넣을 추가 헤더(소문자 키). host·x-amz-date·x-amz-content-sha256 은 자동. */
    headers?: Record<string, string>;
    now?: Date;
}

const sha256hex = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (key: Buffer | string, s: string) => crypto.createHmac('sha256', key).update(s, 'utf8').digest();

/** 요청에 실을 헤더 전체(Authorization 포함)를 돌려준다. */
export function signV4(i: SigV4Input): Record<string, string> {
    const now = i.now ?? new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');   // 20261010T123456Z
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256hex(i.body);

    const headers: Record<string, string> = {
        ...Object.fromEntries(Object.entries(i.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v).trim()])),
        host: i.host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
    };
    if (i.sessionToken) headers['x-amz-security-token'] = i.sessionToken;

    const names = Object.keys(headers).sort();
    const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('');
    const signedHeaders = names.join(';');
    // 경로는 서비스(S3 외)에서 한 번 더 인코딩하는 규칙 — 우리 경로는 영숫자·/·- 뿐이라 그대로 같다.
    const canonicalRequest = [i.method.toUpperCase(), i.path, i.query || '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const scope = `${dateStamp}/${i.region}/${i.service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
    const kDate = hmac(`AWS4${i.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, i.region);
    const kService = hmac(kRegion, i.service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

    return {
        ...headers,
        authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
}
