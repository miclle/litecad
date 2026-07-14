package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const (
	MaxProjectExportArtifactBytes       = 100 * 1024 * 1024
	maxProjectExportArtifactMetadataIDs = 200
)

var ErrInvalidProjectExportArtifactInput = errors.New("invalid project export artifact input")

// CreateProjectExportArtifactInput stores one browser-generated export.
type CreateProjectExportArtifactInput struct {
	OwnerUserID       string
	ProjectID         string
	Filename          string
	ContentType       string
	ExportKind        string
	TargetCount       int
	SourceRevisionIDs []string
	OccurrenceIDs     []string
	Data              []byte
}

// ProjectExportArtifact is the public metadata for one stored export.
type ProjectExportArtifact struct {
	ID                string   `json:"id"`
	ProjectID         string   `json:"project_id"`
	Filename          string   `json:"filename"`
	ContentType       string   `json:"content_type"`
	ExportKind        string   `json:"export_kind"`
	TargetCount       int      `json:"target_count"`
	SourceRevisionIDs []string `json:"source_revision_ids"`
	OccurrenceIDs     []string `json:"occurrence_ids"`
	ByteSize          int64    `json:"byte_size"`
	CreatedAt         string   `json:"created_at"`
	UpdatedAt         string   `json:"updated_at"`
}

// ProjectExportArtifactDownload is a stored export file plus download metadata.
type ProjectExportArtifactDownload struct {
	ProjectExportArtifact
	Data []byte `json:"-"`
}

// CreateProjectExportArtifact stores one generated STEP export for an owned project.
func (s *Service) CreateProjectExportArtifact(ctx context.Context, input CreateProjectExportArtifactInput) (ProjectExportArtifact, error) {
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectExportArtifact{}, err
	}
	filename := strings.TrimSpace(filepath.Base(input.Filename))
	contentType := strings.TrimSpace(input.ContentType)
	exportKind := strings.TrimSpace(input.ExportKind)
	data := input.Data
	if !isValidProjectExportArtifactInput(filename, contentType, exportKind, input.TargetCount, input.SourceRevisionIDs, input.OccurrenceIDs, data) {
		return ProjectExportArtifact{}, ErrInvalidProjectExportArtifactInput
	}
	revisionIDs, err := marshalProjectExportArtifactIDs(input.SourceRevisionIDs)
	if err != nil {
		return ProjectExportArtifact{}, err
	}
	occurrenceIDs, err := marshalProjectExportArtifactIDs(input.OccurrenceIDs)
	if err != nil {
		return ProjectExportArtifact{}, err
	}
	artifactID, err := id.NewPrefixed("pex")
	if err != nil {
		return ProjectExportArtifact{}, err
	}
	artifact := entity.ProjectExportArtifact{
		ID:                    artifactID,
		ProjectID:             project.ID,
		Filename:              filename,
		ContentType:           contentType,
		ExportKind:            exportKind,
		TargetCount:           input.TargetCount,
		SourceRevisionIDsJSON: revisionIDs,
		OccurrenceIDsJSON:     occurrenceIDs,
		ByteSize:              int64(len(data)),
		Data:                  append([]byte(nil), data...),
	}
	if err := s.db.WithContext(ctx).Create(&artifact).Error; err != nil {
		return ProjectExportArtifact{}, fmt.Errorf("create project export artifact: %w", err)
	}
	return publicProjectExportArtifact(artifact), nil
}

// ListProjectExportArtifacts returns newest-first export metadata for an owned project.
func (s *Service) ListProjectExportArtifacts(ctx context.Context, ownerUserID, projectID string) ([]ProjectExportArtifact, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return nil, err
	}
	var artifacts []entity.ProjectExportArtifact
	if err := s.db.WithContext(ctx).
		Where("project_id = ?", project.ID).
		Order("created_at DESC").
		Find(&artifacts).Error; err != nil {
		return nil, fmt.Errorf("list project export artifacts: %w", err)
	}
	result := make([]ProjectExportArtifact, 0, len(artifacts))
	for _, artifact := range artifacts {
		result = append(result, publicProjectExportArtifact(artifact))
	}
	return result, nil
}

// GetProjectExportArtifactDownload returns one stored export file for an owned project.
func (s *Service) GetProjectExportArtifactDownload(ctx context.Context, ownerUserID, projectID, artifactID string) (ProjectExportArtifactDownload, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return ProjectExportArtifactDownload{}, err
	}
	artifactID = strings.TrimSpace(artifactID)
	if artifactID == "" {
		return ProjectExportArtifactDownload{}, ErrProjectNotFound
	}
	var artifact entity.ProjectExportArtifact
	if err := s.db.WithContext(ctx).First(&artifact, "id = ? AND project_id = ?", artifactID, project.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectExportArtifactDownload{}, ErrProjectNotFound
		}
		return ProjectExportArtifactDownload{}, fmt.Errorf("get project export artifact: %w", err)
	}
	return ProjectExportArtifactDownload{
		ProjectExportArtifact: publicProjectExportArtifact(artifact),
		Data:                  append([]byte(nil), artifact.Data...),
	}, nil
}

func isValidProjectExportArtifactInput(filename, contentType, exportKind string, targetCount int, sourceRevisionIDs, occurrenceIDs []string, data []byte) bool {
	if filename == "" || utf8.RuneCountInString(filename) > 255 || contentType != "model/step" || len(data) == 0 || len(data) > MaxProjectExportArtifactBytes {
		return false
	}
	if exportKind != "single" && exportKind != "merged" {
		return false
	}
	if targetCount <= 0 || len(sourceRevisionIDs) > maxProjectExportArtifactMetadataIDs || len(occurrenceIDs) > maxProjectExportArtifactMetadataIDs {
		return false
	}
	for _, value := range append(append([]string{}, sourceRevisionIDs...), occurrenceIDs...) {
		if strings.TrimSpace(value) == "" || utf8.RuneCountInString(value) > 64 {
			return false
		}
	}
	return true
}

func marshalProjectExportArtifactIDs(values []string) ([]byte, error) {
	copied := make([]string, 0, len(values))
	for _, value := range values {
		copied = append(copied, strings.TrimSpace(value))
	}
	data, err := json.Marshal(copied)
	if err != nil {
		return nil, fmt.Errorf("marshal project export artifact ids: %w", err)
	}
	return data, nil
}

func publicProjectExportArtifact(artifact entity.ProjectExportArtifact) ProjectExportArtifact {
	return ProjectExportArtifact{
		ID:                artifact.ID,
		ProjectID:         artifact.ProjectID,
		Filename:          artifact.Filename,
		ContentType:       artifact.ContentType,
		ExportKind:        artifact.ExportKind,
		TargetCount:       artifact.TargetCount,
		SourceRevisionIDs: unmarshalProjectExportArtifactIDs(artifact.SourceRevisionIDsJSON),
		OccurrenceIDs:     unmarshalProjectExportArtifactIDs(artifact.OccurrenceIDsJSON),
		ByteSize:          artifact.ByteSize,
		CreatedAt:         artifact.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:         artifact.UpdatedAt.Format(timeFormatRFC3339),
	}
}

func unmarshalProjectExportArtifactIDs(data []byte) []string {
	var values []string
	if len(data) == 0 {
		return []string{}
	}
	if err := json.Unmarshal(data, &values); err != nil {
		return []string{}
	}
	return values
}
