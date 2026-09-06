#!/bin/bash
# Run by .cpanel.yml during a cPanel Git Version Control "deploy" click.
# Builds the static site inside the repo checkout at $REPO_PATH; .cpanel.yml
# copies dist/ to $DEPLOYPATH afterwards. No secrets required — static build.
#
# EVERY STAGE LOGS. A previous version of this script combined `set -e` with a
# hardcoded `source .../activate` on line 9, so a wrong nodevenv path killed it
# instantly and silently — cPanel showed a spinner over a task that had already
# died, and `ps` showed no node process because there never was one. If this
# fails now it says where and why.
set -euo pipefail

log() { printf '[deploy] %s\n' "$*"; }
trap 'ec=$?; log "FAILED at line ${LINENO} (exit ${ec})"; exit ${ec}' ERR

log "start $(date -u '+%Y-%m-%dT%H:%M:%SZ')  user=$(whoami)  host=$(hostname 2>/dev/null || echo '?')"

# cPanel runs each .cpanel.yml task through its own shell in some versions, so
# an `export` in an earlier task may not survive into this one. Falling back to
# the script's own location makes that irrelevant instead of fatal.
if [ -z "${REPO_PATH:-}" ]; then
  REPO_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  log "REPO_PATH was unset — derived from script location: ${REPO_PATH}"
else
  log "REPO_PATH=${REPO_PATH}"
fi
[ -d "${REPO_PATH}" ] || { log "REPO_PATH does not exist: ${REPO_PATH}"; exit 1; }
cd "${REPO_PATH}"
log "cwd=$(pwd)"
log "git HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo 'not a git checkout')"

# --- Node -------------------------------------------------------------------
# The nodevenv path is tied to the Node.js Selector APP root, which is not the
# same thing as the git checkout — moving the repo (commit d7b2aef) does not
# move this. Try the known locations, then search, rather than assuming one.
activate=""
for candidate in \
  "/home/${USER}/nodevenv/public_html/kalodimitrov.com/new/22/bin/activate" \
  "/home/${USER}/nodevenv/repositories/kalodimitrov/22/bin/activate" \
  "${NODEVENV_ACTIVATE:-}" ; do
  if [ -n "${candidate}" ] && [ -f "${candidate}" ]; then activate="${candidate}"; break; fi
done

if [ -z "${activate}" ]; then
  log "no nodevenv activate script at any known path; searching /home/${USER}/nodevenv ..."
  activate="$(find "/home/${USER}/nodevenv" -maxdepth 5 -name activate -path '*/bin/*' 2>/dev/null | head -1 || true)"
fi

if [ -n "${activate}" ]; then
  log "sourcing nodevenv: ${activate}"
  # `set -u` must be off across this source. CloudLinux's activate references
  # CL_VIRTUAL_ENV with no default (line 78), which is fatal under nounset —
  # virtualenv-style activate scripts assume an unguarded shell, and Python's
  # venv has the identical problem. Scoped as tightly as possible so nounset
  # still guards the rest of this script.
  set +u
  # shellcheck disable=SC1090
  source "${activate}"
  set -u
else
  log "WARNING: no nodevenv found — falling back to whatever node is on PATH."
  log "  If this fails, open cPanel > Setup Node.js App, read the app's real"
  log "  'Enter to the virtual environment' path, and set NODEVENV_ACTIVATE to it."
fi

command -v node >/dev/null 2>&1 || { log "node is not on PATH after activation — cannot build"; exit 1; }
command -v npm  >/dev/null 2>&1 || { log "npm is not on PATH after activation — cannot build";  exit 1; }
log "node=$(node --version)  npm=$(npm --version)  which=$(command -v node)"

# --- Install ----------------------------------------------------------------
log "npm ci ..."
npm ci
log "npm ci done"

# --- Build ------------------------------------------------------------------
# Root cause (confirmed with hosting support): Astro/Vite 8's Rolldown bundler
# is a multi-threaded Rust binary that sizes its thread pool off the host's
# full CPU count, not this account's much smaller actual LVE CPU entitlement —
# it silently SIGABRTs trying to spin up far more threads than the account can
# really use. Pinning the build to the account's real core allowance fixes it.
#
# Kept from earlier troubleshooting as harmless headroom, not the actual fix:
# this account's cPanel "Resource Usage" memory cap is 1.4GB (host RAM is not
# the account's real limit). VIPS_DISC_THRESHOLD was removed after it caused a
# segfault in libvips' image step once the real (CPU) bug above was fixed.
export VIPS_CONCURRENCY=1
export NODE_OPTIONS="--max-old-space-size=700"

if command -v taskset >/dev/null 2>&1; then
  log "building with taskset -c 0,1 (LVE CPU pin)"
  taskset -c 0,1 npm run build
else
  log "taskset unavailable — building unpinned (watch for a Rolldown SIGABRT)"
  npm run build
fi

# --- Verify -----------------------------------------------------------------
[ -d "${REPO_PATH}/dist" ] || { log "build reported success but dist/ is missing"; exit 1; }
log "dist/ ok — $(find "${REPO_PATH}/dist" -name '*.html' | wc -l | tr -d ' ') html file(s), $(du -sh "${REPO_PATH}/dist" | cut -f1)"
log "done — .cpanel.yml now copies dist/ to \$DEPLOYPATH"
