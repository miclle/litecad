package handler

import (
	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
)

type projectModelRevisionsResponse struct {
	Revisions []service.ProjectModelRevision `json:"revisions"`
}

type projectModelRevisionResponse struct {
	Revision service.ProjectModelRevision `json:"revision"`
}

type restoreProjectModelRevisionRequest struct {
	ExpectedRevision int `json:"expected_revision" binding:"required,min=1"`
}

// ListProjectModelRevisions returns immutable source snapshots for one owned model.
func (ctrl *Ctrl) ListProjectModelRevisions(c *fox.Context) (projectModelRevisionsResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectModelRevisionsResponse{}, err
	}
	revisions, err := ctrl.service.ListProjectModelRevisions(c.Request.Context(), user.ID, c.Param("projectID"), c.Param("modelID"))
	if err != nil {
		return projectModelRevisionsResponse{}, projectError(err)
	}
	return projectModelRevisionsResponse{Revisions: revisions}, nil
}

// GetProjectModelRevision returns one immutable source snapshot's metadata.
func (ctrl *Ctrl) GetProjectModelRevision(c *fox.Context) (projectModelRevisionResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectModelRevisionResponse{}, err
	}
	revision, err := ctrl.service.GetProjectModelRevision(c.Request.Context(), user.ID, c.Param("projectID"), c.Param("modelID"), c.Param("revisionID"))
	if err != nil {
		return projectModelRevisionResponse{}, projectError(err)
	}
	return projectModelRevisionResponse{Revision: revision}, nil
}

// RestoreProjectModelRevision selects an immutable snapshot through CAD History.
func (ctrl *Ctrl) RestoreProjectModelRevision(c *fox.Context, req *restoreProjectModelRevisionRequest) (projectModelResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectModelResponse{}, err
	}
	model, err := ctrl.service.RestoreProjectModelRevision(c.Request.Context(), service.RestoreProjectModelRevisionInput{
		OwnerUserID:      user.ID,
		ProjectID:        c.Param("projectID"),
		ModelID:          c.Param("modelID"),
		RevisionID:       c.Param("revisionID"),
		ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectModelResponse{}, projectError(err)
	}
	return projectModelResponse{Model: model}, nil
}
