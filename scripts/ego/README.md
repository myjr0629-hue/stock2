# ego 자동화 — 검증된 절차만 여기 둔다

**왜**: 2026-09-18 실측 — `/tmp/ego` 에 하루 **265개** 스크립트가 생기고 결과가 남은 건 10%,
같은 작업을 다시 쓰다 재시도한 흔적이 9종이었다. 절차가 파일마다 흩어져 매번 다시 쓰였기 때문이다.

## 쓰는 법
```bash
export PATH="/Applications/ego lite.app/Contents/Frameworks/ego Framework.framework/Versions/0.5.0.32/Helpers:$PATH"
ego-browser nodejs < scripts/ego/ads-today.mjs        # 광고 오늘 수치
ego-browser nodejs < scripts/ego/pages-clean.mjs      # 탭 예산 해소
```
새 작업은 `lib.mjs` 를 import 해서 쓴다(절대경로 `file:///…/scripts/ego/lib.mjs` — stdin 실행이라 상대경로가 없다).

## lib.mjs 가 담고 있는 «실패로 배운 것»
| 함수 | 왜 필요했나(실측) |
|---|---|
| `space()` | 대표가 작업공간을 쥐면 **되찾지 않는다**(하드 스톱). null 을 돌려 사이클이 우회하게 한다 |
| `findPage/cleanupPages` | 탭 8개를 넘기면 `Page budget reached` 로 아무것도 못 연다 |
| `trapDialogs` | 네이티브 alert 이 뜨면 `evaluate` 가 «대화상자» 오류로 막힌다(Daum·네이버) |
| `findByText/clickText` | 공백 정규화 없이 매칭해 3번 헛손질 · `scrollIntoView` 뒤 좌표를 **다시** 재고 inView 확인 |
| `jsClick` | 좌표 클릭이 허공에 떨어지는 콘솔(플레이, 네이버 발행 레이어)은 `.click()` 이 답 |
| `typeInto` | 편집기는 문자 타이핑에 깨진다 → `Input.insertText` 청크 + Enter 키. CodeMirror 는 400자·600ms |
| `attachFiles` | 「사진 추가」가 **클릭 즉시** OS 선택기를 연다 → `waitFileChooser` 를 클릭 **전**에 |
| `verifyPublic` | 「보인다」는 **비로그인 경로**에서 확인해야 사실이다 |

`page.evaluate` 는 인자를 **하나**만 넘긴다 — 객체로 묶어라(이 규칙 때문에 두 번 헛돌았다).
