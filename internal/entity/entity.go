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

// ProjectModel is an uploaded CAD source file attached to a project.
type ProjectModel struct {
	ID               string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	ProjectID        string         `gorm:"size:32;index;not null" json:"project_id"`
	OriginalFilename string         `gorm:"size:255;not null" json:"original_filename"`
	Format           string         `gorm:"size:16;index;not null" json:"format"`
	ContentType      string         `gorm:"size:120" json:"content_type"`
	ByteSize         int64          `gorm:"not null" json:"byte_size"`
	ParseStatus      string         `gorm:"size:32;index;not null;default:pending" json:"parse_status"`
	ParseError       string         `gorm:"type:text" json:"parse_error"`
	MetadataJSON     []byte         `gorm:"column:metadata_json" json:"-"`
	SourceData       []byte         `gorm:"not null" json:"-"`
	Project          Project        `gorm:"foreignKey:ProjectID" json:"project"`
}

// ProjectModelPreviewArtifact stores a browser-previewable mesh derived from a source model.
type ProjectModelPreviewArtifact struct {
	ID               string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	ModelID          string         `gorm:"size:32;uniqueIndex;not null" json:"model_id"`
	Format           string         `gorm:"size:16;index;not null" json:"format"`
	ContentType      string         `gorm:"size:120;not null" json:"content_type"`
	GeneratorVersion string         `gorm:"size:32;index;not null;default:''" json:"generator_version"`
	ByteSize         int64          `gorm:"not null" json:"byte_size"`
	VertexCount      int            `gorm:"not null" json:"vertex_count"`
	FacetCount       int            `gorm:"not null" json:"facet_count"`
	Data             []byte         `gorm:"not null" json:"-"`
	Model            ProjectModel   `gorm:"foreignKey:ModelID" json:"model"`
}

// ProjectGeometryVersion records a project geometry snapshot produced from a preview artifact.
type ProjectGeometryVersion struct {
	ID                string                      `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt         time.Time                   `json:"created_at"`
	UpdatedAt         time.Time                   `json:"updated_at"`
	DeletedAt         gorm.DeletedAt              `gorm:"index" json:"deleted_at,omitempty"`
	ProjectID         string                      `gorm:"size:32;index;not null" json:"project_id"`
	SourceModelID     string                      `gorm:"size:32;index;not null" json:"source_model_id"`
	PreviewArtifactID string                      `gorm:"size:32;uniqueIndex;not null" json:"preview_artifact_id"`
	VersionNumber     int                         `gorm:"not null" json:"version_number"`
	Summary           string                      `gorm:"size:255;not null" json:"summary"`
	Project           Project                     `gorm:"foreignKey:ProjectID" json:"project"`
	SourceModel       ProjectModel                `gorm:"foreignKey:SourceModelID" json:"source_model"`
	PreviewArtifact   ProjectModelPreviewArtifact `gorm:"foreignKey:PreviewArtifactID" json:"preview_artifact"`
}
