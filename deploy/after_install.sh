#!/bin/bash
set -e
# deploy/after_install.sh — Runs as ubuntu AFTER code extracted
# Installs npm dependencies; copies .env + service-account from persistent dirs

cd /home/ubuntu/kami-bot
echo "=== [2/4] AfterInstall: npm ci ==="

# Install exact lockfile deps (production only, faster & reproducible)
npm ci --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------
# ⚙️  SECRETS MANAGEMENT (TWO CHOICES)
#
# CHOICE A: Keep secrets on server in /home/ubuntu/secrets/ and
#           just copy them into the app folder on each deploy.
#
#           mkdir -p /home/ubuntu/secrets
#           scp your-local.env   server:/home/ubuntu/secrets/.env
#           scp service-account.json server:/home/ubuntu/secrets/
#           This is what the 4 lines below do:
# ---------------------------------------------------------------
if [ -d /home/ubuntu/secrets ]; then
  echo "→ Copying .env & service-account from /home/ubuntu/secrets"
  cp /home/ubuntu/secrets/.env ./.env
  mkdir -p ./config
  cp /home/ubuntu/secrets/service-account.json ./config/service-account.json
fi

# ---------------------------------------------------------------
# CHOICE B (better for multiple envs): AWS Systems Manager
#           Parameter Store. Write a small script using AWS CLI
#           to pull /kami-bot/prod/ENV as JSON and populate .env
# ---------------------------------------------------------------

# Ensure folders that need to be writable exist
mkdir -p ./logs ./auth_info ./config
chmod 755 ./logs ./auth_info ./config

# Build Drive cache upfront so first .file command is instant
echo "→ Pre-building Drive cache (14k+ files, may take ~60s)..."
node build-drive-cache.js || echo "⚠️  Drive cache build failed (non-fatal, will build at runtime)."

echo "✅ AfterInstall done."
