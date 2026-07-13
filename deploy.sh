#!/bin/bash
# Run by .cpanel.yml during a cPanel Git Version Control "deploy" click.
# Builds the static site in place inside the repo checkout at $REPO_PATH.
# No env vars/secrets required — this is a fully static Astro build.
set -e

# Puts Node 22 on PATH for this build step. Path comes from cPanel's
# "Setup Node.js App" detail page for the app rooted at this repo checkout.
source /home/kickstic/nodevenv/public_html/kalodimitrov.com/new/22/bin/activate

cd "$REPO_PATH"
npm ci

# The build crashed with "JavaScript heap out of memory": V8 sizes its default
# heap off the host's total RAM (250GB), not this account's actual cPanel/LVE
# allowance (1.4GB physical memory usage cap), so it grows past the real
# ceiling before its own limit ever kicks in. Capping old-space at 700MB
# leaves ~700MB headroom in the 1.4GB budget for sharp's native image buffers
# (the studio photos are 4032x3024), Vite/Rollup, and Node's own baseline.
NODE_OPTIONS="--max-old-space-size=700" npm run build
