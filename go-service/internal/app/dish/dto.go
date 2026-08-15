package dish

// UpdateDishDTO is a partial-update proxy kept as a map for backward
// compatibility; production handlers use ShouldBindJSON against
// map[string]interface{} so the same JSON shape keeps working.
type UpdateDishDTO = map[string]interface{}

// PriceHistoryEntry is the per-snapshot shape returned by PriceHistory.
type PriceHistoryEntry struct {
	Timestamp int64   `json:"timestamp"`
	Price     float64 `json:"price"`
}
