package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type fakeLimiter struct {
	calls  int64
	allow  bool
	err    error
	misses chan struct{}
}

func (f *fakeLimiter) Allow(_ context.Context, _ string, _ int64, _ time.Duration) (bool, error) {
	atomic.AddInt64(&f.calls, 1)
	if f.misses != nil {
		select {
		case f.misses <- struct{}{}:
		default:
		}
	}
	return f.allow, f.err
}

func TestRateLimitPassesWhenAllowed(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := &fakeLimiter{allow: true}
	r := gin.New()
	r.Use(RateLimit(limiter, 10, time.Second))
	r.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestRateLimitRejectsWhenBlocked(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := &fakeLimiter{allow: false}
	r := gin.New()
	r.Use(RateLimit(limiter, 10, time.Second))
	r.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Fatalf("expected Retry-After header to be set")
	}
}

func TestRateLimitSkipsOptionsAndHealthCheck(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := &fakeLimiter{allow: false}
	r := gin.New()
	r.Use(RateLimit(limiter, 1, time.Second))
	r.GET("/api/v1/health", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	var wg sync.WaitGroup
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				t.Errorf("health should not be rate limited, got %d", w.Code)
			}
		}()
	}
	wg.Wait()

	if atomic.LoadInt64(&limiter.calls) != 0 {
		t.Fatalf("expected limiter to be skipped for health, got %d calls", limiter.calls)
	}
}

func TestRateLimitFailsOpenWhenLimiterErrors(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := &fakeLimiter{allow: false, err: errors.New("redis down")}
	r := gin.New()
	r.Use(RateLimit(limiter, 1, time.Second))
	r.GET("/ping", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected fail-open 200, got %d", w.Code)
	}
}
