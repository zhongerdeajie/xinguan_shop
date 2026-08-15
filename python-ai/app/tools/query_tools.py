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


@tool
def get_system_stats() -> str:
    """获取系统概况统计"""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as c FROM student"); students = cur.fetchone()['c']
            cur.execute("SELECT COUNT(*) as c FROM teacher"); teachers = cur.fetchone()['c']
            cur.execute("SELECT COUNT(*) as c FROM course"); courses = cur.fetchone()['c']
            return f"学生: {students}人, 教师: {teachers}人, 课程: {courses}门"
    finally:
        conn.close()


@tool
def check_schedule_conflicts(teacher_id: int, weekday: int, start_slot: int, end_slot: int) -> str:
    """检查排课冲突。参数: teacher_id, weekday(1-7), start_slot, end_slot"""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.section_code, c.name FROM section sm
                JOIN section s ON sm.section_id = s.id
                JOIN course_offering co ON s.offering_id = co.id
                JOIN course c ON co.course_id = c.id
                WHERE sm.teacher_id = %s AND sm.weekday = %s
                AND sm.start_slot < %s AND sm.end_slot > %s
            """, (teacher_id, weekday, end_slot, start_slot))
            conflicts = cur.fetchall()
            if conflicts:
                return f"冲突: {conflicts}"
            return "无冲突"
    finally:
        conn.close()
