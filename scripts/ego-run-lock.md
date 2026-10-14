# ego-run 공간별 잠금

## 원인과 변경 범위

기존 `ego-run.lock`과 `ego-run.queue` 하나가 서로 다른 taskSpace까지 직렬화했다.
실행 인터페이스 `ego-run.sh <file.mjs> [limit=420]`는 유지하고, 잠금과 타임아웃
구현은 같은 디렉터리의 `ego-run-lock.pl`로 분리했다. 두 파일을 함께 사용해야 한다.
Bash 3.2와 macOS 기본 Perl 모듈만 필요하다. 브라우저 공용 함수 `ego/lib.mjs`는 바꾸지 않는다.

## 공간 판정

스크립트를 실행하지 않고 읽어 다음처럼 판정한다. 대기 중 파일이 바뀌더라도 처음 읽어
판정한 내용을 메모리에서 그대로 stdin으로 전달한다.

- `taskSpace(4)`, `taskSpace ( /* 주석 */ 4 )`, 줄바꿈, `'4'`/`"4"` 표기와
  같은 ID 반복 호출: `/tmp/ego/ego-run.4.lock` 및 `.4.queue`.
- `claimTaskSpace(4)`, `takeOverTaskSpace(4)`도 공간 접근으로 계산한다.
- 변수·이름·여러 ID·`space()`·`takeSpaceOrExit()`·선택 함수 별칭·동적 import/eval 등은 전체 잠금.
  `takeSpaceOrExit(3)`도 공용 함수가 다른 공간으로 우회할 수 있으므로 전체 잠금이다.
- 주석과 일반 문자열의 가짜 호출은 제외한다. 정규식·템플릿 등에서 분석이 모호하면
  전체 잠금으로 보수적으로 처리한다. JavaScript 전체를 해석하거나 import 그래프를 실행하지 않는다.

2026-10-14에 `scripts/ego` 및 `~/signum-ego-io`의 `.mjs`에서 직접 숫자 호출
`0/3/4/5`, 문자열 이름, `id`/`sp.id`/`s.id`/`SPACE`/`SPACE_ID`/`WANT`/`L.SPACE`,
`space()`·`takeSpaceOrExit()`·`claimTaskSpace()`·`takeOverTaskSpace()` 표기를 확인했다.
일부 스크립트는 간접 선택을 사용하므로 계속 전체 잠금을 사용한다.

## 잠금·전환 규약

1. 새 실행기는 짧은 메타데이터 변경만 `ego-run.state`의 Perl `flock`으로 직렬화한다.
   공간 번호표는 마이크로초 순번을 flock 안에서 발급하므로 같은 초에 들어와도 FIFO다.
2. 옛 `ego-run.queue`에도 입장 번호표를 둔다. 옛 실행기가 PID를 읽을 수 있도록
   마지막 `-PID` 형식을 유지한다. 새 작업은 입장하자마자 이 번호표를 지우고 공간 FIFO를 기다린다.
3. 새 작업들이 병렬 실행되는 동안 별도의 보호 프로세스가 옛 `ego-run.lock`을 계속 소유한다.
   따라서 **옛 실행기가 나중에 시작하더라도** 공간 작업과 겹칠 수 없다. 옛 주인이 이미 있으면
   새 실행기가 기다린다. 옛 번호표가 맨 앞에 오면 새 작업 입장을 중단하고 입장한 작업들이
   끝난 뒤 보호 잠금을 해제한다. 옛 번호표를 새 실행기가 강제로 지우지 않는다.
4. 공간 불명/복수 작업은 입장한 작업들이 모두 끝날 때까지 기다린 다음 전용 입장 장벽을 세우고,
   등록된 모든 `.N.queue`의 공간 잠금을 **번호 오름차순**으로 획득한다. 실행 중 새 ID가
   등록되어도 장벽 밖에서 기다린다. 공간 개수/최대 ID를 하드코딩하지 않는다.
5. `EGO_LOCK_GLOBAL=1`은 같은 입장 절차 뒤 전역 잠금 하나만 독점한다.
   공간별 실행기와 섞여도 직렬화하며, 실행 중인 공간 작업을 먼저 비운다.
6. 죽은 주인/번호표와 30분 넘은 개별 잠금·입장 기록을 정리한다. 보호 프로세스는 여러 짧은
   작업에 걸쳐 생존할 수 있어 전역 디렉터리 시각을 갱신한다. 종료·부분 획득 실패·유예 종료는
   **자신의 PID가 남아 있는 잠금만** 해제한다.
7. 시간 제한은 CLI를 SIGKILL하고 124를 반환한다. 원격 스크립트가 남을 수 있어 모든 소유권과
   입장 기록을 별도 유예 프로세스의 실제 PID로 넘긴 뒤 반환한다. Bash 3.2에 없는 `BASHPID`는
   사용하지 않는다. 실행 중 TERM/INT도 유예를 적용한다. 대기 중 취소는 번호표만 정리한다.

등록용 `.queue` 디렉터리와 메타데이터 파일은 비어도 남긴다. `ego-run.state`를 실행 도중
삭제하면 flock 대상이 갈라지므로 임의 삭제하지 않는다. 모든 실행기는 같은 잠금 디렉터리를
사용해야 한다. 기본값은 `/tmp/ego`이며 시험만 `EGO_LOCK_DIR`로 격리한다.

전환 중 전역 `pid`는 개별 작업이 아니라 보호 프로세스 PID다. 이를 외부에서 강제로 죽이거나
전역 디렉터리를 지우면, 새 규약을 모르는 옛 실행기까지 보호하는 것은 불가능하다.
직접 `ego-browser`를 실행해 래퍼를 우회하는 작업도 이 잠금의 보호 범위 밖이다.
숨겨진 간접 호출을 정적으로 확정할 수 없는 스크립트는 `EGO_LOCK_GLOBAL=1`을 사용한다.

## 호출자 영향 확인

기준 커밋 `66169f24e`에서 `git grep -l 'ego-run.sh' HEAD -- scripts`로 사용 예를 포함한
57개 참조 파일을 확인했다. 호출 경로·두 위치 인자·stdin 실행·notice 필터·정상 종료 코드와
기본 대기 900초/실행 420초/유예 240초는 유지한다. `EGO_BIN`은 인자 문자열이 아닌
실행 파일 경로 하나이며 `nodejs` 인자를 받는다. `EGO_LOCK_POLL`은 기본 0.2초다.

참조 파일 전체(아래 이름은 모두 `scripts/` 기준):

```text
admob-arc-sweep.mjs
ego-run.sh
ego/ads-periods.mjs
ego/ads-search-terms.mjs
ego/app-shot.mjs
ego/asc-source-breakdown.mjs
ego/findupapp-find.mjs
ego/findupapp-probe.mjs
ego/findupapp-submit.mjs
ego/findupapp-verify.mjs
ego/github-pr-comment.mjs
ego/gsc-dataset-watch.mjs
ego/gsc-seo-watch.mjs
ego/gsc-sitemap-resubmit.mjs
ego/kin-find.mjs
ego/naver-post-comments.mjs
ego/naver-sa-status.mjs
ego/note-tsubuyaki-probe.mjs
ego/page-probe.mjs
ego/play/README.txt
ego/play/play-acquisitions.mjs
ego/play/play-listing-acq.mjs
ego/reddit-anon-check.mjs
ego/reddit-feed-list.mjs
ego/reddit-rules.mjs
ego/spaces-list.mjs
ego/threads-my-replies.mjs
ego/threads-post-replies.mjs
ego/threads-views.mjs
ego/x-post-replies.mjs
ego/x-profile-top.mjs
flow-map-caption-gen.py
geeknews-comment.mjs
hf-dataset-create.mjs
hf-datasets-upload.mjs
hud/asc-read.mjs
hud/refresh.js
hud/verify-ads-api.js
ih-feed-list.mjs
ih-post-fill.mjs
ih-post-group.mjs
ih-post-submit.mjs
ih-thread-read.mjs
make-x-shot.js
mkt-plan.js
naver-blog-edit-paragraph.mjs
naver-blog-post.mjs
naver-kin-answer.mjs
note-magazine-add.mjs
threads-find-reply-kr.mjs
threads-find-reply.mjs
threads-pin.mjs
threads-reply-ko-gen.py
tistory-edit-paragraph.mjs
tistory-post.mjs
x-find-reply.mjs
x-thread-check.mjs
```

## 오프라인 검증

`/bin/bash scripts/test-ego-run-lock.sh`

시험마다 임시 잠금 디렉터리와 stdin을 읽고 기다리는 더미 Perl 명령을 사용한다.
브라우저·네트워크·운영 `/tmp/ego`에는 접근하지 않는다. 구버전 fixture는 기존 mkdir/FIFO
규약을 그대로 사용하며 시험 경로·poll 간격·실행 명령만 교체한다.

다른 공간 병렬, 같은 공간 FIFO, 불명/복수 공간 배타, 숫자순 전체 잠금, 미등록 공간 차단,
양방향 구버전 공존, 되돌리기 혼합, 죽은 주인/번호표, 30분 만료, 취소/대기 만료, 부분 잠금
정리, 타임아웃 유예와 자체 정리, 다른 주인의 잠금 보존, 표기 판정, 종료 코드/필터,
대기 중 스크립트 변경을 검사한다. 실제 브라우저 및 원격 스크립트 종료 여부는 시험하지 않는다.
