# -*- coding: utf-8 -*-
"""读测试结果"""
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

keys = ["指代", "汇总", "记忆R", "FAIL"]
with open("test_full_result.txt", "r", encoding="utf-8") as f:
    for line in f:
        if any(k in line for k in keys):
            print(line.rstrip())