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
exit "${PIPESTATUS[0]}"
