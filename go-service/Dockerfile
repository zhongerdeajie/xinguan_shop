FROM golang:1.21-alpine AS builder
WORKDIR /app
ENV GOPROXY=https://goproxy.cn,direct
COPY go.mod ./
RUN go mod download
COPY . .
# 同时编译三个二进制: main(API 服务) + outbox-worker(事件消费) + stock-sync(库存校准)
RUN CGO_ENABLED=0 GOOS=linux go build -o main cmd/main.go && \
    CGO_ENABLED=0 GOOS=linux go build -o outbox-worker cmd/outbox-worker/main.go && \
    CGO_ENABLED=0 GOOS=linux go build -o stock-sync cmd/stock-sync/main.go

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata netcat-openbsd
WORKDIR /app
COPY --from=builder /app/main .
COPY --from=builder /app/outbox-worker .
COPY --from=builder /app/stock-sync .
RUN chmod +x main outbox-worker stock-sync
EXPOSE 8081 8082
# MySQL 等待脚本
RUN echo '#!/bin/sh' > /app/wait-for-mysql.sh && \
    echo 'for i in $(seq 1 30); do' >> /app/wait-for-mysql.sh && \
    echo '  nc -z "$1" "$2" && exit 0' >> /app/wait-for-mysql.sh && \
    echo '  echo "Waiting for MySQL at $1:$2... ($i/30)"' >> /app/wait-for-mysql.sh && \
    echo '  sleep 2' >> /app/wait-for-mysql.sh && \
    echo 'done' >> /app/wait-for-mysql.sh && \
    echo 'echo "MySQL not available, exiting"' >> /app/wait-for-mysql.sh && \
    echo 'exit 1' >> /app/wait-for-mysql.sh && \
    chmod +x /app/wait-for-mysql.sh

# 入口脚本: 默认启动 main, 其它 binary 由 docker-compose command 覆盖
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'echo "Starting StarSelect Go Service..."' >> /app/entrypoint.sh && \
    echo '/app/wait-for-mysql.sh "$MYSQL_HOST" "$MYSQL_PORT"' >> /app/entrypoint.sh && \
    echo 'exec /app/main' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

CMD ["/app/entrypoint.sh"]
