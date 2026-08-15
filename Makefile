.PHONY: help dev stop build logs clean migrate seed

# 默认目标
help:
	@echo "School System V3.0 — 可用命令:"
	@echo ""
	@echo "  make dev        - 启动所有服务 (docker-compose)"
	@echo "  make stop       - 停止所有服务"
	@echo "  make build      - 重新构建所有镜像"
	@echo "  make logs       - 查看所有服务日志"
	@echo "  make migrate    - 执行数据库迁移"
	@echo "  make seed       - 填充种子数据"
	@echo "  make clean      - 清理所有容器和卷"
	@echo "  make restart    - 重启所有服务"

# 启动所有服务
dev:
	docker-compose up -d
	@echo "✅ 服务已启动"
	@echo "  统一入口:  http://localhost:8080 (nginx 网关)"
	@echo "  API:        http://localhost:3000/api/docs"
	@echo "  顾客首页:   http://localhost:8080/"
	@echo "  AI 助手:    http://localhost:8080/assistant"
	@echo "  管理端:     http://localhost:8080/login"
	@echo "  Go Service: http://localhost:8081/api/v1/health"
	@echo "  Python AI:  http://localhost:5000/api/v1/health"

# 停止所有服务
stop:
	docker-compose down
	@echo "⏹️ 服务已停止"

# 重新构建镜像
build:
	docker-compose build --no-cache
	@echo "🔨 镜像构建完成"

# 查看日志
logs:
	docker-compose logs -f

# 数据库迁移
migrate:
	cd nestjs-api && npx prisma migrate dev

# 种子数据
seed:
	cd nestjs-api && npx ts-node prisma/seed.ts

# 清理所有
clean:
	docker-compose down -v
	docker system prune -f
	@echo "🧹 清理完成"

# 重启
restart: stop dev

# 开发模式（本地）
dev-local:
	concurrently \
		"cd go-service && go run cmd/main.go" \
		"cd python-ai && uvicorn app.main:app --reload --port 5000" \
		"cd nestjs-api && npm run dev" \
		"cd next-web && npm run dev" \
		"cd vue-admin && npm run dev"
