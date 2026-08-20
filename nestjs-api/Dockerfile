FROM node:20 AS builder
WORKDIR /app
RUN npm config set registry https://registry.npmmirror.com/
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm
WORKDIR /app
RUN npm config set registry https://registry.npmmirror.com/
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
# 构建期执行 schema 同步 (这是唯一一次 db push, 不在启动时再跑)
RUN npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || true
EXPOSE 3000
# 启动时只跑 seed + main, 不再 db push (防止 Prisma drop 掉 outbox_events 等不在 schema 的表)
CMD ["sh", "-c", "node prisma/seed.js && node dist/main.js"]
