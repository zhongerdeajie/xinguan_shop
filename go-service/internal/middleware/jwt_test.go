package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const testJWTSecret = "test-secret"

func signedToken(t *testing.T, userID int, tokenType string) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":      userID,
		"username": "tester",
		"type":     tokenType,
		"exp":      time.Now().Add(time.Hour).Unix(),
	})
	signed, err := token.SignedString([]byte(testJWTSecret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

func performRequest(token string, allowedType string, spoofedUserID string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(JWTAuth(testJWTSecret), RequireTokenType(allowedType))
	router.GET("/resource", func(c *gin.Context) {
		userID, ok := CurrentUserID(c)
		if !ok {
			return
		}
		c.JSON(http.StatusOK, gin.H{"userId": userID})
	})

	req := httptest.NewRequest(http.MethodGet, "/resource", nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if spoofedUserID != "" {
		req.Header.Set("X-User-Id", spoofedUserID)
	}
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	return resp
}

func TestCustomerTokenUsesSubjectAndIgnoresSpoofedHeader(t *testing.T) {
	resp := performRequest(signedToken(t, 27, "customer"), "customer", "999")
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	if body := resp.Body.String(); body != "{\"userId\":27}" {
		t.Fatalf("expected JWT subject user 27, got %s", body)
	}
}

func TestAdminCannotAccessCustomerRoute(t *testing.T) {
	resp := performRequest(signedToken(t, 1, "admin"), "customer", "")
	if resp.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestCustomerCannotAccessAdminRoute(t *testing.T) {
	resp := performRequest(signedToken(t, 27, "customer"), "admin", "")
	if resp.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestMissingTokenIsUnauthorized(t *testing.T) {
	resp := performRequest("", "customer", "27")
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", resp.Code, resp.Body.String())
	}
}
