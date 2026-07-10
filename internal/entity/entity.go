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

// ProjectThumbnailSnapshot stores the static project-list cover image generated from the browser workbench.
type ProjectThumbnailSnapshot struct {
	ID          string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	ProjectID   string         `gorm:"size:32;uniqueIndex;not null" json:"project_id"`
	ContentType string         `gorm:"size:80;not null" json:"content_type"`
	ByteSize    int64          `gorm:"not null" json:"byte_size"`
	Width       int            `gorm:"not null" json:"width"`
	Height      int            `gorm:"not null" json:"height"`
	Revision    int            `gorm:"not null;default:0" json:"revision"`
	Status      string         `gorm:"size:32;index;not null;default:ready" json:"status"`
	Data        []byte         `gorm:"not null" json:"-"`
	Project     Project        `gorm:"foreignKey:ProjectID" json:"project"`
}

// ProjectGeometryVersion records a project geometry snapshot produced from a preview artifact.
type ProjectGeometryVersion struct {
	ID                string                      `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt         time.Time                   `json:"created_at"`
	UpdatedAt         time.Time                   `json:"updated_at"`
	DeletedAt         gorm.DeletedAt              `gorm:"index" json:"deleted_at,omitempty"`
	ProjectID         string                      `gorm:"size:32;index;uniqueIndex:idx_project_geometry_version_number;not null" json:"project_id"`
	SourceModelID     string                      `gorm:"size:32;index;not null" json:"source_model_id"`
	PreviewArtifactID string                      `gorm:"size:32;uniqueIndex;not null" json:"preview_artifact_id"`
	VersionNumber     int                         `gorm:"uniqueIndex:idx_project_geometry_version_number;not null" json:"version_number"`
	Summary           string                      `gorm:"size:255;not null" json:"summary"`
	Project           Project                     `gorm:"foreignKey:ProjectID" json:"project"`
	SourceModel       ProjectModel                `gorm:"foreignKey:SourceModelID" json:"source_model"`
	PreviewArtifact   ProjectModelPreviewArtifact `gorm:"foreignKey:PreviewArtifactID" json:"preview_artifact"`
}

// ProjectCADDocument stores LiteCAD-owned editable document state for a project.
type ProjectCADDocument struct {
	ID              string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	ProjectID       string         `gorm:"size:32;uniqueIndex;not null" json:"project_id"`
	SchemaVersion   int            `gorm:"not null;default:1" json:"schema_version"`
	Revision        int            `gorm:"not null;default:1" json:"revision"`
	HistorySequence int64          `gorm:"not null;default:0" json:"history_sequence"`
	HistoryHeadID   string         `gorm:"size:32;index" json:"history_head_id"`
	DocumentJSON    []byte         `gorm:"column:document_json;not null" json:"-"`
	Project         Project        `gorm:"foreignKey:ProjectID" json:"project"`
}

// ProjectCADHistoryEntry stores one reversible user edit in a project CAD document.
type ProjectCADHistoryEntry struct {
	ID            string             `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt     time.Time          `json:"created_at"`
	UpdatedAt     time.Time          `json:"updated_at"`
	ProjectID     string             `gorm:"size:32;index;not null" json:"project_id"`
	DocumentID    string             `gorm:"size:32;uniqueIndex:idx_cad_history_document_sequence;index:idx_cad_history_document_status;not null" json:"document_id"`
	Sequence      int64              `gorm:"uniqueIndex:idx_cad_history_document_sequence;not null" json:"sequence"`
	ParentEntryID string             `gorm:"size:32;index" json:"parent_entry_id"`
	Status        string             `gorm:"size:16;index:idx_cad_history_document_status;not null" json:"status"`
	CommandType   string             `gorm:"size:32;index;not null" json:"command_type"`
	TargetID      string             `gorm:"size:64;index" json:"target_id"`
	Summary       string             `gorm:"type:text;not null" json:"summary"`
	CommandJSON   []byte             `gorm:"column:command_json;not null" json:"-"`
	Project       Project            `gorm:"foreignKey:ProjectID" json:"project"`
	Document      ProjectCADDocument `gorm:"foreignKey:DocumentID" json:"document"`
}

// ProjectAgentMessage stores one CAD Agent conversation message for a project.
type ProjectAgentMessage struct {
	ID        string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt time.Time      `gorm:"index" json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	ProjectID string         `gorm:"size:32;index;not null" json:"project_id"`
	Role      string         `gorm:"size:16;index;not null" json:"role"`
	Body      string         `gorm:"type:text;not null" json:"body"`
	Project   Project        `gorm:"foreignKey:ProjectID" json:"project"`
}
