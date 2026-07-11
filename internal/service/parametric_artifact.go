package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	if sourceKind != projectParametricSourceKindOpenSCAD {
		return normalizedProjectParametricArtifactInput{}, ErrInvalidProjectParametricArtifactInput
	}

	sourceCode := strings.TrimSpace(input.SourceCode)
	if sourceCode == "" || len([]byte(sourceCode)) > maxProjectParametricArtifactSourceBytes {
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
