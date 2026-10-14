#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
/bin/bash -n "$ROOT/scripts/ego-run.sh"
perl -c "$ROOT/scripts/ego-run-lock.pl"
exec python3 "$ROOT/tests/ego_run_lock_test.py" "$@"
