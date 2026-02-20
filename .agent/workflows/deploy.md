---
description: how to build and deploy the application
---

# 배포 전 필수 체크리스트

## 1. TypeScript 타입 체크
// turbo
```
npx tsc --noEmit
```
에러 0개 확인 후 다음 단계.

## 2. 프로덕션 빌드 검증
```
npx next build
```
빌드 성공 확인 필수. `tsc --noEmit` 통과해도 `next build`에서 실패할 수 있음.

## 3. 로컬 실행 확인
```
npx next start -p 3001
```
변경한 페이지를 브라우저에서 직접 열어서 확인:
- 페이지가 정상 렌더링되는지
- 콘솔에 에러가 없는지
- 기존 기능이 깨지지 않았는지

## 4. 커밋 & Push
```
git add -A
git commit -m "설명"
git push
```

## 주의사항
- **절대 `tsc --noEmit`만으로 검증 완료라고 판단하지 말 것**
- **한 번에 여러 파일/기능을 대량 변경하지 말 것 — 하나씩 검증**
- **잘 동작하는 코드는 건드리지 말 것**
- **SWR, fetch 패턴 변경 등 데이터 흐름을 바꾸는 작업은 반드시 로컬 실행 확인 후 push**
- **에러 핸들링 패턴을 바꿀 때는 기존 동작 (silent fail vs throw) 반드시 확인**
