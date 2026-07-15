package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
)

const (
	ProjectInspectionRecordKindMeasurement = "measurement"
	ProjectInspectionRecordKindSection     = "section"
	maxProjectInspectionVisibleModelIDs    = 200
	maxProjectTopologyReferences           = 10000
	projectTopologySignaturePrefix         = "sha256:"
	projectTopologySignatureHexLength      = 64
	maxProjectTopologyReferenceIDRunes     = 512
)

var ErrInvalidProjectInspectionRecordInput = errors.New("invalid project inspection record input")

// ProjectInspectionVector is a persisted 3D vector in project units.
type ProjectInspectionVector struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// ProjectInspectionMeasurement stores either a preview-bounds snapshot or exact OCCT B-rep properties.
type ProjectInspectionMeasurement struct {
	Derivation string                      `json:"derivation"`
	ModelCount int                         `json:"model_count"`
	Center     ProjectInspectionVector     `json:"center"`
	Size       ProjectInspectionVector     `json:"size"`
	Diagonal   float64                     `json:"diagonal"`
	Topology   *ProjectTopologyMeasurement `json:"topology,omitempty"`
}

// ProjectTopologyReferenceScope pins topology identity to immutable occurrence inputs.
type ProjectTopologyReferenceScope struct {
	OccurrenceID        string `json:"occurrence_id"`
	ModelRevisionID     string `json:"model_revision_id"`
	OperationsSignature string `json:"operations_signature"`
}

// ProjectTopologyReference identifies one deterministic face or edge inside a scope.
type ProjectTopologyReference struct {
	ID      string  `json:"id"`
	Kind    string  `json:"kind"`
	Index   int     `json:"index"`
	Measure float64 `json:"measure"`
}

// ProjectTopologyProperties stores exact aggregate B-rep properties in project units.
type ProjectTopologyProperties struct {
	Volume       float64                 `json:"volume"`
	SurfaceArea  float64                 `json:"surface_area"`
	EdgeLength   float64                 `json:"edge_length"`
	CenterOfMass ProjectInspectionVector `json:"center_of_mass"`
	SolidCount   int                     `json:"solid_count"`
	FaceCount    int                     `json:"face_count"`
	EdgeCount    int                     `json:"edge_count"`
}

// ProjectTopologyMeasurementTarget stores one occurrence/revision-scoped exact result.
type ProjectTopologyMeasurementTarget struct {
	ReferenceScope ProjectTopologyReferenceScope `json:"reference_scope"`
	ProjectTopologyProperties
	References []ProjectTopologyReference `json:"references"`
}

// ProjectTopologyMeasurement stores exact B-rep results and their immutable provenance.
type ProjectTopologyMeasurement struct {
	TargetCount int                                `json:"target_count"`
	Totals      ProjectTopologyProperties          `json:"totals"`
	Targets     []ProjectTopologyMeasurementTarget `json:"targets"`
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
		if input.Measurement == nil || input.Section != nil || !isValidProjectInspectionMeasurement(*input.Measurement) {
			return false
		}
		if input.Measurement.Derivation == "occt-brep-properties" {
			if input.CADDocumentRevision <= 0 || len(input.VisibleModelIDs) != input.Measurement.Topology.TargetCount {
				return false
			}
			for index, target := range input.Measurement.Topology.Targets {
				if input.VisibleModelIDs[index] != target.ReferenceScope.OccurrenceID {
					return false
				}
			}
		}
		return true
	case ProjectInspectionRecordKindSection:
		return input.Section != nil && input.Measurement == nil && isValidProjectInspectionSection(*input.Section)
	default:
		return false
	}
}

func isValidProjectInspectionMeasurement(measurement ProjectInspectionMeasurement) bool {
	switch measurement.Derivation {
	case "preview-visible-aabb":
		return measurement.Topology == nil &&
			measurement.ModelCount > 0 &&
			isFiniteProjectInspectionVector(measurement.Center) &&
			isFiniteProjectInspectionVector(measurement.Size) &&
			isFiniteNumber(measurement.Diagonal) &&
			measurement.Size.X >= 0 &&
			measurement.Size.Y >= 0 &&
			measurement.Size.Z >= 0 &&
			measurement.Diagonal >= 0
	case "occt-brep-properties":
		return measurement.ModelCount == 0 && measurement.Center == (ProjectInspectionVector{}) &&
			measurement.Size == (ProjectInspectionVector{}) && measurement.Diagonal == 0 &&
			measurement.Topology != nil && isValidProjectTopologyMeasurement(*measurement.Topology)
	default:
		return false
	}
}

func isValidProjectTopologyMeasurement(measurement ProjectTopologyMeasurement) bool {
	if measurement.TargetCount <= 0 || measurement.TargetCount != len(measurement.Targets) || measurement.TargetCount > maxProjectInspectionVisibleModelIDs || !isValidProjectTopologyProperties(measurement.Totals) {
		return false
	}
	seenScopes := make(map[string]struct{}, len(measurement.Targets))
	seenOccurrences := make(map[string]struct{}, len(measurement.Targets))
	totalReferences := 0
	var aggregateVolume float64
	var aggregateSurfaceArea float64
	var aggregateEdgeLength float64
	var aggregateSolidCount int
	var aggregateFaceCount int
	var aggregateEdgeCount int
	for _, target := range measurement.Targets {
		if !isValidProjectTopologyProperties(target.ProjectTopologyProperties) || !isValidProjectTopologyReferenceScope(target.ReferenceScope) {
			return false
		}
		scopeKey := target.ReferenceScope.OccurrenceID + "\x00" + target.ReferenceScope.ModelRevisionID + "\x00" + target.ReferenceScope.OperationsSignature
		if _, exists := seenScopes[scopeKey]; exists {
			return false
		}
		seenScopes[scopeKey] = struct{}{}
		if _, exists := seenOccurrences[target.ReferenceScope.OccurrenceID]; exists {
			return false
		}
		seenOccurrences[target.ReferenceScope.OccurrenceID] = struct{}{}
		faceIndexes := make(map[int]struct{}, target.FaceCount)
		edgeIndexes := make(map[int]struct{}, target.EdgeCount)
		seenReferenceIDs := make(map[string]struct{}, len(target.References))
		var referencedSurfaceArea float64
		var referencedEdgeLength float64
		for _, reference := range target.References {
			if !isValidProjectTopologyReference(reference, target.ReferenceScope) {
				return false
			}
			if _, exists := seenReferenceIDs[reference.ID]; exists {
				return false
			}
			seenReferenceIDs[reference.ID] = struct{}{}
			indexes := edgeIndexes
			if reference.Kind == "face" {
				indexes = faceIndexes
				referencedSurfaceArea += reference.Measure
			} else {
				referencedEdgeLength += reference.Measure
			}
			if _, exists := indexes[reference.Index]; exists {
				return false
			}
			indexes[reference.Index] = struct{}{}
		}
		if len(faceIndexes) != target.FaceCount || len(edgeIndexes) != target.EdgeCount ||
			!nearlyEqualProjectTopologyMeasure(target.SurfaceArea, referencedSurfaceArea) ||
			!nearlyEqualProjectTopologyMeasure(target.EdgeLength, referencedEdgeLength) {
			return false
		}
		totalReferences += len(target.References)
		if totalReferences > maxProjectTopologyReferences {
			return false
		}
		aggregateVolume += target.Volume
		aggregateSurfaceArea += target.SurfaceArea
		aggregateEdgeLength += target.EdgeLength
		aggregateSolidCount += target.SolidCount
		aggregateFaceCount += target.FaceCount
		aggregateEdgeCount += target.EdgeCount
	}
	centerMeasure := func(properties ProjectTopologyProperties) float64 {
		if aggregateVolume > 0 {
			return properties.Volume
		}
		if aggregateSurfaceArea > 0 {
			return properties.SurfaceArea
		}
		return properties.EdgeLength
	}
	var aggregateCenterWeight float64
	var aggregateWeightedCenter ProjectInspectionVector
	for _, target := range measurement.Targets {
		centerWeight := centerMeasure(target.ProjectTopologyProperties)
		aggregateCenterWeight += centerWeight
		aggregateWeightedCenter.X += target.CenterOfMass.X * centerWeight
		aggregateWeightedCenter.Y += target.CenterOfMass.Y * centerWeight
		aggregateWeightedCenter.Z += target.CenterOfMass.Z * centerWeight
	}
	expectedCenter := ProjectInspectionVector{}
	if aggregateCenterWeight > 0 {
		expectedCenter = ProjectInspectionVector{
			X: aggregateWeightedCenter.X / aggregateCenterWeight,
			Y: aggregateWeightedCenter.Y / aggregateCenterWeight,
			Z: aggregateWeightedCenter.Z / aggregateCenterWeight,
		}
	}
	return nearlyEqualProjectTopologyMeasure(measurement.Totals.Volume, aggregateVolume) &&
		nearlyEqualProjectTopologyMeasure(measurement.Totals.SurfaceArea, aggregateSurfaceArea) &&
		nearlyEqualProjectTopologyMeasure(measurement.Totals.EdgeLength, aggregateEdgeLength) &&
		nearlyEqualProjectTopologyVector(measurement.Totals.CenterOfMass, expectedCenter) &&
		measurement.Totals.SolidCount == aggregateSolidCount &&
		measurement.Totals.FaceCount == aggregateFaceCount &&
		measurement.Totals.EdgeCount == aggregateEdgeCount
}

func nearlyEqualProjectTopologyVector(first, second ProjectInspectionVector) bool {
	return nearlyEqualProjectTopologyMeasure(first.X, second.X) &&
		nearlyEqualProjectTopologyMeasure(first.Y, second.Y) &&
		nearlyEqualProjectTopologyMeasure(first.Z, second.Z)
}

func nearlyEqualProjectTopologyMeasure(first, second float64) bool {
	scale := math.Max(1, math.Max(math.Abs(first), math.Abs(second)))
	return math.Abs(first-second) <= scale*1e-8
}

func isValidProjectTopologyProperties(properties ProjectTopologyProperties) bool {
	return isFiniteNumber(properties.Volume) && properties.Volume >= 0 &&
		isFiniteNumber(properties.SurfaceArea) && properties.SurfaceArea >= 0 &&
		isFiniteNumber(properties.EdgeLength) && properties.EdgeLength >= 0 &&
		isFiniteProjectInspectionVector(properties.CenterOfMass) &&
		properties.SolidCount >= 0 && properties.FaceCount >= 0 && properties.EdgeCount >= 0
}

func isValidProjectTopologyReferenceScope(scope ProjectTopologyReferenceScope) bool {
	return scope.OccurrenceID != "" && scope.OccurrenceID == strings.TrimSpace(scope.OccurrenceID) && utf8.RuneCountInString(scope.OccurrenceID) <= 64 &&
		scope.ModelRevisionID != "" && scope.ModelRevisionID == strings.TrimSpace(scope.ModelRevisionID) && utf8.RuneCountInString(scope.ModelRevisionID) <= 64 &&
		isValidProjectTopologyOperationsSignature(scope.OperationsSignature)
}

func isValidProjectTopologyOperationsSignature(signature string) bool {
	if len(signature) != len(projectTopologySignaturePrefix)+projectTopologySignatureHexLength || !strings.HasPrefix(signature, projectTopologySignaturePrefix) {
		return false
	}
	for _, value := range signature[len(projectTopologySignaturePrefix):] {
		if (value < '0' || value > '9') && (value < 'a' || value > 'f') {
			return false
		}
	}
	return true
}

func isValidProjectTopologyReference(reference ProjectTopologyReference, scope ProjectTopologyReferenceScope) bool {
	if (reference.Kind != "face" && reference.Kind != "edge") || reference.Index <= 0 || !isFiniteNumber(reference.Measure) || reference.Measure < 0 {
		return false
	}
	expectedID := fmt.Sprintf("topology:%s:%s:%s:%s:%d",
		encodeProjectTopologyReferenceComponent(scope.OccurrenceID),
		encodeProjectTopologyReferenceComponent(scope.ModelRevisionID),
		encodeProjectTopologyReferenceComponent(scope.OperationsSignature),
		reference.Kind,
		reference.Index,
	)
	return reference.ID == expectedID && utf8.RuneCountInString(reference.ID) <= maxProjectTopologyReferenceIDRunes
}

func encodeProjectTopologyReferenceComponent(value string) string {
	encoded := url.QueryEscape(value)
	encoded = strings.ReplaceAll(encoded, "+", "%20")
	return strings.NewReplacer("%21", "!", "%27", "'", "%28", "(", "%29", ")", "%2A", "*").Replace(encoded)
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
