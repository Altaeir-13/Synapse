FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
# Install Playwright browsers and OS dependencies securely and cleanly
RUN npx playwright install --with-deps chromium
EXPOSE 3000
CMD ["node", "dist/index.js"]
