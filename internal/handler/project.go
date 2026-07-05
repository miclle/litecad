package handler

import (
	"errors"
	"io"
	"net/http"

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

type projectModelResponse struct {
	Model service.ProjectModel `json:"model"`
}

type projectModelPreviewArtifactResponse struct {
	Preview service.ProjectModelPreviewArtifact `json:"preview"`
}

type projectGeometryDocumentResponse struct {
	Document service.ProjectGeometryDocument `json:"document"`
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
	case errors.Is(err, service.ErrModelPreviewUnavailable):
		return httperr.NewBadRequest("model preview unavailable")
	case errors.Is(err, service.ErrProjectNotFound):
		return httperr.NewNotFound("project not found")
	default:
		return err
	}
}
