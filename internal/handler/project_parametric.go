package handler

import (
	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
)

type projectParametricArtifactRequest struct {
	ConversationID  string         `json:"conversation_id"`
	MessageID       string         `json:"message_id"`
	Title           string         `json:"title" binding:"required"`
	SourceKind      string         `json:"source_kind" binding:"required"`
	SourceCode      string         `json:"source_code" binding:"required"`
	ParameterValues map[string]any `json:"parameter_values"`
	CompileStatus   string         `json:"compile_status"`
	CompileError    string         `json:"compile_error"`
	PreviewModelID  string         `json:"preview_model_id"`
}

type projectParametricArtifactResponse struct {
	Artifact service.ProjectParametricArtifact `json:"artifact"`
}

type projectParametricArtifactsResponse struct {
	Artifacts []service.ProjectParametricArtifact `json:"artifacts"`
}

// ListProjectParametricArtifacts returns generated parametric CAD source artifacts for a project.
func (ctrl *Ctrl) ListProjectParametricArtifacts(c *fox.Context) (projectParametricArtifactsResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectParametricArtifactsResponse{}, err
	}
	artifacts, err := ctrl.service.ListProjectParametricArtifacts(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectParametricArtifactsResponse{}, projectError(err)
	}
	return projectParametricArtifactsResponse{Artifacts: artifacts}, nil
}

// GetProjectParametricArtifact returns one generated parametric CAD source artifact.
func (ctrl *Ctrl) GetProjectParametricArtifact(c *fox.Context) (projectParametricArtifactResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectParametricArtifactResponse{}, err
	}
	artifact, err := ctrl.service.GetProjectParametricArtifact(c.Request.Context(), user.ID, c.Param("projectID"), c.Param("artifactID"))
	if err != nil {
		return projectParametricArtifactResponse{}, projectError(err)
	}
	return projectParametricArtifactResponse{Artifact: artifact}, nil
}

// CreateProjectParametricArtifact stores generated parametric CAD source for a project.
func (ctrl *Ctrl) CreateProjectParametricArtifact(c *fox.Context, req *projectParametricArtifactRequest) (projectParametricArtifactResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectParametricArtifactResponse{}, err
	}
	artifact, err := ctrl.service.CreateProjectParametricArtifact(c.Request.Context(), service.CreateProjectParametricArtifactInput{
		OwnerUserID:     user.ID,
		ProjectID:       c.Param("projectID"),
		ConversationID:  req.ConversationID,
		MessageID:       req.MessageID,
		Title:           req.Title,
		SourceKind:      req.SourceKind,
		SourceCode:      req.SourceCode,
		ParameterValues: req.ParameterValues,
		CompileStatus:   req.CompileStatus,
		CompileError:    req.CompileError,
		PreviewModelID:  req.PreviewModelID,
	})
	if err != nil {
		return projectParametricArtifactResponse{}, projectError(err)
	}
	return projectParametricArtifactResponse{Artifact: artifact}, nil
}

// UpdateProjectParametricArtifact replaces editable fields on generated parametric CAD source.
func (ctrl *Ctrl) UpdateProjectParametricArtifact(c *fox.Context, req *projectParametricArtifactRequest) (projectParametricArtifactResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectParametricArtifactResponse{}, err
	}
	artifact, err := ctrl.service.UpdateProjectParametricArtifact(c.Request.Context(), service.UpdateProjectParametricArtifactInput{
		OwnerUserID:     user.ID,
		ProjectID:       c.Param("projectID"),
		ArtifactID:      c.Param("artifactID"),
		Title:           req.Title,
		SourceKind:      req.SourceKind,
		SourceCode:      req.SourceCode,
		ParameterValues: req.ParameterValues,
		CompileStatus:   req.CompileStatus,
		CompileError:    req.CompileError,
		PreviewModelID:  req.PreviewModelID,
	})
	if err != nil {
		return projectParametricArtifactResponse{}, projectError(err)
	}
	return projectParametricArtifactResponse{Artifact: artifact}, nil
}

// SaveProjectParametricArtifactModel stores a generated artifact as a durable project model source.
func (ctrl *Ctrl) SaveProjectParametricArtifactModel(c *fox.Context) (projectModelResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectModelResponse{}, err
	}
	model, err := ctrl.service.SaveParametricArtifactAsProjectModel(c.Request.Context(), service.SaveParametricArtifactAsProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   c.Param("projectID"),
		ArtifactID:  c.Param("artifactID"),
	})
	if err != nil {
		return projectModelResponse{}, projectError(err)
	}
	return projectModelResponse{Model: model}, nil
}
