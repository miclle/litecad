package handler

import (
	"context"
	"strconv"

	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
)

type projectCADDocumentResponse struct {
	Document service.ProjectCADDocument `json:"document"`
}

type updateProjectCADModelTransformRequest struct {
	Transform        service.CADTransform `json:"transform" binding:"required"`
	ExpectedRevision int                  `json:"expected_revision" binding:"required,min=1"`
}

type addProjectCADModelBoxUnionRequest struct {
	Box              service.CADBoxFeature `json:"box" binding:"required"`
	ExpectedRevision int                   `json:"expected_revision" binding:"required,min=1"`
}

type modifyProjectCADHistoryRequest struct {
	ExpectedRevision int `json:"expected_revision" binding:"required,min=1"`
}

type projectCADHistoryResponse struct {
	Entries            []service.CADHistoryEntrySummary `json:"entries"`
	NextBeforeSequence int64                            `json:"next_before_sequence,omitempty"`
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
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), ModelID: c.Param("modelID"),
		Transform: req.Transform, ExpectedRevision: req.ExpectedRevision,
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
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), NodeID: c.Param("nodeID"),
		Transform: req.Transform, ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// DeleteProjectCADNode removes a component node from the editable LiteCAD document.
func (ctrl *Ctrl) DeleteProjectCADNode(c *fox.Context, req *modifyProjectCADHistoryRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.DeleteProjectCADNode(c.Request.Context(), service.DeleteProjectCADNodeInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), NodeID: c.Param("nodeID"), ExpectedRevision: req.ExpectedRevision,
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
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), ModelID: c.Param("modelID"),
		Box: req.Box, ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// ListProjectCADHistory returns persisted edit summaries in newest-first order.
func (ctrl *Ctrl) ListProjectCADHistory(c *fox.Context) (projectCADHistoryResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADHistoryResponse{}, err
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	beforeSequence, _ := strconv.ParseInt(c.Query("before_sequence"), 10, 64)
	page, err := ctrl.service.ListProjectCADHistory(c.Request.Context(), user.ID, c.Param("projectID"), limit, beforeSequence)
	if err != nil {
		return projectCADHistoryResponse{}, projectError(err)
	}
	return projectCADHistoryResponse{Entries: page.Entries, NextBeforeSequence: page.NextBeforeSequence}, nil
}

// UndoProjectCADDocument applies the inverse of the current persisted edit.
func (ctrl *Ctrl) UndoProjectCADDocument(c *fox.Context, req *modifyProjectCADHistoryRequest) (projectCADDocumentResponse, error) {
	return ctrl.modifyProjectCADHistory(c, req, ctrl.service.UndoProjectCADDocument)
}

// RedoProjectCADDocument reapplies the next persisted edit.
func (ctrl *Ctrl) RedoProjectCADDocument(c *fox.Context, req *modifyProjectCADHistoryRequest) (projectCADDocumentResponse, error) {
	return ctrl.modifyProjectCADHistory(c, req, ctrl.service.RedoProjectCADDocument)
}

func (ctrl *Ctrl) modifyProjectCADHistory(
	c *fox.Context,
	req *modifyProjectCADHistoryRequest,
	modify func(context.Context, service.ModifyProjectCADHistoryInput) (service.ProjectCADDocument, error),
) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := modify(c.Request.Context(), service.ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}
