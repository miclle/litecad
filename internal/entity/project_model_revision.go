package entity

import "time"

// ProjectModelRevision stores one immutable source-model snapshot.
type ProjectModelRevision struct {
	ID               string       `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt        time.Time    `gorm:"index" json:"created_at"`
	ProjectID        string       `gorm:"size:32;index;not null" json:"project_id"`
	ModelID          string       `gorm:"size:32;index;uniqueIndex:idx_project_model_revision_sequence;not null" json:"model_id"`
	ParentRevisionID string       `gorm:"size:32;index" json:"parent_revision_id,omitempty"`
	Sequence         int          `gorm:"uniqueIndex:idx_project_model_revision_sequence;not null" json:"sequence"`
	SourceData       []byte       `gorm:"not null" json:"-"`
	MetadataJSON     []byte       `gorm:"column:metadata_json" json:"-"`
	ContentChecksum  string       `gorm:"size:64;index;not null" json:"content_checksum"`
	Summary          string       `gorm:"type:text;not null" json:"summary"`
	Project          Project      `gorm:"foreignKey:ProjectID" json:"project"`
	Model            ProjectModel `gorm:"foreignKey:ModelID" json:"model"`
}
