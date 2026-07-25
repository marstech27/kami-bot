#!/bin/bash
set -e
# deploy/before_install.sh — Runs on EC2 as root BEFORE extracting code
# Installs Node 20, PM2, FFmpeg, git, build tools (if missing)

echo "=== [1/4] BeforeInstall: Bootstrapping ==="

# ---- Node 20 LTS via NodeSource ----
if ! command -v node || ! node -v | grep -q "v20"; then
  echo "→ Installing Node 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "→ Node $(node -v) already installed."
fi

# ---- PM2 (process manager) ----
if ! command -v pm2; then
  echo "→ Installing PM2 globally..."
  npm install -g pm2
  # startup hook so PM2 resurrects on reboot
  pm2 startup systemd -u ubuntu --hp /home/ubuntu || true
else
  echo "→ PM2 already installed."
fi

# ---- FFmpeg (for sticker / media conversion) ----
if ! command -v ffmpeg; then
  echo "→ Installing FFmpeg..."
  apt-get install -y ffmpeg
else
  echo "→ FFmpeg already installed."
fi

# ---- Sharp build dependencies (libvips) ----
if ! dpkg -l | grep -q libvips; then
  echo "→ Installing libvips for sharp..."
  apt-get install -y libvips42 build-essential || true
fi

echo "✅ BeforeInstall done."
