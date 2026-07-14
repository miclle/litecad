package handler

import (
	"mime"
	"net/http"

	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
	"github.com/miclle/litecad/pkg/httperr"
)

type projectExportArtifactRequest struct {
	Filename          string   `json:"filename" binding:"required"`
	ContentType       string   `json:"content_type" binding:"required"`
	ExportKind        string   `json:"export_kind" binding:"required"`
	TargetCount       int      `json:"target_count" binding:"required,min=1"`
	SourceRevisionIDs []string `json:"source_revision_ids"`
	OccurrenceIDs     []string `json:"occurrence_ids"`
	StepText          string   `json:"step_text" binding:"required"`
}

type projectExportArtifactResponse struct {
	Artifact service.ProjectExportArtifact `json:"artifact"`
}

type projectExportArtifactsResponse struct {
	Artifacts []service.ProjectExportArtifact `json:"artifacts"`
}

// ListProjectExportArtifacts returns stored browser-generated export metadata.
func (ctrl *Ctrl) ListProjectExportArtifacts(c *fox.Context) (projectExportArtifactsResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectExportArtifactsResponse{}, err
	}
	artifacts, err := ctrl.service.ListProjectExportArtifacts(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectExportArtifactsResponse{}, projectError(err)
	}
	return projectExportArtifactsResponse{Artifacts: artifacts}, nil
}

// CreateProjectExportArtifact stores one browser-generated export artifact.
func (ctrl *Ctrl) CreateProjectExportArtifact(c *fox.Context, req *projectExportArtifactRequest) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}
	if c.Request.ContentLength > service.MaxProjectExportArtifactBytes {
		return httperr.NewRequestEntityTooLarge("export artifact is too large")
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.MaxProjectExportArtifactBytes+4096)
	artifact, err := ctrl.service.CreateProjectExportArtifact(c.Request.Context(), service.CreateProjectExportArtifactInput{
		OwnerUserID:       user.ID,
		ProjectID:         c.Param("projectID"),
		Filename:          req.Filename,
		ContentType:       req.ContentType,
		ExportKind:        req.ExportKind,
		TargetCount:       req.TargetCount,
		SourceRevisionIDs: req.SourceRevisionIDs,
		OccurrenceIDs:     req.OccurrenceIDs,
		Data:              []byte(req.StepText),
	})
	if err != nil {
		return projectError(err)
	}
	c.JSON(http.StatusCreated, projectExportArtifactResponse{Artifact: artifact})
	return nil
}

// DownloadProjectExportArtifact downloads a stored browser-generated export file.
func (ctrl *Ctrl) DownloadProjectExportArtifact(c *fox.Context) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}
	download, err := ctrl.service.GetProjectExportArtifactDownload(c.Request.Context(), user.ID, c.Param("projectID"), c.Param("artifactID"))
	if err != nil {
		return projectError(err)
	}
	c.Writer.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": download.Filename}))
	c.Data(http.StatusOK, download.ContentType, download.Data)
	return nil
}
