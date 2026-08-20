// Package app wires per-business HTTP handlers into a single Gin engine.
//
// Each subpackage (employee, dish, setmeal, user, address, cart, order,
// payment, health) exposes a Handler with the dependencies it actually
// needs. router.go composes them onto a shared gin.Engine.
package app

import (
	"github.com/gin-gonic/gin"

	"go-service/internal/app/address"
	"go-service/internal/app/appdeps"
	"go-service/internal/app/cart"
	"go-service/internal/app/dish"
	"go-service/internal/app/employee"
	"go-service/internal/app/health"
	"go-service/internal/app/order"
	"go-service/internal/app/payment"
	"go-service/internal/app/review"
	"go-service/internal/app/setmeal"
	"go-service/internal/app/user"
	"go-service/internal/middleware"
)

// Register mounts every business subpackage onto r. The wiring order matches
// the original main route table (admin/customer split, shared auth, etc.).
func Register(r *gin.Engine, d appdeps.Deps) {
	svcs := appdeps.NewServices(d)

	api := r.Group("/api")
	v1 := api.Group("/v1")

	// Public health probe stays reachable for monitoring without a token.
	publicHealth := health.NewHandler(d.DB)
	v1.GET("/health", publicHealth.Health)

	// All non-health routes go through the JWT middleware first.
	auth := v1.Group("")
	auth.Use(middleware.JWTAuth(d.JWTSecret))

	admin := auth.Group("")
	admin.Use(middleware.RequireTokenType("admin"))
	{
		employeeH := employee.NewHandler(d.DB, svcs)
		employees := admin.Group("/employees")
		{
			employees.GET("", employeeH.List)
			employees.POST("", employeeH.Create)
			employees.PUT("/:id", employeeH.Update)
			employees.DELETE("/:id", employeeH.Delete)
		}

		dishAdminH := dish.NewHandler(d.DB, d.Redis, svcs)
		admin.POST("/dishes", dishAdminH.Create)
		admin.PUT("/dishes/:id", dishAdminH.Update)
		admin.DELETE("/dishes/:id", dishAdminH.Delete)

		setmealAdminH := setmeal.NewHandler(d.DB, svcs)
		admin.POST("/setmeals", setmealAdminH.Create)
		admin.PUT("/setmeals/:id", setmealAdminH.Update)
		admin.DELETE("/setmeals/:id", setmealAdminH.Delete)

		userH := user.NewHandler(d.DB, svcs)
		users := admin.Group("/users")
		{
			users.GET("", userH.List)
			users.POST("", userH.Create)
			users.GET("/:id", userH.GetByID)
			users.PUT("/:id", userH.Update)
		}
	}

	// Shared auth endpoints (admin + customer).
	dishH := dish.NewHandler(d.DB, d.Redis, svcs)
	auth.GET("/dishes", dishH.List)
	auth.GET("/dishes/:id", dishH.Detail)
	auth.GET("/dishes/:id/price-history", dishH.PriceHistory)
	setmealH := setmeal.NewHandler(d.DB, svcs)
	auth.GET("/setmeals", setmealH.List)
	authH := health.NewHandler(d.DB)
	auth.GET("/categories", authH.Categories)

	// 菜品评价: 公开查某菜品的评价
	// 注意: 必须用 :id 与已有 /dishes/:id 保持同层同名通配符, 否则 Gin 报路由冲突
	reviewH := review.NewHandler(d.DB, svcs)
	auth.GET("/dishes/:id/reviews", reviewH.List)

	customer := auth.Group("")
	customer.Use(middleware.RequireTokenType("customer"))
	{
		addressH := address.NewHandler(d.DB, svcs)
		addresses := customer.Group("/addresses")
		{
			addresses.POST("", addressH.Create)
			addresses.GET("", addressH.List)
			addresses.PUT("/:id", addressH.Update)
			addresses.DELETE("/:id", addressH.Delete)
			addresses.PUT("/default/:id", addressH.SetDefault)
		}

		cartH := cart.NewHandler(svcs)
		cartG := customer.Group("/cart")
		{
			cartG.POST("/add", cartH.Add)
			cartG.GET("", cartH.List)
			cartG.PUT("/:id", cartH.Update)
			cartG.DELETE("/:id", cartH.DeleteItem)
			cartG.DELETE("", cartH.Clear)
		}

		orderH := order.NewHandler(svcs)
		orders := customer.Group("/orders")
		{
			orders.POST("/submit", orderH.Submit)
			orders.GET("", orderH.List)
			orders.GET("/:id", orderH.Detail)
			orders.PUT("/cancel", orderH.Cancel)
		}

		paymentH := payment.NewHandler(svcs)
		paymentG := customer.Group("/payment")
		{
			paymentG.POST("/pay", paymentH.Pay)
			paymentG.POST("/refund/:orderId", paymentH.Refund)
		}

		// 顾客提交菜品评价
		reviewH := review.NewHandler(d.DB, svcs)
		customer.POST("/reviews", reviewH.Create)
	}
}
