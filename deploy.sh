#!/bin/bash
# Run by .cpanel.yml during a cPanel Git Version Control "deploy" click.
# Builds the static site in place inside the repo checkout at $REPO_PATH.
# No env vars/secrets required — this is a fully static Astro build.
set -e

# Puts Node 22 on PATH for this build step. Exact path/version comes from
# cPanel's "Setup Node.js App" detail page for the app rooted at this repo —
# replace <youruser> and the "22" version segment with what cPanel showed you.
source /home/<youruser>/nodevenv/repos/kalod/22/bin/activate

cd "$REPO_PATH"
npm ci
npm run build
