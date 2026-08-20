"""查询工具集"""
from langchain_core.tools import tool
from typing import List, Dict
import pymysql
from app.config import settings


def get_db():
    """获取数据库连接"""
    return pymysql.connect(
        host=settings.MYSQL_HOST,
        port=settings.MYSQL_PORT,
        user=settings.MYSQL_USER,
        password=settings.MYSQL_PASSWORD,
        database=settings.MYSQL_DATABASE,
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor
    )


@tool
def execute_sql(sql: str) -> str:
    """执行 SQL 查询。参数: sql 为 SELECT 语句"""
    if not sql.strip().upper().startswith("SELECT"):
        return "仅支持 SELECT 查询"
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
            if not rows:
                return "查询结果为空"
            return str(rows[:50])
    finally:
        conn.close()



