# 빌드 환경 정본 (2026-09-01 실측·검증)

이 문서는 **실제로 빌드를 성공시킨 상태**를 기록한 것이다. 추측 없음.

## 안드로이드 — 이것만 쓴다

```bash
source ~/android-tools/env.sh
cd android && ./gradlew --max-workers=2 :app:assembleDebug
```

| 항목 | 값 |
|---|---|
| JDK | `~/android-tools/jdk-extracted/jdk-21.0.11+10/Contents/Home` (Temurin 21.0.11) |
| SDK | `~/Library/Android/sdk` → **외장** `/Volumes/macportable/android-sdk` |
| 사용자 데이터 | `~/.android` → **외장** `/Volumes/macportable/android-home` |
| adb | 1.0.41 |
| AVD | AIVORY_Phone_API35 · a13_verify · a15_verify · a16_verify |

### ⚠️ JDK 21 이 아니면 깨진다

`@capacitor/android` 가 `JavaVersion.VERSION_21` 을 요구한다.
17 로 돌리면 `error: invalid source release: 21` 로 실패한다.

**이 맥에는 시스템 JDK 가 없다.** `/usr/libexec/java_home` 은 실패하고
Android Studio 도 설치돼 있지 않다. `~/.aivory-tools/jdks/` 에는 17 뿐이다.

### ⚠️ 절대 건드리면 안 되는 파일

```
~/android-tools/signum-upload-key.jks
~/android-tools/undercurrent-upload-key.jks
```
잃으면 해당 앱을 **영원히 업데이트할 수 없다.**

## iOS

| 항목 | 값 |
|---|---|
| Xcode | 26.6 |
| 시뮬레이터 | **12대 · 내장 보관** (부팅 검증 완료: iPhone 17 Pro) |

### ⚠️ 시뮬레이터는 외장으로 옮길 수 없다

외장이 `noowners` 로 마운트돼 CoreSimulator 가 기기 소유권 검증에 실패한다.
옮기면 **데이터는 멀쩡한데 `simctl list` 가 0대**를 반환한다. 심링크로도 안 된다.

## 저장소 배치

| 대상 | 위치 | 크기 |
|---|---|---|
| 안드로이드 SDK·사용자데이터 | 외장 | 37G |
| `~/.aivory-tools` | 외장 | 6.5G |
| iOS 시뮬레이터 | **내장(필수)** | 25G |

**외장을 뽑으면 안드로이드 빌드가 깨진다.** iOS 는 영향 없다.

## 용량 정리 이력 (2026-09-01)

`3.5GB 여유(99% 사용)` → **`70GB 여유(15% 사용)`**

- 안드로이드 SDK·사용자데이터·aivory-tools 를 외장으로 (43G)
- 각종 캐시 정리 (19G)
- 구형 iOS 심볼 캐시 삭제 — iPhone16,1 26.5(23F77), 기기는 26.5.2 사용 중 (5.6G)

### ★ 이때 저지른 오진 — 심링크를 못 보고 «중복»이라 판단

`~/Library/Android` **자체가 심링크**인데 `du -sh ~/Library/Android/sdk` 가
25G 로 나오자 «내장에도 중복»이라 판단했다. 실제로는 외장 하나뿐이었다.
그 상태에서 외장 폴더 이름을 바꾸고 심링크를 걸어 **순환 링크**를 만들었고
`android.jar` 을 못 찾아 빌드가 깨졌다.

**규칙:** 용량 재기 전에 `ls -ld` 로 심링크 여부부터 볼 것.
내장 실사용량은 `du -shx` (한 파일시스템 안에서만) 로 잰다.
