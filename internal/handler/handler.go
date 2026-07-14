// Package handler provides HTTP handlers and route registration.
package handler

import (
	"github.com/fox-gonic/fox"

	"github.com/miclle/litecad/internal/service"
	"github.com/miclle/litecad/website"
)

// Ctrl is the controller that holds service dependencies and registers routes.
type Ctrl struct {
	service *service.Service
}

// New creates a new Ctrl instance.
func New(svc *service.Service) *Ctrl {
	return &Ctrl{
		service: svc,
	}
}

// RegisterRoutes registers all API routes on the given engine.
func (ctrl *Ctrl) RegisterRoutes(r *fox.Engine) {
	// embed website assets
	website.EmbedAssets(r)

	// ── Health check ────────────────────────────────────────────────────
	r.GET("/health", ctrl.Health)

	// ── API routes ──────────────────────────────────────────────────────
	api := r.Group("/api/v1")
	api.GET("/studio/status", ctrl.StudioStatus)
	api.POST("/auth/register", ctrl.Register)
	api.POST("/auth/login", ctrl.Login)
	api.GET("/auth/me", ctrl.Me)
	api.POST("/auth/logout", ctrl.Logout)
	api.GET("/projects", ctrl.ListProjects)
	api.POST("/projects", ctrl.CreateProject)
	api.GET("/projects/:projectID", ctrl.GetProject)
	api.PATCH("/projects/:projectID", ctrl.UpdateProject)
	api.DELETE("/projects/:projectID", ctrl.DeleteProject)
	api.GET("/projects/:projectID/thumbnail", ctrl.GetProjectThumbnailSnapshot)
	api.POST("/projects/:projectID/thumbnail", ctrl.SaveProjectThumbnailSnapshot)
	api.GET("/projects/:projectID/agent/conversations", ctrl.ListProjectAgentConversations)
	api.POST("/projects/:projectID/agent/conversations", ctrl.CreateProjectAgentConversation)
	api.GET("/projects/:projectID/agent/conversations/:conversationID/messages", ctrl.ListProjectAgentMessages)
	api.POST("/projects/:projectID/agent/conversations/:conversationID/messages", ctrl.SendProjectAgentMessage)
	api.POST("/projects/:projectID/agent/conversations/:conversationID/parametric-runs", ctrl.RunProjectAgentParametric)
	api.GET("/projects/:projectID/parametric-artifacts", ctrl.ListProjectParametricArtifacts)
	api.POST("/projects/:projectID/parametric-artifacts", ctrl.CreateProjectParametricArtifact)
	api.GET("/projects/:projectID/parametric-artifacts/:artifactID", ctrl.GetProjectParametricArtifact)
	api.PATCH("/projects/:projectID/parametric-artifacts/:artifactID", ctrl.UpdateProjectParametricArtifact)
	api.POST("/projects/:projectID/parametric-artifacts/:artifactID/save-model", ctrl.SaveProjectParametricArtifactModel)
	api.GET("/projects/:projectID/geometry", ctrl.GetProjectGeometryDocument)
	api.GET("/projects/:projectID/cad-document", ctrl.GetProjectCADDocument)
	api.GET("/projects/:projectID/cad-document/history", ctrl.ListProjectCADHistory)
	api.POST("/projects/:projectID/cad-document/history/undo", ctrl.UndoProjectCADDocument)
	api.POST("/projects/:projectID/cad-document/history/redo", ctrl.RedoProjectCADDocument)
	api.DELETE("/projects/:projectID/cad-document/nodes/:nodeID", ctrl.DeleteProjectCADNode)
	api.PATCH("/projects/:projectID/cad-document/nodes/:nodeID/transform", ctrl.UpdateProjectCADNodeTransform)
	api.PATCH("/projects/:projectID/cad-document/models/:modelID/transform", ctrl.UpdateProjectCADModelTransform)
	api.POST("/projects/:projectID/cad-document/models/:modelID/box-union", ctrl.AddProjectCADModelBoxUnion)
	api.GET("/projects/:projectID/models", ctrl.ListProjectModels)
	api.POST("/projects/:projectID/models", ctrl.UploadProjectModel)
	api.PATCH("/projects/:projectID/models/:modelID/parametric-parameters", ctrl.UpdateProjectParametricModelParameters)
	api.GET("/projects/:projectID/models/:modelID/revisions", ctrl.ListProjectModelRevisions)
	api.GET("/projects/:projectID/models/:modelID/revisions/:revisionID", ctrl.GetProjectModelRevision)
	api.GET("/projects/:projectID/models/:modelID/revisions/:revisionID/source", ctrl.GetProjectModelRevisionSource)
	api.POST("/projects/:projectID/models/:modelID/revisions/:revisionID/restore", ctrl.RestoreProjectModelRevision)
	api.GET("/projects/:projectID/models/:modelID/source", ctrl.GetProjectModelSource)
	api.GET("/projects/:projectID/models/:modelID/preview-artifact", ctrl.GetProjectModelPreviewArtifact)
	api.GET("/projects/:projectID/models/:modelID/preview", ctrl.GetProjectModelPreview)
}

// Health returns a simple health check response.
func (ctrl *Ctrl) Health(c *fox.Context) string {
	return "ok"
}

// StudioStatus returns the product initialization state for the LiteCAD studio.
func (ctrl *Ctrl) StudioStatus(c *fox.Context) any {
	return map[string]any{
		"name":    "litecad",
		"status":  "initializing",
		"summary": "AI-driven 3D design and preview workspace",
		"capabilities": []string{
			"Prompt-to-geometry design brief",
			"Browser-based 3D preview",
			"STEP-first import pipeline",
			"Single-binary deployment",
		},
	}
}
