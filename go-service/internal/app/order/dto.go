package order

// PaginationQuery mirrors the order list query string.
type PaginationQuery struct {
	Page     int `form:"page"`
	PageSize int `form:"pageSize"`
	Status   int `form:"status"`
}
