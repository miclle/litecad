package handler

import (
	"net/http"

	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
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
