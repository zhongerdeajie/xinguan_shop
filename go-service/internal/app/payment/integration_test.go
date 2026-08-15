// Package payment_test exercises the pay and refund endpoints against a
// real Redis container and a per-test sqlite database.
package payment_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
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

type paymentFixture struct {
	router *gin.Engine
	rdb    *pkgredis.Client
	db     *gorm.DB
	secret string
	userID int
}

func newPaymentFixture(t *testing.T) *paymentFixture {
	t.Helper()
	addr := os.Getenv("TEST_REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}
	rdb, err := pkgredis.NewClient(config.RedisConfig{Addr: addr, DB: 11})
	if err != nil {
		t.Skipf("Redis not reachable at %s: %v", addr, err)
	}

	path := t.TempDir() + "/payment.db"
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
	gdb.Create(&model.Dish{ID: 1, Name: "宫保鸡丁", CategoryID: 1, Price: 38.0, Status: 1})

	secret := "payment-itest-secret"
	userID := 33
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

	return &paymentFixture{router: r, rdb: rdb, db: gdb, secret: secret, userID: userID}
}

func (f *paymentFixture) token(t *testing.T) string {
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

func (f *paymentFixture) do(method, path, token string, body any) *httptest.ResponseRecorder {
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

// seedOrder creates a paid order via the production handlers so the
// payment test operates on the same code path as running services.
func (f *paymentFixture) seedOrder(t *testing.T) (orderID int64, orderNumber string) {
	t.Helper()
	tok := f.token(t)

	addr := model.AddressBook{
		ID: 1, UserID: f.userID, Consignee: "张三", Phone: "13800000000",
		ProvinceName: "北京市", CityName: "北京市", DistrictName: "朝阳区",
		Detail: "三里屯街道1号", IsDefault: 1,
	}
	if err := f.db.Create(&addr).Error; err != nil {
		t.Fatalf("seed addr: %v", err)
	}

	dishID := 1
	cart := model.ShoppingCart{
		Name: "宫保鸡丁", UserID: f.userID, DishID: &dishID,
		Number: 1, Amount: 38.0,
	}
	if err := f.db.Create(&cart).Error; err != nil {
		t.Fatalf("seed cart: %v", err)
	}

	f.rdb.Set(context.Background(), "dish:1:stock", 10, 0)

	resp := f.do(http.MethodPost, "/api/v1/orders/submit", tok, map[string]any{
		"addressBookId": addr.ID, "payMethod": 1,
	})
	if resp.Code != http.StatusOK {
		t.Fatalf("submit: %d %s", resp.Code, resp.Body.String())
	}
	var body struct {
		Data struct {
			ID     int64  `json:"id"`
			Number string `json:"orderNumber"`
		} `json:"data"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Data.ID == 0 {
		t.Fatalf("missing order id")
	}

	payResp := f.do(http.MethodPost, "/api/v1/payment/pay", tok, map[string]any{
		"orderNumber": body.Data.Number, "payMethod": 1,
	})
	if payResp.Code != http.StatusOK {
		t.Fatalf("pay: %d %s", payResp.Code, payResp.Body.String())
	}
	return body.Data.ID, body.Data.Number
}

// TestPayTwiceRejects confirms the Pay endpoint refuses to re-pay a
// non-pending order.
func TestPayTwiceRejects(t *testing.T) {
	f := newPaymentFixture(t)
	_, orderNumber := f.seedOrder(t)
	tok := f.token(t)

	resp := f.do(http.MethodPost, "/api/v1/payment/pay", tok, map[string]any{
		"orderNumber": orderNumber, "payMethod": 1,
	})
	if resp.Code == http.StatusOK {
		t.Fatalf("expected non-200 on second pay, got 200: %s", resp.Body.String())
	}
}

// TestRefundUnpaidOrderRejects confirms RefundOrder refuses non-paid orders.
func TestRefundUnpaidOrderRejects(t *testing.T) {
	f := newPaymentFixture(t)
	tok := f.token(t)

	addr := model.AddressBook{
		ID: 1, UserID: f.userID, Consignee: "张三", Phone: "13800000000",
		ProvinceName: "北京市", CityName: "北京市", DistrictName: "朝阳区",
		Detail: "三里屯街道1号", IsDefault: 1,
	}
	if err := f.db.Create(&addr).Error; err != nil {
		t.Fatalf("seed addr: %v", err)
	}
	dishID := 1
	if err := f.db.Create(&model.ShoppingCart{
		Name: "宫保鸡丁", UserID: f.userID, DishID: &dishID, Number: 1, Amount: 38.0,
	}).Error; err != nil {
		t.Fatalf("seed cart: %v", err)
	}
	f.rdb.Set(context.Background(), "dish:1:stock", 10, 0)

	resp := f.do(http.MethodPost, "/api/v1/orders/submit", tok, map[string]any{
		"addressBookId": addr.ID, "payMethod": 1,
	})
	var body struct {
		Data struct {
			ID int64 `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}

	// Skip paying, go straight to refund.
	refundPath := "/api/v1/payment/refund/" + strconv.FormatInt(body.Data.ID, 10)
	refundResp := f.do(http.MethodPost, refundPath, tok, nil)
	if refundResp.Code == http.StatusOK {
		t.Fatalf("expected non-200 on unpaid refund, got 200: %s", refundResp.Body.String())
	}
}

// TestRefundInvalidOrderIDRejects confirms the Refund endpoint returns 400
// for a non-numeric order id (defensive routing check).
func TestRefundInvalidOrderIDRejects(t *testing.T) {
	f := newPaymentFixture(t)
	tok := f.token(t)

	resp := f.do(http.MethodPost, "/api/v1/payment/refund/not-a-number", tok, nil)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", resp.Code, resp.Body.String())
	}
}
