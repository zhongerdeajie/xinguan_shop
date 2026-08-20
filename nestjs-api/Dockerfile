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
# 数据库结构由 go-service 的 cmd/migrate 管理(见 go-service/migrations/)
# 这里不再跑 prisma db push, 避免 Prisma 基于不完整 schema 误删列(如 dish.stock/outbox 等)
# prisma generate 已在 builder 阶段执行, 只需生成 client 即可
RUN npx prisma generate
EXPOSE 3000
# 启动时只跑 seed + main, 不再 db push (防止 Prisma drop 掉 outbox_events 等不在 schema 的表)
CMD ["sh", "-c", "node prisma/seed.js && node dist/main.js"]
