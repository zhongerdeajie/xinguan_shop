"""配置管理"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """应用配置"""
    APP_NAME: str = "星选商城 AI Service"
    APP_VERSION: str = "3.0.0"
    DEBUG: bool = False

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # MySQL
    MYSQL_HOST: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = ""
    MYSQL_DATABASE: str = "starselect"

    # Go 服务
    GO_SERVICE_URL: str = "http://localhost:8081"

    # NestJS（用于换取调用 Go 服务的 JWT）
    NESTJS_URL: str = "http://localhost:3000"
    AI_SERVICE_USERNAME: str = "admin"
    AI_SERVICE_PASSWORD: str = "123456"

    # ZhipuAI Embedding
    ZHIPU_API_KEY: str = ""
    ZHIPU_EMBEDDING_MODEL: str = "embedding-3"
    EMBEDDING_DIM: int = 1536

    # MiniMax Embedding（embo-01，1536 维，OpenAI 兼容端点但参数为 texts/type）
    EMBEDDING_PROVIDER: str = "minimax"          # zhipu | minimax
    MINIMAX_API_KEY: str = ""
    MINIMAX_EMBEDDING_MODEL: str = "embo-01"
    MINIMAX_EMBEDDING_URL: str = "https://api.minimaxi.com/v1/embeddings"

    # LLM - 使用 ZhipuAI（智谱 AI）
    LLM_MODEL: str = "glm-4-flash"
    LLM_API_URL: str = "https://open.bigmodel.cn/api/paas/v4/"
    LLM_API_KEY: str = ""
    LLM_TEMPERATURE: float = 0.3

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
