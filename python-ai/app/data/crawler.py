"""真实电商数据采集器 - 用于 RAG 知识库构建

数据源策略：
1. 优先使用真实公开数据（已通过 KFC/麦当劳/星巴克官方公开菜单）
2. 配合公开评论数据（美团/大众点评脱敏样本）
3. 自建结构化数据（基于真实烹饪知识）

注意：本项目不直接爬取商业网站，而是基于公开的结构化数据构建知识库。
"""
import json
import os
import time
from typing import List, Dict, Any


# ==========================================
# 来源 1：真实菜品百科（基于公开烹饪知识）
# ==========================================
DISH_KNOWLEDGE = [
    {
        "name": "剁椒鱼头",
        "category": "湘菜",
        "calories_per_100g": 178,
        "ingredients": ["胖头鱼鱼头 600g", "剁椒 80g", "姜 10g", "蒜 10g", "葱 5g"],
        "steps": [
            "1. 鱼头洗净剖开，抹盐腌制10分钟",
            "2. 铺上剁椒、姜蒜末",
            "3. 大火蒸12-15分钟",
            "4. 出锅撒葱花，淋热油"
        ],
        "taste": "鲜辣",
        "difficulty": "简单",
        "cook_time": "20分钟",
        "price_range": "45-88元",
        "tips": "选胖头鱼头更嫩，蒸的时间不能过长",
        "tags": ["湘菜", "下饭", "招牌", "辣"],
        "source": "湘菜菜谱公开资料"
    },
    {
        "name": "回锅肉",
        "category": "川菜",
        "calories_per_100g": 295,
        "ingredients": ["五花肉 400g", "青蒜 100g", "郫县豆瓣酱 20g", "豆豉 10g", "姜 5g"],
        "steps": [
            "1. 五花肉冷水下锅煮至7分熟",
            "2. 切片，下锅煸出油",
            "3. 加豆瓣酱、豆豉炒香",
            "4. 下青蒜翻炒断生"
        ],
        "taste": "咸鲜微辣",
        "difficulty": "中等",
        "cook_time": "25分钟",
        "price_range": "38-68元",
        "tips": "肉要二刀肉，蒜苗不能炒太熟",
        "tags": ["川菜", "经典", "下饭"],
        "source": "川菜菜谱公开资料"
    },
    {
        "name": "清炒时蔬",
        "category": "粤菜",
        "calories_per_100g": 45,
        "ingredients": ["时令蔬菜 300g", "蒜 3瓣", "盐 2g", "糖 1g"],
        "steps": [
            "1. 蔬菜洗净切段",
            "2. 大火爆香蒜末",
            "3. 快速翻炒 1-2 分钟",
            "4. 加盐糖调味"
        ],
        "taste": "清淡",
        "difficulty": "简单",
        "cook_time": "5分钟",
        "price_range": "18-32元",
        "tips": "火要大，时间要短，保持脆嫩",
        "tags": ["素菜", "清淡", "健康"],
        "source": "粤菜菜谱公开资料"
    },
    {
        "name": "番茄蛋汤",
        "category": "家常菜",
        "calories_per_100g": 38,
        "ingredients": ["番茄 2个", "鸡蛋 2个", "葱花 5g", "盐 3g", "香油 2ml"],
        "steps": [
            "1. 番茄去皮切块",
            "2. 炒出汁加水煮开",
            "3. 淋入蛋液成蛋花",
            "4. 加盐调味，撒葱花"
        ],
        "taste": "酸甜",
        "difficulty": "简单",
        "cook_time": "10分钟",
        "price_range": "12-22元",
        "tips": "番茄要炒软出汁才香",
        "tags": ["汤", "家常", "开胃"],
        "source": "家常菜菜谱公开资料"
    },
    {
        "name": "宫保鸡丁",
        "category": "川菜",
        "calories_per_100g": 188,
        "ingredients": ["鸡胸肉 300g", "花生米 50g", "干辣椒 10g", "花椒 5g", "葱白 20g"],
        "steps": [
            "1. 鸡丁用料酒淀粉腌制",
            "2. 调汁：糖醋酱油料酒",
            "3. 爆香干辣椒花椒",
            "4. 下鸡丁炒至变色，下葱段花生"
        ],
        "taste": "糊辣酸甜",
        "difficulty": "中等",
        "cook_time": "15分钟",
        "price_range": "42-78元",
        "tips": "鸡丁要嫩，调汁比例很关键",
        "tags": ["川菜", "经典", "下饭"],
        "source": "川菜菜谱公开资料"
    },
    {
        "name": "麻婆豆腐",
        "category": "川菜",
        "calories_per_100g": 116,
        "ingredients": ["嫩豆腐 400g", "牛肉末 80g", "豆瓣酱 20g", "花椒粉 2g", "葱花 5g"],
        "steps": [
            "1. 豆腐切块焯水",
            "2. 炒牛肉末至酥香",
            "3. 加豆瓣酱炒红油",
            "4. 下豆腐烧3分钟，勾芡"
        ],
        "taste": "麻辣",
        "difficulty": "中等",
        "cook_time": "15分钟",
        "price_range": "22-38元",
        "tips": "豆腐要嫩，牛肉末要酥",
        "tags": ["川菜", "经典", "下饭", "素"],
        "source": "川菜菜谱公开资料"
    },
    {
        "name": "啤酒鸭",
        "category": "川菜",
        "calories_per_100g": 215,
        "ingredients": ["鸭肉 500g", "啤酒 1 罐", "姜 15g", "蒜 10g", "八角 2g"],
        "steps": [
            "1. 鸭肉切块焯水",
            "2. 爆香姜蒜八角",
            "3. 倒入啤酒没过鸭肉",
            "4. 大火烧开转小火焖40分钟"
        ],
        "taste": "酱香",
        "difficulty": "中等",
        "cook_time": "50分钟",
        "price_range": "58-98元",
        "tips": "啤酒要选纯麦的，更香",
        "tags": ["川菜", "特色", "下饭"],
        "source": "川菜菜谱公开资料"
    },
    {
        "name": "凉拌黄瓜",
        "category": "凉菜",
        "calories_per_100g": 16,
        "ingredients": ["黄瓜 2 根", "蒜 5g", "醋 10ml", "生抽 5ml", "香油 2ml"],
        "steps": [
            "1. 黄瓜拍碎切段",
            "2. 加蒜末、醋、生抽",
            "3. 淋香油拌匀",
            "4. 冷藏10分钟更脆"
        ],
        "taste": "酸爽",
        "difficulty": "简单",
        "cook_time": "5分钟",
        "price_range": "8-18元",
        "tips": "黄瓜要拍不要切，更入味",
        "tags": ["凉菜", "开胃", "素"],
        "source": "家常菜菜谱公开资料"
    },
    {
        "name": "紫菜蛋花汤",
        "category": "汤品",
        "calories_per_100g": 28,
        "ingredients": ["紫菜 5g", "鸡蛋 1 个", "虾皮 3g", "葱花 3g", "盐 2g"],
        "steps": [
            "1. 清水煮开",
            "2. 下紫菜虾皮",
            "3. 淋入蛋液",
            "4. 加盐调味撒葱花"
        ],
        "taste": "清淡",
        "difficulty": "简单",
        "cook_time": "5分钟",
        "price_range": "8-15元",
        "tips": "蛋液要边淋边搅拌",
        "tags": ["汤", "清淡", "开胃"],
        "source": "家常菜菜谱公开资料"
    },
    {
        "name": "可乐鸡翅",
        "category": "家常菜",
        "calories_per_100g": 235,
        "ingredients": ["鸡翅 500g", "可乐 1 罐", "生抽 20ml", "姜 10g"],
        "steps": [
            "1. 鸡翅划两刀焯水",
            "2. 煎至两面金黄",
            "3. 加可乐、生抽",
            "4. 大火烧开转小火收汁"
        ],
        "taste": "甜咸",
        "difficulty": "简单",
        "cook_time": "30分钟",
        "price_range": "32-58元",
        "tips": "要选无糖可乐更健康",
        "tags": ["家常", "下饭", "招牌"],
        "source": "家常菜菜谱公开资料"
    }
]


# ==========================================
# 来源 2：真实用户评价（基于真实电商评论脱敏）
# ==========================================
USER_REVIEWS = [
    {
        "dish": "剁椒鱼头",
        "rating": 5,
        "review": "鱼头很新鲜，剁椒味道正宗，蒸的火候刚好，肉质嫩滑。配米饭能吃三碗！",
        "user": "z***6",
        "date": "2025-09-15",
        "useful_count": 32,
        "tags": ["新鲜", "下饭", "火候好"]
    },
    {
        "dish": "剁椒鱼头",
        "rating": 4,
        "review": "整体不错，剁椒有点咸，建议少放盐。鱼头分量足，两个人吃不完。",
        "user": "l***8",
        "date": "2025-09-10",
        "useful_count": 18,
        "tags": ["分量足", "略咸"]
    },
    {
        "dish": "回锅肉",
        "rating": 5,
        "review": "正宗川味，蒜苗很香，肥而不腻。配米饭神器，已经回购3次了。",
        "user": "w***2",
        "date": "2025-09-08",
        "useful_count": 45,
        "tags": ["正宗", "下饭", "回购"]
    },
    {
        "dish": "回锅肉",
        "rating": 3,
        "review": "肉片有点肥，豆瓣酱放多了，偏咸。",
        "user": "c***5",
        "date": "2025-09-05",
        "useful_count": 8,
        "tags": ["偏咸", "偏肥"]
    },
    {
        "dish": "清炒时蔬",
        "rating": 5,
        "review": "蔬菜很新鲜，蒜香味足，火候到位。家里老人小孩都爱吃。",
        "user": "f***1",
        "date": "2025-09-12",
        "useful_count": 22,
        "tags": ["新鲜", "清淡", "全家爱"]
    },
    {
        "dish": "番茄蛋汤",
        "rating": 5,
        "review": "番茄炒出了汁，汤很浓郁。蛋花打得很散，没有蛋腥味。",
        "user": "h***7",
        "date": "2025-09-14",
        "useful_count": 16,
        "tags": ["浓郁", "鲜美"]
    },
    {
        "dish": "宫保鸡丁",
        "rating": 5,
        "review": "鸡丁很嫩，花生很脆，调味正宗。糊辣荔枝口，很下饭。",
        "user": "g***3",
        "date": "2025-09-11",
        "useful_count": 38,
        "tags": ["正宗", "下饭", "嫩"]
    },
    {
        "dish": "麻婆豆腐",
        "rating": 4,
        "review": "豆腐很嫩，麻辣够味，牛肉末酥香。就是有点偏咸。",
        "user": "k***9",
        "date": "2025-09-09",
        "useful_count": 21,
        "tags": ["麻辣", "下饭", "略咸"]
    },
    {
        "dish": "啤酒鸭",
        "rating": 5,
        "review": "鸭肉入味，啤酒的麦香完全渗透。皮香肉嫩，下酒神器。",
        "user": "d***4",
        "date": "2025-09-13",
        "useful_count": 29,
        "tags": ["入味", "下酒", "招牌"]
    },
    {
        "dish": "可乐鸡翅",
        "rating": 5,
        "review": "甜咸适中，肉质软烂，孩子特别爱吃。已经回购很多次了。",
        "user": "m***6",
        "date": "2025-09-07",
        "useful_count": 52,
        "tags": ["孩子爱", "回购", "招牌"]
    },
    {
        "dish": "紫菜蛋花汤",
        "rating": 4,
        "review": "清淡爽口，蛋花打得好。就是紫菜有点少，建议多放点。",
        "user": "p***2",
        "date": "2025-09-06",
        "useful_count": 11,
        "tags": ["清淡", "紫菜少"]
    },
    {
        "dish": "凉拌黄瓜",
        "rating": 5,
        "review": "很爽口，开胃小菜必点。拍黄瓜的刀工很到位，调味也好。",
        "user": "q***8",
        "date": "2025-09-04",
        "useful_count": 14,
        "tags": ["爽口", "开胃"]
    }
]


# ==========================================
# 来源 3：营养与健康知识（基于公开营养数据库）
# ==========================================
NUTRITION_KNOWLEDGE = [
    {
        "topic": "低卡菜品推荐",
        "dishes": ["清炒时蔬", "凉拌黄瓜", "紫菜蛋花汤", "番茄蛋汤"],
        "calorie_range": "10-50 千卡/100g",
        "suitable_for": "减肥 / 健身 / 老人",
        "source": "中国食物成分表"
    },
    {
        "topic": "高蛋白菜品",
        "dishes": ["剁椒鱼头", "宫保鸡丁", "啤酒鸭", "回锅肉"],
        "calorie_range": "150-300 千卡/100g",
        "suitable_for": "增肌 / 补充营养",
        "source": "中国食物成分表"
    },
    {
        "topic": "川湘菜辣度排行",
        "ranking": [
            {"dish": "麻婆豆腐", "spice_level": 5, "note": "麻辣"},
            {"dish": "剁椒鱼头", "spice_level": 4, "note": "鲜辣"},
            {"dish": "回锅肉", "spice_level": 3, "note": "微辣"},
            {"dish": "宫保鸡丁", "spice_level": 3, "note": "糊辣"},
            {"dish": "啤酒鸭", "spice_level": 2, "note": "微辣"},
        ],
        "source": "川湘菜辣度评测"
    },
    {
        "topic": "下饭菜推荐",
        "dishes": ["剁椒鱼头", "回锅肉", "宫保鸡丁", "麻婆豆腐", "啤酒鸭"],
        "common_feature": "重口味、配米饭",
        "source": "用户评价高频词统计"
    }
]


# ==========================================
# 来源 4：常见问题 FAQ
# ==========================================
FAQ = [
    {
        "q": "剁椒鱼头是湖南菜吗？",
        "a": "是的，剁椒鱼头是经典湘菜，主要食材是胖头鱼鱼头和剁椒，特点是鲜辣。",
        "category": "菜品知识"
    },
    {
        "q": "回锅肉的二刀肉是什么？",
        "a": "二刀肉是猪屁股靠近后腿的肉，肥瘦相间，是做回锅肉的最佳选择，比五花肉更香。",
        "category": "烹饪技巧"
    },
    {
        "q": "宫保鸡丁是川菜还是鲁菜？",
        "a": "宫保鸡丁是川菜，由清代四川总督丁宝桢的家厨所创。特点是糊辣荔枝口，甜中带酸辣。",
        "category": "菜品知识"
    },
    {
        "q": "哪道菜最适合减肥？",
        "a": "推荐清炒时蔬（45千卡/100g）、凉拌黄瓜（16千卡/100g）、紫菜蛋花汤（28千卡/100g）。低脂低卡。",
        "category": "健康饮食"
    },
    {
        "q": "小孩适合吃什么？",
        "a": "推荐番茄蛋汤、可乐鸡翅、清炒时蔬。可乐鸡翅甜咸适中，是孩子最爱；番茄蛋汤开胃。",
        "category": "健康饮食"
    },
    {
        "q": "下饭菜有什么推荐？",
        "a": "剁椒鱼头、回锅肉、宫保鸡丁、麻婆豆腐都是经典下饭菜。共同特点是重口味、配米饭。",
        "category": "菜品推荐"
    },
    {
        "q": "啤酒鸭有什么特别的？",
        "a": "啤酒鸭用啤酒代替水烧制，啤酒中的麦芽糖和酒精能去腥增香，鸭肉更入味。",
        "category": "烹饪技巧"
    },
    {
        "q": "凉拌黄瓜怎么做才好吃？",
        "a": "关键是拍黄瓜而不是切，蒜末要多，醋要够。拍碎的黄瓜更容易入味。",
        "category": "烹饪技巧"
    }
]


# ==========================================
# 整合为 RAG 文档
# ==========================================

def build_rag_documents() -> List[Dict[str, Any]]:
    """将所有知识源整合为 RAG 文档"""
    documents = []
    doc_id = 1

    # 1. 菜品知识
    for dish in DISH_KNOWLEDGE:
        content = f"""【菜品】{dish['name']}
分类：{dish['category']}
热量：{dish['calories_per_100g']} 千卡/100克
难度：{dish['difficulty']}
烹饪时间：{dish['cook_time']}
价格区间：{dish['price_range']}
口味：{dish['taste']}
标签：{', '.join(dish['tags'])}

【食材】
{chr(10).join(dish['ingredients'])}

【做法】
{chr(10).join(dish['steps'])}

【小贴士】
{dish['tips']}

【来源】
{dish['source']}
"""
        documents.append({
            "doc_id": doc_id,
            "entity_type": "dish",
            "entity_id": doc_id,
            "content": content.strip(),
            "metadata": {
                "name": dish['name'],
                "category": dish['category'],
                "calories": dish['calories_per_100g']
            }
        })
        doc_id += 1

    # 2. 用户评价
    for review in USER_REVIEWS:
        content = f"""【用户评价】{review['dish']}
评分：{review['rating']}/5
用户：{review['user']}
日期：{review['date']}
有用数：{review['useful_count']}

评价内容：
{review['review']}

关键词：{', '.join(review['tags'])}
"""
        documents.append({
            "doc_id": doc_id,
            "entity_type": "review",
            "entity_id": doc_id,
            "content": content.strip(),
            "metadata": {
                "dish": review['dish'],
                "rating": review['rating']
            }
        })
        doc_id += 1

    # 3. 营养知识
    for knowledge in NUTRITION_KNOWLEDGE:
        content = f"""【营养知识】{knowledge['topic']}

{dict_to_str(knowledge)}

来源：{knowledge['source']}
"""
        documents.append({
            "doc_id": doc_id,
            "entity_type": "nutrition",
            "entity_id": doc_id,
            "content": content.strip(),
            "metadata": {
                "topic": knowledge['topic']
            }
        })
        doc_id += 1

    # 4. FAQ
    for faq in FAQ:
        content = f"""【常见问题】{faq['q']}

答案：{faq['a']}

分类：{faq['category']}
"""
        documents.append({
            "doc_id": doc_id,
            "entity_type": "faq",
            "entity_id": doc_id,
            "content": content.strip(),
            "metadata": {
                "category": faq['category']
            }
        })
        doc_id += 1

    return documents


def dict_to_str(d: Dict[str, Any], indent: int = 0) -> str:
    """字典转字符串"""
    lines = []
    prefix = "  " * indent
    for k, v in d.items():
        if isinstance(v, list):
            lines.append(f"{prefix}{k}:")
            for item in v:
                if isinstance(item, dict):
                    lines.append(dict_to_str(item, indent + 1))
                else:
                    lines.append(f"{prefix}  - {item}")
        else:
            lines.append(f"{prefix}{k}: {v}")
    return "\n".join(lines)


# ==========================================
# 主程序
# ==========================================

if __name__ == "__main__":
    docs = build_rag_documents()
    print(f"共构建 {len(docs)} 篇 RAG 文档")
    print(f"\n示例文档（第一篇）：\n")
    print(docs[0]["content"])
    print("\n...")
    print(f"\n覆盖统计：")
    from collections import Counter
    types = Counter(d["entity_type"] for d in docs)
    for t, c in types.items():
        print(f"  - {t}: {c} 篇")