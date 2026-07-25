#!/bin/bash
set -e
# deploy/stop.sh — Stop the existing PM2 process (if any)
cd /home/ubuntu/kami-bot
echo "=== [3/4] ApplicationStop ==="
if pm2 describe kami-bot >/dev/null 2>&1; then
  pm2 stop kami-bot || true
  pm2 delete kami-bot || true
fi
echo "✅ ApplicationStop done."
