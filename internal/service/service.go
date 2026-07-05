// Package service provides business logic and database operations.
package service

import (
	"context"
	"fmt"

	"github.com/fox-gonic/fox/logger"
	"gorm.io/gorm"
)

// Service holds the database connection and provides business logic methods.
type Service struct {
	db               *gorm.DB
	previewConverter ModelPreviewConverter
}

// New creates a new Service instance with the given database handle.
func New(ctx context.Context, db *gorm.DB) (*Service, error) {
	return NewWithPreviewConverter(ctx, db, NewFreeCADPreviewConverter())
}

// NewWithPreviewConverter creates a Service with an explicit preview converter.
func NewWithPreviewConverter(ctx context.Context, db *gorm.DB, converter ModelPreviewConverter) (*Service, error) {
	l := logger.NewWithContext(ctx)

	if db == nil {
		return nil, fmt.Errorf("db handle is required")
	}
	if converter == nil {
		converter = NewFreeCADPreviewConverter()
	}

	l.Info("[Service] initialized")

	return &Service{db: db, previewConverter: converter}, nil
}

// DB returns the underlying GORM database connection.
func (s *Service) DB() *gorm.DB {
	return s.db
}
