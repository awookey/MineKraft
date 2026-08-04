FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/awookey/MineKraft" \
      org.opencontainers.image.revision="$VCS_REF"
HEALTHCHECK --interval=15s --timeout=3s --start-period=120s --retries=3 \
  CMD test -f /tmp/silasbot-ready || exit 1
CMD ["npm", "start"]
