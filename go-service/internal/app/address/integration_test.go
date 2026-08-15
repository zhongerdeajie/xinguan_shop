// Package address_test covers the address book endpoints end-to-end.
package address_test

import (
	"bytes"
	"context"
	"encoding/json"
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

type addressFixture struct {
	router *gin.Engine
	rdb    *pkgredis.Client
	db     *gorm.DB
	secret string
	userID int
}

func newAddressFixture(t *testing.T) *addressFixture {
	t.Helper()
	addr := os.Getenv("TEST_REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}
	rdb, err := pkgredis.NewClient(config.RedisConfig{Addr: addr, DB: 10})
	if err != nil {
		t.Skipf("Redis not reachable at %s: %v", addr, err)
	}

	path := t.TempDir() + "/address.db"
	gdb, err := gorm.Open(sqlite.Open(path+"?_busy_timeout=5000&_fk=1"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := gdb.AutoMigrate(&model.User{}, &model.AddressBook{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		t.Fatalf("acquire sql.DB: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	secret := "address-itest-secret"
	userID := 11
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
		rlIter := rdb.Client.Scan(ctx, 0, "rate_limit:ip:*", 1000).Iterator()
		for rlIter.Next(ctx) {
			rdb.Client.Del(ctx, rlIter.Val())
		}
		_ = rdb.Close()
	})

	return &addressFixture{router: r, rdb: rdb, db: gdb, secret: secret, userID: userID}
}

func (f *addressFixture) token(t *testing.T) string {
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

func (f *addressFixture) do(method, path, token string, body any) *httptest.ResponseRecorder {
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

// TestCreateAndListAddress verifies the create + list flow scoped to the
// authenticated user.
func TestCreateAndListAddress(t *testing.T) {
	f := newAddressFixture(t)
	tok := f.token(t)

	resp := f.do(http.MethodPost, "/api/v1/addresses", tok, map[string]any{
		"consignee":    "李四",
		"phone":        "13800000001",
		"provinceName": "上海市",
		"cityName":     "上海市",
		"districtName": "浦东新区",
		"detail":       "世纪大道1号",
		"isDefault":    1,
	})
	if resp.Code != http.StatusOK {
		t.Fatalf("create: %d %s", resp.Code, resp.Body.String())
	}

	listResp := f.do(http.MethodGet, "/api/v1/addresses", tok, nil)
	if listResp.Code != http.StatusOK {
		t.Fatalf("list: %d %s", listResp.Code, listResp.Body.String())
	}
	var body struct {
		Data []struct {
			ID        int    `json:"ID"`
			Consignee string `json:"Consignee"`
			UserID    int    `json:"UserID"`
			IsDefault int    `json:"IsDefault"`
		} `json:"data"`
	}
	if err := json.Unmarshal(listResp.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Data) != 1 {
		t.Fatalf("expected 1 address, got %d", len(body.Data))
	}
	if body.Data[0].UserID != f.userID {
		t.Fatalf("address user_id=%d, expected %d", body.Data[0].UserID, f.userID)
	}
	if body.Data[0].IsDefault != 1 {
		t.Fatalf("expected IsDefault=1, got %d", body.Data[0].IsDefault)
	}
}

// TestAddressIsolatedBetweenUsers confirms each user only sees their own
// addresses and the create handler refuses to honour a different userId.
func TestAddressIsolatedBetweenUsers(t *testing.T) {
	f := newAddressFixture(t)
	other := 999

	// user A creates address but tries to override userId to other
	tokA := f.token(t)
	respA := f.do(http.MethodPost, "/api/v1/addresses", tokA, map[string]any{
		"consignee":    "李四",
		"phone":        "13800000001",
		"provinceName": "上海市",
		"cityName":     "上海市",
		"districtName": "浦东新区",
		"detail":       "世纪大道1号",
		"isDefault":    1,
		"userId":       other,
	})
	if respA.Code != http.StatusOK {
		t.Fatalf("create: %d %s", respA.Code, respA.Body.String())
	}

	var rows []model.AddressBook
	f.db.Find(&rows)
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	if rows[0].UserID == other {
		t.Fatalf("address was assigned to another user: %+v", rows[0])
	}
	if rows[0].UserID != f.userID {
		t.Fatalf("expected address user_id=%d, got %d", f.userID, rows[0].UserID)
	}
}

// TestUpdateStripsUserIDOverride confirms a partial update cannot escalate
// to another user's record.
func TestUpdateStripsUserIDOverride(t *testing.T) {
	f := newAddressFixture(t)
	tok := f.token(t)

	createResp := f.do(http.MethodPost, "/api/v1/addresses", tok, map[string]any{
		"consignee":    "李四",
		"phone":        "13800000001",
		"provinceName": "上海市",
		"cityName":     "上海市",
		"districtName": "浦东新区",
		"detail":       "世纪大道1号",
		"isDefault":    0,
	})
	if createResp.Code != http.StatusOK {
		t.Fatalf("create: %d", createResp.Code)
	}

	listResp := f.do(http.MethodGet, "/api/v1/addresses", tok, nil)
	var body struct {
		Data []struct {
			ID int `json:"ID"`
		} `json:"data"`
	}
	if err := json.Unmarshal(listResp.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(body.Data) == 0 {
		t.Fatalf("no address returned")
	}
	id := body.Data[0].ID

	updateResp := f.do(http.MethodPut, "/api/v1/addresses/"+itoa(id), tok, map[string]any{
		"detail":  "世纪大道88号",
		"userId":  999,
		"user_id": 999,
	})
	if updateResp.Code != http.StatusOK {
		t.Fatalf("update: %d %s", updateResp.Code, updateResp.Body.String())
	}

	var row model.AddressBook
	f.db.First(&row, id)
	if row.UserID != f.userID {
		t.Fatalf("user_id was changed to %d via update", row.UserID)
	}
	if row.Detail != "世纪大道88号" {
		t.Fatalf("expected detail to be updated, got %q", row.Detail)
	}
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	negative := i < 0
	if negative {
		i = -i
	}
	var buf [20]byte
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	if negative {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}
