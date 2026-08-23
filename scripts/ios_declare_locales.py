#!/usr/bin/env python3
# ============================================================================
# ios_declare_locales — 앱스토어가 한국어·일본어 지원을 «실제로» 인식하게 만든다.
# ----------------------------------------------------------------------------
# 왜 필요한가 (2026-08-24 실측):
#   한국 앱스토어 페이지의 「언어」 칸이 «EN 영어» 하나였다. 앱 전체가 한국어인데도.
#   한국 방문자에게 「이 앱은 영어 전용」이라고 말하는 셈이라 1순위 시장에서 손해다.
#
#   Info.plist 의 CFBundleLocalizations 에는 2026-06-29부터 en/ko/ja 가 선언돼
#   있었고 1.1·1.2·1.3 이 전부 그 뒤에 빌드됐다. 그런데도 영어만 표시됐다.
#   → **선언만으로는 부족하다. 애플은 번들 안의 .lproj 폴더를 본다.**
#
#   UI 는 웹뷰가 그리므로 번역할 문자열이 없다. .lproj 의 «존재 자체»가 목적이다.
#
# 하는 일: en/ko/ja InfoPlist.strings 생성 → pbxproj 에 variant group 으로 등록
#          → Resources 빌드 페이즈에 추가 → knownRegions 에 ko, ja 추가
# 검증: 빌드 후 App.app 안에 ko.lproj / ja.lproj 가 있는지 확인할 것.
#
# 사용: python3 scripts/ios_declare_locales.py <ios/App 경로> <표시이름>
# ============================================================================
import os
import sys

proj_dir = sys.argv[1]          # 예: uc-app/ios/App
display_name = sys.argv[2]      # 예: Undercurrent

app_dir = os.path.join(proj_dir, "App")
pbx = os.path.join(proj_dir, "App.xcodeproj", "project.pbxproj")

COMMENT = {
    "en": "/* Declares English support to the App Store. The UI is web-rendered,\n"
          "   so there is nothing to translate here — this file exists so Apple\n"
          "   detects the language at all. */",
    "ko": "/* 앱스토어에 한국어 지원을 «실제로» 알리기 위한 파일.\n"
          "   CFBundleLocalizations 선언만으로는 스토어 «언어» 칸이 영어 하나로 남는다.\n"
          "   애플은 번들 안의 .lproj 폴더를 보고 판단한다. */",
    "ja": "/* App Store に日本語対応を実際に認識させるためのファイル。\n"
          "   詳細は ko.lproj/InfoPlist.strings のコメントを参照。 */",
}

# 프로젝트마다 다른 ID 를 쓰도록 이름에서 만든다(충돌 방지)
seed = abs(hash(display_name)) % 0xFFFF
IDS = {k: f"A1B2C3D{i:03d}{seed:04X}0000000E{i}" [:24]
       for i, k in enumerate(("en", "ko", "ja", "grp", "build"), start=1)}

for loc in ("en", "ko", "ja"):
    d = os.path.join(app_dir, f"{loc}.lproj")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "InfoPlist.strings"), "w") as f:
        f.write(COMMENT[loc] + f'\n"CFBundleDisplayName" = "{display_name}";\n')

s = open(pbx).read()
if "InfoPlist.strings" in s:
    sys.exit("이미 등록돼 있다 — 건너뛴다")
for v in IDS.values():
    if v in s:
        sys.exit(f"ID 충돌: {v}")

# 1) 파일 참조 — LaunchScreen Base 참조 뒤에 붙인다
import re
m = re.search(r'^\t\t\w+ /\* Base \*/ = \{isa = PBXFileReference;[^\n]*LaunchScreen\.storyboard[^\n]*\};$',
              s, re.M)
assert m, "LaunchScreen Base 참조를 못 찾았다"
refs = "\n".join(
    f'\t\t{IDS[l]} /* {l} */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.strings; '
    f'name = {l}; path = {l}.lproj/InfoPlist.strings; sourceTree = "<group>"; }};'
    for l in ("en", "ko", "ja"))
s = s[:m.end()] + "\n" + refs + s[m.end():]

# 2) 빌드 파일
s = s.replace("/* Begin PBXBuildFile section */",
              "/* Begin PBXBuildFile section */\n"
              f'\t\t{IDS["build"]} /* InfoPlist.strings in Resources */ = '
              f'{{isa = PBXBuildFile; fileRef = {IDS["grp"]} /* InfoPlist.strings */; }};', 1)

# 3) variant group
vg = (f'\t\t{IDS["grp"]} /* InfoPlist.strings */ = {{\n'
      '\t\t\tisa = PBXVariantGroup;\n\t\t\tchildren = (\n'
      + "".join(f'\t\t\t\t{IDS[l]} /* {l} */,\n' for l in ("en", "ko", "ja"))
      + '\t\t\t);\n\t\t\tname = InfoPlist.strings;\n\t\t\tsourceTree = "<group>";\n\t\t};\n')
s = s.replace("/* End PBXVariantGroup section */", vg + "/* End PBXVariantGroup section */", 1)

# 4) Resources 빌드 페이즈 — 첫 항목 앞에 넣는다
m = re.search(r'(isa = PBXResourcesBuildPhase;.*?files = \(\n)', s, re.S)
assert m, "Resources 빌드 페이즈를 못 찾았다"
s = s[:m.end()] + f'\t\t\t\t{IDS["build"]} /* InfoPlist.strings in Resources */,\n' + s[m.end():]

# 5) knownRegions
old = "\t\t\tknownRegions = (\n\t\t\t\ten,\n\t\t\t\tBase,\n\t\t\t);"
assert old in s, "knownRegions 형태가 예상과 다르다"
s = s.replace(old, "\t\t\tknownRegions = (\n\t\t\t\ten,\n\t\t\t\tBase,\n\t\t\t\tko,\n\t\t\t\tja,\n\t\t\t);", 1)

# 6) ★ variant group 을 «path = App» 그룹의 children 에 넣는다.
#    이걸 빠뜨리면 Xcode 가 경로를 ios/App/ko.lproj 로 해석해 빌드가 깨진다
#    ("Build input file cannot be found"). 실제 파일은 ios/App/App/ko.lproj 에 있다.
#    (2026-08-24 UC·WIM 에서 실제로 이 에러를 맞고 찾아냈다)
gm = re.search(r'(children = \(\n(?:\t\t\t\t[^\n]*\n)*?)(\t\t\t\);\n\t\t\tpath = App;)', s)
assert gm, "path = App 그룹을 못 찾았다"
s = s[:gm.end(1)] + f'\t\t\t\t{IDS["grp"]} /* InfoPlist.strings */,\n' + s[gm.end(1):]

open(pbx, "w").write(s)
print(f"{display_name}: en/ko/ja .lproj 생성 + pbxproj 등록 완료")
print("  ※ 반드시 빌드해서 App.app 안에 ko.lproj/ja.lproj 가 있는지 확인할 것")
