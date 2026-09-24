#!/usr/bin/env bash
# Installs @wesleycamargo/skills-sync from the GitHub Packages npm registry.
set -euo pipefail

PACKAGE="@wesleycamargo/skills-sync"
SCOPE="@wesleycamargo"
REGISTRY="https://npm.pkg.github.com"
AUTH_PREFIX="//npm.pkg.github.com/:_authToken="
MIN_NODE="22.20.0"
TOKEN_URL="https://github.com/settings/tokens/new?scopes=read:packages&description=skills-sync"
USER_NPMRC="${NPM_CONFIG_USERCONFIG:-${npm_config_userconfig:-$HOME/.npmrc}}"

global=false
version="latest"
run_init=true

usage() {
  cat <<EOF
Usage: setup-skills-sync.sh [--global] [--version <version>] [--no-init]

Configures npm for GitHub Packages and installs $PACKAGE.
Run it from your project's root directory.

  --global            Install globally instead of as a project dev dependency.
  --version <version> Install a specific version (default: latest).
  --no-init           Do not start the skills-sync setup wizard afterwards.
  -h, --help          Show this help.

GitHub Packages requires a token even for public packages. The script uses
an existing npm login if one works, then NODE_AUTH_TOKEN if set, and
otherwise asks for a classic personal access token with the read:packages
scope. The token is saved in your user npm config, never in the project.
EOF
}

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --global) global=true ;;
    --version)
      [[ $# -ge 2 ]] || die "--version needs a value."
      version="$2"
      shift
      ;;
    --no-init) run_init=false ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
  shift
done

command -v node >/dev/null 2>&1 || die "Node.js $MIN_NODE or later is required."
command -v npm >/dev/null 2>&1 || die "npm is required."
node -e '
  const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const parse = (v) => v.split(".").map(Number);
  process.exit(cmp(parse(process.versions.node), parse(process.argv[1])) >= 0 ? 0 : 1);
' "$MIN_NODE" || die "Node.js $MIN_NODE or later is required (found $(node --version))."

if [[ $global == false && ! -f package.json ]]; then
  die "No package.json in $(pwd). Run this from your project root, create one with 'npm init -y', or use --global."
fi

can_read_package() {
  npm view "$PACKAGE" version --registry="$REGISTRY" >/dev/null 2>&1
}

# Writes the token to the user npm config without passing it on a command line.
save_token() {
  local tmp
  touch "$USER_NPMRC"
  chmod 600 "$USER_NPMRC"
  tmp="$(mktemp)"
  awk -v prefix="$AUTH_PREFIX" 'index($0, prefix) != 1' "$USER_NPMRC" >"$tmp"
  printf '%s%s\n' "$AUTH_PREFIX" "$1" >>"$tmp"
  cat "$tmp" >"$USER_NPMRC"
  rm -f "$tmp"
}

if can_read_package; then
  echo "npm can already read $PACKAGE from GitHub Packages."
else
  token="${NODE_AUTH_TOKEN:-}"
  if [[ -z $token ]]; then
    [[ -t 0 ]] || die "Not logged in to $REGISTRY. Set NODE_AUTH_TOKEN to a classic token with read:packages and re-run."
    echo "GitHub Packages needs a classic personal access token with the read:packages scope."
    echo "Create one at: $TOKEN_URL"
    read -rsp "Token: " token
    echo
  fi
  [[ -n $token ]] || die "No token entered."
  backup="$(mktemp)"
  [[ -f $USER_NPMRC ]] && cat "$USER_NPMRC" >"$backup"
  save_token "$token"
  if ! can_read_package; then
    cat "$backup" >"$USER_NPMRC"
    rm -f "$backup"
    die "GitHub rejected the token. Use a classic token (not fine-grained) with the read:packages scope."
  fi
  rm -f "$backup"
  echo "Saved the token to your user npm config ($USER_NPMRC)."
fi

if [[ $global == true ]]; then
  npm config set "$SCOPE:registry" "$REGISTRY" --location=user
  npm install --global "$PACKAGE@$version"
  command -v skills-sync >/dev/null 2>&1 ||
    die "Installed, but 'skills-sync' is not on your PATH. Add $(npm prefix --global)/bin to PATH."
  cli=(skills-sync)
else
  # The scope mapping goes in the project so teammates and CI resolve the same registry.
  tmp="$(mktemp)"
  [[ -f .npmrc ]] && awk -v prefix="$SCOPE:registry=" 'index($0, prefix) != 1' .npmrc >"$tmp"
  printf '%s:registry=%s\n' "$SCOPE" "$REGISTRY" >>"$tmp"
  cat "$tmp" >.npmrc
  rm -f "$tmp"
  echo "Pointed $SCOPE packages at GitHub Packages in ./.npmrc (safe to commit; it holds no token)."
  npm install --save-dev "$PACKAGE@$version"
  [[ -e node_modules/.bin/skills-sync ]] ||
    die "Installed, but the package did not provide the 'skills-sync' command. Try a newer version with --version."
  cli=(npx --no-install skills-sync)
fi

echo "Installed $PACKAGE."

if [[ $run_init == true && -t 0 ]]; then
  echo "Starting the setup wizard (${cli[*]} init)..."
  "${cli[@]}" init
else
  echo "Next: run '${cli[*]} init' to configure which skills to sync."
fi
