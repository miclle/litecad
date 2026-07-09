package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const maxProjectDescriptionRunes = 350
const projectThumbnailModelLimit = 3

// MaxProjectModelUploadBytes is the largest CAD source file accepted by the import pipeline.
const MaxProjectModelUploadBytes = 100 * 1024 * 1024

var (
	// ErrInvalidProjectInput indicates missing or malformed project input.
	ErrInvalidProjectInput = errors.New("invalid project input")
	// ErrProjectNotFound indicates a project does not exist for the current owner.
	ErrProjectNotFound = errors.New("project not found")
	// ErrInvalidProjectModelInput indicates missing or malformed project model input.
	ErrInvalidProjectModelInput = errors.New("invalid project model input")
	// ErrUnsupportedModelFormat indicates the uploaded CAD file format is not accepted yet.
	ErrUnsupportedModelFormat = errors.New("unsupported model format")
)

// CreateProjectInput is the data required to create a project.
type CreateProjectInput struct {
	OwnerUserID string
	Name        string
	Description string
}

// Project is the public project shape returned by project APIs.
type Project struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Thumbnail   ProjectThumbnail `json:"thumbnail"`
	CreatedAt   string           `json:"created_at"`
	UpdatedAt   string           `json:"updated_at"`
}

// ProjectThumbnail is the lightweight model context needed for project-list cards.
type ProjectThumbnail struct {
	ModelCount int                   `json:"model_count"`
	Models     []ProjectModelSummary `json:"models"`
}

// ProjectModelSummary is safe to include in project-list responses without source bytes.
type ProjectModelSummary struct {
	ID          string       `json:"id"`
	Format      string       `json:"format"`
	ParseStatus string       `json:"parse_status"`
	Metadata    StepMetadata `json:"metadata"`
	UpdatedAt   string       `json:"updated_at"`
}

// UploadProjectModelInput is the data required to attach a CAD source file to a project.
type UploadProjectModelInput struct {
	OwnerUserID string
	ProjectID   string
	Filename    string
	ContentType string
	Data        []byte
}

// ProjectModel is the public shape for an uploaded CAD source file.
type ProjectModel struct {
	ID               string       `json:"id"`
	ProjectID        string       `json:"project_id"`
	OriginalFilename string       `json:"original_filename"`
	Format           string       `json:"format"`
	ContentType      string       `json:"content_type"`
	ByteSize         int64        `json:"byte_size"`
	ParseStatus      string       `json:"parse_status"`
	ParseError       string       `json:"parse_error"`
	Metadata         StepMetadata `json:"metadata"`
	CreatedAt        string       `json:"created_at"`
	UpdatedAt        string       `json:"updated_at"`
}

// ProjectModelSource is an owned CAD source file and its public metadata.
type ProjectModelSource struct {
	Model ProjectModel
	Data  []byte
}

// ListProjects returns projects owned by the given user, newest first.
func (s *Service) ListProjects(ctx context.Context, ownerUserID string) ([]Project, error) {
	if strings.TrimSpace(ownerUserID) == "" {
		return nil, ErrInvalidSession
	}

	var projects []entity.Project
	if err := s.db.WithContext(ctx).
		Where("owner_user_id = ?", ownerUserID).
		Order("updated_at DESC").
		Find(&projects).Error; err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}

	result := make([]Project, 0, len(projects))
	projectIDs := make([]string, 0, len(projects))
	for _, project := range projects {
		result = append(result, publicProject(project))
		projectIDs = append(projectIDs, project.ID)
	}
	if err := s.attachProjectThumbnails(ctx, result, projectIDs); err != nil {
		return nil, err
	}
	return result, nil
}

// GetProject returns a project owned by the given user.
func (s *Service) GetProject(ctx context.Context, ownerUserID, projectID string) (Project, error) {
	ownerUserID = strings.TrimSpace(ownerUserID)
	projectID = strings.TrimSpace(projectID)
	if ownerUserID == "" || projectID == "" {
		return Project{}, ErrProjectNotFound
	}

	var project entity.Project
	err := s.db.WithContext(ctx).
		First(&project, "id = ? AND owner_user_id = ?", projectID, ownerUserID).
		Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Project{}, ErrProjectNotFound
		}
		return Project{}, fmt.Errorf("get project: %w", err)
	}
	return publicProject(project), nil
}

// CreateProject creates a user-owned LiteCAD project.
func (s *Service) CreateProject(ctx context.Context, input CreateProjectInput) (Project, error) {
	ownerUserID := strings.TrimSpace(input.OwnerUserID)
	name := strings.TrimSpace(input.Name)
	description := strings.TrimSpace(input.Description)
	if ownerUserID == "" || name == "" || utf8.RuneCountInString(name) > 120 || utf8.RuneCountInString(description) > maxProjectDescriptionRunes {
		return Project{}, ErrInvalidProjectInput
	}

	projectID, err := id.NewPrefixed("prj")
	if err != nil {
		return Project{}, err
	}

	project := entity.Project{
		ID:          projectID,
		OwnerUserID: ownerUserID,
		Name:        name,
		Description: description,
	}
	if err := s.db.WithContext(ctx).Create(&project).Error; err != nil {
		return Project{}, fmt.Errorf("create project: %w", err)
	}
	return publicProject(project), nil
}

// UploadProjectModel stores an uploaded CAD source file for a user-owned project.
func (s *Service) UploadProjectModel(ctx context.Context, input UploadProjectModelInput) (ProjectModel, error) {
	ownerUserID := strings.TrimSpace(input.OwnerUserID)
	projectID := strings.TrimSpace(input.ProjectID)
	filename := strings.TrimSpace(filepath.Base(input.Filename))
	contentType := strings.TrimSpace(input.ContentType)
	data := input.Data
	if ownerUserID == "" || projectID == "" || filename == "" || len(data) == 0 || len(data) > MaxProjectModelUploadBytes {
		return ProjectModel{}, ErrInvalidProjectModelInput
	}

	format, err := projectModelFormat(filename)
	if err != nil {
		return ProjectModel{}, err
	}

	var project entity.Project
	if err := s.db.WithContext(ctx).First(&project, "id = ? AND owner_user_id = ?", projectID, ownerUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectModel{}, ErrProjectNotFound
		}
		return ProjectModel{}, fmt.Errorf("load project for model upload: %w", err)
	}

	modelID, err := id.NewPrefixed("mdl")
	if err != nil {
		return ProjectModel{}, err
	}
	model := entity.ProjectModel{
		ID:               modelID,
		ProjectID:        project.ID,
		OriginalFilename: filename,
		Format:           format,
		ContentType:      contentType,
		ByteSize:         int64(len(data)),
		SourceData:       append([]byte(nil), data...),
	}
	applyModelMetadata(&model)
	if err := s.db.WithContext(ctx).Create(&model).Error; err != nil {
		return ProjectModel{}, fmt.Errorf("store project model: %w", err)
	}
	return publicProjectModel(model), nil
}

// ListProjectModels returns uploaded CAD source files for a user-owned project, newest first.
func (s *Service) ListProjectModels(ctx context.Context, ownerUserID, projectID string) ([]ProjectModel, error) {
	ownerUserID = strings.TrimSpace(ownerUserID)
	projectID = strings.TrimSpace(projectID)
	if ownerUserID == "" || projectID == "" {
		return nil, ErrProjectNotFound
	}

	var project entity.Project
	if err := s.db.WithContext(ctx).First(&project, "id = ? AND owner_user_id = ?", projectID, ownerUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrProjectNotFound
		}
		return nil, fmt.Errorf("load project for model list: %w", err)
	}

	var models []entity.ProjectModel
	if err := s.db.WithContext(ctx).
		Where("project_id = ?", project.ID).
		Order("created_at DESC").
		Find(&models).Error; err != nil {
		return nil, fmt.Errorf("list project models: %w", err)
	}

	result := make([]ProjectModel, 0, len(models))
	for _, model := range models {
		if shouldBackfillModelMetadata(model) {
			applyModelMetadata(&model)
			if err := s.db.WithContext(ctx).Model(&model).Updates(map[string]any{
				"parse_status":  model.ParseStatus,
				"parse_error":   model.ParseError,
				"metadata_json": model.MetadataJSON,
			}).Error; err != nil {
				return nil, fmt.Errorf("update project model metadata: %w", err)
			}
		}
		result = append(result, publicProjectModel(model))
	}
	return result, nil
}

// GetProjectModelSource returns the original uploaded bytes for a user-owned project model.
func (s *Service) GetProjectModelSource(ctx context.Context, ownerUserID, projectID, modelID string) (ProjectModelSource, error) {
	ownerUserID = strings.TrimSpace(ownerUserID)
	projectID = strings.TrimSpace(projectID)
	modelID = strings.TrimSpace(modelID)
	if ownerUserID == "" || projectID == "" || modelID == "" {
		return ProjectModelSource{}, ErrProjectNotFound
	}

	var model entity.ProjectModel
	err := s.db.WithContext(ctx).
		Joins("JOIN projects ON projects.id = project_models.project_id").
		Where("project_models.id = ? AND project_models.project_id = ? AND projects.owner_user_id = ?", modelID, projectID, ownerUserID).
		First(&model).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectModelSource{}, ErrProjectNotFound
		}
		return ProjectModelSource{}, fmt.Errorf("get project model source: %w", err)
	}

	return ProjectModelSource{
		Model: publicProjectModel(model),
		Data:  append([]byte(nil), model.SourceData...),
	}, nil
}

func publicProject(project entity.Project) Project {
	return Project{
		ID:          project.ID,
		Name:        project.Name,
		Description: project.Description,
		Thumbnail:   ProjectThumbnail{},
		CreatedAt:   project.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:   project.UpdatedAt.Format(timeFormatRFC3339),
	}
}

func (s *Service) attachProjectThumbnails(ctx context.Context, projects []Project, projectIDs []string) error {
	if len(projectIDs) == 0 {
		return nil
	}

	var counts []struct {
		ProjectID  string
		ModelCount int
	}
	if err := s.db.WithContext(ctx).
		Model(&entity.ProjectModel{}).
		Select("project_id, COUNT(*) AS model_count").
		Where("project_id IN ?", projectIDs).
		Group("project_id").
		Scan(&counts).Error; err != nil {
		return fmt.Errorf("count project thumbnail models: %w", err)
	}

	var models []entity.ProjectModel
	if err := s.db.WithContext(ctx).Raw(`
		SELECT id, project_id, original_filename, format, parse_status, metadata_json, updated_at, created_at
		FROM (
			SELECT id, project_id, original_filename, format, parse_status, metadata_json, updated_at, created_at,
				ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at DESC) AS row_number
			FROM project_models
			WHERE project_id IN ? AND deleted_at IS NULL
		) ranked_project_models
		WHERE row_number <= ?
		ORDER BY project_id ASC, created_at DESC
	`, projectIDs, projectThumbnailModelLimit).Scan(&models).Error; err != nil {
		return fmt.Errorf("list project thumbnail models: %w", err)
	}

	projectIndexes := make(map[string]int, len(projects))
	for index, project := range projects {
		projectIndexes[project.ID] = index
	}
	for _, count := range counts {
		index, ok := projectIndexes[count.ProjectID]
		if !ok {
			continue
		}
		projects[index].Thumbnail.ModelCount = count.ModelCount
	}
	for _, model := range models {
		index, ok := projectIndexes[model.ProjectID]
		if !ok {
			continue
		}
		thumbnail := &projects[index].Thumbnail
		thumbnail.Models = append(thumbnail.Models, publicProjectModelSummary(model))
	}
	return nil
}

func publicProjectModelSummary(model entity.ProjectModel) ProjectModelSummary {
	metadata := StepMetadata{}
	if len(model.MetadataJSON) > 0 {
		_ = json.Unmarshal(model.MetadataJSON, &metadata)
	}
	return ProjectModelSummary{
		ID:          model.ID,
		Format:      model.Format,
		ParseStatus: model.ParseStatus,
		Metadata:    metadata,
		UpdatedAt:   model.UpdatedAt.Format(timeFormatRFC3339),
	}
}

func projectModelFormat(filename string) (string, error) {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".step", ".stp":
		return "step", nil
	case ".glb":
		return "glb", nil
	case ".gltf":
		return "gltf", nil
	case ".stl":
		return "stl", nil
	default:
		return "", ErrUnsupportedModelFormat
	}
}

func publicProjectModel(model entity.ProjectModel) ProjectModel {
	metadata := StepMetadata{}
	if len(model.MetadataJSON) > 0 {
		_ = json.Unmarshal(model.MetadataJSON, &metadata)
	}
	return ProjectModel{
		ID:               model.ID,
		ProjectID:        model.ProjectID,
		OriginalFilename: model.OriginalFilename,
		Format:           model.Format,
		ContentType:      model.ContentType,
		ByteSize:         model.ByteSize,
		ParseStatus:      model.ParseStatus,
		ParseError:       model.ParseError,
		Metadata:         metadata,
		CreatedAt:        model.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:        model.UpdatedAt.Format(timeFormatRFC3339),
	}
}

func shouldBackfillModelMetadata(model entity.ProjectModel) bool {
	return model.ParseStatus == "" || (model.ParseStatus == "pending" && len(model.MetadataJSON) == 0)
}

func applyModelMetadata(model *entity.ProjectModel) {
	var (
		metadata StepMetadata
		err      error
	)
	switch model.Format {
	case "step":
		metadata, err = ExtractStepMetadata(model.SourceData)
	case "glb":
		metadata, err = ExtractGLBMetadata(model.SourceData)
	case "gltf":
		metadata, err = ExtractGLTFMetadata(model.SourceData)
	case "stl":
		metadata, err = ExtractSTLMetadata(model.SourceData)
	default:
		model.ParseStatus = "pending"
		return
	}
	if err != nil {
		model.ParseStatus = "error"
		model.ParseError = err.Error()
		model.MetadataJSON = nil
		return
	}
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		model.ParseStatus = "error"
		model.ParseError = err.Error()
		model.MetadataJSON = nil
		return
	}
	model.ParseStatus = "parsed"
	model.ParseError = ""
	model.MetadataJSON = metadataJSON
}
