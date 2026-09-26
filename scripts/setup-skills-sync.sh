#!/usr/bin/env bash
# Installs @wesleycamargo/skills-sync from npmjs.
set -euo pipefail

PACKAGE="@wesleycamargo/skills-sync"
REGISTRY="https://registry.npmjs.org"
MIN_NODE="22.20.0"

global=false
version="latest"
run_init=true

usage() {
  cat <<EOF
Usage: setup-skills-sync.sh [--global] [--version <version>] [--no-init]

Installs $PACKAGE from npmjs without changing npm registry configuration.
Run it from your project's root directory.

  --global            Install globally instead of as a project dev dependency.
  --version <version> Install a specific version (default: latest).
  --no-init           Do not start the skills-sync setup wizard afterwards.
  -h, --help          Show this help.

No npm token is required to install this public package.
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

if [[ $global == true ]]; then
  npm install --global "$PACKAGE@$version" --registry="$REGISTRY"
  command -v skills-sync >/dev/null 2>&1 ||
    die "Installed, but 'skills-sync' is not on your PATH. Add $(npm prefix --global)/bin to PATH."
  cli=(skills-sync)
else
  npm install --save-dev "$PACKAGE@$version" --registry="$REGISTRY"
  [[ -e node_modules/.bin/skills-sync ]] ||
    die "Installed, but the package did not provide the 'skills-sync' command. Try a newer version with --version."
  cli=(npx --no-install skills-sync)
fi

echo "Installed $PACKAGE."

if [[ $run_init == true && -t 0 ]]; then
  echo "Starting the setup wizard."
  "${cli[@]}" init
else
  echo "Run the displayed CLI command with init to configure which skills to sync."
fi
