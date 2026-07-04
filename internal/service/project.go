package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const maxProjectDescriptionRunes = 350

var (
	// ErrInvalidProjectInput indicates missing or malformed project input.
	ErrInvalidProjectInput = errors.New("invalid project input")
	// ErrProjectNotFound indicates a project does not exist for the current owner.
	ErrProjectNotFound = errors.New("project not found")
)

// CreateProjectInput is the data required to create a project.
type CreateProjectInput struct {
	OwnerUserID string
	Name        string
	Description string
}

// Project is the public project shape returned by project APIs.
type Project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
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
	for _, project := range projects {
		result = append(result, publicProject(project))
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

func publicProject(project entity.Project) Project {
	return Project{
		ID:          project.ID,
		Name:        project.Name,
		Description: project.Description,
		CreatedAt:   project.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:   project.UpdatedAt.Format(timeFormatRFC3339),
	}
}
