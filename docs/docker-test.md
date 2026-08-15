# 在 Docker 里跑全量测试

## 思路

测试代码全部包进 Docker 镜像，在容器里运行：

- 不污染本机 Go/Node 环境
- CI 一次构建，到处跑
- 复用已经起好的 MySQL/Redis/NestJS/Python AI 容器
- 与生产环境一致的依赖（Alpine + libc 兼容，cgo 支持）

## 复用网络

`school-system3_default` 是 `docker-compose.yml` 创建的外部网络。测试容器 `external: true` 引用它，复用以下服务：

- `redis:6379`
- `nestjs-api:3000`
- `python-ai:5000`

## 构建

```bash
docker build -f go-service/Dockerfile.test -t school-system3-go-test      go-service
docker build -f python-ai/Dockerfile.test -t school-system3-python-test  python-ai
docker build -f nestjs-api/Dockerfile.test -t school-system3-nestjs-test nestjs-api
docker build -f next-web/Dockerfile.test -t school-system3-next-test      next-web
```

## 跑测试（一次性容器）

### Go 测试（25/25）

```bash
docker run --rm \
  --network school-system3_default \
  -e TEST_REDIS_ADDR=redis:6379 \
  school-system3-go-test
```

### Python AI 测试（10/10）

```bash
docker run --rm school-system3-python-test
```

### NestJS e2e（4/4）

```bash
docker run --rm \
  --network school-system3_default \
  -e NEST_BASE=http://nestjs-api:3000 \
  -e AI_BASE=http://python-ai:5000 \
  school-system3-nestjs-test
```

### Next.js 测试（12/12）

```bash
docker run --rm school-system3-next-test
```

## 用 docker compose 一键跑

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm go-test
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm python-test
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm nestjs-test
docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm next-test
```

任意一个退出码非 0 即整条流水线失败。

## CI 集成

GitHub Actions 示例：

```yaml
- name: 启动基础服务
  run: docker compose up -d mysql redis nestjs-api python-ai

- name: 构建测试镜像
  run: |
    docker build -f go-service/Dockerfile.test -t school-system3-go-test      go-service
    docker build -f python-ai/Dockerfile.test -t school-system3-python-test  python-ai
    docker build -f nestjs-api/Dockerfile.test -t school-system3-nestjs-test nestjs-api
    docker build -f next-web/Dockerfile.test -t school-system3-next-test      next-web

- name: 跑测试
  run: |
    docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm go-test
    docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm python-test
    docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm nestjs-test
    docker compose -f docker-compose.yml -f docker-compose.test.yml run --rm next-test

- name: 关闭服务
  run: docker compose down
```

## 全量测试结果

| 测试套件 | 通过 / 总数 | 镜像大小（约） |
| --- | --- | --- |
| Go 服务 | 25 / 25 ✅ | 350 MB |
| Python AI | 10 / 10 ✅ | 1.4 GB（含 LLM 依赖） |
| NestJS e2e | 4 / 4 ✅ | 950 MB |
| Next.js | 12 / 12 ✅ | 800 MB |
| **合计** | **51 / 51 ✅** | — |