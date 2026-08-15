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
RUN npx prisma db push --skip-generate 2>/dev/null || true
EXPOSE 3000
# 启动时自动建表 + 灌入种子数据 + 启动服务
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node prisma/seed.js && node dist/main.js"]
