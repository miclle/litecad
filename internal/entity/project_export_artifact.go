package entity

import (
	"time"

	"gorm.io/gorm"
)

// ProjectExportArtifact stores one browser-generated export file for a project.
type ProjectExportArtifact struct {
	ID                    string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt             time.Time      `gorm:"index" json:"created_at"`
	UpdatedAt             time.Time      `json:"updated_at"`
	DeletedAt             gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	ProjectID             string         `gorm:"size:32;index;not null" json:"project_id"`
	Filename              string         `gorm:"size:255;not null" json:"filename"`
	ContentType           string         `gorm:"size:120;not null" json:"content_type"`
	ExportKind            string         `gorm:"size:32;index;not null" json:"export_kind"`
	TargetCount           int            `gorm:"not null" json:"target_count"`
	SourceRevisionIDsJSON []byte         `gorm:"column:source_revision_ids_json;type:json" json:"-"`
	OccurrenceIDsJSON     []byte         `gorm:"column:occurrence_ids_json;type:json" json:"-"`
	ByteSize              int64          `gorm:"not null" json:"byte_size"`
	Data                  []byte         `gorm:"not null" json:"-"`
	Project               Project        `gorm:"foreignKey:ProjectID" json:"project"`
}
