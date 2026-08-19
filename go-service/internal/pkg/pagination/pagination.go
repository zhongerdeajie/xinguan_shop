// Package pagination provides shared pagination + masking helpers for HTTP handlers.
package pagination

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// MaxPageSize caps how many rows a single list request can return.
// Prevents a malicious or careless ?pageSize=100000 from OOMing the server.
const MaxPageSize = 100

// DefaultPageSize is used when the caller doesn't pass ?pageSize.
const DefaultPageSize = 20

// ParsePaging reads ?page and ?pageSize from the query string and clamps them.
// page starts at 1; pageSize is capped at MaxPageSize.
// Returns (offset, limit) suitable for GORM Offset(...).Limit(...).
func ParsePaging(c *gin.Context) (offset int, limit int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	limit, _ = strconv.Atoi(c.DefaultQuery("pageSize", strconv.Itoa(DefaultPageSize)))
	if limit < 1 {
		limit = DefaultPageSize
	}
	if limit > MaxPageSize {
		limit = MaxPageSize
	}
	offset = (page - 1) * limit
	return offset, limit
}

// MaskIDNumber masks a Chinese ID number, keeping only the first 6 and last 4
// digits. e.g. "110101199001011234" -> "110101********1234".
// Empty input returns empty string.
func MaskIDNumber(s string) string {
	if len(s) <= 10 {
		// Too short to safely mask without revealing too much; mask everything
		// except the last 2 chars.
		if len(s) <= 2 {
			return strings.Repeat("*", len(s))
		}
		return strings.Repeat("*", len(s)-2) + s[len(s)-2:]
	}
	return s[:6] + strings.Repeat("*", len(s)-10) + s[len(s)-4:]
}