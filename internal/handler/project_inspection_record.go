package handler

import (
	"net/http"

	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
)

type projectInspectionRecordRequest struct {
	Kind                string                                `json:"kind" binding:"required"`
	Name                string                                `json:"name"`
	CADDocumentRevision int                                   `json:"cad_document_revision"`
	Unit                string                                `json:"unit"`
	VisibleModelIDs     []string                              `json:"visible_model_ids"`
	Measurement         *service.ProjectInspectionMeasurement `json:"measurement"`
	Section             *service.ProjectInspectionSection     `json:"section"`
}

type projectInspectionRecordResponse struct {
	Record service.ProjectInspectionRecord `json:"record"`
}

type projectInspectionRecordsResponse struct {
	Records []service.ProjectInspectionRecord `json:"records"`
}

// ListProjectInspectionRecords returns durable viewer inspection records.
func (ctrl *Ctrl) ListProjectInspectionRecords(c *fox.Context) (projectInspectionRecordsResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectInspectionRecordsResponse{}, err
	}
	records, err := ctrl.service.ListProjectInspectionRecords(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectInspectionRecordsResponse{}, projectError(err)
	}
	return projectInspectionRecordsResponse{Records: records}, nil
}

// CreateProjectInspectionRecord stores one durable viewer inspection record.
func (ctrl *Ctrl) CreateProjectInspectionRecord(c *fox.Context, req *projectInspectionRecordRequest) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}
	record, err := ctrl.service.CreateProjectInspectionRecord(c.Request.Context(), service.CreateProjectInspectionRecordInput{
		OwnerUserID:         user.ID,
		ProjectID:           c.Param("projectID"),
		Kind:                req.Kind,
		Name:                req.Name,
		CADDocumentRevision: req.CADDocumentRevision,
		Unit:                req.Unit,
		VisibleModelIDs:     req.VisibleModelIDs,
		Measurement:         req.Measurement,
		Section:             req.Section,
	})
	if err != nil {
		return projectError(err)
	}
	c.JSON(http.StatusCreated, projectInspectionRecordResponse{Record: record})
	return nil
}

// DeleteProjectInspectionRecord removes one durable viewer inspection record.
func (ctrl *Ctrl) DeleteProjectInspectionRecord(c *fox.Context) error {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return err
	}
	if err := ctrl.service.DeleteProjectInspectionRecord(c.Request.Context(), user.ID, c.Param("projectID"), c.Param("recordID")); err != nil {
		return projectError(err)
	}
	c.Status(http.StatusNoContent)
	return nil
}
