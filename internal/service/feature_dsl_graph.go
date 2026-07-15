package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/miclle/litecad/internal/entity"
	"gorm.io/gorm"
)

// UpdateLiteCADFeatureGraphInput replaces one saved LiteCAD feature graph under the document revision envelope.
type UpdateLiteCADFeatureGraphInput struct {
	OwnerUserID      string
	ProjectID        string
	ModelID          string
	SourceCode       string
	ExpectedRevision int
}

type liteCADFeatureGraphDocument struct {
	Version  int               `json:"version"`
	Features []json.RawMessage `json:"features"`
}

type liteCADFeatureGraphNode struct {
	ID        string
	Type      string
	ParentID  string
	Index     int
	Path      string
	Canonical []byte
}

// UpdateLiteCADFeatureGraph stores one validated graph source revision and its reversible node transitions.
func (s *Service) UpdateLiteCADFeatureGraph(ctx context.Context, input UpdateLiteCADFeatureGraphInput) (ProjectModel, error) {
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectModel{}, err
	}
	modelID := strings.TrimSpace(input.ModelID)
	sourceCode := strings.TrimSpace(input.SourceCode)
	if modelID == "" || sourceCode == "" || len([]byte(sourceCode)) > maxProjectParametricArtifactSourceBytes {
		return ProjectModel{}, ErrInvalidProjectParametricArtifactInput
	}
	if input.ExpectedRevision <= 0 {
		return ProjectModel{}, ErrInvalidCADDocumentInput
	}
	if err := validateLiteCADFeatureDSLSource([]byte(sourceCode)); err != nil {
		return ProjectModel{}, ErrInvalidProjectParametricArtifactInput
	}

	var model entity.ProjectModel
	if err := s.db.WithContext(ctx).First(&model, "id = ? AND project_id = ?", modelID, project.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectModel{}, ErrProjectNotFound
		}
		return ProjectModel{}, fmt.Errorf("load LiteCAD feature graph model: %w", err)
	}
	if model.Format != "lcad" {
		return ProjectModel{}, ErrInvalidProjectParametricArtifactInput
	}

	var currentMetadata StepMetadata
	if len(model.MetadataJSON) > 0 {
		_ = json.Unmarshal(model.MetadataJSON, &currentMetadata)
	}
	var graphVersion int
	var transitions []CADFeatureGraphNodeTransition
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		document, state, err := s.getOrCreateProjectCADDocumentEntity(ctx, tx, project)
		if err != nil {
			return err
		}
		if document.Revision != input.ExpectedRevision {
			return ErrCADDocumentConflict
		}
		beforeNodes, beforeEnvelope, beforeGraphVersion, err := parseLiteCADFeatureGraph(model.SourceData)
		if err != nil {
			return ErrInvalidProjectParametricArtifactInput
		}
		afterNodes, afterEnvelope, afterGraphVersion, err := parseLiteCADFeatureGraph([]byte(sourceCode))
		if err != nil {
			return ErrInvalidProjectParametricArtifactInput
		}
		if beforeGraphVersion != afterGraphVersion || string(beforeEnvelope) != string(afterEnvelope) {
			return ErrInvalidProjectParametricArtifactInput
		}
		graphVersion = afterGraphVersion
		transitions = diffLiteCADFeatureGraphNodes(beforeNodes, afterNodes)
		if len(transitions) == 0 {
			return ErrInvalidProjectParametricArtifactInput
		}
		beforeRevision, err := ensureProjectModelRevision(ctx, tx, &model)
		if err != nil {
			return err
		}

		model.SourceData = []byte(sourceCode)
		model.ByteSize = int64(len(model.SourceData))
		applyModelMetadata(&model)
		if model.ParseStatus != "parsed" {
			return ErrInvalidProjectParametricArtifactInput
		}
		mergeParametricArtifactValuesIntoModelMetadata(&model, currentMetadata.ParameterValues)
		afterRevision, err := createProjectModelRevision(ctx, tx, model, "Updated Feature DSL graph")
		if err != nil {
			return err
		}
		model.CurrentRevisionID = afterRevision.ID
		model.CurrentRevisionSequence = afterRevision.Sequence
		if err := tx.WithContext(ctx).Model(&model).Updates(map[string]any{
			"source_data":         model.SourceData,
			"metadata_json":       model.MetadataJSON,
			"byte_size":           model.ByteSize,
			"parse_status":        model.ParseStatus,
			"parse_error":         model.ParseError,
			"current_revision_id": model.CurrentRevisionID,
		}).Error; err != nil {
			return fmt.Errorf("update LiteCAD feature graph model: %w", err)
		}
		if err := setCADDocumentModelRevision(&state, model.ID, afterRevision.ID); err != nil {
			return err
		}
		if _, err := appendProjectCADHistoryEntry(ctx, tx, &document, "feature-graph-change", model.ID, "Update feature graph for "+model.OriginalFilename, cadFeatureGraphHistoryCommand{
			ModelID:          model.ID,
			BeforeRevisionID: beforeRevision.ID,
			AfterRevisionID:  afterRevision.ID,
			GraphVersion:     graphVersion,
			NodeTransitions:  transitions,
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

func parseLiteCADFeatureGraph(data []byte) ([]liteCADFeatureGraphNode, []byte, int, error) {
	var document liteCADFeatureGraphDocument
	if err := json.Unmarshal(data, &document); err != nil || document.Version != 1 || len(document.Features) == 0 {
		return nil, nil, 0, ErrInvalidProjectParametricArtifactInput
	}
	var envelope map[string]any
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, nil, 0, ErrInvalidProjectParametricArtifactInput
	}
	delete(envelope, "features")
	canonicalEnvelope, err := json.Marshal(envelope)
	if err != nil {
		return nil, nil, 0, ErrInvalidProjectParametricArtifactInput
	}
	nodes := make([]liteCADFeatureGraphNode, 0, len(document.Features))
	seen := make(map[string]struct{}, len(document.Features))
	for index, rawFeature := range document.Features {
		if err := appendLiteCADFeatureGraphNode(rawFeature, "", "", index, &nodes, seen); err != nil {
			return nil, nil, 0, err
		}
	}
	return nodes, canonicalEnvelope, document.Version, nil
}

func appendLiteCADFeatureGraphNode(
	rawFeature json.RawMessage,
	parentID string,
	parentPath string,
	index int,
	nodes *[]liteCADFeatureGraphNode,
	seen map[string]struct{},
) error {
	var identity struct {
		ID       string            `json:"id"`
		Type     string            `json:"type"`
		Operands []json.RawMessage `json:"operands"`
	}
	if err := json.Unmarshal(rawFeature, &identity); err != nil {
		return ErrInvalidProjectParametricArtifactInput
	}
	identity.ID = strings.TrimSpace(identity.ID)
	identity.Type = strings.TrimSpace(identity.Type)
	if identity.ID == "" || identity.Type == "" {
		return ErrInvalidProjectParametricArtifactInput
	}
	if _, exists := seen[identity.ID]; exists {
		return ErrInvalidProjectParametricArtifactInput
	}
	seen[identity.ID] = struct{}{}

	var canonicalValue map[string]any
	if err := json.Unmarshal(rawFeature, &canonicalValue); err != nil {
		return ErrInvalidProjectParametricArtifactInput
	}
	delete(canonicalValue, "operands")
	canonical, err := json.Marshal(canonicalValue)
	if err != nil {
		return ErrInvalidProjectParametricArtifactInput
	}
	path := "features/" + featureGraphPathSegment(identity.ID)
	if parentPath != "" {
		path = parentPath + "/operands/" + featureGraphPathSegment(identity.ID)
	}
	*nodes = append(*nodes, liteCADFeatureGraphNode{
		ID:        identity.ID,
		Type:      identity.Type,
		ParentID:  parentID,
		Index:     index,
		Path:      path,
		Canonical: canonical,
	})
	if identity.Type == "boolean" {
		for operandIndex, operand := range identity.Operands {
			if err := appendLiteCADFeatureGraphNode(operand, identity.ID, path, operandIndex, nodes, seen); err != nil {
				return err
			}
		}
	}
	return nil
}

func featureGraphPathSegment(id string) string {
	return strings.ReplaceAll(strings.ReplaceAll(id, "~", "~0"), "/", "~1")
}

func diffLiteCADFeatureGraphNodes(before, after []liteCADFeatureGraphNode) []CADFeatureGraphNodeTransition {
	beforeByID := make(map[string]liteCADFeatureGraphNode, len(before))
	afterByID := make(map[string]liteCADFeatureGraphNode, len(after))
	for _, node := range before {
		beforeByID[node.ID] = node
	}
	for _, node := range after {
		afterByID[node.ID] = node
	}

	transitions := make([]CADFeatureGraphNodeTransition, 0)
	for _, afterNode := range after {
		beforeNode, exists := beforeByID[afterNode.ID]
		if !exists {
			transitions = append(transitions, CADFeatureGraphNodeTransition{
				NodeID:     afterNode.ID,
				Change:     "added",
				AfterType:  afterNode.Type,
				AfterPath:  afterNode.Path,
				AfterIndex: featureGraphIndex(afterNode.Index),
			})
			continue
		}
		if string(beforeNode.Canonical) != string(afterNode.Canonical) {
			transitions = append(transitions, CADFeatureGraphNodeTransition{
				NodeID:      afterNode.ID,
				Change:      "updated",
				BeforeType:  beforeNode.Type,
				AfterType:   afterNode.Type,
				BeforePath:  beforeNode.Path,
				AfterPath:   afterNode.Path,
				BeforeIndex: featureGraphIndex(beforeNode.Index),
				AfterIndex:  featureGraphIndex(afterNode.Index),
			})
		}
		if beforeNode.ParentID != afterNode.ParentID || beforeNode.Index != afterNode.Index {
			transitions = append(transitions, CADFeatureGraphNodeTransition{
				NodeID:      afterNode.ID,
				Change:      "moved",
				BeforeType:  beforeNode.Type,
				AfterType:   afterNode.Type,
				BeforePath:  beforeNode.Path,
				AfterPath:   afterNode.Path,
				BeforeIndex: featureGraphIndex(beforeNode.Index),
				AfterIndex:  featureGraphIndex(afterNode.Index),
			})
		}
	}
	for _, beforeNode := range before {
		if _, exists := afterByID[beforeNode.ID]; !exists {
			transitions = append(transitions, CADFeatureGraphNodeTransition{
				NodeID:      beforeNode.ID,
				Change:      "removed",
				BeforeType:  beforeNode.Type,
				BeforePath:  beforeNode.Path,
				BeforeIndex: featureGraphIndex(beforeNode.Index),
			})
		}
	}
	return transitions
}

func featureGraphIndex(index int) *int {
	value := index
	return &value
}
