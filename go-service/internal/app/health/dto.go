package health

// HealthResponse is the response body for /health.
type HealthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
}
