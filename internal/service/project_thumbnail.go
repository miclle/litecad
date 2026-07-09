package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const MaxProjectThumbnailSnapshotBytes = 2 * 1024 * 1024

// ProjectThumbnailSnapshot is the current static cover image for a project.
type ProjectThumbnailSnapshot struct {
	ContentType string
	Data        []byte
	Revision    int
	UpdatedAt   string
}

// SaveProjectThumbnailSnapshotInput stores the current project-list cover image.
type SaveProjectThumbnailSnapshotInput struct {
	OwnerUserID string
	ProjectID   string
	ContentType string
	Data        []byte
	Width       int
	Height      int
	Revision    int
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

// SaveProjectThumbnailSnapshot replaces the static project-list cover image for a project.
func (s *Service) SaveProjectThumbnailSnapshot(ctx context.Context, input SaveProjectThumbnailSnapshotInput) (ProjectThumbnailSnapshotSummary, error) {
	ownerUserID := strings.TrimSpace(input.OwnerUserID)
	projectID := strings.TrimSpace(input.ProjectID)
	contentType := strings.TrimSpace(input.ContentType)
	data := input.Data
	if ownerUserID == "" || projectID == "" {
		return ProjectThumbnailSnapshotSummary{}, ErrProjectNotFound
	}
	if !isSupportedProjectThumbnailContentType(contentType) || len(data) == 0 || len(data) > MaxProjectThumbnailSnapshotBytes || input.Width <= 0 || input.Height <= 0 || input.Revision < 0 {
		return ProjectThumbnailSnapshotSummary{}, ErrInvalidProjectInput
	}

	var project entity.Project
	if err := s.db.WithContext(ctx).First(&project, "id = ? AND owner_user_id = ?", projectID, ownerUserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectThumbnailSnapshotSummary{}, ErrProjectNotFound
		}
		return ProjectThumbnailSnapshotSummary{}, fmt.Errorf("load project for thumbnail snapshot: %w", err)
	}

	var publicSnapshot *ProjectThumbnailSnapshotSummary
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var snapshot entity.ProjectThumbnailSnapshot
		err := tx.First(&snapshot, "project_id = ?", project.ID).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("load project thumbnail snapshot: %w", err)
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			snapshotID, err := id.NewPrefixed("pth")
			if err != nil {
				return err
			}
			snapshot = entity.ProjectThumbnailSnapshot{
				ID:        snapshotID,
				ProjectID: project.ID,
			}
		}

		snapshot.ContentType = contentType
		snapshot.ByteSize = int64(len(data))
		snapshot.Width = input.Width
		snapshot.Height = input.Height
		snapshot.Revision = input.Revision
		snapshot.Status = "ready"
		snapshot.Data = append([]byte(nil), data...)
		if snapshot.ID == "" {
			return ErrInvalidProjectInput
		}
		if err := tx.Save(&snapshot).Error; err != nil {
			return fmt.Errorf("save project thumbnail snapshot: %w", err)
		}
		publicSnapshot = publicProjectThumbnailSnapshotSummary(snapshot)
		return nil
	})
	if err != nil {
		return ProjectThumbnailSnapshotSummary{}, err
	}
	if publicSnapshot == nil {
		return ProjectThumbnailSnapshotSummary{}, fmt.Errorf("save project thumbnail snapshot: missing result")
	}
	return *publicSnapshot, nil
}

func isSupportedProjectThumbnailContentType(contentType string) bool {
	return contentType == "image/webp" || contentType == "image/png"
}
