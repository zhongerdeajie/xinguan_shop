package employee

// CreateEmployeeDTO mirrors model.Employee but is reserved for future
// validation tags (e.g. binding:"required,min=1"). Kept as a distinct type
// so handler signatures stay stable when business rules evolve.
type CreateEmployeeDTO struct {
	Name     string `json:"name" binding:"required"`
	Username string `json:"username" binding:"required,min=3"`
	Password string `json:"password" binding:"required,min=6"`
	Phone    string `json:"phone"`
	Sex      string `json:"sex"`
	IDNumber string `json:"idNumber"`
	Status   *int   `json:"status"`
}

// UpdateEmployeeDTO is intentionally a map[string]interface{} proxy for now
// to preserve the original partial-update behaviour without forcing a
// breaking migration.
type UpdateEmployeeDTO = map[string]interface{}
