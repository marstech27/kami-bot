#!/bin/bash
set -e
# deploy/start.sh — Start the bot via PM2 + persist on reboot
cd /home/ubuntu/kami-bot
echo "=== [4/4] ApplicationStart ==="
pm2 start ecosystem.config.js
pm2 save
echo "→ Server running. Open http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo 'SERVER_IP'):3000 for QR panel."
echo "✅ ApplicationStart done."
