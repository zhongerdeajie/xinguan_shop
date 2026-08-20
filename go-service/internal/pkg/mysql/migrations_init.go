// Package mysql - db_init.go
//
// 把 db 初始化抽到一个包里, 让 cmd/main.go / cmd/outbox-worker / cmd/migrate / cmd/stock-sync 共用
package mysql

import (
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"go-service/internal/config"
	"gorm.io/driver/mysql"
)

// Init 带重试的 MySQL 初始化
func InitWithRetry(cfg config.MySQLConfig, attempts int) (*DB, error) {
	var lastErr error
	for i := 1; i <= attempts; i++ {
		db, err := Init(cfg)
		if err == nil {
			return db, nil
		}
		lastErr = err
		if i < attempts {
			time.Sleep(2 * time.Second)
		}
	}
	return nil, fmt.Errorf("MySQL 连接失败 %d 次: %w", attempts, lastErr)
}

// Init 单次连接(供其它 worker 使用)
func Init(cfg config.MySQLConfig) (*DB, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local&interpolateParams=true",
		cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.Database)
	gormDB, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetMaxIdleConns(20)
	sqlDB.SetConnMaxLifetime(time.Hour)
	sqlDB.SetConnMaxIdleTime(30 * time.Minute)
	return &DB{DB: gormDB}, nil
}

// 导入以确保 logger 至少被引用一次
var _ = logger.Default