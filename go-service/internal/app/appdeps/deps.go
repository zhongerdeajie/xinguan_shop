// Package appdeps holds the cross-package types (Deps, Services) so the
// app router and individual subpackages can share them without forming an
// import cycle.
package appdeps

import (
	pkgmysql "go-service/internal/pkg/mysql"
	pkgredis "go-service/internal/pkg/redis"
	"go-service/internal/repository"
	"go-service/internal/service"
)

// Deps carries every long-lived dependency a handler may need. Individual
// subpackage handlers accept only the fields they use so a missing or future
// dependency does not ripple through the codebase.
type Deps struct {
	DB        *pkgmysql.DB
	Redis     *pkgredis.Client
	JWTSecret string
}

// Services bundles the service-layer instances shared across handlers. We
// build it once so subpackages can borrow individual services without each
// constructing their own repository.
type Services struct {
	Write *service.WriteService
	Order *service.OrderService
}

// NewServices is the single place where the repository and services are
// assembled. router.go calls it once and hands the resulting Services to the
// subpackage handlers.
func NewServices(d Deps) Services {
	repo := repository.NewWriteRepository(d.DB, d.Redis)
	return Services{
		Write: service.NewWriteService(repo, d.Redis),
		Order: service.NewOrderService(repo, d.Redis),
	}
}
