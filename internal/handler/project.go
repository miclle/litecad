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

type createProjectRequest struct {
	Name        string `json:"name" binding:"required,min=1,max=120"`
	Description string `json:"description" binding:"max=350"`
}

type projectsResponse struct {
	Projects []service.Project `json:"projects"`
}

type projectResponse struct {
	Project service.Project `json:"project"`
}

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

type projectCADDocumentResponse struct {
	Document service.ProjectCADDocument `json:"document"`
}

type updateProjectCADModelTransformRequest struct {
	Transform service.CADTransform `json:"transform" binding:"required"`
}

type addProjectCADModelBoxUnionRequest struct {
	Box service.CADBoxFeature `json:"box" binding:"required"`
}

type projectAgentMessageRequest struct {
	Messages []service.AIChatMessage `json:"messages" binding:"required"`
}

type projectAgentMessageResponse struct {
	Message service.ProjectAgentMessage `json:"message"`
}

type projectAgentMessagesResponse struct {
	Messages []service.ProjectAgentMessage `json:"messages"`
}

// ListProjects returns the signed-in user's projects.
func (ctrl *Ctrl) ListProjects(c *fox.Context) (projectsResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectsResponse{}, err
	}
	projects, err := ctrl.service.ListProjects(c.Request.Context(), user.ID)
	if err != nil {
		return projectsResponse{}, projectError(err)
	}
	return projectsResponse{Projects: projects}, nil
}

// GetProject returns a signed-in user's project by id.
func (ctrl *Ctrl) GetProject(c *fox.Context) (projectResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectResponse{}, err
	}
	project, err := ctrl.service.GetProject(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectResponse{}, projectError(err)
	}
	return projectResponse{Project: project}, nil
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
	defer func() {
		_ = file.Close()
	}()

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

// CreateProject creates a signed-in user's project.
func (ctrl *Ctrl) CreateProject(c *fox.Context, req *createProjectRequest) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}
	project, err := ctrl.service.CreateProject(c.Request.Context(), service.CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        req.Name,
		Description: req.Description,
	})
	if err != nil {
		return projectError(err)
	}
	c.JSON(http.StatusCreated, projectResponse{Project: project})
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
	defer func() {
		_ = file.Close()
	}()

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

// GetProjectCADDocument returns the editable LiteCAD document for a signed-in user's project.
func (ctrl *Ctrl) GetProjectCADDocument(c *fox.Context) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.GetProjectCADDocument(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// UpdateProjectCADModelTransform records a per-model transform in the editable LiteCAD document.
func (ctrl *Ctrl) UpdateProjectCADModelTransform(c *fox.Context, req *updateProjectCADModelTransformRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.UpdateProjectCADModelTransform(c.Request.Context(), service.UpdateProjectCADModelTransformInput{
		OwnerUserID: user.ID,
		ProjectID:   c.Param("projectID"),
		ModelID:     c.Param("modelID"),
		Transform:   req.Transform,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// UpdateProjectCADNodeTransform records a document-node transform in the editable LiteCAD document.
func (ctrl *Ctrl) UpdateProjectCADNodeTransform(c *fox.Context, req *updateProjectCADModelTransformRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.UpdateProjectCADNodeTransform(c.Request.Context(), service.UpdateProjectCADNodeTransformInput{
		OwnerUserID: user.ID,
		ProjectID:   c.Param("projectID"),
		NodeID:      c.Param("nodeID"),
		Transform:   req.Transform,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// AddProjectCADModelBoxUnion records one kernel-backed box union feature.
func (ctrl *Ctrl) AddProjectCADModelBoxUnion(c *fox.Context, req *addProjectCADModelBoxUnionRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.AddProjectCADModelBoxUnion(c.Request.Context(), service.AddProjectCADModelBoxUnionInput{
		OwnerUserID: user.ID,
		ProjectID:   c.Param("projectID"),
		ModelID:     c.Param("modelID"),
		Box:         req.Box,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// ListProjectAgentMessages returns persisted CAD Agent messages for a signed-in user's project.
func (ctrl *Ctrl) ListProjectAgentMessages(c *fox.Context) (projectAgentMessagesResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectAgentMessagesResponse{}, err
	}
	messages, err := ctrl.service.ListProjectAgentMessages(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectAgentMessagesResponse{}, projectError(err)
	}
	return projectAgentMessagesResponse{Messages: messages}, nil
}

// SendProjectAgentMessage returns a CAD Agent reply grounded in the signed-in user's project.
func (ctrl *Ctrl) SendProjectAgentMessage(c *fox.Context, req *projectAgentMessageRequest) (projectAgentMessageResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectAgentMessageResponse{}, err
	}
	message, err := ctrl.service.SendProjectAgentMessage(c.Request.Context(), service.ProjectAgentMessageInput{
		OwnerUserID: user.ID,
		ProjectID:   c.Param("projectID"),
		Messages:    req.Messages,
	})
	if err != nil {
		return projectAgentMessageResponse{}, projectError(err)
	}
	return projectAgentMessageResponse{Message: message}, nil
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

func (ctrl *Ctrl) currentUser(c *fox.Context) (service.AuthUser, error) {
	token, err := c.Cookie(SessionCookieName)
	if err != nil {
		return service.AuthUser{}, httperr.NewUnauthorized("not signed in")
	}
	user, err := ctrl.service.UserBySessionToken(c.Request.Context(), token)
	if err != nil {
		return service.AuthUser{}, authError(err)
	}
	return user, nil
}

func projectError(err error) error {
	switch {
	case errors.Is(err, service.ErrInvalidProjectInput):
		return httperr.NewBadRequest("invalid project information")
	case errors.Is(err, service.ErrInvalidProjectModelInput):
		return httperr.NewBadRequest("invalid model upload")
	case errors.Is(err, service.ErrUnsupportedModelFormat):
		return httperr.NewBadRequest("unsupported model format")
	case errors.Is(err, service.ErrInvalidCADDocumentInput):
		return httperr.NewBadRequest("invalid CAD document input")
	case errors.Is(err, service.ErrModelPreviewUnavailable):
		return httperr.NewBadRequest("model preview unavailable")
	case errors.Is(err, service.ErrInvalidAIChatInput):
		return httperr.NewBadRequest("invalid agent message")
	case errors.Is(err, service.ErrAIUnavailable):
		return httperr.NewServiceUnavailable("AI provider is not configured")
	case errors.Is(err, service.ErrProjectNotFound):
		return httperr.NewNotFound("project not found")
	default:
		return err
	}
}
