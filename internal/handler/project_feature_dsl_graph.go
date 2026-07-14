package handler

import (
	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
)

type projectFeatureDSLGraphRequest struct {
	SourceCode       string `json:"source_code" binding:"required"`
	ExpectedRevision int    `json:"expected_revision" binding:"required,min=1"`
}

// UpdateProjectFeatureDSLGraph stores one validated saved-model graph revision.
func (ctrl *Ctrl) UpdateProjectFeatureDSLGraph(c *fox.Context, req *projectFeatureDSLGraphRequest) (projectModelResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectModelResponse{}, err
	}
	model, err := ctrl.service.UpdateLiteCADFeatureGraph(c.Request.Context(), service.UpdateLiteCADFeatureGraphInput{
		OwnerUserID:      user.ID,
		ProjectID:        c.Param("projectID"),
		ModelID:          c.Param("modelID"),
		SourceCode:       req.SourceCode,
		ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectModelResponse{}, projectError(err)
	}
	return projectModelResponse{Model: model}, nil
}
