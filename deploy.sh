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

# Root cause (confirmed with hosting support): Astro/Vite 8's Rolldown bundler
# is a multi-threaded Rust binary that sizes its thread pool off the host's
# full CPU count, not this account's much smaller actual LVE CPU entitlement —
# it silently SIGABRTs trying to spin up far more threads than the account can
# really use. Pinning the build to the account's real core allowance fixes it.
#
# Kept from earlier troubleshooting as harmless headroom, not the actual fix:
# this account's cPanel "Resource Usage" memory cap is 1.4GB (host RAM is not
# the account's real limit). VIPS_DISC_THRESHOLD was removed after it caused a
# segfault in libvips' image step once the real (CPU) bug above was fixed —
# forcing the disk-streaming code path for the 4032x3024 studio photos was
# solving a memory problem that turned out not to be the actual issue.
export VIPS_CONCURRENCY=1
NODE_OPTIONS="--max-old-space-size=700" taskset -c 0,1 npm run build
