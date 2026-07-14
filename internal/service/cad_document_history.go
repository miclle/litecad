package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const (
	cadHistoryStatusApplied   = "applied"
	cadHistoryStatusUndone    = "undone"
	cadHistoryStatusDiscarded = "discarded"
)

type cadTransformHistoryCommand struct {
	NodeID         string       `json:"node_id"`
	Before         CADTransform `json:"before"`
	After          CADTransform `json:"after"`
	Operation      CADOperation `json:"operation"`
	OperationIndex int          `json:"operation_index"`
}

type cadBoxUnionHistoryCommand struct {
	Operation      CADOperation `json:"operation"`
	OperationIndex int          `json:"operation_index"`
}

type cadDeleteNodeHistoryCommand struct {
	Node            CADDocumentNode                `json:"node"`
	NodeIndex       int                            `json:"node_index"`
	Nodes           []cadDeletedDocumentNode       `json:"nodes,omitempty"`
	Occurrence      *CADAssemblyOccurrence         `json:"occurrence,omitempty"`
	OccurrenceIndex int                            `json:"occurrence_index,omitempty"`
	Occurrences     []cadDeletedAssemblyOccurrence `json:"occurrences,omitempty"`
	Operation       CADOperation                   `json:"operation"`
	OperationIndex  int                            `json:"operation_index"`
}

type cadParameterChangeHistoryCommand struct {
	ModelID          string `json:"model_id"`
	BeforeRevisionID string `json:"before_revision_id"`
	AfterRevisionID  string `json:"after_revision_id"`
}

type cadFeatureGraphHistoryCommand struct {
	ModelID          string                          `json:"model_id"`
	BeforeRevisionID string                          `json:"before_revision_id"`
	AfterRevisionID  string                          `json:"after_revision_id"`
	NodeTransitions  []CADFeatureGraphNodeTransition `json:"node_transitions"`
}

type cadDeletedDocumentNode struct {
	Node  CADDocumentNode `json:"node"`
	Index int             `json:"index"`
}

type cadDeletedAssemblyOccurrence struct {
	Occurrence CADAssemblyOccurrence `json:"occurrence"`
	Index      int                   `json:"index"`
}

type cadOccurrenceCreateHistoryCommand struct {
	Occurrence CADAssemblyOccurrence `json:"occurrence"`
	Index      int                   `json:"index"`
}

type cadOccurrenceUpdateHistoryCommand struct {
	Before CADAssemblyOccurrence `json:"before"`
	After  CADAssemblyOccurrence `json:"after"`
}

type cadOccurrenceMoveHistoryCommand struct {
	OccurrenceID string `json:"occurrence_id"`
	BeforeIndex  int    `json:"before_index"`
	AfterIndex   int    `json:"after_index"`
}

type cadOccurrenceDeleteHistoryCommand struct {
	Occurrence CADAssemblyOccurrence `json:"occurrence"`
	Index      int                   `json:"index"`
}

type cadAssemblyGroupCreateHistoryCommand struct {
	Group CADAssemblyGroup `json:"group"`
	Index int              `json:"index"`
}

type cadAssemblyGroupUpdateHistoryCommand struct {
	Before CADAssemblyGroup `json:"before"`
	After  CADAssemblyGroup `json:"after"`
}

type cadAssemblyGroupDeleteHistoryCommand struct {
	Group CADAssemblyGroup `json:"group"`
	Index int              `json:"index"`
}

type cadAssemblyConstraintCreateHistoryCommand struct {
	Constraint CADAssemblyConstraintRecord `json:"constraint"`
	Index      int                         `json:"index"`
}

type cadAssemblyConstraintDeleteHistoryCommand struct {
	Constraint CADAssemblyConstraintRecord `json:"constraint"`
	Index      int                         `json:"index"`
}

// ModifyProjectCADHistoryInput moves one project document through persisted history.
type ModifyProjectCADHistoryInput struct {
	OwnerUserID      string
	ProjectID        string
	ExpectedRevision int
}

// CADFeatureGraphNodeTransition identifies one top-level Feature DSL node change.
type CADFeatureGraphNodeTransition struct {
	NodeID     string `json:"node_id"`
	Change     string `json:"change"`
	BeforeType string `json:"before_type,omitempty"`
	AfterType  string `json:"after_type,omitempty"`
}

// CADHistoryEntrySummary is the public audit shape for one persisted CAD edit.
type CADHistoryEntrySummary struct {
	ID                      string                          `json:"id"`
	Sequence                int64                           `json:"sequence"`
	ParentEntryID           string                          `json:"parent_entry_id,omitempty"`
	Status                  string                          `json:"status"`
	CommandType             string                          `json:"command_type"`
	TargetID                string                          `json:"target_id"`
	Summary                 string                          `json:"summary"`
	FeatureGraphTransitions []CADFeatureGraphNodeTransition `json:"feature_graph_transitions,omitempty"`
	CreatedAt               string                          `json:"created_at"`
}

// ProjectCADHistoryPage contains newest-first history summaries.
type ProjectCADHistoryPage struct {
	Entries            []CADHistoryEntrySummary `json:"entries"`
	NextBeforeSequence int64                    `json:"next_before_sequence,omitempty"`
}

// ListProjectCADHistory returns persisted user edits without exposing internal command payloads.
func (s *Service) ListProjectCADHistory(ctx context.Context, ownerUserID, projectID string, limit int, beforeSequence int64) (ProjectCADHistoryPage, error) {
	document, err := s.GetProjectCADDocument(ctx, ownerUserID, projectID)
	if err != nil {
		return ProjectCADHistoryPage{}, err
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	query := s.db.WithContext(ctx).Where("document_id = ?", document.ID)
	if beforeSequence > 0 {
		query = query.Where("sequence < ?", beforeSequence)
	}
	var entries []entity.ProjectCADHistoryEntry
	if err := query.Order("sequence DESC").Limit(limit).Find(&entries).Error; err != nil {
		return ProjectCADHistoryPage{}, fmt.Errorf("list CAD history: %w", err)
	}
	publicEntries := make([]CADHistoryEntrySummary, 0, len(entries))
	for _, entry := range entries {
		var transitions []CADFeatureGraphNodeTransition
		if entry.CommandType == "feature-graph-change" {
			var command cadFeatureGraphHistoryCommand
			if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
				return ProjectCADHistoryPage{}, fmt.Errorf("decode feature graph history summary: %w", err)
			}
			transitions = command.NodeTransitions
		}
		publicEntries = append(publicEntries, CADHistoryEntrySummary{
			ID:                      entry.ID,
			Sequence:                entry.Sequence,
			ParentEntryID:           entry.ParentEntryID,
			Status:                  entry.Status,
			CommandType:             entry.CommandType,
			TargetID:                entry.TargetID,
			Summary:                 entry.Summary,
			FeatureGraphTransitions: transitions,
			CreatedAt:               entry.CreatedAt.Format(timeFormatRFC3339),
		})
	}
	page := ProjectCADHistoryPage{Entries: publicEntries}
	if len(entries) == limit {
		page.NextBeforeSequence = entries[len(entries)-1].Sequence
	}
	return page, nil
}

func appendProjectCADHistoryEntry(
	ctx context.Context,
	tx *gorm.DB,
	document *entity.ProjectCADDocument,
	commandType string,
	targetID string,
	summary string,
	command any,
) (entity.ProjectCADHistoryEntry, error) {
	commandJSON, err := json.Marshal(command)
	if err != nil {
		return entity.ProjectCADHistoryEntry{}, fmt.Errorf("serialize CAD history command: %w", err)
	}
	if err := tx.WithContext(ctx).
		Model(&entity.ProjectCADHistoryEntry{}).
		Where("document_id = ? AND status = ?", document.ID, cadHistoryStatusUndone).
		Update("status", cadHistoryStatusDiscarded).Error; err != nil {
		return entity.ProjectCADHistoryEntry{}, fmt.Errorf("discard CAD redo history: %w", err)
	}

	entryID, err := id.NewPrefixed("hist")
	if err != nil {
		return entity.ProjectCADHistoryEntry{}, err
	}
	entry := entity.ProjectCADHistoryEntry{
		ID:            entryID,
		ProjectID:     document.ProjectID,
		DocumentID:    document.ID,
		Sequence:      document.HistorySequence + 1,
		ParentEntryID: document.HistoryHeadID,
		Status:        cadHistoryStatusApplied,
		CommandType:   commandType,
		TargetID:      targetID,
		Summary:       summary,
		CommandJSON:   commandJSON,
	}
	if err := tx.WithContext(ctx).Create(&entry).Error; err != nil {
		return entity.ProjectCADHistoryEntry{}, fmt.Errorf("create CAD history entry: %w", err)
	}
	document.HistorySequence = entry.Sequence
	document.HistoryHeadID = entry.ID
	return entry, nil
}

func persistProjectCADDocumentEntity(ctx context.Context, tx *gorm.DB, document *entity.ProjectCADDocument, state cadDocumentState) error {
	previousRevision := document.Revision
	document.Revision++
	document.SchemaVersion = cadDocumentSchemaVersion
	documentJSON, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("serialize CAD document: %w", err)
	}
	result := tx.WithContext(ctx).Model(document).Where("revision = ?", previousRevision).Updates(map[string]any{
		"schema_version":   document.SchemaVersion,
		"revision":         document.Revision,
		"history_sequence": document.HistorySequence,
		"history_head_id":  document.HistoryHeadID,
		"document_json":    documentJSON,
	})
	if result.Error != nil {
		return fmt.Errorf("update CAD document: %w", result.Error)
	}
	if result.RowsAffected != 1 {
		return ErrCADDocumentConflict
	}
	document.DocumentJSON = documentJSON
	return nil
}

func populateProjectCADHistoryState(ctx context.Context, tx *gorm.DB, document entity.ProjectCADDocument, publicDocument *ProjectCADDocument) error {
	var redoCount int64
	if err := tx.WithContext(ctx).Model(&entity.ProjectCADHistoryEntry{}).
		Where("document_id = ? AND parent_entry_id = ? AND status = ?", document.ID, document.HistoryHeadID, cadHistoryStatusUndone).
		Count(&redoCount).Error; err != nil {
		return fmt.Errorf("load CAD redo state: %w", err)
	}
	publicDocument.History = CADHistoryState{
		HeadID:  document.HistoryHeadID,
		CanUndo: document.HistoryHeadID != "",
		CanRedo: redoCount > 0,
	}
	return nil
}

// UndoProjectCADDocument applies the inverse of the current history entry.
func (s *Service) UndoProjectCADDocument(ctx context.Context, input ModifyProjectCADHistoryInput) (ProjectCADDocument, error) {
	if input.ExpectedRevision <= 0 {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	var publicDocument ProjectCADDocument
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		document, state, err := s.getOrCreateProjectCADDocumentEntity(ctx, tx, project)
		if err != nil {
			return err
		}
		if input.ExpectedRevision > 0 && document.Revision != input.ExpectedRevision {
			return ErrCADDocumentConflict
		}
		if document.HistoryHeadID == "" {
			return ErrInvalidCADDocumentInput
		}
		var entry entity.ProjectCADHistoryEntry
		if err := tx.WithContext(ctx).First(&entry, "id = ? AND document_id = ? AND status = ?", document.HistoryHeadID, document.ID, cadHistoryStatusApplied).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvalidCADDocumentInput
			}
			return fmt.Errorf("load CAD history head: %w", err)
		}
		if err := applyCADHistoryCommand(ctx, tx, &state, entry, false); err != nil {
			return err
		}
		if err := tx.WithContext(ctx).Model(&entry).Update("status", cadHistoryStatusUndone).Error; err != nil {
			return fmt.Errorf("mark CAD history undone: %w", err)
		}
		document.HistoryHeadID = entry.ParentEntryID
		if err := persistProjectCADDocumentEntity(ctx, tx, &document, state); err != nil {
			return err
		}
		publicDocument = publicProjectCADDocument(document, state)
		return populateProjectCADHistoryState(ctx, tx, document, &publicDocument)
	})
	return publicDocument, err
}

// RedoProjectCADDocument reapplies the next undone history entry.
func (s *Service) RedoProjectCADDocument(ctx context.Context, input ModifyProjectCADHistoryInput) (ProjectCADDocument, error) {
	if input.ExpectedRevision <= 0 {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	var publicDocument ProjectCADDocument
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		document, state, err := s.getOrCreateProjectCADDocumentEntity(ctx, tx, project)
		if err != nil {
			return err
		}
		if input.ExpectedRevision > 0 && document.Revision != input.ExpectedRevision {
			return ErrCADDocumentConflict
		}
		var entry entity.ProjectCADHistoryEntry
		if err := tx.WithContext(ctx).
			Where("document_id = ? AND parent_entry_id = ? AND status = ?", document.ID, document.HistoryHeadID, cadHistoryStatusUndone).
			Order("sequence ASC").First(&entry).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvalidCADDocumentInput
			}
			return fmt.Errorf("load CAD redo entry: %w", err)
		}
		if err := applyCADHistoryCommand(ctx, tx, &state, entry, true); err != nil {
			return err
		}
		if err := tx.WithContext(ctx).Model(&entry).Update("status", cadHistoryStatusApplied).Error; err != nil {
			return fmt.Errorf("mark CAD history applied: %w", err)
		}
		document.HistoryHeadID = entry.ID
		if err := persistProjectCADDocumentEntity(ctx, tx, &document, state); err != nil {
			return err
		}
		publicDocument = publicProjectCADDocument(document, state)
		return populateProjectCADHistoryState(ctx, tx, document, &publicDocument)
	})
	return publicDocument, err
}

func applyCADHistoryCommand(ctx context.Context, tx *gorm.DB, state *cadDocumentState, entry entity.ProjectCADHistoryEntry, forward bool) error {
	switch entry.CommandType {
	case "transform":
		var command cadTransformHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode transform history command: %w", err)
		}
		if forward {
			if _, err := setCADDocumentNodeTransform(state, command.NodeID, command.After); err != nil {
				return err
			}
			state.Operations = insertCADOperation(state.Operations, command.OperationIndex, command.Operation)
		} else {
			if _, err := setCADDocumentNodeTransform(state, command.NodeID, command.Before); err != nil {
				return err
			}
			state.Operations = removeCADOperation(state.Operations, command.Operation.ID)
		}
	case "box-union":
		var command cadBoxUnionHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode box union history command: %w", err)
		}
		if forward {
			state.Operations = insertCADOperation(state.Operations, command.OperationIndex, command.Operation)
		} else {
			state.Operations = removeCADOperation(state.Operations, command.Operation.ID)
		}
	case "delete-node":
		var command cadDeleteNodeHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode delete node history command: %w", err)
		}
		deletedNodes := command.Nodes
		if len(deletedNodes) == 0 {
			deletedNodes = []cadDeletedDocumentNode{{Node: command.Node, Index: command.NodeIndex}}
		}
		deletedOccurrences := command.Occurrences
		if len(deletedOccurrences) == 0 && command.Occurrence != nil {
			deletedOccurrences = []cadDeletedAssemblyOccurrence{{Occurrence: *command.Occurrence, Index: command.OccurrenceIndex}}
		}
		if forward {
			for _, deletedNode := range deletedNodes {
				nodeIndex := cadDocumentNodeIndex(state.Nodes, deletedNode.Node.ID)
				if nodeIndex < 0 {
					return ErrInvalidCADDocumentInput
				}
				state.Nodes = append(state.Nodes[:nodeIndex], state.Nodes[nodeIndex+1:]...)
			}
			for _, deletedOccurrence := range deletedOccurrences {
				occurrenceIndex := cadAssemblyOccurrenceIndex(state.Assembly.Occurrences, deletedOccurrence.Occurrence.ID)
				if occurrenceIndex < 0 {
					return ErrInvalidCADDocumentInput
				}
				state.Assembly.Occurrences = append(state.Assembly.Occurrences[:occurrenceIndex], state.Assembly.Occurrences[occurrenceIndex+1:]...)
			}
			state.Operations = insertCADOperation(state.Operations, command.OperationIndex, command.Operation)
		} else {
			for _, deletedNode := range deletedNodes {
				state.Nodes = insertCADDocumentNode(state.Nodes, deletedNode.Index, deletedNode.Node)
			}
			if len(deletedOccurrences) > 0 {
				for _, deletedOccurrence := range deletedOccurrences {
					state.Assembly.Occurrences = insertCADAssemblyOccurrence(state.Assembly.Occurrences, deletedOccurrence.Index, deletedOccurrence.Occurrence)
				}
			} else if command.Node.ParentNodeID == "" && command.Node.ModelID != "" {
				occurrence, err := legacyCADAssemblyOccurrence(ctx, tx, entry.ProjectID, command.Node)
				if err != nil {
					return err
				}
				occurrenceIndex := cadAssemblyOccurrenceInsertIndex(state.Nodes, command.Node.ID)
				state.Assembly.Occurrences = insertCADAssemblyOccurrence(state.Assembly.Occurrences, occurrenceIndex, occurrence)
			}
			state.Operations = removeCADOperation(state.Operations, command.Operation.ID)
		}
	case "occurrence-create":
		var command cadOccurrenceCreateHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode occurrence create history command: %w", err)
		}
		if forward {
			state.Assembly.Occurrences = insertCADAssemblyOccurrence(state.Assembly.Occurrences, command.Index, command.Occurrence)
		} else {
			index := cadAssemblyOccurrenceIndex(state.Assembly.Occurrences, command.Occurrence.ID)
			if index < 0 {
				return ErrInvalidCADDocumentInput
			}
			state.Assembly.Occurrences = append(state.Assembly.Occurrences[:index], state.Assembly.Occurrences[index+1:]...)
		}
	case "occurrence-update":
		var command cadOccurrenceUpdateHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode occurrence update history command: %w", err)
		}
		value := command.Before
		if forward {
			value = command.After
		}
		index := cadAssemblyOccurrenceIndex(state.Assembly.Occurrences, value.ID)
		if index < 0 {
			return ErrInvalidCADDocumentInput
		}
		state.Assembly.Occurrences[index] = value
	case "occurrence-move":
		var command cadOccurrenceMoveHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode occurrence move history command: %w", err)
		}
		targetIndex := command.BeforeIndex
		if forward {
			targetIndex = command.AfterIndex
		}
		if err := moveCADAssemblyOccurrence(state, command.OccurrenceID, targetIndex); err != nil {
			return err
		}
	case "occurrence-delete":
		var command cadOccurrenceDeleteHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode occurrence delete history command: %w", err)
		}
		if forward {
			index := cadAssemblyOccurrenceIndex(state.Assembly.Occurrences, command.Occurrence.ID)
			if index < 0 {
				return ErrInvalidCADDocumentInput
			}
			state.Assembly.Occurrences = append(state.Assembly.Occurrences[:index], state.Assembly.Occurrences[index+1:]...)
		} else {
			state.Assembly.Occurrences = insertCADAssemblyOccurrence(state.Assembly.Occurrences, command.Index, command.Occurrence)
		}
	case "assembly-group-create":
		var command cadAssemblyGroupCreateHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode assembly group create history command: %w", err)
		}
		if forward {
			state.Assembly.Groups = insertCADAssemblyGroup(state.Assembly.Groups, command.Index, command.Group)
		} else {
			index := cadAssemblyGroupIndex(state.Assembly.Groups, command.Group.ID)
			if index < 0 {
				return ErrInvalidCADDocumentInput
			}
			state.Assembly.Groups = append(state.Assembly.Groups[:index], state.Assembly.Groups[index+1:]...)
		}
	case "assembly-group-update":
		var command cadAssemblyGroupUpdateHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode assembly group update history command: %w", err)
		}
		value := command.Before
		if forward {
			value = command.After
		}
		index := cadAssemblyGroupIndex(state.Assembly.Groups, value.ID)
		if index < 0 {
			return ErrInvalidCADDocumentInput
		}
		state.Assembly.Groups[index] = value
	case "assembly-group-delete":
		var command cadAssemblyGroupDeleteHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode assembly group delete history command: %w", err)
		}
		if forward {
			index := cadAssemblyGroupIndex(state.Assembly.Groups, command.Group.ID)
			if index < 0 {
				return ErrInvalidCADDocumentInput
			}
			state.Assembly.Groups = append(state.Assembly.Groups[:index], state.Assembly.Groups[index+1:]...)
		} else {
			state.Assembly.Groups = insertCADAssemblyGroup(state.Assembly.Groups, command.Index, command.Group)
		}
	case "assembly-constraint-create":
		var command cadAssemblyConstraintCreateHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode assembly constraint create history command: %w", err)
		}
		if forward {
			state.Assembly.Constraints = insertCADAssemblyConstraint(state.Assembly.Constraints, command.Index, command.Constraint)
		} else {
			index := cadAssemblyConstraintIndex(state.Assembly.Constraints, command.Constraint.ID)
			if index < 0 {
				return ErrInvalidCADDocumentInput
			}
			state.Assembly.Constraints = append(state.Assembly.Constraints[:index], state.Assembly.Constraints[index+1:]...)
		}
	case "assembly-constraint-delete":
		var command cadAssemblyConstraintDeleteHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode assembly constraint delete history command: %w", err)
		}
		if forward {
			index := cadAssemblyConstraintIndex(state.Assembly.Constraints, command.Constraint.ID)
			if index < 0 {
				return ErrInvalidCADDocumentInput
			}
			state.Assembly.Constraints = append(state.Assembly.Constraints[:index], state.Assembly.Constraints[index+1:]...)
		} else {
			state.Assembly.Constraints = insertCADAssemblyConstraint(state.Assembly.Constraints, command.Index, command.Constraint)
		}
	case "parameter-change", "model-revision-restore", "feature-graph-change":
		var command struct {
			ModelID          string `json:"model_id"`
			BeforeRevisionID string `json:"before_revision_id"`
			AfterRevisionID  string `json:"after_revision_id"`
		}
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode model revision history command: %w", err)
		}
		revisionID := command.BeforeRevisionID
		if forward {
			revisionID = command.AfterRevisionID
		}
		var revision entity.ProjectModelRevision
		if err := tx.WithContext(ctx).First(&revision, "id = ? AND model_id = ? AND project_id = ?", revisionID, command.ModelID, entry.ProjectID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProjectNotFound
			}
			return fmt.Errorf("load model revision history target: %w", err)
		}
		result := tx.WithContext(ctx).
			Model(&entity.ProjectModel{}).
			Where("id = ? AND project_id = ?", command.ModelID, entry.ProjectID).
			Updates(map[string]any{
				"current_revision_id": revision.ID,
				"source_data":         revision.SourceData,
				"metadata_json":       revision.MetadataJSON,
				"byte_size":           len(revision.SourceData),
			})
		if result.Error != nil {
			return fmt.Errorf("apply model revision history command: %w", result.Error)
		}
		if result.RowsAffected != 1 {
			return ErrProjectNotFound
		}
		if err := setCADDocumentModelRevision(state, command.ModelID, revision.ID); err != nil {
			return err
		}
	default:
		return ErrInvalidCADDocumentInput
	}
	if err := validateCADAssembly(state.Assembly); err != nil {
		return err
	}
	return nil
}

func cadDocumentNodeIndex(nodes []CADDocumentNode, nodeID string) int {
	for index := range nodes {
		if nodes[index].ID == nodeID {
			return index
		}
	}
	return -1
}

func cadAssemblyOccurrenceIndex(occurrences []CADAssemblyOccurrence, occurrenceID string) int {
	for index := range occurrences {
		if occurrences[index].ID == occurrenceID {
			return index
		}
	}
	return -1
}

func cadAssemblyOccurrenceInsertIndex(nodes []CADDocumentNode, nodeID string) int {
	index := 0
	for _, node := range nodes {
		if node.ID == nodeID {
			return index
		}
		if node.ParentNodeID == "" && node.ModelID != "" {
			index++
		}
	}
	return index
}

func legacyCADAssemblyOccurrence(ctx context.Context, tx *gorm.DB, projectID string, node CADDocumentNode) (CADAssemblyOccurrence, error) {
	var model entity.ProjectModel
	if err := tx.WithContext(ctx).First(&model, "id = ? AND project_id = ?", node.ModelID, projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return CADAssemblyOccurrence{}, ErrProjectNotFound
		}
		return CADAssemblyOccurrence{}, fmt.Errorf("load legacy delete occurrence model: %w", err)
	}
	revision, err := ensureProjectModelRevision(ctx, tx, &model)
	if err != nil {
		return CADAssemblyOccurrence{}, err
	}
	transform := node.Transform
	if transform.Matrix == ([16]float64{}) {
		transform = identityCADTransform()
	}
	name := node.Name
	if name == "" {
		name = model.OriginalFilename
	}
	return CADAssemblyOccurrence{
		ID:              "occurrence_" + model.ID,
		NodeID:          node.ID,
		ModelID:         model.ID,
		ModelRevisionID: revision.ID,
		Name:            name,
		Transform:       transform,
	}, nil
}

func removeCADOperation(operations []CADOperation, operationID string) []CADOperation {
	for index := range operations {
		if operations[index].ID == operationID {
			return append(operations[:index], operations[index+1:]...)
		}
	}
	return operations
}

func insertCADOperation(operations []CADOperation, index int, operation CADOperation) []CADOperation {
	if index < 0 || index > len(operations) {
		index = len(operations)
	}
	operations = append(operations, CADOperation{})
	copy(operations[index+1:], operations[index:])
	operations[index] = operation
	return operations
}

func insertCADDocumentNode(nodes []CADDocumentNode, index int, node CADDocumentNode) []CADDocumentNode {
	if index < 0 || index > len(nodes) {
		index = len(nodes)
	}
	nodes = append(nodes, CADDocumentNode{})
	copy(nodes[index+1:], nodes[index:])
	nodes[index] = node
	return nodes
}

func insertCADAssemblyOccurrence(occurrences []CADAssemblyOccurrence, index int, occurrence CADAssemblyOccurrence) []CADAssemblyOccurrence {
	if index < 0 || index > len(occurrences) {
		index = len(occurrences)
	}
	occurrences = append(occurrences, CADAssemblyOccurrence{})
	copy(occurrences[index+1:], occurrences[index:])
	occurrences[index] = occurrence
	return occurrences
}

func insertCADAssemblyGroup(groups []CADAssemblyGroup, index int, group CADAssemblyGroup) []CADAssemblyGroup {
	if index < 0 || index > len(groups) {
		index = len(groups)
	}
	groups = append(groups, CADAssemblyGroup{})
	copy(groups[index+1:], groups[index:])
	groups[index] = group
	return groups
}

func insertCADAssemblyConstraint(constraints []CADAssemblyConstraintRecord, index int, constraint CADAssemblyConstraintRecord) []CADAssemblyConstraintRecord {
	if index < 0 || index > len(constraints) {
		index = len(constraints)
	}
	constraints = append(constraints, CADAssemblyConstraintRecord{})
	copy(constraints[index+1:], constraints[index:])
	constraints[index] = constraint
	return constraints
}
