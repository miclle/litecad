package service

import (
	"bytes"
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
	"gorm.io/gorm/clause"
)

const (
	ProjectSectionArtifactStatusReady = "ready"
	ProjectSectionArtifactStatusEmpty = "empty"
	MaxProjectSectionArtifactBytes    = 100 * 1024 * 1024
	maxProjectSectionArtifactInputs   = 200
)

var (
	ErrInvalidProjectSectionArtifactInput        = errors.New("invalid project section artifact input")
	ErrProjectSectionArtifactGeometryUnavailable = errors.New("project section artifact geometry unavailable")
	ErrProjectSectionArtifactGenerationConflict  = errors.New("project section artifact generation conflict")
)

// CreateProjectSectionArtifactInput stores one browser-kernel section result.
type CreateProjectSectionArtifactInput struct {
	OwnerUserID         string
	ProjectID           string
	CADDocumentRevision int
	Unit                string
	Status              string
	Filename            string
	ContentType         string
	TargetCount         int
	SourceRevisionIDs   []string
	OccurrenceIDs       []string
	AssociationID       string
	ExpectedGeneration  int
	PlaneOrigin         ProjectInspectionVector
	PlaneNormal         ProjectInspectionVector
	EdgeCount           int
	Data                []byte
}

// ProjectSectionArtifact is the public metadata for one section result.
type ProjectSectionArtifact struct {
	ID                   string                  `json:"id"`
	ProjectID            string                  `json:"project_id"`
	CADDocumentRevision  int                     `json:"cad_document_revision"`
	Unit                 string                  `json:"unit"`
	Status               string                  `json:"status"`
	Filename             string                  `json:"filename"`
	ContentType          string                  `json:"content_type"`
	TargetCount          int                     `json:"target_count"`
	SourceRevisionIDs    []string                `json:"source_revision_ids"`
	OccurrenceIDs        []string                `json:"occurrence_ids"`
	AssociationID        string                  `json:"association_id"`
	Generation           int                     `json:"generation"`
	SupersedesArtifactID string                  `json:"supersedes_artifact_id"`
	IsLatest             bool                    `json:"is_latest"`
	PlaneOrigin          ProjectInspectionVector `json:"plane_origin"`
	PlaneNormal          ProjectInspectionVector `json:"plane_normal"`
	EdgeCount            int                     `json:"edge_count"`
	ByteSize             int64                   `json:"byte_size"`
	CreatedAt            string                  `json:"created_at"`
	UpdatedAt            string                  `json:"updated_at"`
}

// ProjectSectionArtifactDownload contains one stored section STEP file.
type ProjectSectionArtifactDownload struct {
	ProjectSectionArtifact
	Data []byte `json:"-"`
}

// CreateProjectSectionArtifact stores a section geometry result for an owned project.
func (s *Service) CreateProjectSectionArtifact(ctx context.Context, input CreateProjectSectionArtifactInput) (ProjectSectionArtifact, error) {
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectSectionArtifact{}, err
	}
	input.Status = strings.TrimSpace(input.Status)
	input.Unit = strings.TrimSpace(input.Unit)
	input.Filename = strings.TrimSpace(filepath.Base(input.Filename))
	input.ContentType = strings.TrimSpace(input.ContentType)
	input.AssociationID = strings.TrimSpace(input.AssociationID)
	if !isValidProjectSectionArtifactInput(input) {
		return ProjectSectionArtifact{}, ErrInvalidProjectSectionArtifactInput
	}
	revisionIDs, err := marshalProjectExportArtifactIDs(input.SourceRevisionIDs)
	if err != nil {
		return ProjectSectionArtifact{}, err
	}
	occurrenceIDs, err := marshalProjectExportArtifactIDs(input.OccurrenceIDs)
	if err != nil {
		return ProjectSectionArtifact{}, err
	}
	planeOrigin, err := marshalProjectInspectionValue(input.PlaneOrigin)
	if err != nil {
		return ProjectSectionArtifact{}, err
	}
	planeNormal, err := marshalProjectInspectionValue(input.PlaneNormal)
	if err != nil {
		return ProjectSectionArtifact{}, err
	}
	artifactID, err := id.NewPrefixed("pse")
	if err != nil {
		return ProjectSectionArtifact{}, err
	}
	associationID := input.AssociationID
	if associationID == "" {
		associationID, err = id.NewPrefixed("psd")
		if err != nil {
			return ProjectSectionArtifact{}, err
		}
	}
	artifact := entity.ProjectSectionArtifact{}
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		association := entity.ProjectSectionArtifactAssociation{}
		if input.AssociationID == "" {
			association = entity.ProjectSectionArtifactAssociation{
				ID: associationID, ProjectID: project.ID,
				PlaneOriginJSON: planeOrigin, PlaneNormalJSON: planeNormal,
			}
			if err := tx.Create(&association).Error; err != nil {
				return fmt.Errorf("create project section artifact association: %w", err)
			}
		} else {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				First(&association, "id = ? AND project_id = ?", input.AssociationID, project.ID).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrInvalidProjectSectionArtifactInput
				}
				return fmt.Errorf("get project section artifact association: %w", err)
			}
			if association.CurrentGeneration != input.ExpectedGeneration {
				return ErrProjectSectionArtifactGenerationConflict
			}
			if !bytes.Equal(association.PlaneOriginJSON, planeOrigin) || !bytes.Equal(association.PlaneNormalJSON, planeNormal) {
				return ErrInvalidProjectSectionArtifactInput
			}
		}
		generation := association.CurrentGeneration + 1
		artifact = entity.ProjectSectionArtifact{
			ID: artifactID, ProjectID: project.ID, AssociationID: associationID, Generation: generation,
			SupersedesArtifactID: association.LatestArtifactID, CADDocumentRevision: input.CADDocumentRevision,
			Unit: input.Unit, Status: input.Status, Filename: input.Filename, ContentType: input.ContentType,
			TargetCount: input.TargetCount, SourceRevisionIDsJSON: revisionIDs, OccurrenceIDsJSON: occurrenceIDs,
			PlaneOriginJSON: planeOrigin, PlaneNormalJSON: planeNormal, EdgeCount: input.EdgeCount,
			ByteSize: int64(len(input.Data)), Data: append([]byte(nil), input.Data...),
		}
		if err := tx.Create(&artifact).Error; err != nil {
			return err
		}
		result := tx.Model(&entity.ProjectSectionArtifactAssociation{}).
			Where("id = ? AND project_id = ? AND current_generation = ?", associationID, project.ID, association.CurrentGeneration).
			Updates(map[string]any{"current_generation": generation, "latest_artifact_id": artifact.ID})
		if result.Error != nil {
			return fmt.Errorf("update project section artifact association: %w", result.Error)
		}
		if result.RowsAffected != 1 {
			return ErrProjectSectionArtifactGenerationConflict
		}
		return nil
	}); err != nil {
		if errors.Is(err, ErrInvalidProjectSectionArtifactInput) || errors.Is(err, ErrProjectSectionArtifactGenerationConflict) {
			return ProjectSectionArtifact{}, err
		}
		return ProjectSectionArtifact{}, fmt.Errorf("create project section artifact: %w", err)
	}
	return publicProjectSectionArtifact(artifact, true), nil
}

// ListProjectSectionArtifacts returns newest-first section results for an owned project.
func (s *Service) ListProjectSectionArtifacts(ctx context.Context, ownerUserID, projectID string) ([]ProjectSectionArtifact, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return nil, err
	}
	type artifactListRow struct {
		entity.ProjectSectionArtifact
		AssociationLatestArtifactID string `gorm:"column:association_latest_artifact_id"`
	}
	var rows []artifactListRow
	if err := s.db.WithContext(ctx).Model(&entity.ProjectSectionArtifact{}).
		Select("project_section_artifacts.*, project_section_artifact_associations.latest_artifact_id AS association_latest_artifact_id").
		Joins("LEFT JOIN project_section_artifact_associations ON project_section_artifact_associations.id = project_section_artifacts.association_id").
		Where("project_section_artifacts.project_id = ?", project.ID).
		Order("project_section_artifacts.created_at DESC").Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("list project section artifacts: %w", err)
	}
	result := make([]ProjectSectionArtifact, 0, len(rows))
	for _, row := range rows {
		result = append(result, publicProjectSectionArtifact(row.ProjectSectionArtifact, row.AssociationLatestArtifactID == row.ID))
	}
	return result, nil
}

// GetProjectSectionArtifactDownload returns stored section geometry for an owned project.
func (s *Service) GetProjectSectionArtifactDownload(ctx context.Context, ownerUserID, projectID, artifactID string) (ProjectSectionArtifactDownload, error) {
	artifact, err := s.loadProjectSectionArtifact(ctx, ownerUserID, projectID, artifactID)
	if err != nil {
		return ProjectSectionArtifactDownload{}, err
	}
	if artifact.Status != ProjectSectionArtifactStatusReady || len(artifact.Data) == 0 {
		return ProjectSectionArtifactDownload{}, ErrProjectSectionArtifactGeometryUnavailable
	}
	return ProjectSectionArtifactDownload{ProjectSectionArtifact: publicProjectSectionArtifact(artifact, false), Data: append([]byte(nil), artifact.Data...)}, nil
}

// DeleteProjectSectionArtifact soft-deletes one section result for an owned project.
func (s *Service) DeleteProjectSectionArtifact(ctx context.Context, ownerUserID, projectID, artifactID string) error {
	artifact, err := s.loadProjectSectionArtifact(ctx, ownerUserID, projectID, artifactID)
	if err != nil {
		return err
	}
	if err := s.db.WithContext(ctx).Delete(&artifact).Error; err != nil {
		return fmt.Errorf("delete project section artifact: %w", err)
	}
	return nil
}

func (s *Service) loadProjectSectionArtifact(ctx context.Context, ownerUserID, projectID, artifactID string) (entity.ProjectSectionArtifact, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return entity.ProjectSectionArtifact{}, err
	}
	artifactID = strings.TrimSpace(artifactID)
	if artifactID == "" {
		return entity.ProjectSectionArtifact{}, ErrProjectNotFound
	}
	var artifact entity.ProjectSectionArtifact
	if err := s.db.WithContext(ctx).First(&artifact, "id = ? AND project_id = ?", artifactID, project.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return entity.ProjectSectionArtifact{}, ErrProjectNotFound
		}
		return entity.ProjectSectionArtifact{}, fmt.Errorf("get project section artifact: %w", err)
	}
	return artifact, nil
}

func isValidProjectSectionArtifactInput(input CreateProjectSectionArtifactInput) bool {
	if input.ProjectID == "" || input.CADDocumentRevision <= 0 || input.Unit == "" || utf8.RuneCountInString(input.Unit) > 32 {
		return false
	}
	if input.Filename == "" || utf8.RuneCountInString(input.Filename) > 255 || strings.ToLower(filepath.Ext(input.Filename)) != ".step" || input.ContentType != "model/step" {
		return false
	}
	if input.TargetCount <= 0 || input.TargetCount != len(input.SourceRevisionIDs) || input.TargetCount != len(input.OccurrenceIDs) || input.TargetCount > maxProjectSectionArtifactInputs {
		return false
	}
	if (input.AssociationID == "" && input.ExpectedGeneration != 0) || (input.AssociationID != "" && (utf8.RuneCountInString(input.AssociationID) > 32 || input.ExpectedGeneration <= 0)) {
		return false
	}
	for _, value := range append(append([]string{}, input.SourceRevisionIDs...), input.OccurrenceIDs...) {
		if strings.TrimSpace(value) == "" || utf8.RuneCountInString(value) > 64 {
			return false
		}
	}
	if !isFiniteProjectInspectionVector(input.PlaneOrigin) || !isFiniteProjectInspectionVector(input.PlaneNormal) || (input.PlaneNormal.X == 0 && input.PlaneNormal.Y == 0 && input.PlaneNormal.Z == 0) {
		return false
	}
	switch input.Status {
	case ProjectSectionArtifactStatusReady:
		return input.EdgeCount > 0 && len(input.Data) <= MaxProjectSectionArtifactBytes && bytes.HasPrefix(bytes.TrimSpace(input.Data), []byte("ISO-10303-21;"))
	case ProjectSectionArtifactStatusEmpty:
		return input.EdgeCount == 0 && len(input.Data) == 0
	default:
		return false
	}
}

func publicProjectSectionArtifact(artifact entity.ProjectSectionArtifact, isLatest bool) ProjectSectionArtifact {
	return ProjectSectionArtifact{
		ID: artifact.ID, ProjectID: artifact.ProjectID, CADDocumentRevision: artifact.CADDocumentRevision,
		AssociationID: artifact.AssociationID, Generation: artifact.Generation, SupersedesArtifactID: artifact.SupersedesArtifactID, IsLatest: isLatest,
		Unit: artifact.Unit, Status: artifact.Status, Filename: artifact.Filename, ContentType: artifact.ContentType,
		TargetCount: artifact.TargetCount, SourceRevisionIDs: unmarshalProjectExportArtifactIDs(artifact.SourceRevisionIDsJSON),
		OccurrenceIDs: unmarshalProjectExportArtifactIDs(artifact.OccurrenceIDsJSON), PlaneOrigin: unmarshalProjectSectionArtifactVector(artifact.PlaneOriginJSON),
		PlaneNormal: unmarshalProjectSectionArtifactVector(artifact.PlaneNormalJSON), EdgeCount: artifact.EdgeCount, ByteSize: artifact.ByteSize,
		CreatedAt: artifact.CreatedAt.Format(timeFormatRFC3339), UpdatedAt: artifact.UpdatedAt.Format(timeFormatRFC3339),
	}
}

func unmarshalProjectSectionArtifactVector(data []byte) ProjectInspectionVector {
	var value ProjectInspectionVector
	if len(data) == 0 || json.Unmarshal(data, &value) != nil {
		return ProjectInspectionVector{}
	}
	return value
}
