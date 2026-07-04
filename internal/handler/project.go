package handler

import (
	"errors"
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
	case errors.Is(err, service.ErrProjectNotFound):
		return httperr.NewNotFound("project not found")
	default:
		return err
	}
}
