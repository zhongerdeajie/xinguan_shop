// Package strutil 提供字符串处理工具，目前用于将 Go 字段名（驼峰）
// 转成数据库列名（下划线），方便把前端传来的 camelCase 请求体直接传给 GORM。
package strutil

import (
	"strings"
	"unicode"
)

// CamelToSnake 把 "idNumber" → "id_number", "createUser" → "create_user",
// "name" → "name"。其它位置的大写字母前插入下划线并转小写。
//
// 用法：作为更新字段名映射的关键转换：
//
//	for k, v := range updates {
//	    newKey := strutil.CamelToSnake(k)
//	    if newKey != k {
//	        delete(updates, k)
//	        updates[newKey] = v
//	    }
//	}
func CamelToSnake(s string) string {
	if s == "" {
		return s
	}
	var b strings.Builder
	b.Grow(len(s) + 4)
	for i, r := range s {
		if unicode.IsUpper(r) {
			// 第一个字符是大写不补下划线，否则前面补下划线
			if i > 0 {
				prev := rune(s[i-1])
				// 如果前一个字符是小写或数字，补下划线
				if unicode.IsLower(prev) || unicode.IsDigit(prev) {
					b.WriteByte('_')
				}
				// 连续大写字母之间不补下划线（保留 IDNumber → id_number, MyURL → my_url 这种行为）
				_ = prev
			}
			b.WriteRune(unicode.ToLower(r))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// NormalizeUpdateMap 把 map 里的所有 key 从 camelCase 转成 snake_case。
// 原地修改；返回同一个 map（方便链式调用）。
func NormalizeUpdateMap(updates map[string]interface{}) map[string]interface{} {
	for k, v := range updates {
		newKey := CamelToSnake(k)
		if newKey != k {
			delete(updates, k)
			updates[newKey] = v
		}
	}
	return updates
}