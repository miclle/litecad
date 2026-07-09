package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/miclle/litecad/internal/entity"
	"gorm.io/gorm"
)

// ProjectThumbnailSnapshot is the current static cover image for a project.
type ProjectThumbnailSnapshot struct {
	ContentType string
	Data        []byte
	Revision    int
	UpdatedAt   string
}

// GetProjectThumbnailSnapshot returns the authenticated static project-list cover image.
func (s *Service) GetProjectThumbnailSnapshot(ctx context.Context, ownerUserID, projectID string) (ProjectThumbnailSnapshot, error) {
	ownerUserID = strings.TrimSpace(ownerUserID)
	projectID = strings.TrimSpace(projectID)
	if ownerUserID == "" || projectID == "" {
		return ProjectThumbnailSnapshot{}, ErrProjectNotFound
	}

	var snapshot entity.ProjectThumbnailSnapshot
	err := s.db.WithContext(ctx).
		Joins("JOIN projects ON projects.id = project_thumbnail_snapshots.project_id").
		Where("project_thumbnail_snapshots.project_id = ? AND projects.owner_user_id = ?", projectID, ownerUserID).
		First(&snapshot).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectThumbnailSnapshot{}, ErrProjectNotFound
		}
		return ProjectThumbnailSnapshot{}, fmt.Errorf("get project thumbnail snapshot: %w", err)
	}

	return ProjectThumbnailSnapshot{
		ContentType: snapshot.ContentType,
		Data:        append([]byte(nil), snapshot.Data...),
		Revision:    snapshot.Revision,
		UpdatedAt:   snapshot.UpdatedAt.Format(timeFormatRFC3339),
	}, nil
}
