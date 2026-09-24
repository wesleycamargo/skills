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
  printf '{"name":"@example/publisher","version":"%s"}\n' "${2:-1.2.3}" >"$fixture/package.json"
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
    if [[ "$publish_result" == stage_required ]]; then echo E_STAGE_REQUIRED >&2; exit 1; fi
    [[ "$publish_result" == unreadable ]] || touch "$MOCK_PUBLISHED_MARKER"
    ;;
esac
MOCK
  chmod +x "$fixture/bin/npm"
}

run_script() {
  local fixture="$1"
  shift
  set +e
  env -u GITHUB_ACTIONS -u NPM_OTP -u RELEASE_CHANNEL PATH="$fixture/bin:$PATH" MOCK_LOG="$fixture/log" MOCK_PUBLISHED_MARKER="$fixture/published" "$@" bash "$fixture/scripts/publish-npm.sh" >"$fixture/output" 2>&1
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
    grep -Fq 'publish|publish --access public --tag latest --registry=https://registry.npmjs.org|123456' "$fixture/log"
}

actions_case() {
  local fixture="$1"
  run_script "$fixture" env MOCK_VIEW=missing GITHUB_ACTIONS=true &&
    grep -Fq 'publish|publish --access public --provenance --tag latest --registry=https://registry.npmjs.org|' "$fixture/log" &&
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

stage_only_rejection_case() {
  local fixture="$1"
  ! run_script "$fixture" env MOCK_VIEW=missing GITHUB_ACTIONS=true MOCK_PUBLISH=stage_required &&
    grep -Fq 'npm only authorizes staged publishing' "$fixture/output" &&
    test "$(grep -c '^publish' "$fixture/log")" -eq 1
}

beta_channel_case() {
  local fixture="$1"
  run_script "$fixture" env MOCK_VIEW=missing GITHUB_ACTIONS=true RELEASE_CHANNEL=beta &&
    grep -Fq 'publish|publish --access public --provenance --tag beta --registry=https://registry.npmjs.org|' "$fixture/log"
}

channel_mismatch_case() {
  local fixture="$1" channel="$2" expected="$3"
  ! run_script "$fixture" env MOCK_VIEW=missing GITHUB_ACTIONS=true RELEASE_CHANNEL="$channel" &&
    grep -Fq "$expected" "$fixture/output" &&
    ! grep -qs '^publish' "$fixture/log" && ! grep -qs '^view' "$fixture/log"
}

uncertain_result_case() {
  local fixture="$1"
  ! run_script "$fixture" env MOCK_VIEW=missing GITHUB_ACTIONS=true MOCK_PUBLISH=unreadable NPM_READ_ATTEMPTS=2 NPM_READ_DELAY=0 &&
    grep -Fq 'not yet readable' "$fixture/output" &&
    test "$(grep -c '^publish' "$fixture/log")" -eq 1
}

workflow_channels_case() {
  local workflow="$ROOT/.github/workflows/publish-package.yml"
  ! grep -Eq 'npm\.pkg\.github\.com|packages: write|registry:|NODE_AUTH_TOKEN|--force' "$workflow" &&
    grep -Fq "startsWith(github.ref, 'refs/heads/feature/') && 'beta' || 'latest'" "$workflow" &&
    test "$(grep -c '^  [a-z-]*:$' <(sed -n '/^jobs:/,$p' "$workflow"))" -eq 1
}

workflow_versioning_case() {
  local workflow="$ROOT/.github/workflows/publish-package.yml"
  grep -Fq 'contents: write' "$workflow" &&
    grep -Fq 'fetch-depth: 0' "$workflow" && grep -Fq 'fetch-tags: true' "$workflow" &&
    grep -Fq 'cancel-in-progress: false' "$workflow" &&
    awk '/release-version.mjs apply/{a=NR} /npm test/{t=NR} /npm run build/{b=NR} END{exit !(a && a<t && a<b)}' "$workflow" &&
    grep -Fq "if: steps.version.outputs.version != 'none' && env.RELEASE_CHANNEL == 'latest'" "$workflow"
}

workflow_oidc_toolchain_case() {
  local workflow="$ROOT/.github/workflows/publish-package.yml"
  grep -Fq 'id-token: write' "$workflow" &&
    grep -Fq 'npm install --global npm@11.5.1' "$workflow"
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

fixture="$TMP/stage-only-rejection"
make_fixture "$fixture"
check 'stage-only rejection does not retry direct publishing' stage_only_rejection_case "$fixture"

check 'workflow uses npm with trusted-publishing support' workflow_oidc_toolchain_case

fixture="$TMP/beta"
make_fixture "$fixture" 1.2.4-beta.0
check 'beta channel publishes a prerelease with the beta dist-tag' beta_channel_case "$fixture"

fixture="$TMP/stable-on-beta"
make_fixture "$fixture" 1.2.4
check 'stable version on the beta channel fails before publish' channel_mismatch_case "$fixture" beta 'needs a prerelease version'

fixture="$TMP/beta-on-latest"
make_fixture "$fixture" 1.2.4-beta.0
check 'prerelease version on the latest channel fails before publish' channel_mismatch_case "$fixture" latest 'needs a stable version'

fixture="$TMP/placeholder"
make_fixture "$fixture" 0.0.0-development
check 'uncomputed placeholder version never publishes' channel_mismatch_case "$fixture" beta 'was not computed'

fixture="$TMP/unknown-channel"
make_fixture "$fixture"
check 'unknown channel fails before publish' channel_mismatch_case "$fixture" next 'Unknown RELEASE_CHANNEL next'

fixture="$TMP/uncertain"
make_fixture "$fixture"
check 'unreadable publication fails without a second publish' uncertain_result_case "$fixture"

check 'workflow publishes only to npmjs with branch channels' workflow_channels_case
check 'workflow computes, serializes, and tags releases' workflow_versioning_case

printf '%s passed; %s failed.\n' "$pass" "$fail"
test "$fail" -eq 0
