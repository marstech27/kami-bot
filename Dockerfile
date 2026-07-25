# ⚠️ NOTE FOR WHATSAPP BOTS:
# Docker containers are ephemeral by default — on re-deploy the
# auth_info/ folder is wiped, which means you must scan the QR
# code again. Use a Docker NAMED VOLUME for auth_info/ and
# config/ to persist state across re-deploys & restarts.
#
# For production, we recommend AWS EFS (mounted volume) on
# t3.small or use AWS EC2 directly with PM2 (simpler for state).

FROM node:20-slim

# System deps: sharp needs libvips; fluent-ffmpeg needs ffmpeg
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates \
        ffmpeg \
        libvips42 \
        curl \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
WORKDIR /app
RUN chown -R node:node /app
USER node

# Install deps first (better caching when only code changes)
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY --chown=node:node . .

# Persistent state directories (mount volumes here)
#   docker run -v kami-auth:/app/auth_info \
#              -v kami-config:/app/config   ...
VOLUME ["/app/auth_info", "/app/config", "/app/logs"]

# Express admin panel (also used for QR auth via Socket.IO)
EXPOSE 3000

# Healthcheck (probes admin panel URL every 30s)
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD curl -fsS http://localhost:3000/ || exit 1

# Start process via PM2 for crash resilience (1 process only — stateful)
CMD ["npx", "pm2-runtime", "ecosystem.config.js"]
