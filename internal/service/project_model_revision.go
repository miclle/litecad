package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

// ProjectModelRevision is the public metadata for one immutable model snapshot.
type ProjectModelRevision struct {
	ID               string       `json:"id"`
	ProjectID        string       `json:"project_id"`
	ModelID          string       `json:"model_id"`
	ParentRevisionID string       `json:"parent_revision_id,omitempty"`
	Sequence         int          `json:"sequence"`
	ByteSize         int64        `json:"byte_size"`
	Metadata         StepMetadata `json:"metadata"`
	ContentChecksum  string       `json:"content_checksum"`
	Summary          string       `json:"summary"`
	IsCurrent        bool         `json:"is_current"`
	CreatedAt        string       `json:"created_at"`
}

// ProjectModelRevisionSource is one immutable source snapshot and its owning model metadata.
type ProjectModelRevisionSource struct {
	Model    ProjectModel
	Revision ProjectModelRevision
	Data     []byte
}

// RestoreProjectModelRevisionInput selects an immutable snapshot as the active model version.
type RestoreProjectModelRevisionInput struct {
	OwnerUserID      string
	ProjectID        string
	ModelID          string
	RevisionID       string
	ExpectedRevision int
}

// ListProjectModelRevisions returns newest-first immutable revisions for one owned model.
func (s *Service) ListProjectModelRevisions(ctx context.Context, ownerUserID, projectID, modelID string) ([]ProjectModelRevision, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return nil, err
	}
	modelID = strings.TrimSpace(modelID)
	if modelID == "" {
		return nil, ErrProjectNotFound
	}
	var model entity.ProjectModel
	if err := s.db.WithContext(ctx).First(&model, "id = ? AND project_id = ?", modelID, project.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrProjectNotFound
		}
		return nil, fmt.Errorf("load project model revisions model: %w", err)
	}
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		_, err := ensureProjectModelRevision(ctx, tx, &model)
		return err
	}); err != nil {
		return nil, err
	}
	var revisions []entity.ProjectModelRevision
	if err := s.db.WithContext(ctx).Where("project_id = ? AND model_id = ?", project.ID, model.ID).Order("sequence DESC").Find(&revisions).Error; err != nil {
		return nil, fmt.Errorf("list project model revisions: %w", err)
	}
	result := make([]ProjectModelRevision, 0, len(revisions))
	for _, revision := range revisions {
		result = append(result, publicProjectModelRevision(revision, revision.ID == model.CurrentRevisionID))
	}
	return result, nil
}

// GetProjectModelRevision returns one immutable snapshot's public metadata.
func (s *Service) GetProjectModelRevision(ctx context.Context, ownerUserID, projectID, modelID, revisionID string) (ProjectModelRevision, error) {
	revisionID = strings.TrimSpace(revisionID)
	if revisionID == "" {
		return ProjectModelRevision{}, ErrProjectNotFound
	}
	revisions, err := s.ListProjectModelRevisions(ctx, ownerUserID, projectID, modelID)
	if err != nil {
		return ProjectModelRevision{}, err
	}
	for _, revision := range revisions {
		if revision.ID == revisionID {
			return revision, nil
		}
	}
	return ProjectModelRevision{}, ErrProjectNotFound
}

// GetProjectModelRevisionSource returns immutable source bytes for one owned model revision.
func (s *Service) GetProjectModelRevisionSource(ctx context.Context, ownerUserID, projectID, modelID, revisionID string) (ProjectModelRevisionSource, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return ProjectModelRevisionSource{}, err
	}
	modelID = strings.TrimSpace(modelID)
	revisionID = strings.TrimSpace(revisionID)
	if modelID == "" || revisionID == "" {
		return ProjectModelRevisionSource{}, ErrProjectNotFound
	}
	var model entity.ProjectModel
	if err := s.db.WithContext(ctx).First(&model, "id = ? AND project_id = ?", modelID, project.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectModelRevisionSource{}, ErrProjectNotFound
		}
		return ProjectModelRevisionSource{}, fmt.Errorf("load project model revision source model: %w", err)
	}
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		_, err := ensureProjectModelRevision(ctx, tx, &model)
		return err
	}); err != nil {
		return ProjectModelRevisionSource{}, err
	}
	var revision entity.ProjectModelRevision
	if err := s.db.WithContext(ctx).First(&revision, "id = ? AND model_id = ? AND project_id = ?", revisionID, model.ID, project.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectModelRevisionSource{}, ErrProjectNotFound
		}
		return ProjectModelRevisionSource{}, fmt.Errorf("load project model revision source: %w", err)
	}
	return ProjectModelRevisionSource{
		Model:    publicProjectModel(model),
		Revision: publicProjectModelRevision(revision, revision.ID == model.CurrentRevisionID),
		Data:     append([]byte(nil), revision.SourceData...),
	}, nil
}

// RestoreProjectModelRevision switches the active model snapshot through CAD History.
func (s *Service) RestoreProjectModelRevision(ctx context.Context, input RestoreProjectModelRevisionInput) (ProjectModel, error) {
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectModel{}, err
	}
	modelID := strings.TrimSpace(input.ModelID)
	revisionID := strings.TrimSpace(input.RevisionID)
	if modelID == "" || revisionID == "" {
		return ProjectModel{}, ErrProjectNotFound
	}
	if input.ExpectedRevision <= 0 {
		return ProjectModel{}, ErrInvalidCADDocumentInput
	}

	var model entity.ProjectModel
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.WithContext(ctx).First(&model, "id = ? AND project_id = ?", modelID, project.ID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProjectNotFound
			}
			return fmt.Errorf("load project model for revision restore: %w", err)
		}
		document, state, err := s.getOrCreateProjectCADDocumentEntity(ctx, tx, project)
		if err != nil {
			return err
		}
		if document.Revision != input.ExpectedRevision {
			return ErrCADDocumentConflict
		}
		beforeRevision, err := ensureProjectModelRevision(ctx, tx, &model)
		if err != nil {
			return err
		}
		var target entity.ProjectModelRevision
		if err := tx.WithContext(ctx).First(&target, "id = ? AND model_id = ? AND project_id = ?", revisionID, model.ID, project.ID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProjectNotFound
			}
			return fmt.Errorf("load project model revision for restore: %w", err)
		}
		if target.ID == beforeRevision.ID {
			model.CurrentRevisionSequence = target.Sequence
			return nil
		}
		model.CurrentRevisionID = target.ID
		model.CurrentRevisionSequence = target.Sequence
		model.SourceData = append([]byte(nil), target.SourceData...)
		model.MetadataJSON = append([]byte(nil), target.MetadataJSON...)
		model.ByteSize = int64(len(target.SourceData))
		if err := tx.WithContext(ctx).Model(&model).Updates(map[string]any{
			"current_revision_id": model.CurrentRevisionID,
			"source_data":         model.SourceData,
			"metadata_json":       model.MetadataJSON,
			"byte_size":           model.ByteSize,
		}).Error; err != nil {
			return fmt.Errorf("restore project model revision: %w", err)
		}
		if err := setCADDocumentModelRevision(&state, model.ID, target.ID); err != nil {
			return err
		}
		if _, err := appendProjectCADHistoryEntry(ctx, tx, &document, "model-revision-restore", model.ID, "Restore "+model.OriginalFilename+" revision "+fmt.Sprint(target.Sequence), cadParameterChangeHistoryCommand{
			ModelID:          model.ID,
			BeforeRevisionID: beforeRevision.ID,
			AfterRevisionID:  target.ID,
		}); err != nil {
			return err
		}
		return persistProjectCADDocumentEntity(ctx, tx, &document, state)
	})
	if err != nil {
		return ProjectModel{}, err
	}
	return publicProjectModel(model), nil
}

func ensureProjectModelRevision(ctx context.Context, tx *gorm.DB, model *entity.ProjectModel) (entity.ProjectModelRevision, error) {
	if model.CurrentRevisionID != "" {
		var current entity.ProjectModelRevision
		if err := tx.WithContext(ctx).First(&current, "id = ? AND model_id = ?", model.CurrentRevisionID, model.ID).Error; err != nil {
			return entity.ProjectModelRevision{}, fmt.Errorf("load current project model revision: %w", err)
		}
		model.CurrentRevisionSequence = current.Sequence
		return current, nil
	}

	var current entity.ProjectModelRevision
	err := tx.WithContext(ctx).Where("model_id = ?", model.ID).Order("sequence DESC").First(&current).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return entity.ProjectModelRevision{}, fmt.Errorf("load latest project model revision: %w", err)
	}
	if err == gorm.ErrRecordNotFound {
		var createErr error
		current, createErr = createProjectModelRevision(ctx, tx, *model, "Initial model source")
		if createErr != nil {
			return entity.ProjectModelRevision{}, createErr
		}
	}
	if err := tx.WithContext(ctx).Model(&entity.ProjectModel{}).Where("id = ?", model.ID).Update("current_revision_id", current.ID).Error; err != nil {
		return entity.ProjectModelRevision{}, fmt.Errorf("set current project model revision: %w", err)
	}
	model.CurrentRevisionID = current.ID
	model.CurrentRevisionSequence = current.Sequence
	return current, nil
}

func createProjectModelRevision(ctx context.Context, tx *gorm.DB, model entity.ProjectModel, summary string) (entity.ProjectModelRevision, error) {
	var latestSequence int
	if err := tx.WithContext(ctx).Model(&entity.ProjectModelRevision{}).
		Where("model_id = ?", model.ID).
		Select("COALESCE(MAX(sequence), 0)").
		Scan(&latestSequence).Error; err != nil {
		return entity.ProjectModelRevision{}, fmt.Errorf("load project model revision sequence: %w", err)
	}
	revisionID, err := id.NewPrefixed("mvr")
	if err != nil {
		return entity.ProjectModelRevision{}, err
	}
	revision := entity.ProjectModelRevision{
		ID:               revisionID,
		ProjectID:        model.ProjectID,
		ModelID:          model.ID,
		ParentRevisionID: model.CurrentRevisionID,
		Sequence:         latestSequence + 1,
		SourceData:       append([]byte(nil), model.SourceData...),
		MetadataJSON:     append([]byte(nil), model.MetadataJSON...),
		ContentChecksum:  projectModelRevisionChecksum(model.SourceData, model.MetadataJSON),
		Summary:          summary,
	}
	if err := tx.WithContext(ctx).Create(&revision).Error; err != nil {
		return entity.ProjectModelRevision{}, fmt.Errorf("create project model revision: %w", err)
	}
	return revision, nil
}

func projectModelRevisionChecksum(sourceData, metadataJSON []byte) string {
	hash := sha256.New()
	_, _ = hash.Write(sourceData)
	_, _ = hash.Write([]byte{0})
	_, _ = hash.Write(metadataJSON)
	return hex.EncodeToString(hash.Sum(nil))
}

func publicProjectModelRevision(revision entity.ProjectModelRevision, isCurrent bool) ProjectModelRevision {
	metadata := StepMetadata{}
	if len(revision.MetadataJSON) > 0 {
		_ = json.Unmarshal(revision.MetadataJSON, &metadata)
	}
	return ProjectModelRevision{
		ID:               revision.ID,
		ProjectID:        revision.ProjectID,
		ModelID:          revision.ModelID,
		ParentRevisionID: revision.ParentRevisionID,
		Sequence:         revision.Sequence,
		ByteSize:         int64(len(revision.SourceData)),
		Metadata:         metadata,
		ContentChecksum:  revision.ContentChecksum,
		Summary:          revision.Summary,
		IsCurrent:        isCurrent,
		CreatedAt:        revision.CreatedAt.Format(timeFormatRFC3339),
	}
}
