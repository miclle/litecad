package entity

import (
	"time"

	"gorm.io/gorm"
)

// ProjectParametricRevision stores one saved parameter-value revision for a parametric project model.
type ProjectParametricRevision struct {
	ID                  string         `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt           time.Time      `gorm:"index" json:"created_at"`
	UpdatedAt           time.Time      `json:"updated_at"`
	DeletedAt           gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	ProjectID           string         `gorm:"size:32;index;not null" json:"project_id"`
	ModelID             string         `gorm:"size:32;index;not null" json:"model_id"`
	ParameterValuesJSON []byte         `gorm:"column:parameter_values_json;type:json;not null" json:"-"`
	SourceChecksum      string         `gorm:"size:64;index;not null" json:"source_checksum"`
	Summary             string         `gorm:"type:text;not null" json:"summary"`
	Project             Project        `gorm:"foreignKey:ProjectID" json:"project"`
	Model               ProjectModel   `gorm:"foreignKey:ModelID" json:"model"`
}
