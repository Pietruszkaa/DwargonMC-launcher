FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=2121
ENV BIND_HOST=0.0.0.0

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js generate-manifest.js announcements.json ./

RUN mkdir -p /data/files /data/backgrounds

EXPOSE 2121

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 2121) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "mkdir -p /data/files /data/backgrounds && [ -f /data/announcements.json ] || cp /app/announcements.json /data/announcements.json && node /app/server.js /data"]
