FROM golang:1.21-alpine AS builder
WORKDIR /app
ENV GOPROXY=https://goproxy.cn,direct
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o main cmd/main.go

FROM alpine:3.19
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && apk add --no-cache ca-certificates tzdata netcat-openbsd
WORKDIR /app
COPY --from=builder /app/main .
RUN chmod +x main
EXPOSE 8081
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

# 入口脚本
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'echo "Starting StarSelect Go Service..."' >> /app/entrypoint.sh && \
    echo '/app/wait-for-mysql.sh "$MYSQL_HOST" "$MYSQL_PORT"' >> /app/entrypoint.sh && \
    echo 'exec /app/main' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

CMD ["/app/entrypoint.sh"]
