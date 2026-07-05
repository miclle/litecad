package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/miclle/litecad/internal/entity"
	"gorm.io/gorm"
)

// ProjectGeometryDocument is the read-only geometry API shape for a project.
type ProjectGeometryDocument struct {
	ProjectID        string                        `json:"project_id"`
	ModelTree        []ProjectGeometryTreeNode     `json:"model_tree"`
	Models           []ProjectModel                `json:"models"`
	PreviewArtifacts []ProjectModelPreviewArtifact `json:"preview_artifacts"`
	Versions         []ProjectGeometryVersion      `json:"versions"`
}

// ProjectGeometryTreeNode links an uploaded source model to its preview artifact.
type ProjectGeometryTreeNode struct {
	ModelID           string `json:"model_id"`
	ParentModelID     string `json:"parent_model_id"`
	PreviewArtifactID string `json:"preview_artifact_id"`
	Name              string `json:"name"`
	Format            string `json:"format"`
	PreviewFormat     string `json:"preview_format"`
}

// ProjectGeometryVersion is the public shape for a project geometry snapshot.
type ProjectGeometryVersion struct {
	ID                string `json:"id"`
	ProjectID         string `json:"project_id"`
	SourceModelID     string `json:"source_model_id"`
	PreviewArtifactID string `json:"preview_artifact_id"`
	VersionNumber     int    `json:"version_number"`
	Summary           string `json:"summary"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
}

// GetProjectGeometryDocument returns a read-only project geometry document for the signed-in owner.
func (s *Service) GetProjectGeometryDocument(ctx context.Context, ownerUserID, projectID string) (ProjectGeometryDocument, error) {
	ownerUserID = strings.TrimSpace(ownerUserID)
	projectID = strings.TrimSpace(projectID)
	if ownerUserID == "" || projectID == "" {
		return ProjectGeometryDocument{}, ErrProjectNotFound
	}

	var project entity.Project
	if err := s.db.WithContext(ctx).First(&project, "id = ? AND owner_user_id = ?", projectID, ownerUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectGeometryDocument{}, ErrProjectNotFound
		}
		return ProjectGeometryDocument{}, fmt.Errorf("load project geometry document: %w", err)
	}

	models, err := s.ListProjectModels(ctx, ownerUserID, projectID)
	if err != nil {
		return ProjectGeometryDocument{}, err
	}

	var artifacts []entity.ProjectModelPreviewArtifact
	if err := s.db.WithContext(ctx).
		Joins("JOIN project_models ON project_models.id = project_model_preview_artifacts.model_id").
		Where("project_models.project_id = ?", projectID).
		Order("project_model_preview_artifacts.created_at ASC").
		Find(&artifacts).
		Error; err != nil {
		return ProjectGeometryDocument{}, fmt.Errorf("load project preview artifacts: %w", err)
	}

	artifactByModelID := make(map[string]ProjectModelPreviewArtifact, len(artifacts))
	previewArtifacts := make([]ProjectModelPreviewArtifact, 0, len(artifacts))
	for _, artifact := range artifacts {
		publicArtifact := publicProjectModelPreview(artifact)
		publicArtifact.Data = nil
		artifactByModelID[artifact.ModelID] = publicArtifact
		previewArtifacts = append(previewArtifacts, publicArtifact)
	}

	var versions []entity.ProjectGeometryVersion
	if err := s.db.WithContext(ctx).
		Where("project_id = ?", projectID).
		Order("version_number ASC").
		Find(&versions).
		Error; err != nil {
		return ProjectGeometryDocument{}, fmt.Errorf("load project geometry versions: %w", err)
	}
	publicVersions := make([]ProjectGeometryVersion, 0, len(versions))
	for _, version := range versions {
		publicVersions = append(publicVersions, publicProjectGeometryVersion(version))
	}

	modelTree := make([]ProjectGeometryTreeNode, 0, len(models))
	for _, model := range models {
		artifact := artifactByModelID[model.ID]
		modelTree = append(modelTree, ProjectGeometryTreeNode{
			ModelID:           model.ID,
			PreviewArtifactID: artifact.ID,
			Name:              model.OriginalFilename,
			Format:            model.Format,
			PreviewFormat:     artifact.Format,
		})
	}

	return ProjectGeometryDocument{
		ProjectID:        project.ID,
		ModelTree:        modelTree,
		Models:           models,
		PreviewArtifacts: previewArtifacts,
		Versions:         publicVersions,
	}, nil
}

func publicProjectGeometryVersion(version entity.ProjectGeometryVersion) ProjectGeometryVersion {
	return ProjectGeometryVersion{
		ID:                version.ID,
		ProjectID:         version.ProjectID,
		SourceModelID:     version.SourceModelID,
		PreviewArtifactID: version.PreviewArtifactID,
		VersionNumber:     version.VersionNumber,
		Summary:           version.Summary,
		CreatedAt:         version.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:         version.UpdatedAt.Format(timeFormatRFC3339),
	}
}
