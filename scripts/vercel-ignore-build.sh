#!/usr/bin/env bash

# Vercel: 0 skips the build; 1 proceeds. Uncertain main changes must build.
branch=${VERCEL_GIT_COMMIT_REF:-}
message=${VERCEL_GIT_COMMIT_MESSAGE:-}
previous_sha=${VERCEL_GIT_PREVIOUS_SHA:-}

if [[ -z "$branch" ]]; then
    exit 1
fi

if [[ "$branch" != main ]]; then
    if [[ "$branch" == preview/* || "$message" == *'[preview]'* ]]; then
        exit 1
    fi
    exit 0
fi

if [[ -z "$previous_sha" ]] || ! git cat-file -e "${previous_sha}^{commit}" 2>/dev/null; then
    exit 1
fi

# Use NUL delimiters so unusual file names cannot hide an app path.
# A file captures diff's exit status; process substitution would lose it.
changed_files=$(mktemp) || exit 1
trap 'rm -f -- "$changed_files"' EXIT

# Inspect both sides of renames, including app files moved into docs/.
if ! git diff --no-ext-diff --no-renames --name-only -z "$previous_sha" HEAD -- > "$changed_files"; then
    exit 1
fi

saw_file=0
while IFS= read -r -d '' path; do
    saw_file=1
    case "$path" in
        src/*|public/*)
            exit 1
            ;;
        # scripts/ files imported by src/ are app code (2026-10-24: the close-report
        # contract shared with the Lambda; a scripts-only change was skipped on main).
        # tests/vercelIgnoreBuild.test.cjs fails if src/ imports a scripts/ file not listed here.
        scripts/lambda-cross-sector/closingReport.js|scripts/lambda-cross-sector/adviceGuard.generated.js|scripts/integrity/clock.js)
            exit 1
            ;;
        # package.json (build: next build) and next.config.mjs currently use
        # no scripts/ build helpers. Add any future helpers BEFORE this rule.
        .agent/*|docs/*|scripts/*|tests/*|.github/*|*.md)
            ;;
        *)
            exit 1
            ;;
    esac
done < "$changed_files"

if [[ "$saw_file" == 0 ]]; then
    exit 1
fi
exit 0
