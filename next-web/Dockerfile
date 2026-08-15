FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Edge 中间件在构建时内联环境变量，JWT_SECRET 必须作为构建参数传入
ARG JWT_SECRET
ENV JWT_SECRET=$JWT_SECRET
RUN npm config set registry https://registry.npmmirror.com/
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm config set registry https://registry.npmmirror.com/
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY package*.json ./
EXPOSE 3001
CMD ["npm", "start"]
