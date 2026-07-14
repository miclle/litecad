package service

import (
	"context"
	"strings"
	"time"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

type DuplicateProjectCADOccurrenceInput struct {
	OwnerUserID      string
	ProjectID        string
	OccurrenceID     string
	ExpectedRevision int
}

type UpdateProjectCADOccurrenceInput struct {
	OwnerUserID      string
	ProjectID        string
	OccurrenceID     string
	Name             *string
	Suppressed       *bool
	Transform        *CADTransform
	ExpectedRevision int
}

type MoveProjectCADOccurrenceInput struct {
	OwnerUserID      string
	ProjectID        string
	OccurrenceID     string
	TargetIndex      int
	ExpectedRevision int
}

type DeleteProjectCADOccurrenceInput struct {
	OwnerUserID      string
	ProjectID        string
	OccurrenceID     string
	ExpectedRevision int
}

func (s *Service) DuplicateProjectCADOccurrence(ctx context.Context, input DuplicateProjectCADOccurrenceInput) (ProjectCADDocument, error) {
	project, err := s.validateOwnedOccurrenceProject(ctx, input.OwnerUserID, input.ProjectID, input.OccurrenceID, input.ExpectedRevision)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	return s.mutateCADOccurrence(ctx, project, input.ExpectedRevision, func(tx *gorm.DB, document *entity.ProjectCADDocument, state *cadDocumentState) error {
		index := cadAssemblyOccurrenceIndex(state.Assembly.Occurrences, strings.TrimSpace(input.OccurrenceID))
		if index < 0 {
			return ErrProjectNotFound
		}
		occurrence := state.Assembly.Occurrences[index]
		occurrence.ID, err = id.NewPrefixed("occ")
		if err != nil {
			return err
		}
		occurrence.Name = strings.TrimSpace(occurrence.Name) + " copy"
		insertIndex := index + 1
		state.Assembly.Occurrences = insertCADAssemblyOccurrence(state.Assembly.Occurrences, insertIndex, occurrence)
		_, err = appendProjectCADHistoryEntry(ctx, tx, document, "occurrence-create", occurrence.ID, "Duplicate "+occurrence.Name, cadOccurrenceCreateHistoryCommand{
			Occurrence: occurrence, Index: insertIndex,
		})
		return err
	})
}

func (s *Service) UpdateProjectCADOccurrence(ctx context.Context, input UpdateProjectCADOccurrenceInput) (ProjectCADDocument, error) {
	project, err := s.validateOwnedOccurrenceProject(ctx, input.OwnerUserID, input.ProjectID, input.OccurrenceID, input.ExpectedRevision)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	if input.Name == nil && input.Suppressed == nil && input.Transform == nil {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	if input.Name != nil && (strings.TrimSpace(*input.Name) == "" || len(strings.TrimSpace(*input.Name)) > 200) {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	if input.Transform != nil && !isValidCADTransform(*input.Transform) {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	return s.mutateCADOccurrence(ctx, project, input.ExpectedRevision, func(tx *gorm.DB, document *entity.ProjectCADDocument, state *cadDocumentState) error {
		index := cadAssemblyOccurrenceIndex(state.Assembly.Occurrences, strings.TrimSpace(input.OccurrenceID))
		if index < 0 {
			return ErrProjectNotFound
		}
		before := state.Assembly.Occurrences[index]
		after := before
		if input.Name != nil {
			after.Name = strings.TrimSpace(*input.Name)
		}
		if input.Suppressed != nil {
			after.Suppressed = *input.Suppressed
		}
		if input.Transform != nil {
			after.Transform = *input.Transform
		}
		if after == before {
			return ErrInvalidCADDocumentInput
		}
		state.Assembly.Occurrences[index] = after
		_, err = appendProjectCADHistoryEntry(ctx, tx, document, "occurrence-update", after.ID, "Update "+after.Name, cadOccurrenceUpdateHistoryCommand{
			Before: before, After: after,
		})
		return err
	})
}

func (s *Service) MoveProjectCADOccurrence(ctx context.Context, input MoveProjectCADOccurrenceInput) (ProjectCADDocument, error) {
	project, err := s.validateOwnedOccurrenceProject(ctx, input.OwnerUserID, input.ProjectID, input.OccurrenceID, input.ExpectedRevision)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	return s.mutateCADOccurrence(ctx, project, input.ExpectedRevision, func(tx *gorm.DB, document *entity.ProjectCADDocument, state *cadDocumentState) error {
		beforeIndex := cadAssemblyOccurrenceIndex(state.Assembly.Occurrences, strings.TrimSpace(input.OccurrenceID))
		if beforeIndex < 0 {
			return ErrProjectNotFound
		}
		if input.TargetIndex < 0 || input.TargetIndex >= len(state.Assembly.Occurrences) || input.TargetIndex == beforeIndex {
			return ErrInvalidCADDocumentInput
		}
		occurrence := state.Assembly.Occurrences[beforeIndex]
		if err := moveCADAssemblyOccurrence(state, occurrence.ID, input.TargetIndex); err != nil {
			return err
		}
		_, err = appendProjectCADHistoryEntry(ctx, tx, document, "occurrence-move", occurrence.ID, "Reorder "+occurrence.Name, cadOccurrenceMoveHistoryCommand{
			OccurrenceID: occurrence.ID, BeforeIndex: beforeIndex, AfterIndex: input.TargetIndex,
		})
		return err
	})
}

func (s *Service) DeleteProjectCADOccurrence(ctx context.Context, input DeleteProjectCADOccurrenceInput) (ProjectCADDocument, error) {
	project, err := s.validateOwnedOccurrenceProject(ctx, input.OwnerUserID, input.ProjectID, input.OccurrenceID, input.ExpectedRevision)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	return s.mutateCADOccurrence(ctx, project, input.ExpectedRevision, func(tx *gorm.DB, document *entity.ProjectCADDocument, state *cadDocumentState) error {
		index := cadAssemblyOccurrenceIndex(state.Assembly.Occurrences, strings.TrimSpace(input.OccurrenceID))
		if index < 0 {
			return ErrProjectNotFound
		}
		occurrence := state.Assembly.Occurrences[index]
		modelOccurrenceCount := 0
		for _, candidate := range state.Assembly.Occurrences {
			if candidate.ModelID == occurrence.ModelID {
				modelOccurrenceCount++
			}
		}
		if modelOccurrenceCount <= 1 {
			return ErrInvalidCADDocumentInput
		}
		state.Assembly.Occurrences = append(state.Assembly.Occurrences[:index], state.Assembly.Occurrences[index+1:]...)
		_, err = appendProjectCADHistoryEntry(ctx, tx, document, "occurrence-delete", occurrence.ID, "Delete "+occurrence.Name, cadOccurrenceDeleteHistoryCommand{
			Occurrence: occurrence, Index: index,
		})
		return err
	})
}

func (s *Service) validateOwnedOccurrenceProject(ctx context.Context, ownerUserID, projectID, occurrenceID string, expectedRevision int) (entity.Project, error) {
	if strings.TrimSpace(ownerUserID) == "" || strings.TrimSpace(projectID) == "" || strings.TrimSpace(occurrenceID) == "" {
		return entity.Project{}, ErrProjectNotFound
	}
	if expectedRevision <= 0 {
		return entity.Project{}, ErrInvalidCADDocumentInput
	}
	return s.loadOwnedProject(ctx, ownerUserID, projectID)
}

func (s *Service) mutateCADOccurrence(
	ctx context.Context,
	project entity.Project,
	expectedRevision int,
	mutate func(*gorm.DB, *entity.ProjectCADDocument, *cadDocumentState) error,
) (ProjectCADDocument, error) {
	var publicDocument ProjectCADDocument
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		document, state, err := s.getOrCreateProjectCADDocumentEntity(ctx, tx, project)
		if err != nil {
			return err
		}
		if document.Revision != expectedRevision {
			return ErrCADDocumentConflict
		}
		if err := mutate(tx, &document, &state); err != nil {
			return err
		}
		if err := persistProjectCADDocumentEntity(ctx, tx, &document, state); err != nil {
			return err
		}
		document.UpdatedAt = time.Now().UTC()
		publicDocument = publicProjectCADDocument(document, state)
		return populateProjectCADHistoryState(ctx, tx, document, &publicDocument)
	})
	return publicDocument, err
}

func moveCADAssemblyOccurrence(state *cadDocumentState, occurrenceID string, targetIndex int) error {
	index := cadAssemblyOccurrenceIndex(state.Assembly.Occurrences, occurrenceID)
	if index < 0 || targetIndex < 0 || targetIndex >= len(state.Assembly.Occurrences) {
		return ErrInvalidCADDocumentInput
	}
	occurrence := state.Assembly.Occurrences[index]
	state.Assembly.Occurrences = append(state.Assembly.Occurrences[:index], state.Assembly.Occurrences[index+1:]...)
	state.Assembly.Occurrences = insertCADAssemblyOccurrence(state.Assembly.Occurrences, targetIndex, occurrence)
	return nil
}
