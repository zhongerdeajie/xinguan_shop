package config

import (
	"os"
)

type Config struct {
	Port      string
	GinMode   string
	JWTSecret string
	Redis     RedisConfig
	MySQL     MySQLConfig
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

type MySQLConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Database string
}

func Load() *Config {
	return &Config{
		Port:      getEnv("GO_PORT", "8081"),
		GinMode:   getEnv("GIN_MODE", "release"),
		JWTSecret: getEnv("JWT_SECRET", ""),
		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       0,
		},
		MySQL: MySQLConfig{
			Host:     getEnv("MYSQL_HOST", "localhost"),
			Port:     getEnv("MYSQL_PORT", "3306"),
			User:     getEnv("MYSQL_USER", ""),
			Password: getEnv("MYSQL_PASSWORD", ""),
			Database: getEnv("MYSQL_DATABASE", ""),
		},
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
