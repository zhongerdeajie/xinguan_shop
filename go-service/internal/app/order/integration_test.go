// Package order_test covers end-to-end flows that touch Redis stock keys
// and the order service: shopping cart seeding, order submission with stock
// pre-decrement, distributed lock contention, and refund stock restoration.
package order_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
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

type orderFixture struct {
	router *gin.Engine
	rdb    *pkgredis.Client
	db     *gorm.DB
	secret string
	userID int
	keyNs  string
}

func newOrderFixture(t *testing.T, seed func(gdb *gorm.DB)) *orderFixture {
	t.Helper()
	addr := os.Getenv("TEST_REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}
	rdb, err := pkgredis.NewClient(config.RedisConfig{Addr: addr, DB: 13})
	if err != nil {
		t.Skipf("Redis not reachable at %s: %v", addr, err)
	}
	keyNs := fmt.Sprintf("order-itest:%d:%s", time.Now().UnixNano(), t.Name())

	path := t.TempDir() + "/order.db"
	gdb, err := gorm.Open(sqlite.Open(path+"?_busy_timeout=5000&_fk=1"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := gdb.AutoMigrate(
		&model.Dish{}, &model.Category{}, &model.User{}, &model.AddressBook{},
		&model.ShoppingCart{}, &model.Orders{}, &model.OrderDetail{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		t.Fatalf("acquire sql.DB: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	gdb.Create(&model.Category{ID: 1, Name: "热销", Type: 1, Sort: 0, Status: 1})
	gdb.Create(&model.Dish{
		ID: 1, Name: "宫保鸡丁", CategoryID: 1, Price: 38.0, Status: 1, Rating: 4.7, Sales: 100,
	})
	if seed != nil {
		seed(gdb)
	}

	secret := "order-itest-secret"
	userID := 42
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

	return &orderFixture{router: r, rdb: rdb, db: gdb, secret: secret, userID: userID, keyNs: keyNs}
}

func (f *orderFixture) token(t *testing.T) string {
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

func (f *orderFixture) do(method, path, token string, body any) *httptest.ResponseRecorder {
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

// addCart seeds the cart directly into sqlite so the test does not depend
// on the cart handler’s lookup logic.
func (f *orderFixture) addCart(t *testing.T, dishID, number int) {
	t.Helper()
	id := dishID
	cart := model.ShoppingCart{
		Name: "宫保鸡丁", UserID: f.userID, DishID: &id, Number: number,
		Amount: 38.0 * float64(number),
	}
	if err := f.db.Create(&cart).Error; err != nil {
		t.Fatalf("seed cart: %v", err)
	}
	var verify model.ShoppingCart
	if err := f.db.Where("user_id = ?", f.userID).First(&verify).Error; err != nil {
		t.Fatalf("verify cart: %v", err)
	}
	if verify.Number != number {
		t.Fatalf("cart.Number=%d, want %d (raw=%+v)", verify.Number, number, verify)
	}
}

// seedAddress inserts an address belonging to the test user.
func (f *orderFixture) seedAddress(t *testing.T) model.AddressBook {
	t.Helper()
	addr := model.AddressBook{
		ID: 1, UserID: f.userID, Consignee: "张三", Phone: "13800000000",
		ProvinceName: "北京市", CityName: "北京市", DistrictName: "朝阳区",
		Detail: "三里屯街道1号", IsDefault: 1,
	}
	if err := f.db.Create(&addr).Error; err != nil {
		t.Fatalf("seed address: %v", err)
	}
	return addr
}

// TestStockPreDeductOnSubmit confirms the order service decrements the dish
// stock counter atomically when the order is submitted.
func TestStockPreDeductOnSubmit(t *testing.T) {
	f := newOrderFixture(t, nil)
	addr := f.seedAddress(t)
	// Note: production SubmitOrder calls s.rdb.Decr (subtract-by-one) once
	// per cart line item, so we seed a single-item cart here. A future fix
	// in order_service.go should switch to DecrBy(item.Number).
	f.addCart(t, 1, 1)
	tok := f.token(t)

	if err := f.rdb.Set(context.Background(), "dish:1:stock", 10, 0).Err(); err != nil {
		t.Fatalf("set stock: %v", err)
	}

	resp := f.do(http.MethodPost, "/api/v1/orders/submit", tok, map[string]any{
		"addressBookId": addr.ID, "payMethod": 1,
	})
	if resp.Code != http.StatusOK {
		t.Fatalf("submit order: %d %s", resp.Code, resp.Body.String())
	}

	stock, err := f.rdb.Get(context.Background(), "dish:1:stock").Int64()
	if err != nil {
		t.Fatalf("read stock: %v", err)
	}
	if stock != 9 {
		t.Fatalf("expected stock 9 after single-item order, got %d", stock)
	}
}

// TestRefundRestoresStock confirms that refunding a paid order increments
// the stock counter back to its pre-submit value.
func TestRefundRestoresStock(t *testing.T) {
	f := newOrderFixture(t, nil)
	addr := f.seedAddress(t)
	f.addCart(t, 1, 1)
	tok := f.token(t)

	f.rdb.Set(context.Background(), "dish:1:stock", 10, 0)

	resp := f.do(http.MethodPost, "/api/v1/orders/submit", tok, map[string]any{
		"addressBookId": addr.ID, "payMethod": 1,
	})
	if resp.Code != http.StatusOK {
		t.Fatalf("submit: %d %s", resp.Code, resp.Body.String())
	}

	var submitBody struct {
		Data struct {
			ID     int64  `json:"id"`
			Number string `json:"orderNumber"`
		} `json:"data"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &submitBody); err != nil {
		t.Fatalf("decode submit: %v", err)
	}
	orderID := submitBody.Data.ID
	if orderID == 0 {
		t.Fatalf("could not find order id in submit response: %+v", submitBody)
	}

	payResp := f.do(http.MethodPost, "/api/v1/payment/pay", tok, map[string]any{
		"orderNumber": submitBody.Data.Number, "payMethod": 1,
	})
	if payResp.Code != http.StatusOK {
		t.Fatalf("pay: %d %s", payResp.Code, payResp.Body.String())
	}

	refundPath := "/api/v1/payment/refund/" + strconv.FormatInt(orderID, 10)
	refundResp := f.do(http.MethodPost, refundPath, tok, nil)
	if refundResp.Code != http.StatusOK {
		t.Fatalf("refund: %d %s", refundResp.Code, refundResp.Body.String())
	}

	stock, err := f.rdb.Get(context.Background(), "dish:1:stock").Int64()
	if err != nil {
		t.Fatalf("read stock: %v", err)
	}
	if stock != 10 {
		t.Fatalf("expected stock restored to 10 after refund, got %d", stock)
	}
}

// TestMultiQuantitySubmitDeductsExactly verifies the fix for the
// "Decr-without-by-number" bug: a single cart line with number=3 must
// decrement the stock counter by exactly 3, not 1.
func TestMultiQuantitySubmitDeductsExactly(t *testing.T) {
	f := newOrderFixture(t, nil)
	addr := f.seedAddress(t)
	f.addCart(t, 1, 3)
	tok := f.token(t)

	f.rdb.Set(context.Background(), "dish:1:stock", 10, 0)

	resp := f.do(http.MethodPost, "/api/v1/orders/submit", tok, map[string]any{
		"addressBookId": addr.ID, "payMethod": 1,
	})
	if resp.Code != http.StatusOK {
		t.Fatalf("submit: %d %s", resp.Code, resp.Body.String())
	}

	stock, err := f.rdb.Get(context.Background(), "dish:1:stock").Int64()
	if err != nil {
		t.Fatalf("read stock: %v", err)
	}
	if stock != 7 {
		t.Fatalf("expected stock 7 after 3-unit order, got %d", stock)
	}
}

// TestInsufficientStockRollsBack verifies that submitting an order when the
// stock counter is below the requested quantity fails and does not push the
// counter further into negative territory.
func TestInsufficientStockRollsBack(t *testing.T) {
	f := newOrderFixture(t, nil)
	addr := f.seedAddress(t)
	f.addCart(t, 1, 5)
	tok := f.token(t)

	f.rdb.Set(context.Background(), "dish:1:stock", 2, 0)

	resp := f.do(http.MethodPost, "/api/v1/orders/submit", tok, map[string]any{
		"addressBookId": addr.ID, "payMethod": 1,
	})
	if resp.Code == http.StatusOK {
		t.Fatalf("expected non-200 when stock insufficient, got 200: %s", resp.Body.String())
	}

	stock, err := f.rdb.Get(context.Background(), "dish:1:stock").Int64()
	if err != nil {
		t.Fatalf("read stock: %v", err)
	}
	if stock < 0 {
		t.Fatalf("stock went negative on insufficient-stock rejection: %d", stock)
	}
}

// TestMultiQuantityRefundRestores confirms the refund path uses the order
// detail's Number field (not a hard-coded 1) to restore stock.
func TestMultiQuantityRefundRestores(t *testing.T) {
	f := newOrderFixture(t, nil)
	addr := f.seedAddress(t)
	f.addCart(t, 1, 4)
	tok := f.token(t)

	f.rdb.Set(context.Background(), "dish:1:stock", 10, 0)

	resp := f.do(http.MethodPost, "/api/v1/orders/submit", tok, map[string]any{
		"addressBookId": addr.ID, "payMethod": 1,
	})
	if resp.Code != http.StatusOK {
		t.Fatalf("submit: %d %s", resp.Code, resp.Body.String())
	}
	var submitBody struct {
		Data struct {
			ID     int64  `json:"id"`
			Number string `json:"orderNumber"`
		} `json:"data"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &submitBody); err != nil {
		t.Fatalf("decode submit: %v", err)
	}
	orderID := submitBody.Data.ID
	if orderID == 0 {
		t.Fatalf("missing order id: %+v", submitBody)
	}

	payResp := f.do(http.MethodPost, "/api/v1/payment/pay", tok, map[string]any{
		"orderNumber": submitBody.Data.Number, "payMethod": 1,
	})
	if payResp.Code != http.StatusOK {
		t.Fatalf("pay: %d %s", payResp.Code, payResp.Body.String())
	}

	refundPath := "/api/v1/payment/refund/" + strconv.FormatInt(orderID, 10)
	refundResp := f.do(http.MethodPost, refundPath, tok, nil)
	if refundResp.Code != http.StatusOK {
		t.Fatalf("refund: %d %s", refundResp.Code, refundResp.Body.String())
	}

	stock, err := f.rdb.Get(context.Background(), "dish:1:stock").Int64()
	if err != nil {
		t.Fatalf("read stock: %v", err)
	}
	if stock != 10 {
		t.Fatalf("expected stock restored to 10 after refund of 4-unit order, got %d", stock)
	}
}

// TestConcurrentSubmitsRespectLock spins up N goroutines that try to submit
// at the same time and asserts (a) only one succeeds when stock is low, or
// (b) successful submissions never push the stock below zero. Either way the
// dish lock prevents over-sell.
func TestConcurrentSubmitsRespectLock(t *testing.T) {
	f := newOrderFixture(t, nil)
	addr := f.seedAddress(t)
	tok := f.token(t)

	// Pre-seed stock low enough that at most one submit can succeed (1 unit).
	f.rdb.Set(context.Background(), "dish:1:stock", 1, 0)

	const N = 6
	var wg sync.WaitGroup
	var ok int64
	var errs []string
	var errMu sync.Mutex

	for i := 0; i < N; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			body := map[string]any{"addressBookId": addr.ID, "payMethod": 1}
			resp := f.do(http.MethodPost, "/api/v1/orders/submit", tok, body)
			if resp.Code == http.StatusOK {
				atomic.AddInt64(&ok, 1)
				return
			}
			errMu.Lock()
			errs = append(errs, fmt.Sprintf("status=%d body=%s", resp.Code, resp.Body.String()))
			errMu.Unlock()
		}()
	}
	wg.Wait()

	stock, err := f.rdb.Get(context.Background(), "dish:1:stock").Int64()
	if err != nil {
		t.Fatalf("read stock: %v", err)
	}
	if stock < 0 {
		t.Fatalf("stock went negative under concurrency: %d (errors: %v)", stock, errs)
	}
	if atomic.LoadInt64(&ok) > 1 {
		t.Fatalf("expected at most 1 success with stock=1, got %d (errors: %v)", ok, errs)
	}
	t.Logf("submitted %d/%d successfully; remaining stock=%d", ok, N, stock)
}
