package service

import (
	"context"
	"errors"
	"testing"
)

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
			ModelCount: 2,
			Center:     ProjectInspectionVector{X: 3, Y: 4, Z: 5},
			Size:       ProjectInspectionVector{X: 10, Y: 20, Z: 30},
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
