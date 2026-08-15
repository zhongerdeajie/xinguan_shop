package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// JWTAuth 校验 NestJS 签发的 Bearer JWT，并把可信身份写入当前请求上下文。
func JWTAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if secret == "" {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"message": "服务端未配置 JWT_SECRET",
			})
			return
		}

		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"message": "未登录：缺少 Authorization 头",
			})
			return
		}

		tokenString := strings.TrimPrefix(header, "Bearer ")
		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			if t.Method != jwt.SigningMethodHS256 {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"message": "token 无效或已过期",
			})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "token 身份信息无效"})
			return
		}
		sub, ok := claims["sub"].(float64)
		tokenType, typeOK := claims["type"].(string)
		if !ok || sub <= 0 || !typeOK || (tokenType != "admin" && tokenType != "customer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "token 缺少有效的 sub 或 type"})
			return
		}

		c.Set("userId", int(sub))
		c.Set("tokenType", tokenType)
		if username, ok := claims["username"].(string); ok {
			c.Set("username", username)
		}
		c.Next()
	}
}

// RequireTokenType 在验签之后检查调用者是否拥有当前路由要求的身份类型。
func RequireTokenType(allowed ...string) gin.HandlerFunc {
	allowedTypes := make(map[string]struct{}, len(allowed))
	for _, tokenType := range allowed {
		allowedTypes[tokenType] = struct{}{}
	}
	return func(c *gin.Context) {
		tokenType, ok := c.Get("tokenType")
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "未获取到登录身份"})
			return
		}
		if _, allowed := allowedTypes[tokenType.(string)]; !allowed {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"message": "当前身份无权访问此接口"})
			return
		}
		c.Next()
	}
}

// CurrentUserID 返回 JWT sub 对应的用户编号。
func CurrentUserID(c *gin.Context) (int, bool) {
	userID, ok := c.Get("userId")
	if !ok {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "未获取到用户身份"})
		return 0, false
	}
	id, ok := userID.(int)
	if !ok || id <= 0 {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "用户身份无效"})
		return 0, false
	}
	return id, true
}
