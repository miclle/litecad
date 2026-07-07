package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const cadDocumentSchemaVersion = 1

var (
	// ErrInvalidCADDocumentInput indicates missing or malformed editable CAD document input.
	ErrInvalidCADDocumentInput = errors.New("invalid CAD document input")
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
	Nodes         []CADDocumentNode `json:"nodes"`
	Operations    []CADOperation    `json:"operations"`
	CreatedAt     string            `json:"created_at"`
	UpdatedAt     string            `json:"updated_at"`
}

// CADDocumentNode maps one source model into the editable document graph.
type CADDocumentNode struct {
	ID           string       `json:"id"`
	ModelID      string       `json:"model_id"`
	ParentNodeID string       `json:"parent_node_id"`
	Name         string       `json:"name"`
	SourceFormat string       `json:"source_format"`
	Transform    CADTransform `json:"transform"`
}

// CADOperation records a LiteCAD edit operation in replay order.
type CADOperation struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	ModelID   string         `json:"model_id"`
	Transform *CADTransform  `json:"transform,omitempty"`
	Box       *CADBoxFeature `json:"box,omitempty"`
	CreatedAt string         `json:"created_at"`
}

// UpdateProjectCADModelTransformInput updates one model node transform in the editable document.
type UpdateProjectCADModelTransformInput struct {
	OwnerUserID string
	ProjectID   string
	ModelID     string
	Transform   CADTransform
}

// AddProjectCADModelBoxUnionInput appends one kernel-backed box union feature.
type AddProjectCADModelBoxUnionInput struct {
	OwnerUserID string
	ProjectID   string
	ModelID     string
	Box         CADBoxFeature
}

type cadDocumentState struct {
	Unit       string            `json:"unit"`
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

	var publicDocument ProjectCADDocument
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		document, state, err := s.getOrCreateProjectCADDocumentEntity(ctx, tx, project)
		if err != nil {
			return err
		}

		nodeIndex := -1
		for index := range state.Nodes {
			if state.Nodes[index].ModelID == model.ID {
				nodeIndex = index
				break
			}
		}
		if nodeIndex < 0 {
			state.Nodes = append(state.Nodes, cadDocumentNodeFromModel(publicProjectModel(model)))
			nodeIndex = len(state.Nodes) - 1
		}
		state.Nodes[nodeIndex].Transform = input.Transform

		operationID, err := id.NewPrefixed("op")
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		transform := input.Transform
		state.Operations = append(state.Operations, CADOperation{
			ID:        operationID,
			Type:      "transform",
			ModelID:   model.ID,
			Transform: &transform,
			CreatedAt: now.Format(timeFormatRFC3339),
		})

		document.Revision++
		document.SchemaVersion = cadDocumentSchemaVersion
		documentJSON, err := json.Marshal(state)
		if err != nil {
			return fmt.Errorf("serialize CAD document: %w", err)
		}
		if err := tx.Model(&document).Updates(map[string]any{
			"schema_version": document.SchemaVersion,
			"revision":       document.Revision,
			"document_json":  documentJSON,
		}).Error; err != nil {
			return fmt.Errorf("update CAD document: %w", err)
		}
		document.DocumentJSON = documentJSON
		document.UpdatedAt = now
		publicDocument = publicProjectCADDocument(document, state)
		return nil
	})
	if err != nil {
		return ProjectCADDocument{}, err
	}
	return publicDocument, nil
}

// AddProjectCADModelBoxUnion persists one box union feature for browser-kernel replay.
func (s *Service) AddProjectCADModelBoxUnion(ctx context.Context, input AddProjectCADModelBoxUnionInput) (ProjectCADDocument, error) {
	ownerUserID := strings.TrimSpace(input.OwnerUserID)
	projectID := strings.TrimSpace(input.ProjectID)
	modelID := strings.TrimSpace(input.ModelID)
	if ownerUserID == "" || projectID == "" || modelID == "" {
		return ProjectCADDocument{}, ErrProjectNotFound
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

		operationID, err := id.NewPrefixed("op")
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		box := input.Box
		state.Operations = append(state.Operations, CADOperation{
			ID:        operationID,
			Type:      "box-union",
			ModelID:   model.ID,
			Box:       &box,
			CreatedAt: now.Format(timeFormatRFC3339),
		})

		document.Revision++
		document.SchemaVersion = cadDocumentSchemaVersion
		documentJSON, err := json.Marshal(state)
		if err != nil {
			return fmt.Errorf("serialize CAD document: %w", err)
		}
		if err := tx.Model(&document).Updates(map[string]any{
			"schema_version": document.SchemaVersion,
			"revision":       document.Revision,
			"document_json":  documentJSON,
		}).Error; err != nil {
			return fmt.Errorf("update CAD document: %w", err)
		}
		document.DocumentJSON = documentJSON
		document.UpdatedAt = now
		publicDocument = publicProjectCADDocument(document, state)
		return nil
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
		return nil
	})
	if err != nil {
		return ProjectCADDocument{}, err
	}
	return publicDocument, nil
}

func (s *Service) getOrCreateProjectCADDocumentEntity(ctx context.Context, tx *gorm.DB, project entity.Project) (entity.ProjectCADDocument, cadDocumentState, error) {
	var document entity.ProjectCADDocument
	err := tx.WithContext(ctx).First(&document, "project_id = ?", project.ID).Error
	if err == nil {
		state, err := decodeCADDocumentState(document.DocumentJSON)
		if err != nil {
			return entity.ProjectCADDocument{}, cadDocumentState{}, err
		}
		state, changed, err := s.syncCADDocumentNodes(ctx, tx, project.ID, state)
		if err != nil {
			return entity.ProjectCADDocument{}, cadDocumentState{}, err
		}
		if changed {
			document.Revision++
			documentJSON, err := json.Marshal(state)
			if err != nil {
				return entity.ProjectCADDocument{}, cadDocumentState{}, fmt.Errorf("serialize CAD document: %w", err)
			}
			if err := tx.Model(&document).Updates(map[string]any{
				"revision":      document.Revision,
				"document_json": documentJSON,
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

	state, _, err := s.syncCADDocumentNodes(ctx, tx, project.ID, cadDocumentState{Unit: "millimetre"})
	if err != nil {
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

func (s *Service) syncCADDocumentNodes(ctx context.Context, tx *gorm.DB, projectID string, state cadDocumentState) (cadDocumentState, bool, error) {
	var models []entity.ProjectModel
	if err := tx.WithContext(ctx).
		Where("project_id = ?", projectID).
		Order("created_at ASC").
		Find(&models).Error; err != nil {
		return cadDocumentState{}, false, fmt.Errorf("load CAD document models: %w", err)
	}

	if state.Unit == "" {
		state.Unit = "millimetre"
	}
	nodeByModelID := make(map[string]struct{}, len(state.Nodes))
	for _, node := range state.Nodes {
		nodeByModelID[node.ModelID] = struct{}{}
	}

	changed := false
	for _, model := range models {
		if _, ok := nodeByModelID[model.ID]; ok {
			continue
		}
		publicModel := publicProjectModel(model)
		if publicModel.Metadata.LengthUnit != "" && state.Unit == "millimetre" {
			state.Unit = publicModel.Metadata.LengthUnit
		}
		state.Nodes = append(state.Nodes, cadDocumentNodeFromModel(publicModel))
		changed = true
	}
	return state, changed, nil
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
	}
	return state, nil
}

func cadDocumentNodeFromModel(model ProjectModel) CADDocumentNode {
	return CADDocumentNode{
		ID:           "node_" + model.ID,
		ModelID:      model.ID,
		Name:         model.OriginalFilename,
		SourceFormat: model.Format,
		Transform:    identityCADTransform(),
	}
}

func publicProjectCADDocument(document entity.ProjectCADDocument, state cadDocumentState) ProjectCADDocument {
	nodes := append([]CADDocumentNode(nil), state.Nodes...)
	if nodes == nil {
		nodes = []CADDocumentNode{}
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
		Nodes:         nodes,
		Operations:    operations,
		CreatedAt:     document.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:     document.UpdatedAt.Format(timeFormatRFC3339),
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
