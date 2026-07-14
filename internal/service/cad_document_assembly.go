package service

import (
	"context"
	"strings"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const (
	cadAssemblyConstraintKindMate         = "mate"
	cadAssemblyConstraintStatusUnresolved = "unresolved"
)

type CreateProjectCADAssemblyGroupInput struct {
	OwnerUserID      string
	ProjectID        string
	ParentGroupID    string
	Name             string
	ExpectedRevision int
}

type UpdateProjectCADAssemblyGroupInput struct {
	OwnerUserID      string
	ProjectID        string
	GroupID          string
	Name             *string
	ParentGroupID    *string
	Suppressed       *bool
	ExpectedRevision int
}

type DeleteProjectCADAssemblyGroupInput struct {
	OwnerUserID      string
	ProjectID        string
	GroupID          string
	ExpectedRevision int
}

type CreateProjectCADAssemblyConstraintInput struct {
	OwnerUserID        string
	ProjectID          string
	Name               string
	Kind               string
	FirstOccurrenceID  string
	SecondOccurrenceID string
	ExpectedRevision   int
}

type DeleteProjectCADAssemblyConstraintInput struct {
	OwnerUserID      string
	ProjectID        string
	ConstraintID     string
	ExpectedRevision int
}

func (s *Service) CreateProjectCADAssemblyGroup(ctx context.Context, input CreateProjectCADAssemblyGroupInput) (ProjectCADDocument, error) {
	project, err := s.validateOwnedAssemblyProject(ctx, input.OwnerUserID, input.ProjectID, input.ExpectedRevision)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	name := strings.TrimSpace(input.Name)
	if name == "" || len(name) > 200 {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	return s.mutateCADOccurrence(ctx, project, input.ExpectedRevision, func(tx *gorm.DB, document *entity.ProjectCADDocument, state *cadDocumentState) error {
		groupID, err := id.NewPrefixed("grp")
		if err != nil {
			return err
		}
		group := CADAssemblyGroup{ID: groupID, ParentGroupID: strings.TrimSpace(input.ParentGroupID), Name: name}
		index := len(state.Assembly.Groups)
		state.Assembly.Groups = append(state.Assembly.Groups, group)
		if err := validateCADAssembly(state.Assembly); err != nil {
			return err
		}
		_, err = appendProjectCADHistoryEntry(ctx, tx, document, "assembly-group-create", group.ID, "Create group "+group.Name, cadAssemblyGroupCreateHistoryCommand{
			Group: group, Index: index,
		})
		return err
	})
}

func (s *Service) UpdateProjectCADAssemblyGroup(ctx context.Context, input UpdateProjectCADAssemblyGroupInput) (ProjectCADDocument, error) {
	project, err := s.validateOwnedAssemblyProject(ctx, input.OwnerUserID, input.ProjectID, input.ExpectedRevision)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	if strings.TrimSpace(input.GroupID) == "" || (input.Name == nil && input.ParentGroupID == nil && input.Suppressed == nil) {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	if input.Name != nil && (strings.TrimSpace(*input.Name) == "" || len(strings.TrimSpace(*input.Name)) > 200) {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	return s.mutateCADOccurrence(ctx, project, input.ExpectedRevision, func(tx *gorm.DB, document *entity.ProjectCADDocument, state *cadDocumentState) error {
		index := cadAssemblyGroupIndex(state.Assembly.Groups, strings.TrimSpace(input.GroupID))
		if index < 0 {
			return ErrProjectNotFound
		}
		before := state.Assembly.Groups[index]
		after := before
		if input.Name != nil {
			after.Name = strings.TrimSpace(*input.Name)
		}
		if input.ParentGroupID != nil {
			after.ParentGroupID = strings.TrimSpace(*input.ParentGroupID)
		}
		if input.Suppressed != nil {
			after.Suppressed = *input.Suppressed
		}
		if after == before {
			return ErrInvalidCADDocumentInput
		}
		state.Assembly.Groups[index] = after
		if err := validateCADAssembly(state.Assembly); err != nil {
			return err
		}
		_, err = appendProjectCADHistoryEntry(ctx, tx, document, "assembly-group-update", after.ID, "Update group "+after.Name, cadAssemblyGroupUpdateHistoryCommand{
			Before: before, After: after,
		})
		return err
	})
}

func (s *Service) DeleteProjectCADAssemblyGroup(ctx context.Context, input DeleteProjectCADAssemblyGroupInput) (ProjectCADDocument, error) {
	project, err := s.validateOwnedAssemblyProject(ctx, input.OwnerUserID, input.ProjectID, input.ExpectedRevision)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	return s.mutateCADOccurrence(ctx, project, input.ExpectedRevision, func(tx *gorm.DB, document *entity.ProjectCADDocument, state *cadDocumentState) error {
		index := cadAssemblyGroupIndex(state.Assembly.Groups, strings.TrimSpace(input.GroupID))
		if index < 0 {
			return ErrProjectNotFound
		}
		group := state.Assembly.Groups[index]
		for _, candidate := range state.Assembly.Groups {
			if candidate.ParentGroupID == group.ID {
				return ErrInvalidCADDocumentInput
			}
		}
		for _, occurrence := range state.Assembly.Occurrences {
			if occurrence.ParentGroupID == group.ID {
				return ErrInvalidCADDocumentInput
			}
		}
		state.Assembly.Groups = append(state.Assembly.Groups[:index], state.Assembly.Groups[index+1:]...)
		_, err = appendProjectCADHistoryEntry(ctx, tx, document, "assembly-group-delete", group.ID, "Delete group "+group.Name, cadAssemblyGroupDeleteHistoryCommand{
			Group: group, Index: index,
		})
		return err
	})
}

func (s *Service) CreateProjectCADAssemblyConstraint(ctx context.Context, input CreateProjectCADAssemblyConstraintInput) (ProjectCADDocument, error) {
	project, err := s.validateOwnedAssemblyProject(ctx, input.OwnerUserID, input.ProjectID, input.ExpectedRevision)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	name := strings.TrimSpace(input.Name)
	firstOccurrenceID := strings.TrimSpace(input.FirstOccurrenceID)
	secondOccurrenceID := strings.TrimSpace(input.SecondOccurrenceID)
	if name == "" || len(name) > 200 || strings.TrimSpace(input.Kind) != cadAssemblyConstraintKindMate || firstOccurrenceID == "" || firstOccurrenceID == secondOccurrenceID {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	return s.mutateCADOccurrence(ctx, project, input.ExpectedRevision, func(tx *gorm.DB, document *entity.ProjectCADDocument, state *cadDocumentState) error {
		constraintID, err := id.NewPrefixed("cst")
		if err != nil {
			return err
		}
		constraint := CADAssemblyConstraintRecord{
			ID: constraintID, Kind: cadAssemblyConstraintKindMate, Name: name,
			FirstOccurrenceID: firstOccurrenceID, SecondOccurrenceID: secondOccurrenceID,
			Status: cadAssemblyConstraintStatusUnresolved,
		}
		index := len(state.Assembly.Constraints)
		state.Assembly.Constraints = append(state.Assembly.Constraints, constraint)
		if err := validateCADAssembly(state.Assembly); err != nil {
			return err
		}
		_, err = appendProjectCADHistoryEntry(ctx, tx, document, "assembly-constraint-create", constraint.ID, "Record mate "+constraint.Name, cadAssemblyConstraintCreateHistoryCommand{
			Constraint: constraint, Index: index,
		})
		return err
	})
}

func (s *Service) DeleteProjectCADAssemblyConstraint(ctx context.Context, input DeleteProjectCADAssemblyConstraintInput) (ProjectCADDocument, error) {
	project, err := s.validateOwnedAssemblyProject(ctx, input.OwnerUserID, input.ProjectID, input.ExpectedRevision)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	return s.mutateCADOccurrence(ctx, project, input.ExpectedRevision, func(tx *gorm.DB, document *entity.ProjectCADDocument, state *cadDocumentState) error {
		index := cadAssemblyConstraintIndex(state.Assembly.Constraints, strings.TrimSpace(input.ConstraintID))
		if index < 0 {
			return ErrProjectNotFound
		}
		constraint := state.Assembly.Constraints[index]
		state.Assembly.Constraints = append(state.Assembly.Constraints[:index], state.Assembly.Constraints[index+1:]...)
		_, err = appendProjectCADHistoryEntry(ctx, tx, document, "assembly-constraint-delete", constraint.ID, "Delete mate "+constraint.Name, cadAssemblyConstraintDeleteHistoryCommand{
			Constraint: constraint, Index: index,
		})
		return err
	})
}

func (s *Service) validateOwnedAssemblyProject(ctx context.Context, ownerUserID, projectID string, expectedRevision int) (entity.Project, error) {
	if strings.TrimSpace(ownerUserID) == "" || strings.TrimSpace(projectID) == "" {
		return entity.Project{}, ErrProjectNotFound
	}
	if expectedRevision <= 0 {
		return entity.Project{}, ErrInvalidCADDocumentInput
	}
	return s.loadOwnedProject(ctx, ownerUserID, projectID)
}

func validateCADAssembly(assembly CADAssembly) error {
	groupByID := make(map[string]CADAssemblyGroup, len(assembly.Groups))
	for _, group := range assembly.Groups {
		if strings.TrimSpace(group.ID) == "" || strings.TrimSpace(group.Name) == "" {
			return ErrInvalidCADDocumentInput
		}
		if _, exists := groupByID[group.ID]; exists {
			return ErrInvalidCADDocumentInput
		}
		groupByID[group.ID] = group
	}
	for _, group := range assembly.Groups {
		seen := map[string]struct{}{group.ID: {}}
		parentID := group.ParentGroupID
		for parentID != "" {
			if _, exists := seen[parentID]; exists {
				return ErrInvalidCADDocumentInput
			}
			seen[parentID] = struct{}{}
			parent, exists := groupByID[parentID]
			if !exists {
				return ErrInvalidCADDocumentInput
			}
			parentID = parent.ParentGroupID
		}
	}
	occurrenceByID := make(map[string]struct{}, len(assembly.Occurrences))
	for _, occurrence := range assembly.Occurrences {
		if strings.TrimSpace(occurrence.ID) == "" {
			return ErrInvalidCADDocumentInput
		}
		if _, exists := occurrenceByID[occurrence.ID]; exists {
			return ErrInvalidCADDocumentInput
		}
		occurrenceByID[occurrence.ID] = struct{}{}
		if occurrence.ParentGroupID != "" {
			if _, exists := groupByID[occurrence.ParentGroupID]; !exists {
				return ErrInvalidCADDocumentInput
			}
		}
	}
	constraintByID := make(map[string]struct{}, len(assembly.Constraints))
	for _, constraint := range assembly.Constraints {
		if strings.TrimSpace(constraint.ID) == "" || strings.TrimSpace(constraint.Name) == "" || constraint.Kind != cadAssemblyConstraintKindMate || constraint.Status != cadAssemblyConstraintStatusUnresolved || constraint.FirstOccurrenceID == constraint.SecondOccurrenceID {
			return ErrInvalidCADDocumentInput
		}
		if _, exists := constraintByID[constraint.ID]; exists {
			return ErrInvalidCADDocumentInput
		}
		constraintByID[constraint.ID] = struct{}{}
		if _, exists := occurrenceByID[constraint.FirstOccurrenceID]; !exists {
			return ErrInvalidCADDocumentInput
		}
		if _, exists := occurrenceByID[constraint.SecondOccurrenceID]; !exists {
			return ErrInvalidCADDocumentInput
		}
	}
	return nil
}

func cadAssemblyOccurrenceEffectivelySuppressed(assembly CADAssembly, occurrence CADAssemblyOccurrence) bool {
	if occurrence.Suppressed {
		return true
	}
	groupByID := make(map[string]CADAssemblyGroup, len(assembly.Groups))
	for _, group := range assembly.Groups {
		groupByID[group.ID] = group
	}
	seen := map[string]struct{}{}
	for groupID := occurrence.ParentGroupID; groupID != ""; {
		if _, exists := seen[groupID]; exists {
			return true
		}
		seen[groupID] = struct{}{}
		group, exists := groupByID[groupID]
		if !exists {
			return true
		}
		if group.Suppressed {
			return true
		}
		groupID = group.ParentGroupID
	}
	return false
}

func cadAssemblyGroupIndex(groups []CADAssemblyGroup, groupID string) int {
	for index := range groups {
		if groups[index].ID == groupID {
			return index
		}
	}
	return -1
}

func cadAssemblyConstraintIndex(constraints []CADAssemblyConstraintRecord, constraintID string) int {
	for index := range constraints {
		if constraints[index].ID == constraintID {
			return index
		}
	}
	return -1
}
