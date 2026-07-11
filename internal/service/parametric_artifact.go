package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
)

var (
	// ErrInvalidProjectParametricArtifactInput indicates malformed parametric artifact data.
	ErrInvalidProjectParametricArtifactInput = errors.New("invalid project parametric artifact input")
)

// CreateProjectParametricArtifactInput is the data required to persist generated parametric CAD source.
type CreateProjectParametricArtifactInput struct {
	OwnerUserID     string
	ProjectID       string
	ConversationID  string
	MessageID       string
	Title           string
	SourceKind      string
	SourceCode      string
	ParameterValues map[string]any
	CompileStatus   string
	CompileError    string
	PreviewModelID  string
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
	ID              string         `json:"id"`
	ProjectID       string         `json:"project_id"`
	ConversationID  string         `json:"conversation_id"`
	MessageID       string         `json:"message_id"`
	Title           string         `json:"title"`
	SourceKind      string         `json:"source_kind"`
	SourceCode      string         `json:"source_code"`
	ParameterValues map[string]any `json:"parameter_values"`
	CompileStatus   string         `json:"compile_status"`
	CompileError    string         `json:"compile_error"`
	PreviewModelID  string         `json:"preview_model_id"`
	CreatedAt       string         `json:"created_at"`
	UpdatedAt       string         `json:"updated_at"`
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
		ID:                  artifactID,
		ProjectID:           project.ID,
		ConversationID:      strings.TrimSpace(input.ConversationID),
		MessageID:           strings.TrimSpace(input.MessageID),
		Title:               normalized.title,
		SourceKind:          normalized.sourceKind,
		SourceCode:          normalized.sourceCode,
		ParameterValuesJSON: normalized.parameterValuesJSON,
		CompileStatus:       normalized.compileStatus,
		CompileError:        normalized.compileError,
		PreviewModelID:      normalized.previewModelID,
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
	if sourceKind == projectParametricSourceKindLiteCADDSL && !json.Valid([]byte(sourceCode)) {
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
		ID:              artifact.ID,
		ProjectID:       artifact.ProjectID,
		ConversationID:  artifact.ConversationID,
		MessageID:       artifact.MessageID,
		Title:           artifact.Title,
		SourceKind:      artifact.SourceKind,
		SourceCode:      artifact.SourceCode,
		ParameterValues: projectParametricArtifactParameters(artifact.ParameterValuesJSON),
		CompileStatus:   artifact.CompileStatus,
		CompileError:    artifact.CompileError,
		PreviewModelID:  artifact.PreviewModelID,
		CreatedAt:       artifact.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:       artifact.UpdatedAt.Format(timeFormatRFC3339),
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
