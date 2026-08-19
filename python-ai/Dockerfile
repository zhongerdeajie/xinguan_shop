FROM python:3.11-slim
WORKDIR /app

# 清华 pip 镜像源可能不同步某些包（如 fastapi 0.115.x），用默认 PyPI 源最稳。
# 构建时可通过 --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple 切换回清华源加速。
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PIP_INDEX_URL=${PIP_INDEX_URL}

COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
