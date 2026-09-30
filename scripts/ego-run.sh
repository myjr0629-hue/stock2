#!/bin/bash
# ============================================================================
# ego-run — ego-browser 스크립트를 «하드 타임아웃»으로만 돌린다.
#
# 왜 (2026-09-28): 9/27 23:16 에 돌린 ego-browser 스크립트가 멈춘 채 TERM 에도 안 죽고 24시간 «진행 중»으로
#   남아 세션을 붙잡았다 → 시간당 크론이 한 번도 안 불렸고 하루 게시가 0 이 됐다(kill -9 하자마자 풀렸다).
#   명령 도구의 시간 제한은 «백그라운드로 넘길» 뿐 프로세스를 죽이지 않는다. 그래서 스크립트 자신에게 제한을 건다.
#
# 사용: scripts/ego-run.sh <스크립트.mjs> [제한초=420]
#   · 제한을 넘으면 SIGKILL(-9) 후 종료 코드 124 — «발행했다»고 적지 않는다(발행기 자체 검증 출력이 없으므로)
#   · 표준 출력·오류는 그대로 흘린다(ego 의 [ego-browser:notice] 줄은 걸러 낸다)
# ============================================================================
SCRIPT="$1"; LIMIT="${2:-420}"
if [ -z "$SCRIPT" ] || [ ! -f "$SCRIPT" ]; then echo "⛔ ego-run: 스크립트 파일이 없다: $SCRIPT" >&2; exit 2; fi
export PATH="/Applications/ego lite.app/Contents/Frameworks/ego Framework.framework/Versions/0.5.0.32/Helpers:$PATH"
# 잠금 (2026-09-30): 홍보 사이클·검증 에이전트가 동시에 ego 를 몰면 같은 작업 공간을 서로 빼앗는다 → 한 번에 하나만.
#   mkdir 은 원자적이다. 잡은 프로세스가 죽었거나 30분 넘은 잠금은 치운다. EGO_LOCK_WAIT 초(기본 900)까지 기다린다.
mkdir -p /tmp/ego; LOCK=/tmp/ego/ego-run.lock; WAIT="${EGO_LOCK_WAIT:-900}"; T0=$(date +%s)
# ★2026-09-30 11시: 번호표 줄(FIFO). mkdir 경쟁만 하면 연달아 도는 작업이 풀리자마자 다시 잡아 먼저 온 대기자가 굶는다
#   (실측: 홍보 사이클의 광고 판독·댓글이 스토어 작업 5연속에 밀려 10분 넘게 대기). 가장 오래된 «살아 있는» 번호표만 잠금을 시도한다.
#   번호표 = /tmp/ego/ego-run.queue/<대기 시작 epoch 10자리>-<pid> · 주인이 죽은 번호표는 치운다 · 잡으면 번호표를 지운다.
Q=/tmp/ego/ego-run.queue; mkdir -p "$Q"; TICKET="$Q/$(printf '%010d' "$T0")-$$"; : > "$TICKET"
trap 'rm -f "$TICKET"' EXIT
while :; do
  for t in "$Q"/*; do [ -e "$t" ] || continue; kill -0 "${t##*-}" 2>/dev/null || rm -f "$t"; done
  HEAD=$(ls "$Q" 2>/dev/null | sort | head -1)
  if [ "$Q/$HEAD" = "$TICKET" ] && mkdir "$LOCK" 2>/dev/null; then break; fi
  HOLDER=$(cat "$LOCK/pid" 2>/dev/null)
  AGE=$(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || date +%s) ))
  if [ -d "$LOCK" ] && { { [ -n "$HOLDER" ] && ! kill -0 "$HOLDER" 2>/dev/null; } || [ "$AGE" -gt 1800 ]; }; then rm -rf "$LOCK"; continue; fi
  if [ $(( $(date +%s) - T0 )) -gt "$WAIT" ]; then echo "⛔ ego-run: 다른 ego 작업(pid ${HOLDER:-?})이 ${WAIT}초 넘게 점유(줄 앞: ${HEAD:-없음}) — 이번 실행 포기" >&2; exit 75; fi
  sleep 2
done
rm -f "$TICKET"
# 풀 때는 «내 잠금일 때만» 푼다 — 그사이 주인이 죽은 것으로 보고 다른 작업이 새로 잡았으면 그 잠금을 지우면 안 된다(9/30 실측 결함).
echo $$ > "$LOCK/pid"; trap '[ "$(cat "$LOCK/pid" 2>/dev/null)" = "$$" ] && rm -rf "$LOCK"' EXIT
perl -e '
  my $t = shift @ARGV;
  my $pid = fork();
  die "fork 실패" unless defined $pid;
  if ($pid == 0) { exec @ARGV or die "exec 실패: $!"; }
  local $SIG{ALRM} = sub { kill "KILL", $pid; waitpid($pid, 0); print STDERR "⛔ ego-run: ${t}초 초과 — 강제 종료(-9)\n"; exit 124; };
  alarm $t;
  waitpid($pid, 0);
  exit($? >> 8);
' "$LIMIT" ego-browser nodejs < "$SCRIPT" 2>&1 | grep -v 'ego-browser:notice'
CODE="${PIPESTATUS[0]}"
# 강제 종료(124)는 «우리 쪽 클라이언트»만 죽인다 — ego 안의 스크립트는 계속 돈다(9/30 실측: 03:01:56 종료 → 03:02:08 발행 완료).
#   그 사이 잠금이 풀리면 다른 작업이 같은 작업 공간을 동시에 몬다 → 잠금을 EGO_KILL_GRACE 초(기본 240) 더 쥐고 풀어 준다.
#   쥐는 쪽은 분리된 배경 프로세스라 호출자는 바로 돌아간다(기다리는 쪽의 «주인 죽음» 판정은 그 pid 를 본다).
if [ "$CODE" = "124" ]; then
  GRACE="${EGO_KILL_GRACE:-240}"
  trap - EXIT
  ( trap '' HUP; sleep "$GRACE"; [ "$(cat "$LOCK/pid" 2>/dev/null)" = "$BASHPID" ] && rm -rf "$LOCK" ) </dev/null >/dev/null 2>&1 &
  echo $! > "$LOCK/pid"; disown 2>/dev/null
  echo "⛔ ego-run: ego 안의 스크립트가 아직 돌 수 있어 잠금을 ${GRACE}초 더 쥔다" >&2
fi
exit "$CODE"
