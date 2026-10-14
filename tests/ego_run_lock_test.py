"""Offline process tests: no browser, real queue/lock protocol, isolated tmp dirs."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
WRAPPER = ROOT / 'scripts/ego-run.sh'
FAKE = r'''
use strict;
use warnings;
use JSON::PP;
use Time::HiRes qw(time sleep);
@ARGV == 0 && $0 eq 'nodejs' or die "unexpected arguments";
my $source = do { local $/; <STDIN> // '' };
my $events = $ENV{TEST_EVENTS};
my $name = $ENV{TEST_NAME};
opendir my $dh, $ENV{EGO_LOCK_DIR} or die $!;
my @locks = sort grep { /\.lock$/ } readdir $dh;
closedir $dh;
open my $start, '>', "$events/$name.start.tmp" or die $!;
print {$start} encode_json({pid => $$, time => time, locks => \@locks, source => $source});
close $start;
rename "$events/$name.start.tmp", "$events/$name.start" or die $!;
$| = 1;
print "[ego-browser:notice] hidden\ndummy-start\n";
sleep 0.01 until -e "$events/$name.release";
open my $end, '>', "$events/$name.end" or die $!;
print {$end} time;
close $end;
print "dummy-end\n";
exit($ENV{TEST_EXIT} // 0);
'''
# Original mkdir/FIFO protocol; only directory, poll interval and ego command
# are replaced. This process deliberately knows nothing about the new bridge.
LEGACY = r'''
set -u
LOCK="$EGO_LOCK_DIR/ego-run.lock"; Q="$EGO_LOCK_DIR/ego-run.queue"
mkdir -p "$Q"
TICKET="$Q/$(date +%s)-$$"; : > "$TICKET"
trap 'rm -f "$TICKET"' EXIT
while :; do
  for t in "$Q"/*; do [ -e "$t" ] || continue; kill -0 "${t##*-}" 2>/dev/null || rm -f "$t"; done
  HEAD=$(ls "$Q" | sort | head -1)
  if [ "$Q/$HEAD" = "$TICKET" ] && mkdir "$LOCK" 2>/dev/null; then break; fi
  HOLDER=$(cat "$LOCK/pid" 2>/dev/null || true)
  AGE=$(perl -e 'print time - ((stat($ARGV[0]))[9] // time)' "$LOCK")
  if [ -d "$LOCK" ] && { { [ -n "$HOLDER" ] && ! kill -0 "$HOLDER" 2>/dev/null; } || [ "$AGE" -gt 1800 ]; }; then rm -rf "$LOCK"; continue; fi
  sleep 0.03
done
rm -f "$TICKET"
echo $$ > "$LOCK/pid"
trap '[ "$(cat "$LOCK/pid" 2>/dev/null)" = "$$" ] && rm -rf "$LOCK"' EXIT
"$EGO_BIN" nodejs < "$1"
'''


class EgoLocks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture_tmp = tempfile.TemporaryDirectory(prefix='ego-lock-fixture-')
        # Execute the existing system Perl binary, with "nodejs" selecting this
        # fixture. No new temporary executable needs OS launch validation.
        (Path(cls.fixture_tmp.name) / 'nodejs').write_text(FAKE)
        cls.legacy = Path(cls.fixture_tmp.name) / 'legacy.sh'
        cls.legacy.write_text(LEGACY)

    @classmethod
    def tearDownClass(cls):
        cls.fixture_tmp.cleanup()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ego-lock-test-')
        self.base = Path(self.tmp.name)
        self.lock_dir = self.base / 'locks'
        self.lock_dir.mkdir()
        self.events = self.base / 'events'
        self.events.mkdir()
        self.jobs = []
        self.env = dict(os.environ, EGO_BIN='/usr/bin/perl', EGO_LOCK_DIR=str(self.lock_dir),
                        EGO_LOCK_WAIT='20', EGO_KILL_GRACE='0.5', EGO_LOCK_POLL='0.03',
                        EGO_LOCK_GLOBAL='0', TEST_EVENTS=str(self.events))

    def tearDown(self):
        # Only kill PIDs belonging to this test's processes/isolated metadata.
        for p in self.events.glob('*.release'):
            p.touch()
        for p in self.events.glob('*.start'):
            (self.events / (p.stem + '.release')).touch()
        for proc in self.jobs:
            if proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            proc.communicate(timeout=3)
        self.until(lambda: not (self.lock_dir / 'ego-run.lock').exists(), timeout=3, required=False)
        # A deliberately replaced live owner can leave a fixture directory.
        for path in self.lock_dir.glob('*.lock/pid'):
            pid = int(path.read_text().strip())
            if pid != os.getpid():
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        self.tmp.cleanup()

    def until(self, predicate, timeout=10, required=True):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return True
            time.sleep(0.01)
        if required:
            self.fail('condition timed out')
        return False

    def start(self, name, source='await taskSpace(4);', legacy=False, limit='30', **env):
        script = self.base / (name + '.mjs')
        script.write_text(source)
        args = ['/bin/bash', '-u', str(self.legacy if legacy else WRAPPER), str(script), limit]
        proc = subprocess.Popen(args, env=dict(self.env, TEST_NAME=name, **env),
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, start_new_session=True, cwd=self.fixture_tmp.name)
        self.jobs.append(proc)
        return proc

    def started(self, name):
        path = self.events / (name + '.start')
        self.until(path.exists)
        return json.loads(path.read_text())

    def blocked(self, *names):
        time.sleep(0.12)
        for name in names:
            self.assertFalse((self.events / (name + '.start')).exists(), name)

    def release(self, name):
        (self.events / (name + '.release')).touch()

    def done(self, proc, code=0):
        output = proc.communicate(timeout=10)[0]
        self.assertEqual(proc.returncode, code, output)
        return output

    def queued(self, space, count=1):
        folder = self.lock_dir / ('ego-run.queue' if space is None else f'ego-run.{space}.queue')
        self.until(lambda: folder.exists() and len(list(folder.iterdir())) >= count)

    def classify(self, sources):
        code = 'use JSON::PP; require shift; local $/; print encode_json([map { scalar space_id($_) } @{decode_json(<STDIN>)}]);'
        result = subprocess.run(['/usr/bin/perl', '-e', code, str(ROOT / 'scripts/ego-run-lock.pl')],
                                input=json.dumps(sources), text=True, capture_output=True, check=True)
        return json.loads(result.stdout)

    def test_different_spaces_overlap(self):
        a = self.start('a', 'await taskSpace(4);')
        self.started('a')
        b = self.start('b', 'await taskSpace(5);')
        self.started('b')
        self.assertFalse((self.events / 'a.end').exists())
        self.release('a'); self.release('b')
        self.done(a); self.done(b)

    def test_same_space_fifo(self):
        jobs = [self.start('a')]
        self.started('a')
        jobs.append(self.start('b')); self.queued(4)
        jobs.append(self.start('c')); self.queued(4, 2)
        self.blocked('b', 'c')
        self.release('a'); self.started('b'); self.blocked('c')
        self.release('b'); self.started('c'); self.release('c')
        for job in jobs:
            self.done(job)
        self.assertLess(float((self.events / 'a.end').read_text()), self.started('b')['time'])
        self.assertLess(float((self.events / 'b.end').read_text()), self.started('c')['time'])

    def test_unknown_drains_all_and_blocks_new_space(self):
        a = self.start('a', 'taskSpace(4)'); self.started('a')
        b = self.start('b', 'taskSpace(5)'); self.started('b')
        unknown = self.start('unknown', 'space()'); self.queued(None)
        c = self.start('c', 'taskSpace(9)'); self.queued(9)
        self.blocked('unknown', 'c')
        self.release('a'); self.done(a); self.blocked('unknown', 'c')
        self.release('b'); self.done(b)
        locks = self.started('unknown')['locks']
        self.assertEqual(locks, ['ego-run.4.lock', 'ego-run.5.lock', 'ego-run.9.lock', 'ego-run.lock'])
        d = self.start('d', 'taskSpace(17)'); self.queued(17)
        self.blocked('c', 'd')
        self.release('unknown'); self.done(unknown)
        self.started('c'); self.started('d')
        self.release('c'); self.release('d'); self.done(c); self.done(d)

    def test_multiple_spaces_are_exclusive(self):
        a = self.start('a', 'taskSpace(4); taskSpace(5)'); self.started('a')
        b = self.start('b', 'taskSpace(31)'); self.queued(31); self.blocked('b')
        self.release('a'); self.done(a); self.started('b'); self.release('b'); self.done(b)

    def test_rollback_uses_one_global_lock(self):
        a = self.start('a', EGO_LOCK_GLOBAL='1'); self.started('a')
        self.assertEqual(self.started('a')['locks'], ['ego-run.lock'])
        b = self.start('b', 'taskSpace(5)', EGO_LOCK_GLOBAL='1')
        self.queued(None)
        c = self.start('c', 'taskSpace(7)')
        self.queued(None, 2); self.blocked('b', 'c')
        self.release('a'); self.done(a); self.started('b'); self.blocked('c')
        self.release('b'); self.done(b); self.started('c'); self.release('c'); self.done(c)

    def test_rollback_waits_for_existing_space_workers(self):
        a = self.start('a'); self.started('a')
        b = self.start('b', 'taskSpace(5)'); self.started('b')
        c = self.start('c', EGO_LOCK_GLOBAL='1'); self.queued(None)
        self.release('a'); self.done(a); self.blocked('c')
        self.release('b'); self.done(b); self.started('c'); self.release('c'); self.done(c)

    def test_old_holder_and_old_waiter_run_before_new(self):
        a = self.start('a', legacy=True); self.started('a')
        old = self.start('old', legacy=True); self.queued(None)
        new = self.start('new'); self.queued(None, 2); self.blocked('old', 'new')
        self.release('a'); self.done(a); self.started('old'); self.blocked('new')
        self.release('old'); self.done(old); self.started('new'); self.release('new'); self.done(new)

    def test_old_waiter_drains_parallel_workers_without_starvation(self):
        a = self.start('a'); self.started('a')
        b = self.start('b', 'taskSpace(5)'); self.started('b')
        old = self.start('old', legacy=True); self.queued(None)
        c = self.start('c', 'taskSpace(6)'); self.queued(None, 2)
        self.release('a'); self.done(a); self.blocked('old', 'c')
        self.release('b'); self.done(b); self.started('old'); self.blocked('c')
        self.release('old'); self.done(old); self.started('c'); self.release('c'); self.done(c)

    def test_dead_owner_does_not_release_other_space_bridge(self):
        a = self.start('a'); fake = self.started('a')['pid']
        b = self.start('b', 'taskSpace(5)'); self.started('b')
        holder = int((self.lock_dir / 'ego-run.4.lock/pid').read_text())
        os.kill(holder, signal.SIGKILL); os.kill(fake, signal.SIGKILL)
        self.done(a, 137)
        c = self.start('c'); self.started('c')  # Dead .4 owner is reaped.
        old = self.start('old', legacy=True); self.queued(None)
        self.release('c'); self.done(c); self.blocked('old')
        self.release('b'); self.done(b); self.started('old'); self.release('old'); self.done(old)

    def test_dead_and_expired_locks_and_tickets(self):
        dead = subprocess.Popen(['/usr/bin/true']); dead.wait()
        for leaf, pid, old in [('ego-run.lock', dead.pid, False), ('ego-run.4.lock', os.getpid(), True)]:
            path = self.lock_dir / leaf; path.mkdir(); (path / 'pid').write_text(str(pid))
            if old:
                os.utime(path, (time.time() - 1900, time.time() - 1900))
        for leaf in ['ego-run.queue', 'ego-run.4.queue']:
            path = self.lock_dir / leaf; path.mkdir()
            (path / f'0000000000-{dead.pid}').touch()
        a = self.start('a'); self.started('a'); self.release('a'); self.done(a)
        self.assertFalse(list(self.lock_dir.glob('*.queue/0000000000-*')))

    def test_30_minute_legacy_lock_is_reclaimed(self):
        path = self.lock_dir / 'ego-run.lock'; path.mkdir()
        (path / 'pid').write_text(str(os.getpid()))
        os.utime(path, (time.time() - 1900, time.time() - 1900))
        a = self.start('a'); self.started('a'); self.release('a'); self.done(a)

    def test_timeout_grace_blocks_same_space_but_allows_other(self):
        a = self.start('a', limit='0.1', EGO_KILL_GRACE='5')
        output = self.done(a, 124)
        self.assertIn('강제 종료', output)
        self.assertTrue((self.lock_dir / 'ego-run.4.lock').exists())
        b = self.start('b'); self.queued(4)
        c = self.start('c', 'taskSpace(5)')
        self.until(lambda: (self.lock_dir / 'ego-run.5.lock/pid').exists())
        self.blocked('b')
        self.started('b'); self.release('b'); self.release('c'); self.done(b); self.done(c)

    def test_global_grace_blocks_new_and_legacy(self):
        a = self.start('a', 'space()', limit='0.1', EGO_KILL_GRACE='5')
        self.done(a, 124)
        old = self.start('old', legacy=True); self.queued(None)
        b = self.start('b', 'taskSpace(5)'); self.queued(5); self.blocked('old', 'b')
        self.started('old'); self.release('old'); self.done(old)
        self.started('b'); self.release('b'); self.done(b)

    def test_cleanup_only_releases_own_lock(self):
        a = self.start('a'); self.started('a')
        path = self.lock_dir / 'ego-run.4.lock/pid'
        path.write_text(str(os.getpid()))
        self.release('a'); self.done(a)
        self.assertEqual(path.read_text(), str(os.getpid()))

    def test_wait_timeout_and_cancel_remove_tickets(self):
        a = self.start('a'); self.started('a')
        b = self.start('b', EGO_LOCK_WAIT='0.5'); self.queued(4); self.done(b, 75)
        self.assertEqual(list((self.lock_dir / 'ego-run.4.queue').iterdir()), [])
        c = self.start('c'); self.queued(4)
        ticket = next((self.lock_dir / 'ego-run.4.queue').iterdir())
        os.kill(int(ticket.name.rsplit('-', 1)[1]), signal.SIGTERM)
        self.done(c, 143); self.assertFalse(ticket.exists())
        self.release('a'); self.done(a)

    def test_global_acquires_in_numeric_order_and_cleans_partial_acquisition(self):
        for space in [2, 10]:
            (self.lock_dir / f'ego-run.{space}.queue').mkdir()
        busy = self.lock_dir / 'ego-run.10.lock'; busy.mkdir()
        (busy / 'pid').write_text(str(os.getpid()))
        p = self.start('global', 'space()', EGO_LOCK_WAIT='3')
        first = self.lock_dir / 'ego-run.2.lock'
        self.until(lambda: (first / 'pid').exists())
        self.assertEqual((busy / 'pid').read_text(), str(os.getpid()))
        self.done(p, 75)
        self.assertFalse(first.exists())
        self.assertTrue(busy.exists())

    def test_grace_holder_cleans_itself_without_a_waiter(self):
        p = self.start('timeout', limit='0.1', EGO_KILL_GRACE='2')
        self.done(p, 124)
        lock = self.lock_dir / 'ego-run.4.lock'
        self.assertTrue(lock.exists())
        self.until(lambda: not lock.exists())

    def test_grace_cleanup_preserves_replacement_owner(self):
        p = self.start('timeout', limit='0.1', EGO_KILL_GRACE='2')
        self.done(p, 124)
        path = self.lock_dir / 'ego-run.4.lock/pid'
        path.write_text(str(os.getpid()))
        self.until(lambda: not (self.lock_dir / 'ego-run.lock').exists())
        self.assertEqual(path.read_text(), str(os.getpid()))

    def test_literals_comments_strings_and_selectors(self):
        sources = [
            'taskSpace(0)', 'taskSpace (\n /* comment */ 4\n)',
            "taskSpace('4')", 'taskSpace("4")',
            'taskSpace(4); taskSpace(4)', 'claimTaskSpace(4); taskSpace(4)',
            'takeOverTaskSpace(4)',
            '// taskSpace(5)\n taskSpace(4); /* taskSpace(6) */',
            'const text="taskSpace(5)"; taskSpace(4)',
            'const rx=/taskSpace\\(5\\)/g; taskSpace(4)',
            'const msg=`count ${2 + 3}`; taskSpace(4)',
            'taskSpace(4); const fraction=4 / 2;',
        ]
        self.assertEqual(self.classify(sources), ['0'] + ['4'] * (len(sources) - 1))

    def test_dynamic_mixed_and_hidden_selectors_fail_closed(self):
        sources = [
            '', '// taskSpace(4)', 'const text="taskSpace(4)"',
            'taskSpace(id)', 'taskSpace("named-space")',
            'taskSpace(4); taskSpace(id)', 'taskSpace(4); space()',
            'taskSpace(4); takeSpaceOrExit(5)',
            'const get=taskSpace; get(5); taskSpace(4)',
            'globalThis["taskSpace"](5); taskSpace(4)',
            'taskSpace(4); const msg=`${taskSpace(5)}`',
            'taskSpace(4); import("./helper.mjs")',
            'taskSpace(4); taskSpace(5)',
        ]
        self.assertEqual(self.classify(sources), [None] * len(sources))

    def test_exit_code_notice_filter_and_missing_argument(self):
        p = self.start('a', TEST_EXIT='17'); self.started('a'); self.release('a')
        output = self.done(p, 17)
        self.assertNotIn('ego-browser:notice', output)
        self.assertIn('dummy-end', output)
        p = subprocess.run(['/bin/bash', '-u', str(WRAPPER)], env=self.env, capture_output=True, text=True)
        self.assertEqual(p.returncode, 2)
        self.assertNotIn('unbound variable', p.stderr)

    def test_queued_script_snapshot_does_not_change_space(self):
        a = self.start('a'); self.started('a')
        b = self.start('b'); self.queued(4)
        (self.base / 'b.mjs').write_text('taskSpace(5)')
        self.release('a'); self.done(a)
        self.assertEqual(self.started('b')['source'], 'await taskSpace(4);')
        self.release('b'); self.done(b)


if __name__ == '__main__':
    unittest.main(verbosity=2)
