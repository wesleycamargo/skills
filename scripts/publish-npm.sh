#!/usr/bin/env bash
# Publishes this package to npmjs without retrying an uncertain version.
set -euo pipefail

REGISTRY="https://registry.npmjs.org"
ROOT="$(cd "$(dirname "$BASH_SOURCE")/.." && pwd)"
cd "$ROOT"

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "node is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."
PACKAGE="$(node -p "require('./package.json').name")"
VERSION="$(node -p "require('./package.json').version")"
[[ -n "$PACKAGE" && -n "$VERSION" ]] || fail "package.json must define name and version."

# The channel selects the npm dist-tag; the version must match it before npm is asked to publish.
CHANNEL="${RELEASE_CHANNEL:-latest}"
case "$CHANNEL" in
  latest | beta) ;;
  *) fail "Unknown RELEASE_CHANNEL $CHANNEL; use latest or beta." ;;
esac
[[ "$VERSION" != 0.0.0-development ]] ||
  fail "package.json version $VERSION was not computed; run node scripts/release-version.mjs apply --channel $CHANNEL first."
if [[ "$CHANNEL" == latest ]]; then
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
    fail "The latest channel needs a stable version like 1.2.3; package.json has $VERSION."
else
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z.-]+$ ]] ||
    fail "The beta channel needs a prerelease version like 1.2.4-beta.0; package.json has $VERSION."
fi

set +u
actions_mode="$GITHUB_ACTIONS"
otp="$NPM_OTP"
set -u

view_output="$(mktemp)"
publish_output="$(mktemp)"
trap 'rm -f "$view_output" "$publish_output"' EXIT

if npm view "$PACKAGE@$VERSION" version --registry="$REGISTRY" >"$view_output" 2>&1; then
  printf 'npmjs already has %s@%s; skipped.\n' "$PACKAGE" "$VERSION"
  exit 0
fi
if ! grep -Eqi 'E404|No match found|not found' "$view_output"; then
  fail "Cannot determine whether $PACKAGE@$VERSION exists on npmjs; do not retry publication."
fi

if [[ "$actions_mode" != true ]]; then
  stage_json="$(npm stage list "$PACKAGE" --json --registry="$REGISTRY" 2>/dev/null)" ||
    fail "Cannot inspect staged npm versions; do not retry publication."
  normalized_stage_json="$(tr -d '[:space:]' <<<"$stage_json")"
  if [[ "$normalized_stage_json" == *"\"version\":\"$VERSION\""* ]]; then
    fail "$PACKAGE@$VERSION is already staged; approve or reject that stage before any new publication attempt."
  fi
fi
publish() {
  if [[ "$actions_mode" == true ]]; then
    npm publish --access public --provenance --tag "$CHANNEL" --registry="$REGISTRY" >"$publish_output" 2>&1
  else
    [[ -n "$otp" ]] || fail "Local publication requires NPM_OTP from your current authenticator; do not pass an OTP as a command argument."
    NPM_CONFIG_OTP="$otp" npm publish --access public --tag "$CHANNEL" --registry="$REGISTRY" >"$publish_output" 2>&1
  fi
}

if ! publish; then
  if grep -q 'E409' "$publish_output"; then
    fail "npmjs reports $PACKAGE@$VERSION as existing or staged; do not retry or bump automatically."
  fi
  if grep -q 'EOTP' "$publish_output"; then
    fail "npmjs requires an interactive OTP. Set NPM_OTP locally, or configure npm trusted publishing for GitHub Actions."
  fi
  if [[ "$actions_mode" == true ]] && grep -q 'E_STAGE_REQUIRED' "$publish_output"; then
    fail "npm only authorizes staged publishing for this trusted publisher. Enable direct npm publish in npm package settings, or use an approved staged-release workflow; do not retry this direct release."
  fi
  if [[ "$actions_mode" == true ]] && grep -Eq 'E401|E403|ENEEDAUTH' "$publish_output"; then
    fail "npm rejected GitHub Actions trusted publishing. Verify its owner, repository, workflow filename, and permission for direct npm publish; do not retry until corrected."
  fi
  fail "npm publish failed; inspect the npm debug log, then re-check the registry before retrying."
fi

# npmjs can take about a minute to serve a new version. Waiting only reads the registry; it never publishes again.
for ((attempt = 1; attempt <= ${NPM_READ_ATTEMPTS:-12}; attempt++)); do
  if npm view "$PACKAGE@$VERSION" version --registry="$REGISTRY" >/dev/null 2>&1; then
    printf 'Published %s@%s to npmjs under %s.\n' "$PACKAGE" "$VERSION" "$CHANNEL"
    exit 0
  fi
  sleep "${NPM_READ_DELAY:-10}"
done
fail "npm accepted the publish request but the version is not yet readable; do not retry automatically."
