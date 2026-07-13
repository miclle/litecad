// Package service provides business logic and database operations.
package service

import (
	"context"
	"fmt"
	"time"

	"github.com/fox-gonic/fox/logger"
	"gorm.io/gorm"
)

// Service holds the database connection and provides business logic methods.
type Service struct {
	db       *gorm.DB
	aiClient AIClient
	now      func() time.Time
}

// New creates a new Service instance with the given database handle.
func New(ctx context.Context, db *gorm.DB, options ...Option) (*Service, error) {
	return newService(ctx, db, options...)
}

// Option configures a Service dependency.
type Option func(*Service)

// WithAIClient configures the optional AI chat client.
func WithAIClient(client AIClient) Option {
	return func(s *Service) {
		s.aiClient = client
	}
}

// WithClock configures the clock used by time-sensitive service logic.
func WithClock(now func() time.Time) Option {
	return func(s *Service) {
		if now != nil {
			s.now = now
		}
	}
}

func newService(ctx context.Context, db *gorm.DB, options ...Option) (*Service, error) {
	l := logger.NewWithContext(ctx)

	if db == nil {
		return nil, fmt.Errorf("db handle is required")
	}

	l.Info("[Service] initialized")

	svc := &Service{
		db:  db,
		now: time.Now,
	}
	for _, option := range options {
		if option != nil {
			option(svc)
		}
	}
	return svc, nil
}

// DB returns the underlying GORM database connection.
func (s *Service) DB() *gorm.DB {
	return s.db
}
