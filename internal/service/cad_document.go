package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	cadDocumentSchemaVersion             = 4
	cadDocumentFlatAssemblySchemaVersion = 2
)

var (
	// ErrInvalidCADDocumentInput indicates missing or malformed editable CAD document input.
	ErrInvalidCADDocumentInput = errors.New("invalid CAD document input")
	// ErrCADDocumentConflict indicates that a mutation used a stale document revision.
	ErrCADDocumentConflict = errors.New("CAD document revision conflict")
)

// CADTransform is a stable affine transform matrix applied to a document node.
type CADTransform struct {
	Matrix [16]float64 `json:"matrix"`
}

// CADBoxFeature describes an axis-aligned box feature in document units.
type CADBoxFeature struct {
	Origin [3]float64 `json:"origin"`
	Size   [3]float64 `json:"size"`
}

// ProjectCADDocument is the public editable LiteCAD document state for a project.
type ProjectCADDocument struct {
	ID            string            `json:"id"`
	ProjectID     string            `json:"project_id"`
	SchemaVersion int               `json:"schema_version"`
	Revision      int               `json:"revision"`
	Unit          string            `json:"unit"`
	Assembly      CADAssembly       `json:"assembly"`
	Nodes         []CADDocumentNode `json:"nodes"`
	Operations    []CADOperation    `json:"operations"`
	History       CADHistoryState   `json:"history"`
	CreatedAt     string            `json:"created_at"`
	UpdatedAt     string            `json:"updated_at"`
}

// CADAssembly is the durable assembly tree owned by a project document.
type CADAssembly struct {
	ID            string                             `json:"id"`
	Name          string                             `json:"name"`
	Groups        []CADAssemblyGroup                 `json:"groups"`
	Occurrences   []CADAssemblyOccurrence            `json:"occurrences"`
	Constraints   []CADAssemblyConstraintRecord      `json:"constraints"`
	Subassemblies []CADSubassemblyDefinitionRevision `json:"subassemblies"`
}

// CADAssemblyGroup provides nested organization and hierarchical suppression.
type CADAssemblyGroup struct {
	ID                            string `json:"id"`
	ParentGroupID                 string `json:"parent_group_id"`
	Name                          string `json:"name"`
	Suppressed                    bool   `json:"suppressed"`
	SubassemblyDefinitionID       string `json:"subassembly_definition_id,omitempty"`
	SubassemblyDefinitionRevision int    `json:"subassembly_definition_revision,omitempty"`
}

// CADSubassemblyDefinitionRevision is one immutable project-local reusable assembly snapshot.
type CADSubassemblyDefinitionRevision struct {
	ID       string                 `json:"id"`
	Revision int                    `json:"revision"`
	Name     string                 `json:"name"`
	Members  []CADSubassemblyMember `json:"members"`
}

// CADSubassemblyMember pins one source model revision and transform relative to the capture origin.
type CADSubassemblyMember struct {
	ID                string       `json:"id"`
	NodeID            string       `json:"node_id"`
	ModelID           string       `json:"model_id"`
	ModelRevisionID   string       `json:"model_revision_id"`
	Name              string       `json:"name"`
	Suppressed        bool         `json:"suppressed"`
	RelativeTransform CADTransform `json:"relative_transform"`
}

// CADAssemblyConstraintRecord stores either a legacy unresolved relationship or one solved point mate.
type CADAssemblyConstraintRecord struct {
	ID                 string     `json:"id"`
	Kind               string     `json:"kind"`
	Name               string     `json:"name"`
	FirstOccurrenceID  string     `json:"first_occurrence_id"`
	SecondOccurrenceID string     `json:"second_occurrence_id"`
	Status             string     `json:"status"`
	Solver             string     `json:"solver,omitempty"`
	FirstAnchor        [3]float64 `json:"first_anchor,omitempty"`
	SecondAnchor       [3]float64 `json:"second_anchor,omitempty"`
	Offset             [3]float64 `json:"offset,omitempty"`
	Residual           float64    `json:"residual,omitempty"`
}

// CADAssemblyOccurrence binds one source model revision to an assembly placement.
type CADAssemblyOccurrence struct {
	ID                  string       `json:"id"`
	NodeID              string       `json:"node_id"`
	ModelID             string       `json:"model_id"`
	ModelRevisionID     string       `json:"model_revision_id"`
	ParentGroupID       string       `json:"parent_group_id"`
	SubassemblyMemberID string       `json:"subassembly_member_id,omitempty"`
	Name                string       `json:"name"`
	Suppressed          bool         `json:"suppressed"`
	Transform           CADTransform `json:"transform"`
}

// CADHistoryState describes the current server-side Undo/Redo position.
type CADHistoryState struct {
	HeadID  string `json:"head_id"`
	CanUndo bool   `json:"can_undo"`
	CanRedo bool   `json:"can_redo"`
}

// CADDocumentNode maps one source model into the editable document graph.
type CADDocumentNode struct {
	ID              string       `json:"id"`
	ModelID         string       `json:"model_id"`
	ModelRevisionID string       `json:"model_revision_id,omitempty"`
	SourceModelID   string       `json:"source_model_id"`
	ParentNodeID    string       `json:"parent_node_id"`
	Name            string       `json:"name"`
	SourceFormat    string       `json:"source_format"`
	Transform       CADTransform `json:"transform"`
}

// CADOperation records a LiteCAD edit operation in replay order.
type CADOperation struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	ModelID   string         `json:"model_id"`
	NodeID    string         `json:"node_id,omitempty"`
	Transform *CADTransform  `json:"transform,omitempty"`
	Box       *CADBoxFeature `json:"box,omitempty"`
	CreatedAt string         `json:"created_at"`
}

// UpdateProjectCADModelTransformInput updates one model node transform in the editable document.
type UpdateProjectCADModelTransformInput struct {
	OwnerUserID      string
	ProjectID        string
	ModelID          string
	Transform        CADTransform
	ExpectedRevision int
}

// UpdateProjectCADNodeTransformInput updates one document node transform.
type UpdateProjectCADNodeTransformInput struct {
	OwnerUserID      string
	ProjectID        string
	NodeID           string
	Transform        CADTransform
	ExpectedRevision int
}

// DeleteProjectCADNodeInput deletes one editable document node.
type DeleteProjectCADNodeInput struct {
	OwnerUserID      string
	ProjectID        string
	NodeID           string
	ExpectedRevision int
}

// AddProjectCADModelBoxUnionInput appends one kernel-backed box union feature.
type AddProjectCADModelBoxUnionInput struct {
	OwnerUserID      string
	ProjectID        string
	ModelID          string
	Box              CADBoxFeature
	ExpectedRevision int
}

type cadDocumentState struct {
	Unit       string            `json:"unit"`
	Assembly   CADAssembly       `json:"assembly"`
	Nodes      []CADDocumentNode `json:"nodes"`
	Operations []CADOperation    `json:"operations"`
}

// GetProjectCADDocument returns the persisted editable CAD document for a signed-in owner.
func (s *Service) GetProjectCADDocument(ctx context.Context, ownerUserID, projectID string) (ProjectCADDocument, error) {
	ownerUserID = strings.TrimSpace(ownerUserID)
	projectID = strings.TrimSpace(projectID)
	if ownerUserID == "" || projectID == "" {
		return ProjectCADDocument{}, ErrProjectNotFound
	}

	var project entity.Project
	if err := s.db.WithContext(ctx).First(&project, "id = ? AND owner_user_id = ?", projectID, ownerUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectCADDocument{}, ErrProjectNotFound
		}
		return ProjectCADDocument{}, fmt.Errorf("load project CAD document: %w", err)
	}

	return s.getOrCreateProjectCADDocumentForProject(ctx, project)
}

// UpdateProjectCADModelTransform persists a per-model transform operation in the editable CAD document.
func (s *Service) UpdateProjectCADModelTransform(ctx context.Context, input UpdateProjectCADModelTransformInput) (ProjectCADDocument, error) {
	ownerUserID := strings.TrimSpace(input.OwnerUserID)
	projectID := strings.TrimSpace(input.ProjectID)
	modelID := strings.TrimSpace(input.ModelID)
	if ownerUserID == "" || projectID == "" || modelID == "" {
		return ProjectCADDocument{}, ErrProjectNotFound
	}
	if input.ExpectedRevision <= 0 {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	if !isValidCADTransform(input.Transform) {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}

	var project entity.Project
	if err := s.db.WithContext(ctx).First(&project, "id = ? AND owner_user_id = ?", projectID, ownerUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectCADDocument{}, ErrProjectNotFound
		}
		return ProjectCADDocument{}, fmt.Errorf("load project for CAD transform: %w", err)
	}

	var model entity.ProjectModel
	if err := s.db.WithContext(ctx).First(&model, "id = ? AND project_id = ?", modelID, project.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectCADDocument{}, ErrProjectNotFound
		}
		return ProjectCADDocument{}, fmt.Errorf("load model for CAD transform: %w", err)
	}

	return s.updateProjectCADNodeTransform(ctx, project, "node_"+model.ID, input.Transform, input.ExpectedRevision)
}

// UpdateProjectCADNodeTransform persists a transform operation for a document node.
func (s *Service) UpdateProjectCADNodeTransform(ctx context.Context, input UpdateProjectCADNodeTransformInput) (ProjectCADDocument, error) {
	ownerUserID := strings.TrimSpace(input.OwnerUserID)
	projectID := strings.TrimSpace(input.ProjectID)
	nodeID := strings.TrimSpace(input.NodeID)
	if ownerUserID == "" || projectID == "" || nodeID == "" {
		return ProjectCADDocument{}, ErrProjectNotFound
	}
	if input.ExpectedRevision <= 0 {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	if !isValidCADTransform(input.Transform) {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}

	var project entity.Project
	if err := s.db.WithContext(ctx).First(&project, "id = ? AND owner_user_id = ?", projectID, ownerUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectCADDocument{}, ErrProjectNotFound
		}
		return ProjectCADDocument{}, fmt.Errorf("load project for CAD node transform: %w", err)
	}

	return s.updateProjectCADNodeTransform(ctx, project, nodeID, input.Transform, input.ExpectedRevision)
}

// DeleteProjectCADNode removes a component node from the editable document.
func (s *Service) DeleteProjectCADNode(ctx context.Context, input DeleteProjectCADNodeInput) (ProjectCADDocument, error) {
	ownerUserID := strings.TrimSpace(input.OwnerUserID)
	projectID := strings.TrimSpace(input.ProjectID)
	nodeID := strings.TrimSpace(input.NodeID)
	if ownerUserID == "" || projectID == "" || nodeID == "" {
		return ProjectCADDocument{}, ErrProjectNotFound
	}
	if input.ExpectedRevision <= 0 {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}

	var project entity.Project
	if err := s.db.WithContext(ctx).First(&project, "id = ? AND owner_user_id = ?", projectID, ownerUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectCADDocument{}, ErrProjectNotFound
		}
		return ProjectCADDocument{}, fmt.Errorf("load project for CAD node delete: %w", err)
	}

	return s.deleteProjectCADNode(ctx, project, nodeID, input.ExpectedRevision)
}

// AddProjectCADModelBoxUnion persists one box union feature for browser-kernel replay.
func (s *Service) AddProjectCADModelBoxUnion(ctx context.Context, input AddProjectCADModelBoxUnionInput) (ProjectCADDocument, error) {
	ownerUserID := strings.TrimSpace(input.OwnerUserID)
	projectID := strings.TrimSpace(input.ProjectID)
	modelID := strings.TrimSpace(input.ModelID)
	if ownerUserID == "" || projectID == "" || modelID == "" {
		return ProjectCADDocument{}, ErrProjectNotFound
	}
	if input.ExpectedRevision <= 0 {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	if !isValidCADBoxFeature(input.Box) {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}

	var project entity.Project
	if err := s.db.WithContext(ctx).First(&project, "id = ? AND owner_user_id = ?", projectID, ownerUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectCADDocument{}, ErrProjectNotFound
		}
		return ProjectCADDocument{}, fmt.Errorf("load project for CAD box union: %w", err)
	}

	var model entity.ProjectModel
	if err := s.db.WithContext(ctx).First(&model, "id = ? AND project_id = ?", modelID, project.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectCADDocument{}, ErrProjectNotFound
		}
		return ProjectCADDocument{}, fmt.Errorf("load model for CAD box union: %w", err)
	}
	if model.Format != "step" {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}

	var publicDocument ProjectCADDocument
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		document, state, err := s.getOrCreateProjectCADDocumentEntity(ctx, tx, project)
		if err != nil {
			return err
		}
		if input.ExpectedRevision > 0 && document.Revision != input.ExpectedRevision {
			return ErrCADDocumentConflict
		}

		operationID, err := id.NewPrefixed("op")
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		box := input.Box
		operationIndex := len(state.Operations)
		operation := CADOperation{
			ID:        operationID,
			Type:      "box-union",
			ModelID:   model.ID,
			Box:       &box,
			CreatedAt: now.Format(timeFormatRFC3339),
		}
		state.Operations = append(state.Operations, operation)
		if _, err := appendProjectCADHistoryEntry(ctx, tx, &document, "box-union", model.ID, "Add box to "+model.OriginalFilename, cadBoxUnionHistoryCommand{
			Operation:      operation,
			OperationIndex: operationIndex,
		}); err != nil {
			return err
		}
		if err := persistProjectCADDocumentEntity(ctx, tx, &document, state); err != nil {
			return err
		}
		document.UpdatedAt = now
		publicDocument = publicProjectCADDocument(document, state)
		return populateProjectCADHistoryState(ctx, tx, document, &publicDocument)
	})
	if err != nil {
		return ProjectCADDocument{}, err
	}
	return publicDocument, nil
}

func (s *Service) deleteProjectCADNode(ctx context.Context, project entity.Project, nodeID string, expectedRevision int) (ProjectCADDocument, error) {
	var publicDocument ProjectCADDocument
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		document, state, err := s.getOrCreateProjectCADDocumentEntity(ctx, tx, project)
		if err != nil {
			return err
		}
		if expectedRevision > 0 && document.Revision != expectedRevision {
			return ErrCADDocumentConflict
		}

		nodeIndex := -1
		for index := range state.Nodes {
			if state.Nodes[index].ID == nodeID {
				nodeIndex = index
				break
			}
		}
		if nodeIndex < 0 {
			return ErrProjectNotFound
		}

		deletedNode := state.Nodes[nodeIndex]
		var deletedOccurrence *CADAssemblyOccurrence
		deletedOccurrenceIndex := -1
		deletedOccurrences := []cadDeletedAssemblyOccurrence{}
		if deletedNode.ParentNodeID == "" {
			for _, definition := range state.Assembly.Subassemblies {
				for _, member := range definition.Members {
					if member.NodeID == deletedNode.ID || member.ModelID == deletedNode.ModelID {
						return ErrInvalidCADDocumentInput
					}
				}
			}
			removedOccurrenceIDs := make(map[string]struct{})
			for _, occurrence := range state.Assembly.Occurrences {
				if occurrence.NodeID == deletedNode.ID {
					removedOccurrenceIDs[occurrence.ID] = struct{}{}
				}
			}
			for _, constraint := range state.Assembly.Constraints {
				_, removesFirst := removedOccurrenceIDs[constraint.FirstOccurrenceID]
				_, removesSecond := removedOccurrenceIDs[constraint.SecondOccurrenceID]
				if removesFirst || removesSecond {
					return ErrInvalidCADDocumentInput
				}
			}
			nextOccurrences := make([]CADAssemblyOccurrence, 0, len(state.Assembly.Occurrences))
			for index, occurrence := range state.Assembly.Occurrences {
				if occurrence.NodeID != deletedNode.ID {
					nextOccurrences = append(nextOccurrences, occurrence)
					continue
				}
				deletedOccurrences = append(deletedOccurrences, cadDeletedAssemblyOccurrence{Occurrence: occurrence, Index: index})
			}
			state.Assembly.Occurrences = nextOccurrences
			if len(deletedOccurrences) > 0 {
				occurrence := deletedOccurrences[0].Occurrence
				deletedOccurrence = &occurrence
				deletedOccurrenceIndex = deletedOccurrences[0].Index
			}
		}
		deletedNodes := []cadDeletedDocumentNode{{Node: deletedNode, Index: nodeIndex}}
		if deletedNode.ParentNodeID == "" {
			for index := nodeIndex + 1; index < len(state.Nodes); index++ {
				if state.Nodes[index].ParentNodeID == deletedNode.ID {
					deletedNodes = append(deletedNodes, cadDeletedDocumentNode{Node: state.Nodes[index], Index: index})
				}
			}
		}
		deletedNodeIDs := make(map[string]struct{}, len(deletedNodes))
		for _, node := range deletedNodes {
			deletedNodeIDs[node.Node.ID] = struct{}{}
		}
		nextNodes := state.Nodes[:0]
		for _, node := range state.Nodes {
			if _, ok := deletedNodeIDs[node.ID]; ok {
				continue
			}
			nextNodes = append(nextNodes, node)
		}
		state.Nodes = nextNodes

		operationID, err := id.NewPrefixed("op")
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		sourceModelID := deletedNode.SourceModelID
		if sourceModelID == "" {
			sourceModelID = deletedNode.ModelID
		}
		operationIndex := len(state.Operations)
		operation := CADOperation{
			ID:        operationID,
			Type:      "delete-node",
			ModelID:   sourceModelID,
			NodeID:    deletedNode.ID,
			CreatedAt: now.Format(timeFormatRFC3339),
		}
		state.Operations = append(state.Operations, operation)
		if _, err := appendProjectCADHistoryEntry(ctx, tx, &document, "delete-node", deletedNode.ID, "Delete "+deletedNode.Name, cadDeleteNodeHistoryCommand{
			Node:            deletedNode,
			NodeIndex:       nodeIndex,
			Nodes:           deletedNodes,
			Occurrence:      deletedOccurrence,
			OccurrenceIndex: deletedOccurrenceIndex,
			Occurrences:     deletedOccurrences,
			Operation:       operation,
			OperationIndex:  operationIndex,
		}); err != nil {
			return err
		}
		if err := persistProjectCADDocumentEntity(ctx, tx, &document, state); err != nil {
			return err
		}
		document.UpdatedAt = now
		publicDocument = publicProjectCADDocument(document, state)
		return populateProjectCADHistoryState(ctx, tx, document, &publicDocument)
	})
	if err != nil {
		return ProjectCADDocument{}, err
	}
	return publicDocument, nil
}

func (s *Service) updateProjectCADNodeTransform(ctx context.Context, project entity.Project, nodeID string, transform CADTransform, expectedRevision int) (ProjectCADDocument, error) {
	var publicDocument ProjectCADDocument
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		document, state, err := s.getOrCreateProjectCADDocumentEntity(ctx, tx, project)
		if err != nil {
			return err
		}
		if expectedRevision > 0 && document.Revision != expectedRevision {
			return ErrCADDocumentConflict
		}

		nodeIndex := -1
		for index := range state.Nodes {
			if state.Nodes[index].ID == nodeID {
				nodeIndex = index
				break
			}
		}
		if nodeIndex < 0 {
			return ErrProjectNotFound
		}
		occurrenceIndex := -1
		for index := range state.Assembly.Occurrences {
			if state.Assembly.Occurrences[index].NodeID == nodeID {
				occurrenceIndex = index
				break
			}
		}
		if occurrenceIndex >= 0 {
			if cadAssemblyOccurrenceIsSubassemblyMember(state.Assembly, state.Assembly.Occurrences[occurrenceIndex]) {
				return ErrInvalidCADDocumentInput
			}
			occurrenceID := state.Assembly.Occurrences[occurrenceIndex].ID
			for _, constraint := range state.Assembly.Constraints {
				if constraint.Status == cadAssemblyConstraintStatusSolved && constraint.Solver == cadAssemblyConstraintSolverPointV1 && constraint.SecondOccurrenceID == occurrenceID {
					return ErrInvalidCADDocumentInput
				}
			}
		}
		beforeOccurrences := append([]CADAssemblyOccurrence(nil), state.Assembly.Occurrences...)
		beforeTransform, err := setCADDocumentNodeTransform(&state, nodeID, transform)
		if err != nil {
			return err
		}
		if occurrenceIndex >= 0 {
			if err := solveCADAssemblyPointConstraints(&state.Assembly); err != nil {
				return err
			}
		}
		beforeChanged, afterChanged := changedCADAssemblyOccurrences(beforeOccurrences, state.Assembly.Occurrences)

		operationID, err := id.NewPrefixed("op")
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		sourceModelID := state.Nodes[nodeIndex].SourceModelID
		if sourceModelID == "" {
			sourceModelID = state.Nodes[nodeIndex].ModelID
		}
		if sourceModelID == "" && state.Nodes[nodeIndex].ParentNodeID != "" {
			for _, parentNode := range state.Nodes {
				if parentNode.ID == state.Nodes[nodeIndex].ParentNodeID {
					sourceModelID = parentNode.SourceModelID
					if sourceModelID == "" {
						sourceModelID = parentNode.ModelID
					}
					state.Nodes[nodeIndex].SourceModelID = sourceModelID
					break
				}
			}
		}
		operationIndex := len(state.Operations)
		operation := CADOperation{
			ID:        operationID,
			Type:      "transform",
			ModelID:   sourceModelID,
			NodeID:    state.Nodes[nodeIndex].ID,
			Transform: &transform,
			CreatedAt: now.Format(timeFormatRFC3339),
		}
		state.Operations = append(state.Operations, operation)
		if _, err := appendProjectCADHistoryEntry(ctx, tx, &document, "transform", state.Nodes[nodeIndex].ID, "Move "+state.Nodes[nodeIndex].Name, cadTransformHistoryCommand{
			NodeID:            state.Nodes[nodeIndex].ID,
			Before:            beforeTransform,
			After:             transform,
			BeforeOccurrences: beforeChanged,
			AfterOccurrences:  afterChanged,
			Operation:         operation,
			OperationIndex:    operationIndex,
		}); err != nil {
			return err
		}
		if err := persistProjectCADDocumentEntity(ctx, tx, &document, state); err != nil {
			return err
		}
		document.UpdatedAt = now
		publicDocument = publicProjectCADDocument(document, state)
		return populateProjectCADHistoryState(ctx, tx, document, &publicDocument)
	})
	if err != nil {
		return ProjectCADDocument{}, err
	}
	return publicDocument, nil
}

func (s *Service) getOrCreateProjectCADDocumentForProject(ctx context.Context, project entity.Project) (ProjectCADDocument, error) {
	var publicDocument ProjectCADDocument
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		document, state, err := s.getOrCreateProjectCADDocumentEntity(ctx, tx, project)
		if err != nil {
			return err
		}
		publicDocument = publicProjectCADDocument(document, state)
		return populateProjectCADHistoryState(ctx, tx, document, &publicDocument)
	})
	if err != nil {
		return ProjectCADDocument{}, err
	}
	return publicDocument, nil
}

func (s *Service) getOrCreateProjectCADDocumentEntity(ctx context.Context, tx *gorm.DB, project entity.Project) (entity.ProjectCADDocument, cadDocumentState, error) {
	var document entity.ProjectCADDocument
	err := tx.WithContext(ctx).Clauses(clause.Locking{Strength: "UPDATE"}).First(&document, "project_id = ?", project.ID).Error
	if err == nil {
		state, err := decodeCADDocumentState(document.DocumentJSON)
		if err != nil {
			return entity.ProjectCADDocument{}, cadDocumentState{}, err
		}
		state, migrated := upgradeCADDocumentState(project, document.SchemaVersion, state)
		state, changed, err := s.syncCADDocumentNodes(ctx, tx, project, state)
		if err != nil {
			return entity.ProjectCADDocument{}, cadDocumentState{}, err
		}
		if err := validateCADAssembly(state.Assembly); err != nil {
			return entity.ProjectCADDocument{}, cadDocumentState{}, err
		}
		if migrated || changed || document.SchemaVersion != cadDocumentSchemaVersion {
			document.Revision++
			document.SchemaVersion = cadDocumentSchemaVersion
			documentJSON, err := json.Marshal(state)
			if err != nil {
				return entity.ProjectCADDocument{}, cadDocumentState{}, fmt.Errorf("serialize CAD document: %w", err)
			}
			if err := tx.Model(&document).Updates(map[string]any{
				"schema_version": document.SchemaVersion,
				"revision":       document.Revision,
				"document_json":  documentJSON,
			}).Error; err != nil {
				return entity.ProjectCADDocument{}, cadDocumentState{}, fmt.Errorf("sync CAD document: %w", err)
			}
			document.DocumentJSON = documentJSON
		}
		return document, state, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return entity.ProjectCADDocument{}, cadDocumentState{}, fmt.Errorf("load CAD document: %w", err)
	}

	state, _ := upgradeCADDocumentState(project, 0, cadDocumentState{Unit: "millimetre"})
	state, _, err = s.syncCADDocumentNodes(ctx, tx, project, state)
	if err != nil {
		return entity.ProjectCADDocument{}, cadDocumentState{}, err
	}
	if err := validateCADAssembly(state.Assembly); err != nil {
		return entity.ProjectCADDocument{}, cadDocumentState{}, err
	}
	if state.Unit == "" {
		state.Unit = "millimetre"
	}
	documentJSON, err := json.Marshal(state)
	if err != nil {
		return entity.ProjectCADDocument{}, cadDocumentState{}, fmt.Errorf("serialize CAD document: %w", err)
	}
	documentID, err := id.NewPrefixed("doc")
	if err != nil {
		return entity.ProjectCADDocument{}, cadDocumentState{}, err
	}
	document = entity.ProjectCADDocument{
		ID:            documentID,
		ProjectID:     project.ID,
		SchemaVersion: cadDocumentSchemaVersion,
		Revision:      1,
		DocumentJSON:  documentJSON,
	}
	if err := tx.WithContext(ctx).Create(&document).Error; err != nil {
		return entity.ProjectCADDocument{}, cadDocumentState{}, fmt.Errorf("create CAD document: %w", err)
	}
	return document, state, nil
}

func (s *Service) syncCADDocumentNodes(ctx context.Context, tx *gorm.DB, project entity.Project, state cadDocumentState) (cadDocumentState, bool, error) {
	var models []entity.ProjectModel
	if err := tx.WithContext(ctx).
		Where("project_id = ?", project.ID).
		Order("created_at ASC").
		Find(&models).Error; err != nil {
		return cadDocumentState{}, false, fmt.Errorf("load CAD document models: %w", err)
	}

	if state.Unit == "" {
		state.Unit = "millimetre"
	}
	nodeByID := make(map[string]struct{}, len(state.Nodes))
	nodeIndexByModelID := make(map[string]int, len(state.Nodes))
	deletedNodeByID := deletedCADDocumentNodeIDs(state)
	for index, node := range state.Nodes {
		nodeByID[node.ID] = struct{}{}
		if node.ModelID != "" && node.ParentNodeID == "" {
			nodeIndexByModelID[node.ModelID] = index
		}
	}

	changed := false
	if state.Assembly.ID != "assembly_"+project.ID {
		state.Assembly.ID = "assembly_" + project.ID
		changed = true
	}
	if state.Assembly.Name != project.Name {
		state.Assembly.Name = project.Name
		changed = true
	}
	for index := range state.Nodes {
		if state.Nodes[index].ParentNodeID == "" && state.Nodes[index].ModelRevisionID != "" {
			state.Nodes[index].ModelRevisionID = ""
			changed = true
		}
		if state.Nodes[index].SourceModelID != "" || state.Nodes[index].ParentNodeID == "" {
			continue
		}
		for _, parentNode := range state.Nodes {
			if parentNode.ID == state.Nodes[index].ParentNodeID {
				state.Nodes[index].SourceModelID = parentNode.SourceModelID
				if state.Nodes[index].SourceModelID == "" {
					state.Nodes[index].SourceModelID = parentNode.ModelID
				}
				changed = state.Nodes[index].SourceModelID != "" || changed
				break
			}
		}
	}
	for _, model := range models {
		sourceNodeID := "node_" + model.ID
		if _, ok := deletedNodeByID[sourceNodeID]; ok {
			continue
		}
		if shouldBackfillModelMetadata(model) {
			applyModelMetadata(&model)
			if err := tx.WithContext(ctx).Model(&model).Updates(map[string]any{
				"parse_status":  model.ParseStatus,
				"parse_error":   model.ParseError,
				"metadata_json": model.MetadataJSON,
			}).Error; err != nil {
				return cadDocumentState{}, false, fmt.Errorf("update CAD document model metadata: %w", err)
			}
		}
		if _, err := ensureProjectModelRevision(ctx, tx, &model); err != nil {
			return cadDocumentState{}, false, err
		}
		if nodeIndex, ok := nodeIndexByModelID[model.ID]; ok {
			state, changed = syncCADAssemblyOccurrence(state, state.Nodes[nodeIndex], model, changed)
			publicModel := publicProjectModel(model)
			state, changed = syncCADDocumentComponentNodes(state, nodeByID, deletedNodeByID, publicModel, changed)
			continue
		}
		publicModel := publicProjectModel(model)
		if publicModel.Metadata.LengthUnit != "" && state.Unit == "millimetre" {
			state.Unit = publicModel.Metadata.LengthUnit
		}
		sourceNode := cadDocumentNodeFromModel(publicModel)
		state.Nodes = append(state.Nodes, sourceNode)
		nodeByID[sourceNode.ID] = struct{}{}
		nodeIndexByModelID[model.ID] = len(state.Nodes) - 1
		changed = true
		state, changed = syncCADAssemblyOccurrence(state, sourceNode, model, changed)
		state, changed = syncCADDocumentComponentNodes(state, nodeByID, deletedNodeByID, publicModel, changed)
	}
	return state, changed, nil
}

func upgradeCADDocumentState(project entity.Project, schemaVersion int, state cadDocumentState) (cadDocumentState, bool) {
	changed := false
	if state.Assembly.ID == "" {
		state.Assembly = CADAssembly{
			ID:          "assembly_" + project.ID,
			Name:        project.Name,
			Occurrences: []CADAssemblyOccurrence{},
		}
		changed = true
	}
	if state.Assembly.Occurrences == nil {
		state.Assembly.Occurrences = []CADAssemblyOccurrence{}
		changed = true
	}
	if state.Assembly.Groups == nil {
		state.Assembly.Groups = []CADAssemblyGroup{}
		changed = true
	}
	if state.Assembly.Constraints == nil {
		state.Assembly.Constraints = []CADAssemblyConstraintRecord{}
		changed = true
	}
	if state.Assembly.Subassemblies == nil {
		state.Assembly.Subassemblies = []CADSubassemblyDefinitionRevision{}
		changed = true
	}
	if schemaVersion < cadDocumentFlatAssemblySchemaVersion {
		for index := range state.Nodes {
			node := &state.Nodes[index]
			if node.ParentNodeID != "" || node.ModelID == "" {
				continue
			}
			transform := node.Transform
			if transform.Matrix == ([16]float64{}) {
				transform = identityCADTransform()
			}
			state.Assembly.Occurrences = append(state.Assembly.Occurrences, CADAssemblyOccurrence{
				ID:              "occurrence_" + node.ModelID,
				NodeID:          node.ID,
				ModelID:         node.ModelID,
				ModelRevisionID: node.ModelRevisionID,
				Name:            node.Name,
				Transform:       transform,
			})
			node.ModelRevisionID = ""
			node.Transform = identityCADTransform()
			changed = true
		}
	}
	return state, changed
}

func syncCADAssemblyOccurrence(state cadDocumentState, node CADDocumentNode, model entity.ProjectModel, changed bool) (cadDocumentState, bool) {
	found := false
	for index := range state.Assembly.Occurrences {
		occurrence := &state.Assembly.Occurrences[index]
		if occurrence.ModelID != model.ID {
			continue
		}
		found = true
		if cadAssemblyOccurrenceIsSubassemblyMember(state.Assembly, *occurrence) {
			continue
		}
		if occurrence.NodeID != node.ID {
			occurrence.NodeID = node.ID
			changed = true
		}
		if occurrence.ModelRevisionID != model.CurrentRevisionID {
			occurrence.ModelRevisionID = model.CurrentRevisionID
			changed = true
		}
		if strings.TrimSpace(occurrence.Name) == "" {
			occurrence.Name = model.OriginalFilename
			changed = true
		}
		if occurrence.Transform.Matrix == ([16]float64{}) {
			occurrence.Transform = identityCADTransform()
			changed = true
		}
	}
	if found {
		return state, changed
	}
	state.Assembly.Occurrences = append(state.Assembly.Occurrences, CADAssemblyOccurrence{
		ID:              "occurrence_" + model.ID,
		NodeID:          node.ID,
		ModelID:         model.ID,
		ModelRevisionID: model.CurrentRevisionID,
		Name:            model.OriginalFilename,
		Transform:       identityCADTransform(),
	})
	return state, true
}

func deletedCADDocumentNodeIDs(state cadDocumentState) map[string]struct{} {
	deletedNodeByID := make(map[string]struct{})
	for _, operation := range state.Operations {
		if operation.Type == "delete-node" && operation.NodeID != "" {
			deletedNodeByID[operation.NodeID] = struct{}{}
		}
	}
	return deletedNodeByID
}

func syncCADDocumentComponentNodes(
	state cadDocumentState,
	nodeByID map[string]struct{},
	deletedNodeByID map[string]struct{},
	model ProjectModel,
	changed bool,
) (cadDocumentState, bool) {
	if model.Format != "step" || len(model.Metadata.Components) <= 1 {
		return state, changed
	}
	parentNodeID := "node_" + model.ID
	for index, component := range model.Metadata.Components {
		name := strings.TrimSpace(component.Name)
		if name == "" {
			continue
		}
		nodeID := parentNodeID + "_component_" + strconv.Itoa(index+1)
		if _, ok := nodeByID[nodeID]; ok {
			continue
		}
		if _, ok := deletedNodeByID[nodeID]; ok {
			continue
		}
		state.Nodes = append(state.Nodes, CADDocumentNode{
			ID:            nodeID,
			SourceModelID: model.ID,
			ParentNodeID:  parentNodeID,
			Name:          name,
			SourceFormat:  "step-component",
			Transform:     identityCADTransform(),
		})
		nodeByID[nodeID] = struct{}{}
		changed = true
	}
	return state, changed
}

func decodeCADDocumentState(data []byte) (cadDocumentState, error) {
	var state cadDocumentState
	if len(data) == 0 {
		return cadDocumentState{Unit: "millimetre"}, nil
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return cadDocumentState{}, fmt.Errorf("decode CAD document: %w", err)
	}
	if state.Unit == "" {
		state.Unit = "millimetre"
	}
	for index := range state.Nodes {
		if state.Nodes[index].Transform.Matrix == ([16]float64{}) {
			state.Nodes[index].Transform = identityCADTransform()
		}
		if state.Nodes[index].SourceModelID == "" {
			state.Nodes[index].SourceModelID = state.Nodes[index].ModelID
		}
	}
	return state, nil
}

func cadDocumentNodeFromModel(model ProjectModel) CADDocumentNode {
	return CADDocumentNode{
		ID:            "node_" + model.ID,
		ModelID:       model.ID,
		SourceModelID: model.ID,
		Name:          model.OriginalFilename,
		SourceFormat:  model.Format,
		Transform:     identityCADTransform(),
	}
}

func setCADDocumentNodeTransform(state *cadDocumentState, nodeID string, transform CADTransform) (CADTransform, error) {
	for index := range state.Assembly.Occurrences {
		if state.Assembly.Occurrences[index].NodeID == nodeID {
			before := state.Assembly.Occurrences[index].Transform
			state.Assembly.Occurrences[index].Transform = transform
			return before, nil
		}
	}
	for index := range state.Nodes {
		if state.Nodes[index].ID == nodeID {
			before := state.Nodes[index].Transform
			state.Nodes[index].Transform = transform
			return before, nil
		}
	}
	return CADTransform{}, ErrInvalidCADDocumentInput
}

func setCADDocumentModelRevision(state *cadDocumentState, modelID, revisionID string) error {
	found := false
	for index := range state.Assembly.Occurrences {
		if state.Assembly.Occurrences[index].ModelID == modelID {
			found = true
			if cadAssemblyOccurrenceIsSubassemblyMember(state.Assembly, state.Assembly.Occurrences[index]) {
				continue
			}
			state.Assembly.Occurrences[index].ModelRevisionID = revisionID
		}
	}
	if !found {
		return ErrInvalidCADDocumentInput
	}
	return nil
}

func publicProjectCADDocument(document entity.ProjectCADDocument, state cadDocumentState) ProjectCADDocument {
	nodes := append([]CADDocumentNode(nil), state.Nodes...)
	if nodes == nil {
		nodes = []CADDocumentNode{}
	}
	occurrences := append([]CADAssemblyOccurrence(nil), state.Assembly.Occurrences...)
	if occurrences == nil {
		occurrences = []CADAssemblyOccurrence{}
	}
	groups := append([]CADAssemblyGroup(nil), state.Assembly.Groups...)
	if groups == nil {
		groups = []CADAssemblyGroup{}
	}
	constraints := append([]CADAssemblyConstraintRecord(nil), state.Assembly.Constraints...)
	if constraints == nil {
		constraints = []CADAssemblyConstraintRecord{}
	}
	subassemblies := append([]CADSubassemblyDefinitionRevision(nil), state.Assembly.Subassemblies...)
	if subassemblies == nil {
		subassemblies = []CADSubassemblyDefinitionRevision{}
	}
	occurrenceByNodeID := make(map[string]CADAssemblyOccurrence, len(occurrences))
	for _, occurrence := range occurrences {
		if _, exists := occurrenceByNodeID[occurrence.NodeID]; !exists {
			occurrenceByNodeID[occurrence.NodeID] = occurrence
		}
	}
	for index := range nodes {
		if occurrence, ok := occurrenceByNodeID[nodes[index].ID]; ok {
			nodes[index].ModelRevisionID = occurrence.ModelRevisionID
			nodes[index].Transform = occurrence.Transform
		}
	}
	operations := append([]CADOperation(nil), state.Operations...)
	if operations == nil {
		operations = []CADOperation{}
	}
	return ProjectCADDocument{
		ID:            document.ID,
		ProjectID:     document.ProjectID,
		SchemaVersion: document.SchemaVersion,
		Revision:      document.Revision,
		Unit:          state.Unit,
		Assembly: CADAssembly{
			ID:            state.Assembly.ID,
			Name:          state.Assembly.Name,
			Groups:        groups,
			Occurrences:   occurrences,
			Constraints:   constraints,
			Subassemblies: subassemblies,
		},
		Nodes:      nodes,
		Operations: operations,
		History: CADHistoryState{
			HeadID:  document.HistoryHeadID,
			CanUndo: document.HistoryHeadID != "",
		},
		CreatedAt: document.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt: document.UpdatedAt.Format(timeFormatRFC3339),
	}
}

func identityCADTransform() CADTransform {
	return CADTransform{
		Matrix: [16]float64{
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			0, 0, 0, 1,
		},
	}
}

func isValidCADTransform(transform CADTransform) bool {
	for _, value := range transform.Matrix {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return false
		}
	}
	return transform.Matrix[12] == 0 &&
		transform.Matrix[13] == 0 &&
		transform.Matrix[14] == 0 &&
		transform.Matrix[15] == 1
}

func isValidCADBoxFeature(box CADBoxFeature) bool {
	for _, value := range box.Origin {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return false
		}
	}
	for _, value := range box.Size {
		if math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 {
			return false
		}
	}
	return true
}
