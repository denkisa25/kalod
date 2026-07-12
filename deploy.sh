#!/bin/bash
# Run by .cpanel.yml during a cPanel Git Version Control "deploy" click.
# Builds the static site in place inside the repo checkout at $REPO_PATH.
# No env vars/secrets required — this is a fully static Astro build.
set -e
cd "$REPO_PATH"
npm ci
npm run build
