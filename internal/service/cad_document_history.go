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
	Node           CADDocumentNode `json:"node"`
	NodeIndex      int             `json:"node_index"`
	Operation      CADOperation    `json:"operation"`
	OperationIndex int             `json:"operation_index"`
}

// ModifyProjectCADHistoryInput moves one project document through persisted history.
type ModifyProjectCADHistoryInput struct {
	OwnerUserID      string
	ProjectID        string
	ExpectedRevision int
}

// CADHistoryEntrySummary is the public audit shape for one persisted CAD edit.
type CADHistoryEntrySummary struct {
	ID            string `json:"id"`
	Sequence      int64  `json:"sequence"`
	ParentEntryID string `json:"parent_entry_id,omitempty"`
	Status        string `json:"status"`
	CommandType   string `json:"command_type"`
	TargetID      string `json:"target_id"`
	Summary       string `json:"summary"`
	CreatedAt     string `json:"created_at"`
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
		publicEntries = append(publicEntries, CADHistoryEntrySummary{
			ID:            entry.ID,
			Sequence:      entry.Sequence,
			ParentEntryID: entry.ParentEntryID,
			Status:        entry.Status,
			CommandType:   entry.CommandType,
			TargetID:      entry.TargetID,
			Summary:       entry.Summary,
			CreatedAt:     entry.CreatedAt.Format(timeFormatRFC3339),
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
		if err := applyCADHistoryCommand(&state, entry, false); err != nil {
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
		if err := applyCADHistoryCommand(&state, entry, true); err != nil {
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

func applyCADHistoryCommand(state *cadDocumentState, entry entity.ProjectCADHistoryEntry, forward bool) error {
	switch entry.CommandType {
	case "transform":
		var command cadTransformHistoryCommand
		if err := json.Unmarshal(entry.CommandJSON, &command); err != nil {
			return fmt.Errorf("decode transform history command: %w", err)
		}
		nodeIndex := cadDocumentNodeIndex(state.Nodes, command.NodeID)
		if nodeIndex < 0 {
			return ErrInvalidCADDocumentInput
		}
		if forward {
			state.Nodes[nodeIndex].Transform = command.After
			state.Operations = insertCADOperation(state.Operations, command.OperationIndex, command.Operation)
		} else {
			state.Nodes[nodeIndex].Transform = command.Before
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
		if forward {
			nodeIndex := cadDocumentNodeIndex(state.Nodes, command.Node.ID)
			if nodeIndex < 0 {
				return ErrInvalidCADDocumentInput
			}
			state.Nodes = append(state.Nodes[:nodeIndex], state.Nodes[nodeIndex+1:]...)
			state.Operations = insertCADOperation(state.Operations, command.OperationIndex, command.Operation)
		} else {
			state.Nodes = insertCADDocumentNode(state.Nodes, command.NodeIndex, command.Node)
			state.Operations = removeCADOperation(state.Operations, command.Operation.ID)
		}
	default:
		return ErrInvalidCADDocumentInput
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
