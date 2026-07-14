package entity

import (
	"time"

	"gorm.io/gorm"
)

// ProjectInspectionRecord stores a durable viewer inspection record for a project.
type ProjectInspectionRecord struct {
	ID                  string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt           time.Time      `gorm:"index" json:"created_at"`
	UpdatedAt           time.Time      `json:"updated_at"`
	DeletedAt           gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	ProjectID           string         `gorm:"size:32;index;not null" json:"project_id"`
	Kind                string         `gorm:"size:32;index;not null" json:"kind"`
	Name                string         `gorm:"size:160;not null" json:"name"`
	CADDocumentRevision int            `gorm:"not null;default:0" json:"cad_document_revision"`
	Unit                string         `gorm:"size:32;not null" json:"unit"`
	VisibleModelIDsJSON []byte         `gorm:"column:visible_model_ids_json;type:json" json:"-"`
	MeasurementJSON     []byte         `gorm:"column:measurement_json;type:json" json:"-"`
	SectionJSON         []byte         `gorm:"column:section_json;type:json" json:"-"`
	Project             Project        `gorm:"foreignKey:ProjectID" json:"project"`
}
