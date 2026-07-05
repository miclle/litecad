package service

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

// ErrModelPreviewUnavailable indicates preview conversion failed or produced no mesh.
var ErrModelPreviewUnavailable = errors.New("model preview unavailable")

const (
	stepOBJPreviewGeneratorVersion = "step-obj-v4"
)

// ModelPreviewConverter converts source CAD data into a browser-previewable mesh.
type ModelPreviewConverter interface {
	ConvertStepToOBJ(ctx context.Context, data []byte) (ModelPreviewMesh, error)
}

// ModelPreviewMesh is converted mesh data ready to persist as a preview artifact.
type ModelPreviewMesh struct {
	Format      string
	ContentType string
	Data        []byte
	VertexCount int
	FacetCount  int
}

// ProjectModelPreviewArtifact is the public shape for a derived model preview.
type ProjectModelPreviewArtifact struct {
	ID               string `json:"id"`
	ModelID          string `json:"model_id"`
	Format           string `json:"format"`
	ContentType      string `json:"content_type"`
	GeneratorVersion string `json:"generator_version"`
	ByteSize         int64  `json:"byte_size"`
	VertexCount      int    `json:"vertex_count"`
	FacetCount       int    `json:"facet_count"`
	Data             []byte `json:"-"`
	CreatedAt        string `json:"created_at"`
	UpdatedAt        string `json:"updated_at"`
}

// GetOrCreateProjectModelPreview returns a stored preview artifact or converts one from the STEP source.
func (s *Service) GetOrCreateProjectModelPreview(ctx context.Context, ownerUserID, projectID, modelID string) (ProjectModelPreviewArtifact, error) {
	ownerUserID = strings.TrimSpace(ownerUserID)
	projectID = strings.TrimSpace(projectID)
	modelID = strings.TrimSpace(modelID)
	if ownerUserID == "" || projectID == "" || modelID == "" {
		return ProjectModelPreviewArtifact{}, ErrProjectNotFound
	}

	var model entity.ProjectModel
	err := s.db.WithContext(ctx).
		Joins("JOIN projects ON projects.id = project_models.project_id").
		First(&model, "project_models.id = ? AND project_models.project_id = ? AND projects.owner_user_id = ?", modelID, projectID, ownerUserID).
		Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectModelPreviewArtifact{}, ErrProjectNotFound
		}
		return ProjectModelPreviewArtifact{}, fmt.Errorf("load project model for preview: %w", err)
	}

	var existing entity.ProjectModelPreviewArtifact
	err = s.db.WithContext(ctx).First(&existing, "model_id = ?", model.ID).Error
	if err == nil {
		if model.Format == "step" && existing.GeneratorVersion != stepOBJPreviewGeneratorVersion {
			return s.refreshStepPreviewArtifact(ctx, model, existing)
		}
		if model.Format != "step" {
			return ProjectModelPreviewArtifact{}, fmt.Errorf("%w: %s source requires backend preview normalization", ErrModelPreviewUnavailable, model.Format)
		}
		if _, ensureErr := s.ensureProjectGeometryVersion(ctx, model.ProjectID, model.ID, existing.ID); ensureErr != nil {
			return ProjectModelPreviewArtifact{}, ensureErr
		}
		return publicProjectModelPreview(existing), nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectModelPreviewArtifact{}, fmt.Errorf("load project model preview: %w", err)
	}
	if model.Format != "step" {
		return ProjectModelPreviewArtifact{}, fmt.Errorf("%w: %s source requires backend preview normalization", ErrModelPreviewUnavailable, model.Format)
	}

	mesh, err := s.convertStepPreviewMesh(ctx, model)
	if err != nil {
		return ProjectModelPreviewArtifact{}, err
	}

	artifactID, err := id.NewPrefixed("prv")
	if err != nil {
		return ProjectModelPreviewArtifact{}, err
	}
	artifact := entity.ProjectModelPreviewArtifact{
		ID:               artifactID,
		ModelID:          model.ID,
		Format:           mesh.Format,
		ContentType:      mesh.ContentType,
		GeneratorVersion: stepOBJPreviewGeneratorVersion,
		ByteSize:         int64(len(mesh.Data)),
		VertexCount:      mesh.VertexCount,
		FacetCount:       mesh.FacetCount,
		Data:             append([]byte(nil), mesh.Data...),
	}
	if err := s.db.WithContext(ctx).Create(&artifact).Error; err != nil {
		return ProjectModelPreviewArtifact{}, fmt.Errorf("store project model preview: %w", err)
	}
	if _, err := s.ensureProjectGeometryVersion(ctx, model.ProjectID, model.ID, artifact.ID); err != nil {
		return ProjectModelPreviewArtifact{}, err
	}
	return publicProjectModelPreview(artifact), nil
}

func (s *Service) convertStepPreviewMesh(ctx context.Context, model entity.ProjectModel) (ModelPreviewMesh, error) {
	mesh, err := s.previewConverter.ConvertStepToOBJ(ctx, model.SourceData)
	if err != nil {
		return ModelPreviewMesh{}, fmt.Errorf("%w: %v", ErrModelPreviewUnavailable, err)
	}
	if mesh.Format == "" {
		mesh.Format = "obj"
	}
	if mesh.ContentType == "" {
		mesh.ContentType = "model/obj"
	}
	if mesh.VertexCount == 0 || mesh.FacetCount == 0 {
		mesh.VertexCount, mesh.FacetCount = countOBJMesh(mesh.Data)
	}
	if len(mesh.Data) == 0 || mesh.VertexCount == 0 || mesh.FacetCount == 0 {
		return ModelPreviewMesh{}, fmt.Errorf("%w: converted mesh is empty", ErrModelPreviewUnavailable)
	}
	return mesh, nil
}

func (s *Service) refreshStepPreviewArtifact(ctx context.Context, model entity.ProjectModel, artifact entity.ProjectModelPreviewArtifact) (ProjectModelPreviewArtifact, error) {
	mesh, err := s.convertStepPreviewMesh(ctx, model)
	if err != nil {
		return ProjectModelPreviewArtifact{}, err
	}
	artifact.Format = mesh.Format
	artifact.ContentType = mesh.ContentType
	artifact.GeneratorVersion = stepOBJPreviewGeneratorVersion
	artifact.ByteSize = int64(len(mesh.Data))
	artifact.VertexCount = mesh.VertexCount
	artifact.FacetCount = mesh.FacetCount
	artifact.Data = append([]byte(nil), mesh.Data...)
	if err := s.db.WithContext(ctx).Save(&artifact).Error; err != nil {
		return ProjectModelPreviewArtifact{}, fmt.Errorf("refresh project model preview: %w", err)
	}
	if _, err := s.ensureProjectGeometryVersion(ctx, model.ProjectID, model.ID, artifact.ID); err != nil {
		return ProjectModelPreviewArtifact{}, err
	}
	return publicProjectModelPreview(artifact), nil
}

func (s *Service) ensureProjectGeometryVersion(ctx context.Context, projectID, modelID, previewArtifactID string) (ProjectGeometryVersion, error) {
	var existing entity.ProjectGeometryVersion
	err := s.db.WithContext(ctx).First(&existing, "preview_artifact_id = ?", previewArtifactID).Error
	if err == nil {
		return publicProjectGeometryVersion(existing), nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectGeometryVersion{}, fmt.Errorf("load project geometry version: %w", err)
	}

	var maxVersion int
	if err := s.db.WithContext(ctx).
		Model(&entity.ProjectGeometryVersion{}).
		Where("project_id = ?", projectID).
		Select("COALESCE(MAX(version_number), 0)").
		Scan(&maxVersion).
		Error; err != nil {
		return ProjectGeometryVersion{}, fmt.Errorf("load project geometry version number: %w", err)
	}
	versionID, err := id.NewPrefixed("geo")
	if err != nil {
		return ProjectGeometryVersion{}, err
	}
	version := entity.ProjectGeometryVersion{
		ID:                versionID,
		ProjectID:         projectID,
		SourceModelID:     modelID,
		PreviewArtifactID: previewArtifactID,
		VersionNumber:     maxVersion + 1,
		Summary:           "Preview artifact imported",
	}
	if err := s.db.WithContext(ctx).Create(&version).Error; err != nil {
		return ProjectGeometryVersion{}, fmt.Errorf("store project geometry version: %w", err)
	}
	return publicProjectGeometryVersion(version), nil
}

func publicProjectModelPreview(artifact entity.ProjectModelPreviewArtifact) ProjectModelPreviewArtifact {
	return ProjectModelPreviewArtifact{
		ID:               artifact.ID,
		ModelID:          artifact.ModelID,
		Format:           artifact.Format,
		ContentType:      artifact.ContentType,
		GeneratorVersion: artifact.GeneratorVersion,
		ByteSize:         artifact.ByteSize,
		VertexCount:      artifact.VertexCount,
		FacetCount:       artifact.FacetCount,
		Data:             append([]byte(nil), artifact.Data...),
		CreatedAt:        artifact.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:        artifact.UpdatedAt.Format(timeFormatRFC3339),
	}
}

func countOBJMesh(data []byte) (vertices int, facets int) {
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		switch {
		case strings.HasPrefix(line, "v "):
			vertices++
		case strings.HasPrefix(line, "f "):
			facets++
		}
	}
	return vertices, facets
}
