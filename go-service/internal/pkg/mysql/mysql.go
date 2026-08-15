package mysql

import (
	"fmt"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"go-service/internal/config"
)

type DB struct {
	*gorm.DB
}

func NewDB(cfg config.MySQLConfig) (*DB, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=true&loc=UTC",
		cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.Database)
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	// ==========================================
	// MySQL 连接池配置（电商高并发场景优化）
	// ==========================================
	// 最大打开连接数：100（支撑高并发读写）
	sqlDB.SetMaxOpenConns(100)
	// 最大空闲连接数：20（保持一定预热连接，避免频繁创建）
	sqlDB.SetMaxIdleConns(20)
	// 连接最大存活时间：1 小时（定期刷新连接，防止连接泄漏）
	sqlDB.SetConnMaxLifetime(time.Hour)
	// 空闲连接最大存活时间：30 分钟（释放长时间不用的空闲连接）
	sqlDB.SetConnMaxIdleTime(30 * time.Minute)

	return &DB{db}, nil
}

// Close 关闭数据库连接
func (d *DB) Close() error {
	sqlDB, err := d.DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
