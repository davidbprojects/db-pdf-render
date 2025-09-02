FROM ghcr.io/puppeteer/puppeteer:22.15.0

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY index.js ./

ENV NODE_ENV=production
# Secrets provided by Cloud Run:
#  - RENDER_TOKEN (optional if Basic auth used)
#  - BASIC_USER (optional)
#  - BASIC_PASS (optional)

EXPOSE 8080
CMD ["node","index.js"]
