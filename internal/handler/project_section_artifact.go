package handler

import (
	"mime"
	"net/http"

	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
	"github.com/miclle/litecad/pkg/httperr"
)

type projectSectionArtifactRequest struct {
	CADDocumentRevision int                             `json:"cad_document_revision" binding:"required,min=1"`
	Unit                string                          `json:"unit" binding:"required"`
	Status              string                          `json:"status" binding:"required"`
	Filename            string                          `json:"filename" binding:"required"`
	ContentType         string                          `json:"content_type" binding:"required"`
	TargetCount         int                             `json:"target_count" binding:"required,min=1"`
	SourceRevisionIDs   []string                        `json:"source_revision_ids" binding:"required"`
	OccurrenceIDs       []string                        `json:"occurrence_ids" binding:"required"`
	AssociationID       string                          `json:"association_id"`
	ExpectedGeneration  int                             `json:"expected_generation"`
	PlaneOrigin         service.ProjectInspectionVector `json:"plane_origin" binding:"required"`
	PlaneNormal         service.ProjectInspectionVector `json:"plane_normal" binding:"required"`
	EdgeCount           int                             `json:"edge_count"`
	StepText            string                          `json:"step_text"`
}

type projectSectionArtifactResponse struct {
	Artifact service.ProjectSectionArtifact `json:"artifact"`
}

type projectSectionArtifactsResponse struct {
	Artifacts []service.ProjectSectionArtifact `json:"artifacts"`
}

// ListProjectSectionArtifacts returns browser-kernel section result metadata.
func (ctrl *Ctrl) ListProjectSectionArtifacts(c *fox.Context) (projectSectionArtifactsResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectSectionArtifactsResponse{}, err
	}
	artifacts, err := ctrl.service.ListProjectSectionArtifacts(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectSectionArtifactsResponse{}, projectError(err)
	}
	return projectSectionArtifactsResponse{Artifacts: artifacts}, nil
}

// CreateProjectSectionArtifact stores one browser-kernel section result.
func (ctrl *Ctrl) CreateProjectSectionArtifact(c *fox.Context, req *projectSectionArtifactRequest) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}
	if c.Request.ContentLength > service.MaxProjectSectionArtifactBytes {
		return httperr.NewRequestEntityTooLarge("section artifact is too large")
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.MaxProjectSectionArtifactBytes+4096)
	artifact, err := ctrl.service.CreateProjectSectionArtifact(c.Request.Context(), service.CreateProjectSectionArtifactInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), CADDocumentRevision: req.CADDocumentRevision,
		Unit: req.Unit, Status: req.Status, Filename: req.Filename, ContentType: req.ContentType,
		TargetCount: req.TargetCount, SourceRevisionIDs: req.SourceRevisionIDs, OccurrenceIDs: req.OccurrenceIDs,
		AssociationID: req.AssociationID, ExpectedGeneration: req.ExpectedGeneration,
		PlaneOrigin: req.PlaneOrigin, PlaneNormal: req.PlaneNormal, EdgeCount: req.EdgeCount, Data: []byte(req.StepText),
	})
	if err != nil {
		return projectError(err)
	}
	c.JSON(http.StatusCreated, projectSectionArtifactResponse{Artifact: artifact})
	return nil
}

// DownloadProjectSectionArtifact downloads one persisted section STEP file.
func (ctrl *Ctrl) DownloadProjectSectionArtifact(c *fox.Context) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}
	download, err := ctrl.service.GetProjectSectionArtifactDownload(c.Request.Context(), user.ID, c.Param("projectID"), c.Param("artifactID"))
	if err != nil {
		return projectError(err)
	}
	c.Writer.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": download.Filename}))
	c.Data(http.StatusOK, download.ContentType, download.Data)
	return nil
}

// DeleteProjectSectionArtifact removes one persisted section result.
func (ctrl *Ctrl) DeleteProjectSectionArtifact(c *fox.Context) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}
	if err := ctrl.service.DeleteProjectSectionArtifact(c.Request.Context(), user.ID, c.Param("projectID"), c.Param("artifactID")); err != nil {
		return projectError(err)
	}
	c.Status(http.StatusNoContent)
	return nil
}
