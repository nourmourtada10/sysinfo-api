FROM alpine:3.20 AS builder

RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM alpine:3.20 AS runner

RUN apk add --no-cache nodejs \
    && addgroup -S node \
    && adduser -S -G node node

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/dist/index.js /app/dist/server.js /app/dist/sysinfo.js ./dist/

USER node
EXPOSE 8000
CMD ["node", "dist/index.js"]
