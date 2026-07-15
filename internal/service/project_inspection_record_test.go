package service

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

const testProjectTopologyOperationsSignature = "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"

func TestProjectInspectionRecordLifecycle(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForInspectionRecord(t, svc, "inspection-owner@example.com")

	measurement, err := svc.CreateProjectInspectionRecord(ctx, CreateProjectInspectionRecordInput{
		OwnerUserID:         user.ID,
		ProjectID:           project.ID,
		Kind:                ProjectInspectionRecordKindMeasurement,
		Name:                "Visible bounds",
		CADDocumentRevision: 7,
		Unit:                "millimetre",
		VisibleModelIDs:     []string{"mdl_a", "mdl_b"},
		Measurement: &ProjectInspectionMeasurement{
			Derivation: "preview-visible-aabb",
			ModelCount: 2,
			Center:     ProjectInspectionVector{X: 3, Y: 4, Z: 5},
			Size:       ProjectInspectionVector{X: 10, Y: 20, Z: 30},
			Diagonal:   37.416573867739416,
		},
	})
	if err != nil {
		t.Fatalf("CreateProjectInspectionRecord measurement returned error: %v", err)
	}
	section, err := svc.CreateProjectInspectionRecord(ctx, CreateProjectInspectionRecordInput{
		OwnerUserID:         user.ID,
		ProjectID:           project.ID,
		Kind:                ProjectInspectionRecordKindSection,
		Name:                "Center X section",
		CADDocumentRevision: 7,
		Unit:                "millimetre",
		VisibleModelIDs:     []string{"mdl_a"},
		Section: &ProjectInspectionSection{
			Mode:          "center-plane",
			PlaneNormal:   ProjectInspectionVector{X: -1, Y: 0, Z: 0},
			PlaneConstant: 3,
		},
	})
	if err != nil {
		t.Fatalf("CreateProjectInspectionRecord section returned error: %v", err)
	}
	if measurement.ID == "" || section.ID == "" || measurement.ID == section.ID {
		t.Fatalf("record ids measurement=%q section=%q", measurement.ID, section.ID)
	}
	if measurement.Measurement == nil || measurement.Measurement.Size.Z != 30 || measurement.Section != nil {
		t.Fatalf("measurement record = %+v", measurement)
	}
	if section.Section == nil || section.Section.PlaneNormal.X != -1 || section.Measurement != nil {
		t.Fatalf("section record = %+v", section)
	}

	records, err := svc.ListProjectInspectionRecords(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectInspectionRecords returned error: %v", err)
	}
	if len(records) != 2 || records[0].ID != section.ID || records[1].ID != measurement.ID {
		t.Fatalf("record order = %+v", records)
	}

	if err := svc.DeleteProjectInspectionRecord(ctx, user.ID, project.ID, measurement.ID); err != nil {
		t.Fatalf("DeleteProjectInspectionRecord returned error: %v", err)
	}
	records, err = svc.ListProjectInspectionRecords(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectInspectionRecords after delete returned error: %v", err)
	}
	if len(records) != 1 || records[0].ID != section.ID {
		t.Fatalf("records after delete = %+v", records)
	}
}

func TestProjectInspectionRecordValidationAndOwnership(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	owner, project := createTestProjectForInspectionRecord(t, svc, "inspection-validation-owner@example.com")
	other, err := svc.RegisterUser(ctx, RegisterUserInput{Name: "Other", Email: "inspection-validation-other@example.com", Password: "correct-horse-battery"})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}

	_, err = svc.CreateProjectInspectionRecord(ctx, CreateProjectInspectionRecordInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		Kind:        ProjectInspectionRecordKindMeasurement,
		Name:        "Missing measurement",
	})
	if !errors.Is(err, ErrInvalidProjectInspectionRecordInput) {
		t.Fatalf("missing measurement error = %v, want ErrInvalidProjectInspectionRecordInput", err)
	}

	_, err = svc.CreateProjectInspectionRecord(ctx, CreateProjectInspectionRecordInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		Kind:        ProjectInspectionRecordKindSection,
		Name:        "Bad section",
		Section:     &ProjectInspectionSection{Mode: "center-plane", PlaneNormal: ProjectInspectionVector{X: 0, Y: 0, Z: 0}},
	})
	if !errors.Is(err, ErrInvalidProjectInspectionRecordInput) {
		t.Fatalf("invalid section error = %v, want ErrInvalidProjectInspectionRecordInput", err)
	}

	record, err := svc.CreateProjectInspectionRecord(ctx, CreateProjectInspectionRecordInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		Kind:        ProjectInspectionRecordKindSection,
		Name:        "Owned section",
		Section:     &ProjectInspectionSection{Mode: "center-plane", PlaneNormal: ProjectInspectionVector{X: -1, Y: 0, Z: 0}},
	})
	if err != nil {
		t.Fatalf("CreateProjectInspectionRecord owner returned error: %v", err)
	}
	if _, err := svc.ListProjectInspectionRecords(ctx, other.ID, project.ID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("other list error = %v, want ErrProjectNotFound", err)
	}
	if err := svc.DeleteProjectInspectionRecord(ctx, other.ID, project.ID, record.ID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("other delete error = %v, want ErrProjectNotFound", err)
	}
}

func TestProjectInspectionRecordPersistsTopologyMeasurement(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForInspectionRecord(t, svc, "inspection-topology@example.com")
	measurement := validProjectTopologyMeasurement()

	record, err := svc.CreateProjectInspectionRecord(ctx, CreateProjectInspectionRecordInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Kind: ProjectInspectionRecordKindMeasurement,
		Name: "Exact B-rep properties", CADDocumentRevision: 9, Unit: "millimetre",
		VisibleModelIDs: []string{"occ_box"}, Measurement: &measurement,
	})
	if err != nil {
		t.Fatalf("CreateProjectInspectionRecord topology returned error: %v", err)
	}
	if record.Measurement == nil || record.Measurement.Topology == nil || record.Measurement.Topology.Totals.Volume != 6000 {
		t.Fatalf("topology record = %+v", record)
	}
	if got := record.Measurement.Topology.Targets[0].References[0].ID; got != testProjectTopologyReferenceID("face", 1) {
		t.Fatalf("reference id = %q", got)
	}

	invalid := validProjectTopologyMeasurement()
	invalid.Topology.Targets[0].ReferenceScope.OperationsSignature = ""
	if _, err := svc.CreateProjectInspectionRecord(ctx, CreateProjectInspectionRecordInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Kind: ProjectInspectionRecordKindMeasurement,
		Name: "Invalid topology", Measurement: &invalid,
	}); !errors.Is(err, ErrInvalidProjectInspectionRecordInput) {
		t.Fatalf("missing operations signature error = %v, want ErrInvalidProjectInspectionRecordInput", err)
	}

	invalid = validProjectTopologyMeasurement()
	invalid.Topology.Targets[0].References[0].Kind = "vertex"
	if _, err := svc.CreateProjectInspectionRecord(ctx, CreateProjectInspectionRecordInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Kind: ProjectInspectionRecordKindMeasurement,
		Name: "Invalid topology", CADDocumentRevision: 9, VisibleModelIDs: []string{"occ_box"}, Measurement: &invalid,
	}); !errors.Is(err, ErrInvalidProjectInspectionRecordInput) {
		t.Fatalf("invalid reference kind error = %v, want ErrInvalidProjectInspectionRecordInput", err)
	}

	invalid = validProjectTopologyMeasurement()
	invalid.Topology.Targets[0].References[0].ID = "topology:unscoped:face:1"
	if _, err := svc.CreateProjectInspectionRecord(ctx, CreateProjectInspectionRecordInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Kind: ProjectInspectionRecordKindMeasurement,
		Name: "Invalid topology", CADDocumentRevision: 9, VisibleModelIDs: []string{"occ_box"}, Measurement: &invalid,
	}); !errors.Is(err, ErrInvalidProjectInspectionRecordInput) {
		t.Fatalf("unscoped reference id error = %v, want ErrInvalidProjectInspectionRecordInput", err)
	}

	tests := []struct {
		name     string
		revision int
		visible  []string
		mutate   func(*ProjectInspectionMeasurement)
	}{
		{name: "missing document revision", visible: []string{"occ_box"}},
		{name: "mismatched visible occurrence", revision: 9, visible: []string{"occ_other"}},
		{name: "mismatched aggregate counts", revision: 9, visible: []string{"occ_box"}, mutate: func(value *ProjectInspectionMeasurement) {
			value.Topology.Totals.FaceCount++
		}},
		{name: "mismatched aggregate measures", revision: 9, visible: []string{"occ_box"}, mutate: func(value *ProjectInspectionMeasurement) {
			value.Topology.Totals.Volume++
		}},
		{name: "mismatched aggregate center", revision: 9, visible: []string{"occ_box"}, mutate: func(value *ProjectInspectionMeasurement) {
			value.Topology.Totals.CenterOfMass.X++
		}},
		{name: "mismatched reference measure", revision: 9, visible: []string{"occ_box"}, mutate: func(value *ProjectInspectionMeasurement) {
			value.Topology.Targets[0].References[0].Measure++
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			invalid := validProjectTopologyMeasurement()
			if test.mutate != nil {
				test.mutate(&invalid)
			}
			if _, err := svc.CreateProjectInspectionRecord(ctx, CreateProjectInspectionRecordInput{
				OwnerUserID: user.ID, ProjectID: project.ID, Kind: ProjectInspectionRecordKindMeasurement,
				Name: "Invalid topology", CADDocumentRevision: test.revision, VisibleModelIDs: test.visible, Measurement: &invalid,
			}); !errors.Is(err, ErrInvalidProjectInspectionRecordInput) {
				t.Fatalf("error = %v, want ErrInvalidProjectInspectionRecordInput", err)
			}
		})
	}
}

func validProjectTopologyMeasurement() ProjectInspectionMeasurement {
	properties := ProjectTopologyProperties{
		Volume: 6000, SurfaceArea: 2200, EdgeLength: 240,
		CenterOfMass: ProjectInspectionVector{X: 5, Y: 10, Z: 15}, SolidCount: 1, FaceCount: 6, EdgeCount: 12,
	}
	references := make([]ProjectTopologyReference, 0, 18)
	faceAreas := []float64{200, 200, 600, 600, 300, 300}
	for index, area := range faceAreas {
		references = append(references, ProjectTopologyReference{ID: testProjectTopologyReferenceID("face", index+1), Kind: "face", Index: index + 1, Measure: area})
	}
	edgeLengths := []float64{10, 10, 10, 10, 20, 20, 20, 20, 30, 30, 30, 30}
	for index, length := range edgeLengths {
		references = append(references, ProjectTopologyReference{ID: testProjectTopologyReferenceID("edge", index+1), Kind: "edge", Index: index + 1, Measure: length})
	}
	return ProjectInspectionMeasurement{
		Derivation: "occt-brep-properties",
		Topology: &ProjectTopologyMeasurement{
			TargetCount: 1,
			Totals:      properties,
			Targets: []ProjectTopologyMeasurementTarget{{
				ReferenceScope:            ProjectTopologyReferenceScope{OccurrenceID: "occ_box", ModelRevisionID: "pmr_box_1", OperationsSignature: testProjectTopologyOperationsSignature},
				ProjectTopologyProperties: properties,
				References:                references,
			}},
		},
	}
}

func testProjectTopologyReferenceID(kind string, index int) string {
	return fmt.Sprintf("topology:occ_box:pmr_box_1:sha256%%3A4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945:%s:%d", kind, index)
}

func createTestProjectForInspectionRecord(t *testing.T, svc *Service, email string) (AuthUser, Project) {
	t.Helper()
	ctx := context.Background()
	user, err := svc.RegisterUser(ctx, RegisterUserInput{Name: "Inspection Owner", Email: email, Password: "correct-horse-battery"})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Inspection records"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	return user, project
}
