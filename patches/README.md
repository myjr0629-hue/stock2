# patches/ — patch-package 로 노드 모듈을 고친 것들

`package.json` 의 `postinstall: patch-package` 가 설치 때마다 적용한다.

## ⛔ 패치 파일을 «바꾸면» Vercel 배포가 깨진다 (2026-08-20 실사고)

증상: 푸시해도 배포가 안 올라온다. Vercel 에서 `npm install exited with 1`,
빌드 로그에 `**ERROR** Failed to apply patch for package …`.

원인: Vercel 이 `Restored build cache from previous deployment` 로 **이전 배포의
node_modules 를 통째로 복원**한다. 거기엔 «옛 패치»가 이미 적용돼 있다.
patch-package 는 「전부 적용됨」이면 넘어가고 「전혀 적용 안 됨」이면 적용하는데,
**일부만 적용된 상태**(옛 훅은 이미 반영, 새 훅은 아님)에서는 둘 다 아니라 에러를 낸다.

⇒ **패치를 추가·수정한 뒤 첫 배포는 «빌드 캐시 없이» 해야 한다.**
   Vercel → 해당 배포 → Redeploy → `Use existing Build Cache` **체크 해제** → Redeploy.
   한 번만 하면 그 뒤 캐시는 «새 패치가 적용된» 트리라 정상으로 돌아온다.

로컬에서 패치가 유효한지 확인하는 법(깨끗한 설치본에 적용해 보기):
```
rm -rf node_modules/@capacitor-community/admob
npm install @capacitor-community/admob@8.0.0 --no-save --ignore-scripts
npx patch-package          # ✔ 가 뜨면 패치 자체는 정상
```

## 목록

### `@capacitor-community+admob+8.0.0.patch`
1. `android/build.gradle` — proguard-android-optimize 사용 (예전부터 있던 변경)
2. `android/.../banner/BannerExecutor.java` — **Android 15+ 전용 인셋 리스너 제거**
   원본은 `SDK_INT >= 35` 에서만 DecorView 에 리스너를 걸고
   `setMargins(0,0,0,bottomInset)` 으로 우리가 넘긴 margin 을 덮어썼다.
   그래서 최신 안드로이드에서만 배너가 앱 탭바를 덮었다(업스트림 이슈 #390, 미해결).
   실측: 패치 전 margin 94→96dp · 134→102dp · 300→배너 소멸(= 값이 안 먹음).
        패치 후 margin 134 → 배너 하단 181.7dp (= 134 + 내비바 48, 정상 반응).
