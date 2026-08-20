package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"go-service/internal/config"
	"go-service/internal/pkg/mysql"
)

// 数据库迁移运行器
//
// 用法:
//   go run ./cmd/migrate --dir ./migrations --up
//   go run ./cmd/migrate --dir ./migrations --status
//
// 维护机制:
//   - 用 migrations/schema_migrations 表记录已执行的 SQL 文件名
//   - 文件名按字典序执行,0001_*.sql 先于 0002_*.sql
//   - 同一个文件不会被执行两次
//   - 不做 down(业务项目,需要回滚手动执行)
func main() {
	dir := flag.String("dir", "./migrations", "迁移文件目录")
	up := flag.Bool("up", false, "执行迁移")
	status := flag.Bool("status", false, "查看已应用迁移")
	flag.Parse()

	cfg := config.Load()
	db, err := mysql.NewDB(cfg.MySQL)
	if err != nil {
		log.Fatalf("MySQL 连接失败: %v", err)
	}
	defer db.Close()

	if err := ensureMigrationsTable(db); err != nil {
		log.Fatalf("创建迁移记录表失败: %v", err)
	}

	files, err := loadMigrations(*dir)
	if err != nil {
		log.Fatalf("读取迁移目录失败: %v", err)
	}

	applied, err := loadApplied(db)
	if err != nil {
		log.Fatalf("读取已应用列表失败: %v", err)
	}

	if *status {
		fmt.Println("📋 迁移状态:")
		fmt.Println("  Applied | File")
		fmt.Println("  --------|------")
		for _, f := range files {
			mark := " "
			if applied[f] {
				mark = "✅"
			}
			fmt.Printf("    %s    | %s\n", mark, f)
		}
		return
	}

	if !*up {
		fmt.Println("请指定 --up 或 --status")
		flag.PrintDefaults()
		os.Exit(2)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	pending := make([]string, 0)
	for _, f := range files {
		if !applied[f] {
			pending = append(pending, f)
		}
	}
	if len(pending) == 0 {
		fmt.Println("✅ 没有待执行的迁移")
		return
	}

	fmt.Printf("🚀 待执行迁移 %d 个:\n", len(pending))
	for _, f := range pending {
		fmt.Printf("   - %s\n", f)
	}

	for _, f := range pending {
		fmt.Printf("▶  执行 %s ...\n", f)
		sqlText, err := os.ReadFile(filepath.Join(*dir, f))
		if err != nil {
			log.Fatalf("读取 %s 失败: %v", f, err)
		}

		// 用 GORM 的 Exec 跑整段 SQL
		// 多语句 SQL 用 ; 分隔, GORM.Exec 一次跑多语句会被 MySQL 拒绝
		// 所以拆成单条, 每条独立 Exec
		stmts := splitSQL(string(sqlText))
		for i, stmt := range stmts {
			if strings.TrimSpace(stmt) == "" {
				continue
			}
			// 用独立的 Exec 跑每条,失败立刻终止
			if err := db.WithContext(ctx).Exec(stmt).Error; err != nil {
				log.Fatalf("  ❌ %s 第 %d 条失败: %v\n语句: %s", f, i+1, err, truncate(stmt, 200))
			}
		}

		// 记录已执行
		if err := db.WithContext(ctx).Exec(
			"INSERT IGNORE INTO schema_migrations (filename, applied_at) VALUES (?, ?)",
			f, time.Now(),
		).Error; err != nil {
			log.Fatalf("记录迁移失败: %v", err)
		}
		fmt.Printf("✅ %s 完成\n", f)
	}
	fmt.Println("\n🎉 全部迁移完成")
}

// ensureMigrationsTable 建一张迁移记录表
func ensureMigrationsTable(db *mysql.DB) error {
	return db.Exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='迁移记录表'
`).Error
}

// loadMigrations 读取目录下所有 .sql, 按字典序排序
func loadMigrations(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if strings.HasSuffix(e.Name(), ".sql") {
			out = append(out, e.Name())
		}
	}
	sort.Strings(out)
	return out, nil
}

// loadApplied 加载已应用过的迁移文件
func loadApplied(db *mysql.DB) (map[string]bool, error) {
	type row struct {
		Filename string `gorm:"column:filename"`
	}
	var rows []row
	err := db.Table("schema_migrations").Select("filename").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(rows))
	for _, r := range rows {
		out[r.Filename] = true
	}
	return out, nil
}

// splitSQL 按 ; 拆 SQL
// 简单实现:不处理 BEGIN/END/字符串里的 ;
// 对于当前 0001_production_stock.sql 里的 SELECT 验证语句足够
func splitSQL(text string) []string {
	lines := strings.Split(text, "\n")
	var out []string
	var sb strings.Builder
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--") {
			continue // 注释行跳过
		}
		sb.WriteString(line)
		sb.WriteString("\n")
		if strings.HasSuffix(trimmed, ";") {
			out = append(out, sb.String())
			sb.Reset()
		}
	}
	if strings.TrimSpace(sb.String()) != "" {
		out = append(out, sb.String())
	}
	return out
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}