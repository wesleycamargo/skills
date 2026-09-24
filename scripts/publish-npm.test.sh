#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$BASH_SOURCE")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

check() {
  local name="$1"
  shift
  if "$@"; then
    printf 'ok - %s\n' "$name"
    pass=$((pass + 1))
  else
    printf 'not ok - %s\n' "$name" >&2
    fail=$((fail + 1))
  fi
}

make_fixture() {
  local fixture="$1"
  mkdir -p "$fixture/scripts" "$fixture/bin"
  cp "$ROOT/scripts/publish-npm.sh" "$fixture/scripts/publish-npm.sh"
  chmod +x "$fixture/scripts/publish-npm.sh"
  printf '{"name":"@example/publisher","version":"1.2.3"}\n' >"$fixture/package.json"
  cat >"$fixture/bin/npm" <<'MOCK'
#!/usr/bin/env bash
set -eo pipefail
set +u
printf '%s|%s|%s\n' "$1" "$*" "$NPM_CONFIG_OTP" >>"$MOCK_LOG"
view="$MOCK_VIEW"
[[ -n "$view" ]] || view=missing
stage_json="$MOCK_STAGE_JSON"
[[ -n "$stage_json" ]] || stage_json=[]
publish_result="$MOCK_PUBLISH"
[[ -n "$publish_result" ]] || publish_result=success
case "$1" in
  view)
    if [[ -f "$MOCK_PUBLISHED_MARKER" || "$view" == published ]]; then echo 1.2.3; exit 0; fi
    if [[ "$view" == error ]]; then echo E500 >&2; exit 1; fi
    echo E404 >&2; exit 1
    ;;
  stage)
    echo "$stage_json"
    ;;
  publish)
    if [[ "$publish_result" == e409 ]]; then echo E409 >&2; exit 1; fi
    if [[ "$publish_result" == eotp ]]; then echo EOTP >&2; exit 1; fi
    if [[ "$publish_result" == e403 ]]; then echo E403 >&2; exit 1; fi
    touch "$MOCK_PUBLISHED_MARKER"
    ;;
esac
MOCK
  chmod +x "$fixture/bin/npm"
}

run_script() {
  local fixture="$1"
  shift
  set +e
  env -u GITHUB_ACTIONS -u NPM_OTP PATH="$fixture/bin:$PATH" MOCK_LOG="$fixture/log" MOCK_PUBLISHED_MARKER="$fixture/published" "$@" bash "$fixture/scripts/publish-npm.sh" >"$fixture/output" 2>&1
  local status=$?
  set -e
  return "$status"
}

published_case() {
  local fixture="$1"
  run_script "$fixture" env MOCK_VIEW=published && ! grep -q '^publish' "$fixture/log"
}

missing_otp_case() {
  local fixture="$1"
  ! run_script "$fixture" env MOCK_VIEW=missing && ! grep -q '^publish' "$fixture/log"
}

local_otp_case() {
  local fixture="$1"
  run_script "$fixture" env MOCK_VIEW=missing NPM_OTP=123456 &&
    grep -Fq 'publish|publish --access public --registry=https://registry.npmjs.org|123456' "$fixture/log"
}

actions_case() {
  local fixture="$1"
  run_script "$fixture" env MOCK_VIEW=missing GITHUB_ACTIONS=true &&
    grep -Fq 'publish|publish --access public --provenance --registry=https://registry.npmjs.org|' "$fixture/log" &&
    ! grep -q '^stage' "$fixture/log"
}

staged_case() {
  local fixture="$1"
  ! run_script "$fixture" env MOCK_VIEW=missing MOCK_STAGE_JSON='[{"version":"1.2.3"}]' &&
    ! grep -q '^publish' "$fixture/log"
}

conflict_case() {
  local fixture="$1"
  ! run_script "$fixture" env MOCK_VIEW=missing NPM_OTP=123456 MOCK_PUBLISH=e409 &&
    test "$(grep -c '^publish' "$fixture/log")" -eq 1
}

trusted_publisher_rejection_case() {
  local fixture="$1"
  ! run_script "$fixture" env MOCK_VIEW=missing GITHUB_ACTIONS=true MOCK_PUBLISH=e403 &&
    grep -Fq 'npm rejected GitHub Actions trusted publishing' "$fixture/output" &&
    test "$(grep -c '^publish' "$fixture/log")" -eq 1
}

fixture="$TMP/published"
make_fixture "$fixture"
check 'published version skips npm publish' published_case "$fixture"

fixture="$TMP/no-otp"
make_fixture "$fixture"
check 'local release requires an OTP' missing_otp_case "$fixture"

fixture="$TMP/local"
make_fixture "$fixture"
check 'local release passes OTP through environment' local_otp_case "$fixture"

fixture="$TMP/actions"
make_fixture "$fixture"
check 'GitHub Actions uses provenance without staged API access' actions_case "$fixture"

fixture="$TMP/staged"
make_fixture "$fixture"
check 'staged version does not publish again' staged_case "$fixture"

fixture="$TMP/conflict"
make_fixture "$fixture"
check 'publish conflict does not retry' conflict_case "$fixture"

fixture="$TMP/trusted-publisher-rejection"
make_fixture "$fixture"
check 'trusted-publisher rejection has a safe remediation' trusted_publisher_rejection_case "$fixture"

printf '%s passed; %s failed.\n' "$pass" "$fail"
test "$fail" -eq 0
