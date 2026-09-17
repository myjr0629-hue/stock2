#!/usr/bin/env python3
"""galaxy_client — Galaxy Store Developer API 최소 클라이언트.

왜 만들었나 (2026-09-17 대표 지시: 「api로 할수있다면서 그럼 그런것이 더 편하면 그렇게 하고」):
  셀러 포털 UI 는 AngularJS + jQuery 레이어라 앱 등록 다이얼로그의 Next 가 `<a href="#1">` 이고
  핸들러가 안 걸린다. API 는 그 전부를 건너뛴다.

인증 (OAuth2 server-to-server):
  1) RSA 비밀키로 JWT 를 만든다 (iss=service account id, scopes=[publishing, gss])
  2) POST https://devapi.samsungapps.com/auth/accessToken  (Authorization: Bearer <JWT>)
  3) 이후 모든 호출에 두 헤더가 «둘 다» 필요하다:
       Authorization: Bearer <access token>
       service-account-id: <service account id>
     하나라도 빠지면 인증 오류다.

★ 비밀키는 절대 로그에 찍지 않는다. 경로만 다룬다.
"""
import json, os, time, urllib.request, urllib.error

BASE = "https://devapi.samsungapps.com"
SA_ID = os.environ.get("GALAXY_STORE_SERVICE_ACCOUNT_ID", "1367013a-4392-431c-85b5-172d86a0324d")
KEY_PATH = os.path.expanduser(os.environ.get("GALAXY_STORE_PRIVATE_KEY_PATH", "~/.galaxystore/service-account-private.pem"))
_token = None


def _jwt() -> str:
    import jwt  # PyJWT
    with open(KEY_PATH) as f:
        key = f.read()
    now = int(time.time())
    return jwt.encode(
        {"iss": SA_ID, "scopes": ["publishing", "gss"], "iat": now, "exp": now + 1200},
        key, algorithm="RS256")


def token() -> str:
    global _token
    if _token:
        return _token
    req = urllib.request.Request(
        BASE + "/auth/accessToken", data=b"",
        headers={"Authorization": "Bearer " + _jwt(), "service-account-id": SA_ID},
        method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            body = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"accessToken {e.code}: {e.read().decode()[:400]}")
    _token = (body.get("createdItem") or {}).get("accessToken") or body.get("accessToken")
    if not _token:
        raise SystemExit("accessToken 응답에 토큰이 없다: " + json.dumps(body)[:300])
    return _token


def call(method: str, path: str, body=None, raw_headers=None):
    data = json.dumps(body).encode() if body is not None else None
    h = {"Authorization": "Bearer " + token(), "service-account-id": SA_ID,
         "Content-Type": "application/json"}
    if raw_headers:
        h.update(raw_headers)
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            b = r.read()
            return json.loads(b) if b else {}
    except urllib.error.HTTPError as e:
        return {"__error__": e.code, "body": e.read().decode()[:700]}


if __name__ == "__main__":
    import sys
    print("service-account-id:", SA_ID)
    print("key:", KEY_PATH, "(있음)" if os.path.exists(KEY_PATH) else "(없음)")
    t = token()
    print("accessToken 발급 OK · 길이", len(t))
    if len(sys.argv) > 1:
        print(json.dumps(call("GET", sys.argv[1]), indent=1, ensure_ascii=False)[:1500])
