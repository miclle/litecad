// Package entity provides data models and domain types.
package entity

import (
	"time"

	"gorm.io/gorm"
)

// User is an application account that can sign in to LiteCAD.
type User struct {
	ID           string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	Name         string         `gorm:"size:120;not null" json:"name"`
	Email        string         `gorm:"size:320;uniqueIndex;not null" json:"email"`
	PasswordHash string         `gorm:"size:255;not null" json:"-"`
}

// UserSession stores a digest of an auth token issued to a browser.
type UserSession struct {
	ID        string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	UserID    string         `gorm:"size:32;index;not null" json:"user_id"`
	TokenHash string         `gorm:"size:64;uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time      `gorm:"index;not null" json:"expires_at"`
	User      User           `gorm:"foreignKey:UserID" json:"user"`
}

// Project is a user-owned LiteCAD workspace for CAD exploration.
type Project struct {
	ID          string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	OwnerUserID string         `gorm:"size:32;index;not null" json:"owner_user_id"`
	Name        string         `gorm:"size:120;not null" json:"name"`
	Description string         `gorm:"type:text" json:"description"`
	Owner       User           `gorm:"foreignKey:OwnerUserID" json:"owner"`
}
