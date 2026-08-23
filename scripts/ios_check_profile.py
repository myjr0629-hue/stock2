#!/usr/bin/env python3
# ios_check_profile — 프로비저닝 프로파일이 «지금 키체인에 있는» 배포 인증서를
# 참조하는지 검사한다.
#
# 왜 필요한가 (2026-08-23 실측): 배포 인증서를 새로 만든 뒤에도 export 가 실패했다.
#   error: Provisioning profile "..." doesn't include signing certificate "..."
# 기존 프로파일이 «폐기된 옛 인증서»를 참조하고 있었기 때문이다. 이건 30분짜리
# 아카이브를 다 돌린 «다음»에야 드러나므로, 시작 전에 여기서 잡는다.
import glob, os, plistlib, subprocess, sys, tempfile

profile_name, bundle = sys.argv[1], sys.argv[2]
d = os.path.expanduser("~/Library/Developer/Xcode/UserData/Provisioning Profiles")

# 키체인에 있는 배포 인증서들의 SHA1
ids = subprocess.run(["security", "find-identity", "-v", "-p", "codesigning"],
                     capture_output=True, text=True).stdout
local = {ln.split()[1] for ln in ids.splitlines() if "Apple Distribution" in ln}

for path in glob.glob(os.path.join(d, "*.mobileprovision")):
    raw = subprocess.run(["security", "cms", "-D", "-i", path],
                         capture_output=True).stdout
    try:
        p = plistlib.loads(raw)
    except Exception:
        continue
    if p.get("Name") != profile_name:
        continue
    appid = p.get("Entitlements", {}).get("application-identifier", "")
    if not appid.endswith(bundle):
        print(f"✗ 프로파일 '{profile_name}' 의 번들이 다르다: {appid}")
        sys.exit(1)
    for cert in p.get("DeveloperCertificates", []):
        with tempfile.NamedTemporaryFile(suffix=".cer", delete=False) as f:
            f.write(cert); tmp = f.name
        out = subprocess.run(["openssl", "x509", "-inform", "DER", "-in", tmp,
                              "-noout", "-fingerprint", "-sha1"],
                             capture_output=True, text=True).stdout
        os.unlink(tmp)
        sha = out.split("=")[-1].strip().replace(":", "")
        if sha in local:
            print(f"  ✓ 프로파일 '{profile_name}' — 현재 인증서와 일치")
            sys.exit(0)
    print(f"✗ 프로파일 '{profile_name}' 이 «지금 없는 인증서»를 참조한다.")
    print("  → scripts/ios_make_profiles.py 로 프로파일을 새로 만들 것")
    sys.exit(1)

print(f"✗ 프로파일 '{profile_name}' 을 찾을 수 없다.")
print("  → scripts/ios_make_profiles.py 로 만들 것")
sys.exit(1)
