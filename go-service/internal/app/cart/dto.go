package cart

// UpdateNumberDTO captures the new quantity for an existing cart line.
type UpdateNumberDTO struct {
	Number int `json:"number" binding:"required,min=1"`
}
