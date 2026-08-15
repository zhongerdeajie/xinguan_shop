// Package dish_test exercises the dish HTTP handlers against a real Redis
// container and a per-test sqlite database so business logic + redis
// interactions can be verified without docker-compose.
package dish_test

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
	"github.com/redis/go-redis/v9"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"go-service/internal/app"
	"go-service/internal/app/appdeps"
	"go-service/internal/app/dish"
	"go-service/internal/config"
	"go-service/internal/middleware"
	"go-service/internal/model"
	pkgmysql "go-service/internal/pkg/mysql"
	pkgredis "go-service/internal/pkg/redis"
)

// dishFixture wires a real Redis container + per-test sqlite database into
// the production router so tests run the same code path that production
// uses.
type dishFixture struct {
	router *gin.Engine
	rdb    *pkgredis.Client
	keyNs  string
	secret string
}

func newDishFixture(t *testing.T) *dishFixture {
	t.Helper()

	addr := os.Getenv("TEST_REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}
	rdb, err := pkgredis.NewClient(config.RedisConfig{Addr: addr, DB: 14})
	if err != nil {
		t.Skipf("Redis not reachable at %s: %v", addr, err)
	}

	keyNs := fmt.Sprintf("dish-itest:%d:%s", time.Now().UnixNano(), t.Name())

	path := t.TempDir() + "/test.db"
	gdb, err := gorm.Open(sqlite.Open(path+"?_busy_timeout=5000&_fk=1"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := gdb.AutoMigrate(
		&model.Dish{}, &model.Category{}, &model.Employee{}, &model.User{},
		&model.ShoppingCart{}, &model.Orders{}, &model.OrderDetail{},
		&model.AddressBook{}, &model.Setmeal{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		t.Fatalf("acquire sql.DB: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	if err := gdb.Create(&model.Category{ID: 1, Name: "热销", Type: 1, Sort: 0, Status: 1}).Error; err != nil {
		t.Fatalf("seed category: %v", err)
	}
	dishSeed := &model.Dish{
		ID: 1, Name: "宫保鸡丁", CategoryID: 1, Price: 38.0, Status: 1, Rating: 4.7, Sales: 100,
	}
	if err := gdb.Create(dishSeed).Error; err != nil {
		t.Fatalf("seed dish: %v", err)
	}

	secret := "dish-itest-secret"
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
		iter := rdb.Client.Scan(ctx, 0, keyNs+"*", 1000).Iterator()
		for iter.Next(ctx) {
			rdb.Client.Del(ctx, iter.Val())
		}
		rlIter := rdb.Client.Scan(ctx, 0, "rate_limit:ip:*", 1000).Iterator()
		for rlIter.Next(ctx) {
			rdb.Client.Del(ctx, rlIter.Val())
		}
		// Clean up stock keys touched by dish list/update tests.
		for _, k := range []string{"dish:1:stock", "dish:1:lock"} {
			rdb.Del(ctx, k)
		}
		_ = rdb.Close()
	})

	return &dishFixture{router: r, rdb: rdb, keyNs: keyNs, secret: secret}
}

func signToken(t *testing.T, secret string, userID int, tokenType string) string {
	t.Helper()
	claims := jwt.MapClaims{
		"sub":  float64(userID),
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

func (f *dishFixture) do(method, path, token string, body any) *httptest.ResponseRecorder {
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

// TestPriceHistoryUsesRealHandler writes a snapshot into the production
// price-history key and verifies the read endpoint surfaces it.
func TestPriceHistoryUsesRealHandler(t *testing.T) {
	f := newDishFixture(t)
	ctx := context.Background()

	key := "price:history:1"
	ts := time.Now().Unix()
	f.rdb.ZAdd(ctx, key, redisZ(ts, 42.0))
	t.Cleanup(func() { f.rdb.Del(ctx, key) })

	token := signToken(t, f.secret, 1, "admin")
	resp := f.do(http.MethodGet, "/api/v1/dishes/1/price-history", token, nil)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	var body struct {
		Data []struct {
			Timestamp int64   `json:"timestamp"`
			Price     float64 `json:"price"`
		} `json:"data"`
		Dish struct {
			ID int `json:"id"`
		} `json:"dish"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Data) == 0 {
		t.Fatalf("expected at least one entry, got none")
	}
	found := false
	for _, e := range body.Data {
		if e.Timestamp == ts && e.Price == 42.0 {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("seeded entry (ts=%d price=42.0) missing from response %+v", ts, body.Data)
	}
	if body.Dish.ID != 1 {
		t.Fatalf("expected dish id 1, got %d", body.Dish.ID)
	}
}

// TestPriceHistoryRequiresJWTAuth confirms the route is JWT-protected.
func TestPriceHistoryRequiresJWTAuth(t *testing.T) {
	f := newDishFixture(t)
	resp := f.do(http.MethodGet, "/api/v1/dishes/1/price-history", "", nil)
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", resp.Code, resp.Body.String())
	}
}

// TestDishListInitialisesStockForEachDish asserts the GetDishes handler
// seeds a 100-unit stock counter in Redis for every dish.
func TestDishListInitialisesStockForEachDish(t *testing.T) {
	f := newDishFixture(t)
	ctx := context.Background()

	token := signToken(t, f.secret, 1, "admin")
	resp := f.do(http.MethodGet, "/api/v1/dishes", token, nil)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}

	stock, err := f.rdb.Get(ctx, "dish:1:stock").Int64()
	if err != nil {
		t.Fatalf("expected dish:1:stock to be set, got error: %v", err)
	}
	if stock != 100 {
		t.Fatalf("expected initial stock 100, got %d", stock)
	}
}

// redisZ builds a Redis sorted-set member for the price-history tests.
func redisZ(score int64, price float64) redis.Z {
	return redis.Z{Score: float64(score), Member: fmt.Sprintf("%.2f@%d", price, score)}
}

// Reference to suppress unused import when only one of the helpers is used.
var _ = dish.NewHandler
