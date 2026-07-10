package handler

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
	"github.com/miclle/litecad/pkg/httperr"
)

type projectModelsResponse struct {
	Models []service.ProjectModel `json:"models"`
}

type projectThumbnailSnapshotResponse struct {
	Snapshot service.ProjectThumbnailSnapshotSummary `json:"snapshot"`
}

type projectModelResponse struct {
	Model service.ProjectModel `json:"model"`
}

type projectModelPreviewArtifactResponse struct {
	Preview service.ProjectModelPreviewArtifact `json:"preview"`
}

type projectGeometryDocumentResponse struct {
	Document service.ProjectGeometryDocument `json:"document"`
}

// GetProjectThumbnailSnapshot returns the static project-list cover image.
func (ctrl *Ctrl) GetProjectThumbnailSnapshot(c *fox.Context) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}
	snapshot, err := ctrl.service.GetProjectThumbnailSnapshot(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectError(err)
	}
	c.Writer.Header().Set("Cache-Control", "private, max-age=300")
	c.Writer.Header().Set("ETag", fmt.Sprintf("\"litecad-thumbnail-%d\"", snapshot.Revision))
	c.Data(http.StatusOK, snapshot.ContentType, snapshot.Data)
	return nil
}

// SaveProjectThumbnailSnapshot stores the current static project-list cover image.
func (ctrl *Ctrl) SaveProjectThumbnailSnapshot(c *fox.Context) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}

	maxUploadBytes := int64(service.MaxProjectThumbnailSnapshotBytes)
	if c.Request.ContentLength > maxUploadBytes {
		return httperr.NewRequestEntityTooLarge("thumbnail upload is too large")
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadBytes+4096)

	file, header, err := c.Request.FormFile("snapshot")
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return httperr.NewRequestEntityTooLarge("thumbnail upload is too large")
		}
		return httperr.NewBadRequest("thumbnail snapshot is required")
	}
	defer func() { _ = file.Close() }()

	width, err := strconv.Atoi(c.Request.FormValue("width"))
	if err != nil {
		return httperr.NewBadRequest("thumbnail width is required")
	}
	height, err := strconv.Atoi(c.Request.FormValue("height"))
	if err != nil {
		return httperr.NewBadRequest("thumbnail height is required")
	}
	revision, err := strconv.Atoi(c.Request.FormValue("revision"))
	if err != nil {
		return httperr.NewBadRequest("thumbnail revision is required")
	}
	data, err := io.ReadAll(io.LimitReader(file, service.MaxProjectThumbnailSnapshotBytes+1))
	if err != nil {
		return err
	}

	snapshot, err := ctrl.service.SaveProjectThumbnailSnapshot(c.Request.Context(), service.SaveProjectThumbnailSnapshotInput{
		OwnerUserID: user.ID,
		ProjectID:   c.Param("projectID"),
		ContentType: header.Header.Get("Content-Type"),
		Data:        data,
		Width:       width,
		Height:      height,
		Revision:    revision,
	})
	if err != nil {
		return projectError(err)
	}
	c.JSON(http.StatusOK, projectThumbnailSnapshotResponse{Snapshot: snapshot})
	return nil
}

// ListProjectModels returns uploaded CAD source files for a signed-in user's project.
func (ctrl *Ctrl) ListProjectModels(c *fox.Context) (projectModelsResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectModelsResponse{}, err
	}
	models, err := ctrl.service.ListProjectModels(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectModelsResponse{}, projectError(err)
	}
	return projectModelsResponse{Models: models}, nil
}

// UploadProjectModel attaches a CAD source file to a signed-in user's project.
func (ctrl *Ctrl) UploadProjectModel(c *fox.Context) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}

	maxUploadBytes := int64(service.MaxProjectModelUploadBytes)
	if c.Request.ContentLength > maxUploadBytes {
		return httperr.NewRequestEntityTooLarge("model upload is too large")
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadBytes+1)

	file, header, err := c.Request.FormFile("model")
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return httperr.NewRequestEntityTooLarge("model upload is too large")
		}
		return httperr.NewBadRequest("model file is required")
	}
	defer func() { _ = file.Close() }()

	data, err := io.ReadAll(io.LimitReader(file, service.MaxProjectModelUploadBytes+1))
	if err != nil {
		return err
	}
	model, err := ctrl.service.UploadProjectModel(c.Request.Context(), service.UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   c.Param("projectID"),
		Filename:    header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		Data:        data,
	})
	if err != nil {
		return projectError(err)
	}
	c.JSON(http.StatusCreated, projectModelResponse{Model: model})
	return nil
}

// GetProjectModelSource returns the original uploaded CAD source for browser-side processing.
func (ctrl *Ctrl) GetProjectModelSource(c *fox.Context) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}
	source, err := ctrl.service.GetProjectModelSource(c.Request.Context(), user.ID, c.Param("projectID"), c.Param("modelID"))
	if err != nil {
		return projectError(err)
	}

	contentType := strings.TrimSpace(source.Model.ContentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if filename := strings.TrimSpace(source.Model.OriginalFilename); filename != "" {
		c.Writer.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": filename}))
	}
	c.Data(http.StatusOK, contentType, source.Data)
	return nil
}

// GetProjectModelPreview returns a browser-previewable mesh artifact for a project model.
func (ctrl *Ctrl) GetProjectModelPreview(c *fox.Context) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}
	preview, err := ctrl.service.GetOrCreateProjectModelPreview(c.Request.Context(), user.ID, c.Param("projectID"), c.Param("modelID"))
	if err != nil {
		return projectError(err)
	}
	c.Data(http.StatusOK, preview.ContentType, preview.Data)
	return nil
}

// GetProjectModelPreviewArtifact returns metadata for the browser-previewable artifact.
func (ctrl *Ctrl) GetProjectModelPreviewArtifact(c *fox.Context) (projectModelPreviewArtifactResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectModelPreviewArtifactResponse{}, err
	}
	preview, err := ctrl.service.GetOrCreateProjectModelPreview(c.Request.Context(), user.ID, c.Param("projectID"), c.Param("modelID"))
	if err != nil {
		return projectModelPreviewArtifactResponse{}, projectError(err)
	}
	return projectModelPreviewArtifactResponse{Preview: preview}, nil
}

// GetProjectGeometryDocument returns a read-only geometry document for a signed-in user's project.
func (ctrl *Ctrl) GetProjectGeometryDocument(c *fox.Context) (projectGeometryDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectGeometryDocumentResponse{}, err
	}
	document, err := ctrl.service.GetProjectGeometryDocument(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectGeometryDocumentResponse{}, projectError(err)
	}
	return projectGeometryDocumentResponse{Document: document}, nil
}
