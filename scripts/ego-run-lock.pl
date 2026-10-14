#!/usr/bin/perl
use strict;
use warnings;
use Fcntl qw(:flock);
use File::Path qw(make_path remove_tree);
use POSIX qw(setsid);
use Time::HiRes qw(time sleep alarm);

# New writers serialize metadata, not browser execution, with flock. Old
# wrappers know only mkdir(ego-run.lock), so a detached bridge owns it until
# EVERY admitted new worker (including grace holders) finishes.
my ($script, $limit) = @ARGV;
my $root = $ENV{EGO_LOCK_DIR} // '/tmp/ego';
my $wait = $ENV{EGO_LOCK_WAIT} // 900;
my $grace = $ENV{EGO_KILL_GRACE} // 240;
my $poll = $ENV{EGO_LOCK_POLL} // 0.2;
my $global = "$root/ego-run.lock";
my $queue = "$root/ego-run.queue";
my ($guard, $ticket, $member, $child);
my @owned;
my @tickets;
my $cleanup = 1;
my $started = time;
my $max_age = 1800;

sub read_text {
    my ($path) = @_;
    open my $fh, '<', $path or return '';
    local $/;
    return <$fh> // '';
}
sub write_text {
    my ($path, $text) = @_;
    open my $fh, '>', $path or die "cannot write lock metadata\n";
    print {$fh} $text or die "cannot write lock metadata\n";
    close $fh or die "cannot close lock metadata\n";
}
sub owner {
    my $pid = read_text("$_[0]/pid");
    chomp $pid;
    return $pid;
}
sub alive { return $_[0] =~ /^[1-9][0-9]*$/ && kill(0, $_[0]); }
sub expired {
    my @st = stat($_[0]);
    return @st && time - $st[9] > $max_age;
}
sub reap_lock {
    my ($path) = @_;
    return unless -d $path;
    my $pid = owner($path);
    remove_tree($path) if ($pid ne '' && !alive($pid)) || expired($path);
}
sub release_owned {
    my ($pid, @paths) = @_;
    for my $path (@paths) {
        remove_tree($path) if owner($path) eq "$pid";
    }
}
sub head {
    my ($dir) = @_;
    opendir my $dh, $dir or die "cannot read lock queue\n";
    my @names = sort grep { /^[0-9][0-9.-]*-[0-9]+$/ } readdir $dh;
    closedir $dh;
    for my $name (@names) {
        my ($pid) = $name =~ /-([0-9]+)$/;
        return "$dir/$name" if alive($pid);
        unlink "$dir/$name";
    }
    return '';
}
sub locked { flock($guard, LOCK_EX) or die "cannot acquire metadata lock\n"; }
sub unlocked { flock($guard, LOCK_UN) or die "cannot release metadata lock\n"; }
sub finish {
    return unless $cleanup && $guard;
    locked();
    unlink @tickets if @tickets;
    release_owned($$, @owned);
    unlink $member if defined $member && $member =~ /\/\Q$$\E$/;
    unlink "$global/exclusive" if read_text("$global/exclusive") eq "$$";
    unlocked();
}
END { finish(); }

# Conservative lexer; never eval input. Decimal IDs (also quoted), comments
# and multiline calls work. Dynamic selectors, aliases, ambiguous syntax and
# escaped identifiers fall back to all spaces.
sub space_id {
    my ($source) = @_;
    my @tokens;
    pos($source) = 0;
    while (pos($source) < length($source)) {
        next if $source =~ /\G(?:\s+|\/\/[^\n]*|\/\*.*?\*\/)/gcs;
        if ($source =~ /\G(['"])((?:\\.|(?!\1)[^\\])*)\1/gcs) {
            push @tokens, ['string', $2];
        } elsif ($source =~ /\G`((?:\\.|[^`\\])*)`/gcs) {
            my $template = $1;
            # Ordinary text interpolation does not select a space. A selector
            # or executable loader inside interpolation needs full JS parsing.
            return undef if $template =~ /\$\{/ && $template =~ /\b(?:taskSpace|claimTaskSpace|takeOverTaskSpace|space|takeSpace|takeSpaceOrExit|eval|Function|import)\b/;
            push @tokens, ['string', ''];
        } elsif (substr($source, pos($source), 1) eq '/') {
            my $last = @tokens ? $tokens[-1][1] : '';
            return undef if $last eq ')' || $last eq '}';
            if (!@tokens || $last =~ /^(?:[=(:,;!?\[{}]|return|throw|case|yield|await)$/) {
                return undef unless $source =~ /\G\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^\/\\\n])+\/[a-z]*/gc;
                push @tokens, ['string', ''];
            } else {
                ++pos($source); # Division; keep scanning the right operand.
                push @tokens, ['punct', '/'];
            }
        } elsif ($source =~ /\G([a-zA-Z_\$][a-zA-Z0-9_\$]*|[0-9]+)/gc) {
            push @tokens, ['word', $1];
        } elsif ($source =~ /\G(.)/gcs) {
            return undef if $1 eq '/' || $1 eq '\\' || $1 eq '`' || $1 eq "'" || $1 eq '"';
            push @tokens, ['punct', $1];
        } else { return undef; }
    }
    my %ids;
    for (my $i = 0; $i < @tokens; ++$i) {
        my ($type, $name) = @{$tokens[$i]};
        if ($type eq 'string') {
            return undef if $name =~ /^(?:taskSpace|claimTaskSpace|takeOverTaskSpace)$/;
            next;
        }
        return undef if $name =~ /^(?:space|takeSpace|takeSpaceOrExit|eval|Function)$/;
        return undef if $name eq 'import' && ($tokens[$i+1] // ['', ''])->[1] eq '(';
        next unless $name =~ /^(?:taskSpace|claimTaskSpace|takeOverTaskSpace)$/;
        return undef unless $i + 3 < @tokens && $tokens[$i+1][1] eq '('
            && $tokens[$i+2][1] =~ /^(?:0|[1-9][0-9]*)$/ && length($tokens[$i+2][1]) <= 9
            && $tokens[$i+3][1] eq ')';
        $ids{$tokens[$i+2][1]} = 1;
    }
    return keys(%ids) == 1 ? (keys %ids)[0] : undef;
}
sub is_bridge {
    my $pid = owner($global);
    return alive($pid) && read_text("$global/bridge") eq $pid;
}
sub members {
    opendir my $dh, "$global/members" or return ();
    my @pids = grep { /^[1-9][0-9]*$/ } readdir $dh;
    closedir $dh;
    my @live;
    for my $pid (@pids) {
        if (alive($pid) && !expired("$global/members/$pid")) { push @live, $pid; }
        else { unlink "$global/members/$pid"; }
    }
    return @live;
}
sub detach_io {
    open STDIN, '<', '/dev/null' or die "cannot detach stdin\n";
    open STDOUT, '>', '/dev/null' or die "cannot detach stdout\n";
    open STDERR, '>', '/dev/null' or die "cannot detach stderr\n";
}
sub start_bridge {
    return 0 unless mkdir $global; # Competes atomically with OLD wrappers too.
    write_text("$global/pid", "$$\n"); # Reapable if the parent dies during fork.
    make_path("$global/members");
    my $pid = fork();
    die "cannot fork lock bridge\n" unless defined $pid;
    if ($pid == 0) {
        $cleanup = 0;
        $SIG{HUP} = 'IGNORE';
        $SIG{INT} = $SIG{TERM} = 'DEFAULT';
        setsid();
        detach_io();
        # fork inherits the SAME flock description; reopen before using it.
        close $guard;
        open $guard, '>>', "$root/ego-run.state" or exit 1;
        while (1) {
            locked();
            if (owner($global) ne "$$" || read_text("$global/bridge") ne "$$") {
                unlocked();
                last;
            }
            if (!members()) {
                release_owned($$, $global);
                unlocked();
                last;
            }
            # Each member/space still expires after 30 minutes. Old wrappers
            # must not expire a bridge serving a sequence of shorter jobs.
            utime undef, undef, $global;
            unlocked();
            sleep $poll;
        }
        exit 0;
    }
    write_text("$global/pid", "$pid\n");
    write_text("$global/bridge", "$pid");
    return 1;
}

# Allow offline classification tests to load the real lexer without executing
# a script, creating metadata or contacting ego.
return 1 if caller;

for my $value ($limit, $wait, $grace, $poll) {
    die "invalid ego-run timing option\n" unless defined $value && $value =~ /^\d+(?:\.\d+)?$/;
}
die "lock poll must be positive\n" unless $poll > 0;
open my $input, '<', $script or die "cannot read ego script\n";
my $source = do { local $/; <$input> // '' };
close $input;
my $id = space_id($source);
my $rollback = ($ENV{EGO_LOCK_GLOBAL} // '') eq '1';
my $exclusive = $rollback || !defined $id;
make_path($root, $queue);
open $guard, '>>', "$root/ego-run.state" or die "cannot open metadata lock\n";
$SIG{TERM} = sub { exit 143; };
$SIG{INT} = sub { exit 130; };
locked();
# Monotonic microsecond tickets under flock give FIFO within one second and
# across clock corrections. Old wrappers still parse the PID after '-'.
my $previous = read_text("$root/ego-run.sequence");
my $stamp = int(time * 1_000_000);
$stamp = $previous + 1 if $previous =~ /^\d+$/ && $stamp <= $previous;
write_text("$root/ego-run.sequence", "$stamp");
my $name = sprintf('%010d.%06d-%d', int($stamp / 1_000_000), $stamp % 1_000_000, $$);
$ticket = "$queue/$name";
push @tickets, $ticket;
write_text($ticket, '');
my ($space_lock, $space_ticket);
if (!$exclusive) {
    $space_lock = "$root/ego-run.$id.lock";
    make_path("$root/ego-run.$id.queue"); # Persistent registry of seen spaces.
    $space_ticket = "$root/ego-run.$id.queue/$name";
    push @tickets, $space_ticket;
    write_text($space_ticket, '');
}
unlocked();
my $admitted = 0;
my @all_locks;
my $next_lock = 0;
while (1) {
    locked();
    if (!$admitted && head($queue) eq $ticket) {
        reap_lock($global) unless is_bridge();
        start_bridge() unless -d $global;
        if (is_bridge() && !-f "$global/exclusive" && (!$exclusive || !members())) {
            $member = "$global/members/$$";
            write_text($member, '');
            write_text("$global/exclusive", "$$") if $exclusive;
            unlink $ticket;
            $admitted = 1;
            if ($exclusive && !$rollback) {
                opendir my $dh, $root or die "cannot list space registry\n";
                my @ids = sort { $a <=> $b } map { /^ego-run\.([0-9]+)\.queue$/ ? $1 : () } readdir $dh;
                closedir $dh;
                @all_locks = map { "$root/ego-run.$_.lock" } @ids;
            }
        }
    }
    my $ready = 0;
    if ($admitted && $exclusive) {
        while ($next_lock < @all_locks) {
            my $path = $all_locks[$next_lock];
            reap_lock($path);
            last unless mkdir $path;
            push @owned, $path;
            write_text("$path/pid", "$$\n");
            ++$next_lock;
        }
        $ready = $next_lock == @all_locks;
    } elsif ($admitted) {
        reap_lock($space_lock);
        if (head("$root/ego-run.$id.queue") eq $space_ticket && mkdir $space_lock) {
            push @owned, $space_lock;
            write_text("$space_lock/pid", "$$\n");
            unlink $space_ticket;
            $ready = 1;
        }
    }
    unlocked();
    last if $ready;
    if (time - $started > $wait) {
        print STDERR "⛔ ego-run: 다른 ego 작업이 ${wait}초 넘게 점유 — 이번 실행 포기\n";
        exit 75;
    }
    sleep $poll;
}

# Execute exactly the source used for classification, even if the file changes
# while queued. Alarm also covers a command blocked while reading stdin.
pipe my $reader, my $writer or die "cannot create ego stdin\n";
$child = fork();
die "cannot fork ego command\n" unless defined $child;
if ($child == 0) {
    $cleanup = 0;
    close $guard;
    close $writer;
    open STDIN, '<&', $reader or die "cannot connect ego stdin\n";
    close $reader;
    exec { $ENV{EGO_BIN} // 'ego-browser' } ($ENV{EGO_BIN} // 'ego-browser'), 'nodejs';
    die "cannot execute ego command\n";
}
close $reader;
my $code;
{
    local $SIG{ALRM} = sub { die "timeout\n"; };
    local $SIG{TERM} = sub { die "terminated\n"; };
    local $SIG{INT} = sub { die "interrupted\n"; };
    local $SIG{PIPE} = 'IGNORE';
    eval {
        alarm $limit;
        print {$writer} $source;
        close $writer;
        waitpid($child, 0);
        $code = $? & 127 ? 128 + ($? & 127) : $? >> 8;
        alarm 0;
    };
    if ($@) {
        my $reason = $@;
        alarm 0;
        kill 'KILL', $child;
        waitpid($child, 0);
        $code = $reason eq "timeout\n" ? 124 : $reason eq "interrupted\n" ? 130 : 143;
        print STDERR "⛔ ego-run: ${limit}초 초과 — 강제 종료(-9)\n" if $code == 124;
    }
}
if ($code == 124 || $code == 130 || $code == 143) {
    # Killing the CLI need not stop its remote script. Transfer ALL ownership
    # before returning; the detached child uses its real PID (no Bash BASHPID).
    locked();
    my $pid = fork();
    die "cannot fork grace holder\n" unless defined $pid;
    if ($pid == 0) {
        $SIG{HUP} = 'IGNORE';
        detach_io();
        close $guard;
        open $guard, '>>', "$root/ego-run.state" or exit 1;
        $member = "$global/members/$$";
        @tickets = ();
        locked(); # Parent completes the ownership transfer before cleanup.
        unlocked();
        sleep $grace;
        exit 0;
    }
    for my $path (@owned) {
        write_text("$path/pid", "$pid\n") if owner($path) eq "$$";
    }
    write_text("$global/members/$pid", '');
    unlink $member;
    write_text("$global/exclusive", "$pid") if $exclusive;
    $cleanup = 0;
    unlocked();
    print STDERR "⛔ ego-run: ego 안의 스크립트가 아직 돌 수 있어 잠금을 ${grace}초 더 쥔다\n";
}
exit $code;
