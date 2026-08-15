package middleware

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter is the storage contract required by the HTTP rate-limit middleware.
type RateLimiter interface {
	Allow(ctx context.Context, key string, limit int64, window time.Duration) (bool, error)
}

// RateLimit limits requests per client IP within a sliding time window.
// Redis failures are fail-open so a cache outage does not take down the API.
func RateLimit(limiter RateLimiter, limit int64, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodOptions || c.Request.URL.Path == "/api/v1/health" {
			c.Next()
			return
		}

		key := fmt.Sprintf("rate_limit:ip:%s", c.ClientIP())
		allowed, err := limiter.Allow(c.Request.Context(), key, limit, window)
		if err != nil {
			c.Next()
			return
		}
		if !allowed {
			c.Header("Retry-After", fmt.Sprintf("%d", max(1, int(window.Seconds()))))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"message": "请求过于频繁，请稍后再试",
			})
			return
		}

		c.Next()
	}
}
