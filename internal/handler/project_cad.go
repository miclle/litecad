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

type updateProjectCADOccurrenceRequest struct {
	Name             *string               `json:"name"`
	Suppressed       *bool                 `json:"suppressed"`
	Transform        *service.CADTransform `json:"transform"`
	ParentGroupID    *string               `json:"parent_group_id"`
	ExpectedRevision int                   `json:"expected_revision" binding:"required,min=1"`
}

type createProjectCADAssemblyGroupRequest struct {
	Name             string `json:"name" binding:"required"`
	ParentGroupID    string `json:"parent_group_id"`
	ExpectedRevision int    `json:"expected_revision" binding:"required,min=1"`
}

type updateProjectCADAssemblyGroupRequest struct {
	Name             *string `json:"name"`
	ParentGroupID    *string `json:"parent_group_id"`
	Suppressed       *bool   `json:"suppressed"`
	ExpectedRevision int     `json:"expected_revision" binding:"required,min=1"`
}

type createProjectCADAssemblyConstraintRequest struct {
	Name               string     `json:"name" binding:"required"`
	Kind               string     `json:"kind" binding:"required"`
	FirstOccurrenceID  string     `json:"first_occurrence_id" binding:"required"`
	SecondOccurrenceID string     `json:"second_occurrence_id" binding:"required"`
	FirstAnchor        [3]float64 `json:"first_anchor"`
	SecondAnchor       [3]float64 `json:"second_anchor"`
	Offset             [3]float64 `json:"offset"`
	ExpectedRevision   int        `json:"expected_revision" binding:"required,min=1"`
}

type moveProjectCADOccurrenceRequest struct {
	TargetIndex      int `json:"target_index" binding:"min=0"`
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

// DuplicateProjectCADOccurrence creates another flat assembly instance of the same source model revision.
func (ctrl *Ctrl) DuplicateProjectCADOccurrence(c *fox.Context, req *modifyProjectCADHistoryRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.DuplicateProjectCADOccurrence(c.Request.Context(), service.DuplicateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), OccurrenceID: c.Param("occurrenceID"), ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// UpdateProjectCADOccurrence updates instance-owned name, suppression, or placement values.
func (ctrl *Ctrl) UpdateProjectCADOccurrence(c *fox.Context, req *updateProjectCADOccurrenceRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.UpdateProjectCADOccurrence(c.Request.Context(), service.UpdateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), OccurrenceID: c.Param("occurrenceID"),
		Name: req.Name, Suppressed: req.Suppressed, Transform: req.Transform, ParentGroupID: req.ParentGroupID,
		ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// CreateProjectCADAssemblyGroup adds an organizational node to the assembly tree.
func (ctrl *Ctrl) CreateProjectCADAssemblyGroup(c *fox.Context, req *createProjectCADAssemblyGroupRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.CreateProjectCADAssemblyGroup(c.Request.Context(), service.CreateProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), Name: req.Name,
		ParentGroupID: req.ParentGroupID, ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// UpdateProjectCADAssemblyGroup updates group naming, nesting, or suppression.
func (ctrl *Ctrl) UpdateProjectCADAssemblyGroup(c *fox.Context, req *updateProjectCADAssemblyGroupRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.UpdateProjectCADAssemblyGroup(c.Request.Context(), service.UpdateProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), GroupID: c.Param("groupID"), Name: req.Name,
		ParentGroupID: req.ParentGroupID, Suppressed: req.Suppressed, ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// DeleteProjectCADAssemblyGroup removes an empty assembly group.
func (ctrl *Ctrl) DeleteProjectCADAssemblyGroup(c *fox.Context, req *modifyProjectCADHistoryRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.DeleteProjectCADAssemblyGroup(c.Request.Context(), service.DeleteProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), GroupID: c.Param("groupID"), ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// CreateProjectCADAssemblyConstraint records an unresolved mate relationship.
func (ctrl *Ctrl) CreateProjectCADAssemblyConstraint(c *fox.Context, req *createProjectCADAssemblyConstraintRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.CreateProjectCADAssemblyConstraint(c.Request.Context(), service.CreateProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), Name: req.Name, Kind: req.Kind,
		FirstOccurrenceID: req.FirstOccurrenceID, SecondOccurrenceID: req.SecondOccurrenceID,
		FirstAnchor: req.FirstAnchor, SecondAnchor: req.SecondAnchor, Offset: req.Offset, ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// DeleteProjectCADAssemblyConstraint removes a recorded unresolved relationship.
func (ctrl *Ctrl) DeleteProjectCADAssemblyConstraint(c *fox.Context, req *modifyProjectCADHistoryRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.DeleteProjectCADAssemblyConstraint(c.Request.Context(), service.DeleteProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), ConstraintID: c.Param("constraintID"), ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// MoveProjectCADOccurrence changes one flat occurrence's assembly order.
func (ctrl *Ctrl) MoveProjectCADOccurrence(c *fox.Context, req *moveProjectCADOccurrenceRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.MoveProjectCADOccurrence(c.Request.Context(), service.MoveProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), OccurrenceID: c.Param("occurrenceID"),
		TargetIndex: req.TargetIndex, ExpectedRevision: req.ExpectedRevision,
	})
	if err != nil {
		return projectCADDocumentResponse{}, projectError(err)
	}
	return projectCADDocumentResponse{Document: document}, nil
}

// DeleteProjectCADOccurrence removes one assembly instance without deleting its source definition.
func (ctrl *Ctrl) DeleteProjectCADOccurrence(c *fox.Context, req *modifyProjectCADHistoryRequest) (projectCADDocumentResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectCADDocumentResponse{}, err
	}
	document, err := ctrl.service.DeleteProjectCADOccurrence(c.Request.Context(), service.DeleteProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), OccurrenceID: c.Param("occurrenceID"), ExpectedRevision: req.ExpectedRevision,
	})
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
