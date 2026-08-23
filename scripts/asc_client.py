#!/usr/bin/env python3
# asc_client — App Store Connect API 최소 클라이언트.
# 웹 2FA 없이 메타데이터 읽기/쓰기, 프로파일 생성, 심사 제출까지 전부 된다.
# ★ .p8 키 «내용»은 절대 로그에 찍지 않는다.
import json, os, time, urllib.request, urllib.error

KEY_ID = os.environ.get("ASC_KEY_ID", "2LD2B7366M")
ISSUER = os.environ.get("ASC_ISSUER_ID", "ede31c44-c5ac-437b-ab19-ad5d581ef6f9")
KEY_PATH = os.path.expanduser(f"~/.appstoreconnect/private_keys/AuthKey_{KEY_ID}.p8")
BASE = "https://api.appstoreconnect.apple.com/v1"
_token = None


def token() -> str:
    global _token
    if _token:
        return _token
    import jwt  # PyJWT
    with open(KEY_PATH) as f:
        key = f.read()
    now = int(time.time())
    _token = jwt.encode({"iss": ISSUER, "iat": now, "exp": now + 1200,
                         "aud": "appstoreconnect-v1"},
                        key, algorithm="ES256",
                        headers={"kid": KEY_ID, "typ": "JWT"})
    return _token


def call(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Authorization": "Bearer " + token(),
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        return {"__error__": e.code, "body": e.read().decode()[:900]}
