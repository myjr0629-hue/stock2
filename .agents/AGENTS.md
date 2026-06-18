# Agent Coding & Verification Rules

To prevent issues where code modifications are lost, reported prematurely without saving, or blocked by port conflicts, all agents working on this project MUST strictly follow these verification rules:

## 1. Physical Save Verification (Must Run Git Diff)
* After making any file edits, you **MUST** run a `git diff <file_path>` command to verify that the modifications have been physically written to the disk.
* Do not rely solely on the file edit tool returning a success status; always confirm the changes on disk using Git commands.

## 2. Compile & Type-Safety Verification
* After confirming that the file has been saved, you **MUST** run `npx tsc --noEmit` (or the project's standard build/type check command) to verify that the changes do not introduce compilation or syntax errors.
* Never assume the code is correct without running a verification build.

## 3. Server Port & Process Verification
* Before starting a development server, verify if there is an active background process (e.g. a zombie node process) occupying port `3000`.
* If a conflict is found, terminate the conflicting process first to ensure the latest code compiles and serves on port `3000` cleanly, preventing browser caching of older versions.

## 4. Completion Reporting Integrity
* Do not write the `walkthrough.md` or mark tasks as completed in `task.md` until:
  1. The code is physically verified as saved on disk (`git diff`).
  2. The build and type check passes successfully.
  3. The local dev server is verified as serving the latest version.

## 5. App & Web Code Isolation & Data Pipeline Integrity
* **앱 작업 시 웹(Desktop Web) 파일 절대 보존**: 모바일 앱 뷰 전용 파일(예: `src/app/[locale]/app-view/*`) 수정 시 데스크톱 웹 버전 파일(예: `src/app/[locale]/flow/*`)은 절대 수정하거나 간섭하지 말 것.
* **동일한 데이터 파이프라인 유지**: 동일한 지표나 데이터를 앱에 가져올 때는 기존 웹 버전에서 이미 사용 및 검증된 데이터 소스(API 라우터, Redis 캐시, 동일 헬퍼 함수 등)의 방식과 인터페이스를 그대로 활용하여 받아올 것. 직접 외부 데이터 API를 다르게 임의 호출하여 이원화하지 말 것.

## 6. 임의 롤백 및 복구 도구 사용 금지 (No Arbitrary Git Rollbacks/Restores)
* **에러 발생 시 직접 디버깅 강제**: 코드 작성 혹은 수정 중 빌드 오류, 컴파일 에러, 타입 체크 실패 등이 발생하더라도, 에이전트는 **절대로 `git restore`, `git checkout`, `git reset` 등의 명령어를 사용하여 수정 중인 파일을 이전 상태로 롤백하거나 복구해서는 안 된다.**
* **디버깅 수정(Modify) 필수**: 에러 발생 시 에러 로그를 면밀히 분석하고, 수정본 자체 위에서 직접 코드의 버그를 고쳐 에러를 해결해야 한다. 
* **사전 승인**: 에이전트 선에서 디버깅이 불가능하여 파일 롤백이 불가피한 극단적인 경우라 하더라도, 사용자의 명시적인 사전 허락 및 확인을 받기 전에는 어떠한 롤백 명령도 실행할 수 없다.
