package entity

import "time"

// ProjectSectionArtifactAssociation serializes immutable section-definition generations.
type ProjectSectionArtifactAssociation struct {
	ID                string    `gorm:"size:32;primaryKey" json:"id"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
	ProjectID         string    `gorm:"size:32;index;not null" json:"project_id"`
	CurrentGeneration int       `gorm:"not null" json:"current_generation"`
	LatestArtifactID  string    `gorm:"size:32;index" json:"latest_artifact_id"`
	PlaneOriginJSON   []byte    `gorm:"column:plane_origin_json;type:json" json:"-"`
	PlaneNormalJSON   []byte    `gorm:"column:plane_normal_json;type:json" json:"-"`
}
