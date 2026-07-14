package entity

import (
	"time"

	"gorm.io/gorm"
)

// ProjectSectionArtifact stores one browser-kernel section geometry result.
type ProjectSectionArtifact struct {
	ID                    string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt             time.Time      `gorm:"index" json:"created_at"`
	UpdatedAt             time.Time      `json:"updated_at"`
	DeletedAt             gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	ProjectID             string         `gorm:"size:32;index;not null" json:"project_id"`
	CADDocumentRevision   int            `gorm:"not null" json:"cad_document_revision"`
	Unit                  string         `gorm:"size:32;not null" json:"unit"`
	Status                string         `gorm:"size:16;index;not null" json:"status"`
	Filename              string         `gorm:"size:255;not null" json:"filename"`
	ContentType           string         `gorm:"size:120;not null" json:"content_type"`
	TargetCount           int            `gorm:"not null" json:"target_count"`
	SourceRevisionIDsJSON []byte         `gorm:"column:source_revision_ids_json;type:json" json:"-"`
	OccurrenceIDsJSON     []byte         `gorm:"column:occurrence_ids_json;type:json" json:"-"`
	PlaneOriginJSON       []byte         `gorm:"column:plane_origin_json;type:json" json:"-"`
	PlaneNormalJSON       []byte         `gorm:"column:plane_normal_json;type:json" json:"-"`
	EdgeCount             int            `gorm:"not null" json:"edge_count"`
	ByteSize              int64          `gorm:"not null" json:"byte_size"`
	Data                  []byte         `json:"-"`
	Project               Project        `gorm:"foreignKey:ProjectID" json:"project"`
}
