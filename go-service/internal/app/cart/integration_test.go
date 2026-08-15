// Package cart_test exercises the cart endpoints end-to-end against a real
// Redis container and a per-test sqlite database.
package cart_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"go-service/internal/app"
	"go-service/internal/app/appdeps"
	"go-service/internal/config"
	"go-service/internal/middleware"
	"go-service/internal/model"
	pkgmysql "go-service/internal/pkg/mysql"
	pkgredis "go-service/internal/pkg/redis"
)

type cartFixture struct {
	router *gin.Engine
	rdb    *pkgredis.Client
	db     *gorm.DB
	secret string
	userID int
}

func newCartFixture(t *testing.T) *cartFixture {
	t.Helper()
	addr := os.Getenv("TEST_REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}
	rdb, err := pkgredis.NewClient(config.RedisConfig{Addr: addr, DB: 12})
	if err != nil {
		t.Skipf("Redis not reachable at %s: %v", addr, err)
	}

	path := t.TempDir() + "/cart.db"
	gdb, err := gorm.Open(sqlite.Open(path+"?_busy_timeout=5000&_fk=1"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := gdb.AutoMigrate(
		&model.Dish{}, &model.Category{}, &model.User{},
		&model.ShoppingCart{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		t.Fatalf("acquire sql.DB: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	gdb.Create(&model.Category{ID: 1, Name: "热销", Type: 1, Sort: 0, Status: 1})
	gdb.Create(&model.Dish{ID: 1, Name: "宫保鸡丁", CategoryID: 1, Price: 38.0, Status: 1})
	gdb.Create(&model.Dish{ID: 2, Name: "麻婆豆腐", CategoryID: 1, Price: 22.0, Status: 1})

	secret := "cart-itest-secret"
	userID := 7
	deps := appdeps.Deps{
		DB:        &pkgmysql.DB{DB: gdb},
		Redis:     rdb,
		JWTSecret: secret,
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.CORS(), middleware.RateLimit(rdb, 1000, time.Second))
	app.Register(r, deps)

	t.Cleanup(func() {
		ctx := context.Background()
		for _, pattern := range []string{"dish:*:stock", "lock:*", "price:history:*"} {
			it := rdb.Client.Scan(ctx, 0, pattern, 1000).Iterator()
			for it.Next(ctx) {
				rdb.Client.Del(ctx, it.Val())
			}
		}
		rlIter := rdb.Client.Scan(ctx, 0, "rate_limit:ip:*", 1000).Iterator()
		for rlIter.Next(ctx) {
			rdb.Client.Del(ctx, rlIter.Val())
		}
		_ = rdb.Close()
	})

	return &cartFixture{router: r, rdb: rdb, db: gdb, secret: secret, userID: userID}
}

func (f *cartFixture) token(t *testing.T) string {
	t.Helper()
	claims := jwt.MapClaims{
		"sub":  float64(f.userID),
		"type": "customer",
		"exp":  time.Now().Add(5 * time.Minute).Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(f.secret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

func (f *cartFixture) do(method, path, token string, body any) *httptest.ResponseRecorder {
	var reader *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	f.router.ServeHTTP(w, req)
	return w
}

// TestAddCartInitialisesStockForBothDishes confirms the production cart
// handler seeds the Redis stock counter for every dish referenced.
func TestAddCartInitialisesStockForBothDishes(t *testing.T) {
	f := newCartFixture(t)
	tok := f.token(t)
	ctx := context.Background()

	// dish 1
	resp1 := f.do(http.MethodPost, "/api/v1/cart/add", tok, map[string]any{"dishId": 1, "number": 1})
	if resp1.Code != http.StatusOK {
		t.Fatalf("add cart 1: %d %s", resp1.Code, resp1.Body.String())
	}
	// dish 2
	resp2 := f.do(http.MethodPost, "/api/v1/cart/add", tok, map[string]any{"dishId": 2, "number": 2})
	if resp2.Code != http.StatusOK {
		t.Fatalf("add cart 2: %d %s", resp2.Code, resp2.Body.String())
	}

	for _, k := range []string{"dish:1:stock", "dish:2:stock"} {
		v, err := f.rdb.Get(ctx, k).Int64()
		if err != nil {
			t.Fatalf("missing %s: %v", k, err)
		}
		if v != 100 {
			t.Fatalf("%s expected 100, got %d", k, v)
		}
	}

	var cart []model.ShoppingCart
	f.db.Where("user_id = ?", f.userID).Find(&cart)
	if len(cart) != 2 {
		t.Fatalf("expected 2 cart rows, got %d", len(cart))
	}
}

// TestCartRequiresCustomerToken verifies a non-customer token cannot access
// the cart endpoints. RequireTokenType is wired onto the customer group in
// router.go.
func TestCartRequiresCustomerToken(t *testing.T) {
	f := newCartFixture(t)
	adminTok := jwtToken(t, f.secret, 1, "admin")

	resp := f.do(http.MethodGet, "/api/v1/cart", adminTok, nil)
	if resp.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", resp.Code, resp.Body.String())
	}
}

// TestClearCartRemovesAllLines confirms the Clear endpoint wipes every cart
// row for the authenticated user.
func TestClearCartRemovesAllLines(t *testing.T) {
	f := newCartFixture(t)
	tok := f.token(t)

	for i := 1; i <= 3; i++ {
		resp := f.do(http.MethodPost, "/api/v1/cart/add", tok, map[string]any{
			"dishId": i, "number": 1,
		})
		// dish id 3 will fail because we only created dishes 1 and 2; that is fine
		if i > 2 && resp.Code == http.StatusOK {
			t.Fatalf("expected non-200 for dish %d, got 200", i)
		}
	}

	resp := f.do(http.MethodDelete, "/api/v1/cart", tok, nil)
	if resp.Code != http.StatusOK {
		t.Fatalf("clear: %d %s", resp.Code, resp.Body.String())
	}

	var left []model.ShoppingCart
	f.db.Where("user_id = ?", f.userID).Find(&left)
	if len(left) != 0 {
		t.Fatalf("expected 0 cart rows after clear, got %d", len(left))
	}
}

func jwtToken(t *testing.T, secret string, uid int, tokenType string) string {
	t.Helper()
	claims := jwt.MapClaims{
		"sub":  float64(uid),
		"type": tokenType,
		"exp":  time.Now().Add(5 * time.Minute).Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

// Ensure fmt is referenced (used for future expansion of this file).
var _ = fmt.Sprintf
