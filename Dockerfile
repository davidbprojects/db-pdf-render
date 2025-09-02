FROM ghcr.io/puppeteer/puppeteer:22.15.0

WORKDIR /app
USER root
COPY package*.json ./
RUN mkdir -p /app && chown -R pptruser:pptruser /app
USER pptruser
# Use lockfile if present, else fallback
RUN npm ci --omit=dev || npm install --omit=dev --no-audit --no-fund

COPY --chown=pptruser:pptruser index.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node","index.js"]
