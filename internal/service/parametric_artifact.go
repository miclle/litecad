package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const (
	maxProjectParametricArtifactTitleRunes  = 160
	maxProjectParametricArtifactSourceBytes = 256 * 1024
	projectParametricSourceKindOpenSCAD     = "openscad"
	projectParametricSourceKindLiteCADDSL   = "litecad-feature-dsl"
	projectParametricCompileStatusPending   = "pending"
	projectParametricCompileStatusSuccess   = "success"
	projectParametricCompileStatusError     = "error"
	maxLiteCADFeatureDSLRepeatCount         = 128
)

var (
	// ErrInvalidProjectParametricArtifactInput indicates malformed parametric artifact data.
	ErrInvalidProjectParametricArtifactInput = errors.New("invalid project parametric artifact input")
)

// CreateProjectParametricArtifactInput is the data required to persist generated parametric CAD source.
type CreateProjectParametricArtifactInput struct {
	OwnerUserID          string
	ProjectID            string
	ConversationID       string
	MessageID            string
	Title                string
	SourceKind           string
	SourceCode           string
	ParameterValues      map[string]any
	CompileStatus        string
	CompileError         string
	PreviewModelID       string
	GenerationToolMode   string
	GenerationDurationMS int64
}

// UpdateProjectParametricArtifactInput is the data required to replace editable parametric artifact fields.
type UpdateProjectParametricArtifactInput struct {
	OwnerUserID     string
	ProjectID       string
	ArtifactID      string
	Title           string
	SourceKind      string
	SourceCode      string
	ParameterValues map[string]any
	CompileStatus   string
	CompileError    string
	PreviewModelID  string
}

// SaveParametricArtifactAsProjectModelInput identifies a generated artifact to save as a durable project source.
type SaveParametricArtifactAsProjectModelInput struct {
	OwnerUserID string
	ProjectID   string
	ArtifactID  string
}

// UpdateParametricModelParametersInput is the data required to persist parameter changes for a saved parametric model.
type UpdateParametricModelParametersInput struct {
	OwnerUserID     string
	ProjectID       string
	ModelID         string
	ParameterValues map[string]any
}

// ProjectParametricArtifact is a project-owned generated CAD source artifact.
type ProjectParametricArtifact struct {
	ID                   string         `json:"id"`
	ProjectID            string         `json:"project_id"`
	ConversationID       string         `json:"conversation_id"`
	MessageID            string         `json:"message_id"`
	Title                string         `json:"title"`
	SourceKind           string         `json:"source_kind"`
	SourceCode           string         `json:"source_code"`
	ParameterValues      map[string]any `json:"parameter_values"`
	CompileStatus        string         `json:"compile_status"`
	CompileError         string         `json:"compile_error"`
	PreviewModelID       string         `json:"preview_model_id"`
	GenerationToolMode   string         `json:"generation_tool_mode"`
	GenerationDurationMS int64          `json:"generation_duration_ms"`
	CreatedAt            string         `json:"created_at"`
	UpdatedAt            string         `json:"updated_at"`
}

// CreateProjectParametricArtifact persists generated parametric CAD source for a project.
func (s *Service) CreateProjectParametricArtifact(ctx context.Context, input CreateProjectParametricArtifactInput) (ProjectParametricArtifact, error) {
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectParametricArtifact{}, err
	}
	normalized, err := normalizeProjectParametricArtifactInput(projectParametricArtifactInput{
		Title:           input.Title,
		SourceKind:      input.SourceKind,
		SourceCode:      input.SourceCode,
		ParameterValues: input.ParameterValues,
		CompileStatus:   input.CompileStatus,
		CompileError:    input.CompileError,
		PreviewModelID:  input.PreviewModelID,
	})
	if err != nil {
		return ProjectParametricArtifact{}, err
	}

	artifactID, err := id.NewPrefixed("pma")
	if err != nil {
		return ProjectParametricArtifact{}, err
	}
	artifact := entity.ProjectParametricArtifact{
		ID:                   artifactID,
		ProjectID:            project.ID,
		ConversationID:       strings.TrimSpace(input.ConversationID),
		MessageID:            strings.TrimSpace(input.MessageID),
		Title:                normalized.title,
		SourceKind:           normalized.sourceKind,
		SourceCode:           normalized.sourceCode,
		ParameterValuesJSON:  normalized.parameterValuesJSON,
		CompileStatus:        normalized.compileStatus,
		CompileError:         normalized.compileError,
		PreviewModelID:       normalized.previewModelID,
		GenerationToolMode:   strings.TrimSpace(input.GenerationToolMode),
		GenerationDurationMS: max(input.GenerationDurationMS, 0),
	}
	if err := s.db.WithContext(ctx).Create(&artifact).Error; err != nil {
		return ProjectParametricArtifact{}, fmt.Errorf("create project parametric artifact: %w", err)
	}
	return publicProjectParametricArtifact(artifact), nil
}

// ListProjectParametricArtifacts returns project-owned generated CAD source artifacts.
func (s *Service) ListProjectParametricArtifacts(ctx context.Context, ownerUserID, projectID string) ([]ProjectParametricArtifact, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return nil, err
	}

	var artifacts []entity.ProjectParametricArtifact
	if err := s.db.WithContext(ctx).
		Where("project_id = ?", project.ID).
		Order("updated_at DESC, created_at DESC, id DESC").
		Find(&artifacts).Error; err != nil {
		return nil, fmt.Errorf("list project parametric artifacts: %w", err)
	}

	result := make([]ProjectParametricArtifact, 0, len(artifacts))
	for _, artifact := range artifacts {
		result = append(result, publicProjectParametricArtifact(artifact))
	}
	return result, nil
}

// GetProjectParametricArtifact returns one project-owned generated CAD source artifact.
func (s *Service) GetProjectParametricArtifact(ctx context.Context, ownerUserID, projectID, artifactID string) (ProjectParametricArtifact, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return ProjectParametricArtifact{}, err
	}
	artifact, err := s.loadProjectParametricArtifact(ctx, project.ID, artifactID)
	if err != nil {
		return ProjectParametricArtifact{}, err
	}
	return publicProjectParametricArtifact(artifact), nil
}

// UpdateProjectParametricArtifact replaces editable fields on one project-owned generated CAD source artifact.
func (s *Service) UpdateProjectParametricArtifact(ctx context.Context, input UpdateProjectParametricArtifactInput) (ProjectParametricArtifact, error) {
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectParametricArtifact{}, err
	}
	artifact, err := s.loadProjectParametricArtifact(ctx, project.ID, input.ArtifactID)
	if err != nil {
		return ProjectParametricArtifact{}, err
	}
	normalized, err := normalizeProjectParametricArtifactInput(projectParametricArtifactInput{
		Title:           input.Title,
		SourceKind:      input.SourceKind,
		SourceCode:      input.SourceCode,
		ParameterValues: input.ParameterValues,
		CompileStatus:   input.CompileStatus,
		CompileError:    input.CompileError,
		PreviewModelID:  input.PreviewModelID,
	})
	if err != nil {
		return ProjectParametricArtifact{}, err
	}

	artifact.Title = normalized.title
	artifact.SourceKind = normalized.sourceKind
	artifact.SourceCode = normalized.sourceCode
	artifact.ParameterValuesJSON = normalized.parameterValuesJSON
	artifact.CompileStatus = normalized.compileStatus
	artifact.CompileError = normalized.compileError
	artifact.PreviewModelID = normalized.previewModelID
	if err := s.db.WithContext(ctx).Save(&artifact).Error; err != nil {
		return ProjectParametricArtifact{}, fmt.Errorf("update project parametric artifact: %w", err)
	}
	return publicProjectParametricArtifact(artifact), nil
}

// SaveParametricArtifactAsProjectModel stores a successfully compiled generated source as a project model.
func (s *Service) SaveParametricArtifactAsProjectModel(ctx context.Context, input SaveParametricArtifactAsProjectModelInput) (ProjectModel, error) {
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectModel{}, err
	}
	artifact, err := s.loadProjectParametricArtifact(ctx, project.ID, input.ArtifactID)
	if err != nil {
		return ProjectModel{}, err
	}
	if artifact.CompileStatus != projectParametricCompileStatusSuccess {
		return ProjectModel{}, ErrInvalidProjectParametricArtifactInput
	}
	if strings.TrimSpace(artifact.PreviewModelID) != "" {
		var existing entity.ProjectModel
		err := s.db.WithContext(ctx).First(&existing, "id = ? AND project_id = ?", artifact.PreviewModelID, project.ID).Error
		if err == nil {
			return publicProjectModel(existing), nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectModel{}, fmt.Errorf("load saved parametric model: %w", err)
		}
	}

	var model ProjectModel
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		modelID, err := id.NewPrefixed("mdl")
		if err != nil {
			return err
		}
		sourceData := []byte(artifact.SourceCode)
		format, contentType, filename, err := projectParametricModelStorage(artifact.Title, artifact.SourceKind)
		if err != nil {
			return err
		}
		modelEntity := entity.ProjectModel{
			ID:               modelID,
			ProjectID:        project.ID,
			OriginalFilename: filename,
			Format:           format,
			ContentType:      contentType,
			ByteSize:         int64(len(sourceData)),
			SourceData:       append([]byte(nil), sourceData...),
		}
		applyModelMetadata(&modelEntity)
		mergeParametricArtifactValuesIntoModelMetadata(&modelEntity, projectParametricArtifactParameters(artifact.ParameterValuesJSON))
		if err := tx.Create(&modelEntity).Error; err != nil {
			return fmt.Errorf("store parametric project model: %w", err)
		}
		artifact.PreviewModelID = modelEntity.ID
		if err := tx.Save(&artifact).Error; err != nil {
			return fmt.Errorf("link parametric artifact model: %w", err)
		}
		model = publicProjectModel(modelEntity)
		return nil
	})
	if err != nil {
		return ProjectModel{}, err
	}
	return model, nil
}

// UpdateParametricModelParameters stores the latest parameter values and records a model revision.
func (s *Service) UpdateParametricModelParameters(ctx context.Context, input UpdateParametricModelParametersInput) (ProjectModel, error) {
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectModel{}, err
	}
	modelID := strings.TrimSpace(input.ModelID)
	if modelID == "" || len(input.ParameterValues) == 0 {
		return ProjectModel{}, ErrInvalidProjectParametricArtifactInput
	}

	var model entity.ProjectModel
	if err := s.db.WithContext(ctx).First(&model, "id = ? AND project_id = ?", modelID, project.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectModel{}, ErrProjectNotFound
		}
		return ProjectModel{}, fmt.Errorf("load parametric project model: %w", err)
	}
	if model.Format != "scad" && model.Format != "lcad" {
		return ProjectModel{}, ErrInvalidProjectParametricArtifactInput
	}

	defaultValues, metadata, err := parametricModelParameterDefaults(model)
	if err != nil {
		return ProjectModel{}, err
	}
	if len(model.MetadataJSON) > 0 {
		var storedMetadata StepMetadata
		if err := json.Unmarshal(model.MetadataJSON, &storedMetadata); err == nil && storedMetadata.AssetType != "" {
			metadata = storedMetadata
		}
	}
	mergedValues := map[string]any{}
	for name, value := range defaultValues {
		mergedValues[name] = value
	}
	for name, value := range metadata.ParameterValues {
		mergedValues[name] = value
	}
	for name, value := range input.ParameterValues {
		normalizedValue, err := normalizeParametricParameterValue(name, value, defaultValues)
		if err != nil {
			return ProjectModel{}, err
		}
		mergedValues[name] = normalizedValue
	}
	parameterValuesJSON, err := json.Marshal(mergedValues)
	if err != nil {
		return ProjectModel{}, ErrInvalidProjectParametricArtifactInput
	}
	if model.Format == "scad" {
		metadata.AssetType = "scad"
		metadata.SourceKind = projectParametricSourceKindOpenSCAD
		metadata.Version = "1"
		metadata.Schema = "openscad"
	} else {
		metadata.AssetType = "lcad"
		metadata.SourceKind = projectParametricSourceKindLiteCADDSL
		if metadata.Version == "" {
			metadata.Version = "1"
		}
		metadata.Schema = projectParametricSourceKindLiteCADDSL
	}
	metadata.ParameterCount = len(defaultValues)
	metadata.ParameterValues = mergedValues
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return ProjectModel{}, ErrInvalidProjectParametricArtifactInput
	}
	checksumBytes := sha256.Sum256(model.SourceData)
	revisionID, err := id.NewPrefixed("pmr")
	if err != nil {
		return ProjectModel{}, err
	}

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		model.MetadataJSON = metadataJSON
		if err := tx.Save(&model).Error; err != nil {
			return fmt.Errorf("update parametric model metadata: %w", err)
		}
		revision := entity.ProjectParametricRevision{
			ID:                  revisionID,
			ProjectID:           project.ID,
			ModelID:             model.ID,
			ParameterValuesJSON: parameterValuesJSON,
			SourceChecksum:      hex.EncodeToString(checksumBytes[:]),
			Summary:             "Updated parametric parameters",
		}
		if err := tx.Create(&revision).Error; err != nil {
			return fmt.Errorf("create parametric revision: %w", err)
		}
		return nil
	})
	if err != nil {
		return ProjectModel{}, err
	}
	return publicProjectModel(model), nil
}

func (s *Service) loadProjectParametricArtifact(ctx context.Context, projectID, artifactID string) (entity.ProjectParametricArtifact, error) {
	artifactID = strings.TrimSpace(artifactID)
	if artifactID == "" {
		return entity.ProjectParametricArtifact{}, ErrProjectNotFound
	}
	var artifact entity.ProjectParametricArtifact
	if err := s.db.WithContext(ctx).First(&artifact, "id = ? AND project_id = ?", artifactID, projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return entity.ProjectParametricArtifact{}, ErrProjectNotFound
		}
		return entity.ProjectParametricArtifact{}, fmt.Errorf("load project parametric artifact: %w", err)
	}
	return artifact, nil
}

type projectParametricArtifactInput struct {
	Title           string
	SourceKind      string
	SourceCode      string
	ParameterValues map[string]any
	CompileStatus   string
	CompileError    string
	PreviewModelID  string
}

type normalizedProjectParametricArtifactInput struct {
	title               string
	sourceKind          string
	sourceCode          string
	parameterValuesJSON []byte
	compileStatus       string
	compileError        string
	previewModelID      string
}

func normalizeProjectParametricArtifactInput(input projectParametricArtifactInput) (normalizedProjectParametricArtifactInput, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" || utf8.RuneCountInString(title) > maxProjectParametricArtifactTitleRunes {
		return normalizedProjectParametricArtifactInput{}, ErrInvalidProjectParametricArtifactInput
	}

	sourceKind := strings.TrimSpace(input.SourceKind)
	if !isProjectParametricSourceKind(sourceKind) {
		return normalizedProjectParametricArtifactInput{}, ErrInvalidProjectParametricArtifactInput
	}

	sourceCode := strings.TrimSpace(input.SourceCode)
	if sourceCode == "" || len([]byte(sourceCode)) > maxProjectParametricArtifactSourceBytes {
		return normalizedProjectParametricArtifactInput{}, ErrInvalidProjectParametricArtifactInput
	}
	if sourceKind == projectParametricSourceKindLiteCADDSL && validateLiteCADFeatureDSLSource([]byte(sourceCode)) != nil {
		return normalizedProjectParametricArtifactInput{}, ErrInvalidProjectParametricArtifactInput
	}

	compileStatus := strings.TrimSpace(input.CompileStatus)
	if compileStatus == "" {
		compileStatus = projectParametricCompileStatusPending
	}
	if !isProjectParametricCompileStatus(compileStatus) {
		return normalizedProjectParametricArtifactInput{}, ErrInvalidProjectParametricArtifactInput
	}

	parameterValues := input.ParameterValues
	if parameterValues == nil {
		parameterValues = map[string]any{}
	}
	parameterValuesJSON, err := json.Marshal(parameterValues)
	if err != nil {
		return normalizedProjectParametricArtifactInput{}, ErrInvalidProjectParametricArtifactInput
	}

	return normalizedProjectParametricArtifactInput{
		title:               title,
		sourceKind:          sourceKind,
		sourceCode:          sourceCode,
		parameterValuesJSON: parameterValuesJSON,
		compileStatus:       compileStatus,
		compileError:        strings.TrimSpace(input.CompileError),
		previewModelID:      strings.TrimSpace(input.PreviewModelID),
	}, nil
}

func isProjectParametricCompileStatus(status string) bool {
	return status == projectParametricCompileStatusPending ||
		status == projectParametricCompileStatusSuccess ||
		status == projectParametricCompileStatusError
}

func isProjectParametricSourceKind(sourceKind string) bool {
	return sourceKind == projectParametricSourceKindOpenSCAD ||
		sourceKind == projectParametricSourceKindLiteCADDSL
}

type liteCADFeatureDSLValidationDocument struct {
	Version    int                                             `json:"version"`
	Unit       string                                          `json:"unit"`
	Parameters map[string]liteCADFeatureDSLValidationParameter `json:"parameters"`
	Features   []liteCADFeatureDSLValidationFeature            `json:"features"`
}

type liteCADFeatureDSLValidationParameter struct {
	Type    string   `json:"type"`
	Default float64  `json:"default"`
	Min     *float64 `json:"min"`
	Max     *float64 `json:"max"`
}

type liteCADFeatureDSLValidationFeature struct {
	ID       string                             `json:"id"`
	Type     string                             `json:"type"`
	Origin   []any                              `json:"origin"`
	Axis     []any                              `json:"axis"`
	Size     []any                              `json:"size"`
	Radius   any                                `json:"radius"`
	Diameter any                                `json:"diameter"`
	Height   any                                `json:"height"`
	Depth    any                                `json:"depth"`
	Repeat   *liteCADFeatureDSLValidationRepeat `json:"repeat"`
}

type liteCADFeatureDSLValidationRepeat struct {
	Count any   `json:"count"`
	Step  []any `json:"step"`
}

func validateLiteCADFeatureDSLSource(data []byte) error {
	var document liteCADFeatureDSLValidationDocument
	if err := json.Unmarshal(data, &document); err != nil {
		return err
	}
	if document.Version != 1 || strings.TrimSpace(document.Unit) == "" || len(document.Features) == 0 {
		return ErrInvalidProjectParametricArtifactInput
	}
	parameterNames := map[string]struct{}{}
	for name, parameter := range document.Parameters {
		if strings.TrimSpace(name) == "" || parameter.Type != "number" || !isFiniteFloat(parameter.Default) {
			return ErrInvalidProjectParametricArtifactInput
		}
		if parameter.Min != nil && !isFiniteFloat(*parameter.Min) {
			return ErrInvalidProjectParametricArtifactInput
		}
		if parameter.Max != nil && !isFiniteFloat(*parameter.Max) {
			return ErrInvalidProjectParametricArtifactInput
		}
		if parameter.Min != nil && parameter.Default < *parameter.Min {
			return ErrInvalidProjectParametricArtifactInput
		}
		if parameter.Max != nil && parameter.Default > *parameter.Max {
			return ErrInvalidProjectParametricArtifactInput
		}
		parameterNames[name] = struct{}{}
	}
	for _, feature := range document.Features {
		if err := validateLiteCADFeatureDSLFeature(feature, parameterNames); err != nil {
			return err
		}
	}
	return nil
}

func validateLiteCADFeatureDSLFeature(feature liteCADFeatureDSLValidationFeature, parameterNames map[string]struct{}) error {
	if strings.TrimSpace(feature.ID) == "" {
		return ErrInvalidProjectParametricArtifactInput
	}
	switch feature.Type {
	case "box":
		if err := validateLiteCADFeatureDSLExpressionTuple(feature.Size, 3, parameterNames); err != nil {
			return err
		}
		if feature.Origin != nil {
			if err := validateLiteCADFeatureDSLExpressionTuple(feature.Origin, 3, parameterNames); err != nil {
				return err
			}
		}
		return validateLiteCADFeatureDSLRepeat(feature.Repeat, parameterNames)
	case "cylinder":
		return validateLiteCADFeatureDSLCylinderLikeFeature(feature, "height", feature.Height, parameterNames)
	case "cylinder_cut":
		return validateLiteCADFeatureDSLCylinderLikeFeature(feature, "depth", feature.Depth, parameterNames)
	default:
		return ErrInvalidProjectParametricArtifactInput
	}
}

func validateLiteCADFeatureDSLCylinderLikeFeature(feature liteCADFeatureDSLValidationFeature, lengthName string, lengthValue any, parameterNames map[string]struct{}) error {
	if err := validateLiteCADFeatureDSLExpressionTuple(feature.Origin, 3, parameterNames); err != nil {
		return err
	}
	if feature.Axis != nil {
		if err := validateLiteCADFeatureDSLAxisTuple(feature.Axis, parameterNames); err != nil {
			return err
		}
	}
	if err := validateLiteCADFeatureDSLRepeat(feature.Repeat, parameterNames); err != nil {
		return err
	}
	hasRadius := feature.Radius != nil
	hasDiameter := feature.Diameter != nil
	if hasRadius == hasDiameter {
		return ErrInvalidProjectParametricArtifactInput
	}
	if hasRadius {
		if err := validateLiteCADFeatureDSLExpression(feature.Radius, parameterNames); err != nil {
			return err
		}
	} else if err := validateLiteCADFeatureDSLExpression(feature.Diameter, parameterNames); err != nil {
		return err
	}
	if lengthValue == nil {
		return fmt.Errorf("%w: missing cylinder %s", ErrInvalidProjectParametricArtifactInput, lengthName)
	}
	return validateLiteCADFeatureDSLExpression(lengthValue, parameterNames)
}

func validateLiteCADFeatureDSLRepeat(repeat *liteCADFeatureDSLValidationRepeat, parameterNames map[string]struct{}) error {
	if repeat == nil {
		return nil
	}
	count, ok := repeat.Count.(float64)
	if !ok || !isFiniteFloat(count) || math.Trunc(count) != count || count < 1 || count > maxLiteCADFeatureDSLRepeatCount {
		return ErrInvalidProjectParametricArtifactInput
	}
	return validateLiteCADFeatureDSLExpressionTuple(repeat.Step, 3, parameterNames)
}

func validateLiteCADFeatureDSLAxisTuple(values []any, parameterNames map[string]struct{}) error {
	if err := validateLiteCADFeatureDSLExpressionTuple(values, 3, parameterNames); err != nil {
		return err
	}
	hasNonZeroComponent := false
	for _, value := range values {
		if parameterName, ok := value.(string); ok {
			if _, known := parameterNames[parameterName]; known {
				hasNonZeroComponent = true
			}
			continue
		}
		if number, ok := value.(float64); ok && number != 0 {
			hasNonZeroComponent = true
		}
	}
	if !hasNonZeroComponent {
		return ErrInvalidProjectParametricArtifactInput
	}
	return nil
}

func validateLiteCADFeatureDSLExpressionTuple(values []any, length int, parameterNames map[string]struct{}) error {
	if len(values) != length {
		return ErrInvalidProjectParametricArtifactInput
	}
	for _, value := range values {
		if err := validateLiteCADFeatureDSLExpression(value, parameterNames); err != nil {
			return err
		}
	}
	return nil
}

func validateLiteCADFeatureDSLExpression(value any, parameterNames map[string]struct{}) error {
	switch typed := value.(type) {
	case float64:
		if !isFiniteFloat(typed) {
			return ErrInvalidProjectParametricArtifactInput
		}
		return nil
	case string:
		if _, ok := parameterNames[typed]; !ok {
			return ErrInvalidProjectParametricArtifactInput
		}
		return nil
	default:
		return ErrInvalidProjectParametricArtifactInput
	}
}

func isFiniteFloat(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func projectParametricModelStorage(title, sourceKind string) (format, contentType, filename string, err error) {
	switch sourceKind {
	case projectParametricSourceKindOpenSCAD:
		return "scad", "text/plain; charset=utf-8", slugifyProjectModelFilename(title, ".scad"), nil
	case projectParametricSourceKindLiteCADDSL:
		return "lcad", "application/json", slugifyProjectModelFilename(title, ".lcad.json"), nil
	default:
		return "", "", "", ErrInvalidProjectParametricArtifactInput
	}
}

func mergeParametricArtifactValuesIntoModelMetadata(model *entity.ProjectModel, parameterValues map[string]any) {
	if len(parameterValues) == 0 || len(model.MetadataJSON) == 0 {
		return
	}
	var metadata StepMetadata
	if err := json.Unmarshal(model.MetadataJSON, &metadata); err != nil {
		return
	}
	if metadata.ParameterValues == nil {
		metadata.ParameterValues = map[string]any{}
	}
	for name, value := range parameterValues {
		if _, ok := metadata.ParameterValues[name]; ok {
			metadata.ParameterValues[name] = value
		}
	}
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return
	}
	model.MetadataJSON = metadataJSON
}

func publicProjectParametricArtifact(artifact entity.ProjectParametricArtifact) ProjectParametricArtifact {
	return ProjectParametricArtifact{
		ID:                   artifact.ID,
		ProjectID:            artifact.ProjectID,
		ConversationID:       artifact.ConversationID,
		MessageID:            artifact.MessageID,
		Title:                artifact.Title,
		SourceKind:           artifact.SourceKind,
		SourceCode:           artifact.SourceCode,
		ParameterValues:      projectParametricArtifactParameters(artifact.ParameterValuesJSON),
		CompileStatus:        artifact.CompileStatus,
		CompileError:         artifact.CompileError,
		PreviewModelID:       artifact.PreviewModelID,
		GenerationToolMode:   artifact.GenerationToolMode,
		GenerationDurationMS: artifact.GenerationDurationMS,
		CreatedAt:            artifact.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:            artifact.UpdatedAt.Format(timeFormatRFC3339),
	}
}

func projectParametricArtifactParameters(data []byte) map[string]any {
	if len(data) == 0 {
		return map[string]any{}
	}
	var values map[string]any
	if err := json.Unmarshal(data, &values); err != nil {
		return map[string]any{}
	}
	return values
}

func parametricModelParameterDefaults(model entity.ProjectModel) (map[string]any, StepMetadata, error) {
	switch model.Format {
	case "scad":
		return openSCADTopLevelParameterValues(string(model.SourceData)), ExtractSCADMetadata(model.OriginalFilename, model.SourceData), nil
	case "lcad":
		return liteCADFeatureDSLParameterValues(model.SourceData), ExtractLiteCADFeatureDSLMetadata(model.OriginalFilename, model.SourceData), nil
	default:
		return nil, StepMetadata{}, ErrInvalidProjectParametricArtifactInput
	}
}

func openSCADTopLevelParameterValues(source string) map[string]any {
	values := map[string]any{}
	for _, rawLine := range strings.Split(source, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		if strings.HasPrefix(line, "module ") || strings.HasPrefix(line, "function ") {
			break
		}
		equalIndex := strings.Index(line, "=")
		semicolonIndex := strings.Index(line, ";")
		if equalIndex <= 0 || semicolonIndex <= equalIndex {
			continue
		}
		name := strings.TrimSpace(line[:equalIndex])
		if !isOpenSCADParameterName(name) {
			continue
		}
		rawValue := strings.TrimSpace(line[equalIndex+1 : semicolonIndex])
		value, ok := parseOpenSCADLiteral(rawValue)
		if ok {
			values[name] = value
		}
	}
	return values
}

func normalizeParametricParameterValue(name string, value any, defaults map[string]any) (any, error) {
	defaultValue, ok := defaults[name]
	if !ok {
		return nil, ErrInvalidProjectParametricArtifactInput
	}
	switch defaultValue.(type) {
	case bool:
		boolValue, ok := value.(bool)
		if !ok {
			return nil, ErrInvalidProjectParametricArtifactInput
		}
		return boolValue, nil
	case string:
		stringValue, ok := value.(string)
		if !ok {
			return nil, ErrInvalidProjectParametricArtifactInput
		}
		return stringValue, nil
	default:
		numberValue, ok := numericParameterValue(value)
		if !ok {
			return nil, ErrInvalidProjectParametricArtifactInput
		}
		return numberValue, nil
	}
}

func parseOpenSCADLiteral(rawValue string) (any, bool) {
	switch rawValue {
	case "true":
		return true, true
	case "false":
		return false, true
	}
	if strings.HasPrefix(rawValue, "\"") && strings.HasSuffix(rawValue, "\"") {
		value, err := strconv.Unquote(rawValue)
		if err != nil {
			return nil, false
		}
		return value, true
	}
	value, err := strconv.ParseFloat(rawValue, 64)
	if err == nil {
		return value, true
	}
	return nil, false
}

func numericParameterValue(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int8:
		return float64(typed), true
	case int16:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case uint:
		return float64(typed), true
	case uint8:
		return float64(typed), true
	case uint16:
		return float64(typed), true
	case uint32:
		return float64(typed), true
	case uint64:
		return float64(typed), true
	case json.Number:
		number, err := typed.Float64()
		return number, err == nil
	default:
		return 0, false
	}
}

func isOpenSCADParameterName(name string) bool {
	if name == "" {
		return false
	}
	for index, r := range name {
		if index == 0 {
			if r != '_' && (r < 'A' || r > 'Z') && (r < 'a' || r > 'z') {
				return false
			}
			continue
		}
		if r != '_' && (r < 'A' || r > 'Z') && (r < 'a' || r > 'z') && (r < '0' || r > '9') {
			return false
		}
	}
	return true
}
