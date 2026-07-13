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

# First crash was a V8 heap-size guess (host reports 250GB total RAM, but this
# account's real cPanel/LVE ceiling is 1.4GB) — capping old-space didn't fix a
# second crash that showed no GC trace at all, meaning it isn't V8's JS heap.
# That signature points to sharp/libvips: decoding/encoding the 4032x3024
# studio photos (AVIF encoding especially) allocates large native buffers
# outside V8's heap entirely, so no --max-old-space-size value helps. Force
# libvips to work on one image at a time and stream large images from disk
# instead of holding them fully in RAM.
export VIPS_CONCURRENCY=1
export VIPS_DISC_THRESHOLD=50m
NODE_OPTIONS="--max-old-space-size=700" npm run build
