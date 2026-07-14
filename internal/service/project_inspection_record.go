package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"unicode/utf8"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
)

const (
	ProjectInspectionRecordKindMeasurement = "measurement"
	ProjectInspectionRecordKindSection     = "section"
	maxProjectInspectionVisibleModelIDs    = 200
)

var ErrInvalidProjectInspectionRecordInput = errors.New("invalid project inspection record input")

// ProjectInspectionVector is a persisted 3D vector in project units.
type ProjectInspectionVector struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// ProjectInspectionMeasurement stores a visible-bounds measurement snapshot.
type ProjectInspectionMeasurement struct {
	ModelCount int                     `json:"model_count"`
	Center     ProjectInspectionVector `json:"center"`
	Size       ProjectInspectionVector `json:"size"`
}

// ProjectInspectionSection stores a clipping-plane definition, not section geometry.
type ProjectInspectionSection struct {
	Mode          string                  `json:"mode"`
	PlaneNormal   ProjectInspectionVector `json:"plane_normal"`
	PlaneConstant float64                 `json:"plane_constant"`
}

// CreateProjectInspectionRecordInput stores one viewer inspection record.
type CreateProjectInspectionRecordInput struct {
	OwnerUserID         string
	ProjectID           string
	Kind                string
	Name                string
	CADDocumentRevision int
	Unit                string
	VisibleModelIDs     []string
	Measurement         *ProjectInspectionMeasurement
	Section             *ProjectInspectionSection
}

// ProjectInspectionRecord is the public record shape.
type ProjectInspectionRecord struct {
	ID                  string                        `json:"id"`
	ProjectID           string                        `json:"project_id"`
	Kind                string                        `json:"kind"`
	Name                string                        `json:"name"`
	CADDocumentRevision int                           `json:"cad_document_revision"`
	Unit                string                        `json:"unit"`
	VisibleModelIDs     []string                      `json:"visible_model_ids"`
	Measurement         *ProjectInspectionMeasurement `json:"measurement,omitempty"`
	Section             *ProjectInspectionSection     `json:"section,omitempty"`
	CreatedAt           string                        `json:"created_at"`
	UpdatedAt           string                        `json:"updated_at"`
}

// CreateProjectInspectionRecord stores a durable viewer inspection record.
func (s *Service) CreateProjectInspectionRecord(ctx context.Context, input CreateProjectInspectionRecordInput) (ProjectInspectionRecord, error) {
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectInspectionRecord{}, err
	}
	normalized := normalizeProjectInspectionRecordInput(input)
	if !isValidProjectInspectionRecordInput(normalized) {
		return ProjectInspectionRecord{}, ErrInvalidProjectInspectionRecordInput
	}
	visibleModelIDs, err := marshalProjectInspectionStringSlice(normalized.VisibleModelIDs)
	if err != nil {
		return ProjectInspectionRecord{}, err
	}
	measurement, err := marshalProjectInspectionValue(normalized.Measurement)
	if err != nil {
		return ProjectInspectionRecord{}, err
	}
	section, err := marshalProjectInspectionValue(normalized.Section)
	if err != nil {
		return ProjectInspectionRecord{}, err
	}
	recordID, err := id.NewPrefixed("pir")
	if err != nil {
		return ProjectInspectionRecord{}, err
	}
	record := entity.ProjectInspectionRecord{
		ID:                  recordID,
		ProjectID:           project.ID,
		Kind:                normalized.Kind,
		Name:                normalized.Name,
		CADDocumentRevision: normalized.CADDocumentRevision,
		Unit:                normalized.Unit,
		VisibleModelIDsJSON: visibleModelIDs,
		MeasurementJSON:     measurement,
		SectionJSON:         section,
	}
	if err := s.db.WithContext(ctx).Create(&record).Error; err != nil {
		return ProjectInspectionRecord{}, fmt.Errorf("create project inspection record: %w", err)
	}
	return publicProjectInspectionRecord(record), nil
}

// ListProjectInspectionRecords returns newest-first inspection records for an owned project.
func (s *Service) ListProjectInspectionRecords(ctx context.Context, ownerUserID, projectID string) ([]ProjectInspectionRecord, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return nil, err
	}
	var records []entity.ProjectInspectionRecord
	if err := s.db.WithContext(ctx).
		Where("project_id = ?", project.ID).
		Order("created_at DESC").
		Find(&records).Error; err != nil {
		return nil, fmt.Errorf("list project inspection records: %w", err)
	}
	result := make([]ProjectInspectionRecord, 0, len(records))
	for _, record := range records {
		result = append(result, publicProjectInspectionRecord(record))
	}
	return result, nil
}

// DeleteProjectInspectionRecord soft-deletes one inspection record for an owned project.
func (s *Service) DeleteProjectInspectionRecord(ctx context.Context, ownerUserID, projectID, recordID string) error {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return err
	}
	recordID = strings.TrimSpace(recordID)
	if recordID == "" {
		return ErrProjectNotFound
	}
	result := s.db.WithContext(ctx).Where("id = ? AND project_id = ?", recordID, project.ID).Delete(&entity.ProjectInspectionRecord{})
	if result.Error != nil {
		return fmt.Errorf("delete project inspection record: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrProjectNotFound
	}
	return nil
}

func normalizeProjectInspectionRecordInput(input CreateProjectInspectionRecordInput) CreateProjectInspectionRecordInput {
	input.Kind = strings.TrimSpace(input.Kind)
	input.Name = strings.TrimSpace(input.Name)
	input.Unit = strings.TrimSpace(input.Unit)
	if input.Name == "" {
		switch input.Kind {
		case ProjectInspectionRecordKindMeasurement:
			input.Name = "Visible bounds"
		case ProjectInspectionRecordKindSection:
			input.Name = "Center section"
		}
	}
	if input.Unit == "" {
		input.Unit = "unit"
	}
	return input
}

func isValidProjectInspectionRecordInput(input CreateProjectInspectionRecordInput) bool {
	if input.ProjectID == "" || input.Name == "" || utf8.RuneCountInString(input.Name) > 160 || utf8.RuneCountInString(input.Unit) > 32 {
		return false
	}
	if len(input.VisibleModelIDs) > maxProjectInspectionVisibleModelIDs {
		return false
	}
	for _, value := range input.VisibleModelIDs {
		if strings.TrimSpace(value) == "" || utf8.RuneCountInString(value) > 64 {
			return false
		}
	}
	switch input.Kind {
	case ProjectInspectionRecordKindMeasurement:
		return input.Measurement != nil && input.Section == nil && isValidProjectInspectionMeasurement(*input.Measurement)
	case ProjectInspectionRecordKindSection:
		return input.Section != nil && input.Measurement == nil && isValidProjectInspectionSection(*input.Section)
	default:
		return false
	}
}

func isValidProjectInspectionMeasurement(measurement ProjectInspectionMeasurement) bool {
	return measurement.ModelCount > 0 &&
		isFiniteProjectInspectionVector(measurement.Center) &&
		isFiniteProjectInspectionVector(measurement.Size) &&
		measurement.Size.X >= 0 &&
		measurement.Size.Y >= 0 &&
		measurement.Size.Z >= 0
}

func isValidProjectInspectionSection(section ProjectInspectionSection) bool {
	return section.Mode == "center-plane" &&
		isFiniteProjectInspectionVector(section.PlaneNormal) &&
		isFiniteNumber(section.PlaneConstant) &&
		(section.PlaneNormal.X != 0 || section.PlaneNormal.Y != 0 || section.PlaneNormal.Z != 0)
}

func isFiniteProjectInspectionVector(vector ProjectInspectionVector) bool {
	return isFiniteNumber(vector.X) && isFiniteNumber(vector.Y) && isFiniteNumber(vector.Z)
}

func isFiniteNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func marshalProjectInspectionStringSlice(values []string) ([]byte, error) {
	copied := make([]string, 0, len(values))
	for _, value := range values {
		copied = append(copied, strings.TrimSpace(value))
	}
	data, err := json.Marshal(copied)
	if err != nil {
		return nil, fmt.Errorf("marshal project inspection ids: %w", err)
	}
	return data, nil
}

func marshalProjectInspectionValue(value any) ([]byte, error) {
	if value == nil {
		return nil, nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("marshal project inspection value: %w", err)
	}
	return data, nil
}

func publicProjectInspectionRecord(record entity.ProjectInspectionRecord) ProjectInspectionRecord {
	return ProjectInspectionRecord{
		ID:                  record.ID,
		ProjectID:           record.ProjectID,
		Kind:                record.Kind,
		Name:                record.Name,
		CADDocumentRevision: record.CADDocumentRevision,
		Unit:                record.Unit,
		VisibleModelIDs:     unmarshalProjectInspectionStringSlice(record.VisibleModelIDsJSON),
		Measurement:         unmarshalProjectInspectionMeasurement(record.MeasurementJSON),
		Section:             unmarshalProjectInspectionSection(record.SectionJSON),
		CreatedAt:           record.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:           record.UpdatedAt.Format(timeFormatRFC3339),
	}
}

func unmarshalProjectInspectionStringSlice(data []byte) []string {
	var values []string
	if len(data) == 0 {
		return []string{}
	}
	if err := json.Unmarshal(data, &values); err != nil {
		return []string{}
	}
	return values
}

func unmarshalProjectInspectionMeasurement(data []byte) *ProjectInspectionMeasurement {
	var value ProjectInspectionMeasurement
	if len(data) == 0 || bytes.Equal(bytes.TrimSpace(data), []byte("null")) || json.Unmarshal(data, &value) != nil {
		return nil
	}
	return &value
}

func unmarshalProjectInspectionSection(data []byte) *ProjectInspectionSection {
	var value ProjectInspectionSection
	if len(data) == 0 || bytes.Equal(bytes.TrimSpace(data), []byte("null")) || json.Unmarshal(data, &value) != nil {
		return nil
	}
	return &value
}
