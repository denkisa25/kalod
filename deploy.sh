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

# The build crashed with "JavaScript heap out of memory" on this shared-hosting
# account's memory allowance (V8 grows the heap past what the host allows
# before its own limit kicks in). Capping it below the account's ceiling makes
# V8 garbage-collect more aggressively instead of getting killed outright.
NODE_OPTIONS="--max-old-space-size=460" npm run build
