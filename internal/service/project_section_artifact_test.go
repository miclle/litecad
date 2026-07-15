package service

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/miclle/litecad/internal/entity"
)

func TestProjectSectionArtifactLifecycle(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForSectionArtifact(t, svc, "section-owner@example.com")

	ready, err := svc.CreateProjectSectionArtifact(ctx, CreateProjectSectionArtifactInput{
		OwnerUserID:         user.ID,
		ProjectID:           project.ID,
		CADDocumentRevision: 4,
		Unit:                "millimetre",
		Status:              ProjectSectionArtifactStatusReady,
		Filename:            "center-x-section.step",
		ContentType:         "model/step",
		TargetCount:         2,
		SourceRevisionIDs:   []string{"mvr_01", "mvr_02"},
		OccurrenceIDs:       []string{"occ_01", "occ_02"},
		PlaneOrigin:         ProjectInspectionVector{X: 10},
		PlaneNormal:         ProjectInspectionVector{X: 1},
		EdgeCount:           3,
		Data:                []byte("ISO-10303-21; ready section"),
	})
	if err != nil {
		t.Fatalf("CreateProjectSectionArtifact ready returned error: %v", err)
	}
	empty, err := svc.CreateProjectSectionArtifact(ctx, CreateProjectSectionArtifactInput{
		OwnerUserID:         user.ID,
		ProjectID:           project.ID,
		CADDocumentRevision: 4,
		Unit:                "millimetre",
		Status:              ProjectSectionArtifactStatusEmpty,
		Filename:            "empty-section.step",
		ContentType:         "model/step",
		TargetCount:         1,
		SourceRevisionIDs:   []string{"mvr_03"},
		OccurrenceIDs:       []string{"occ_03"},
		PlaneOrigin:         ProjectInspectionVector{X: 200},
		PlaneNormal:         ProjectInspectionVector{X: 1},
	})
	if err != nil {
		t.Fatalf("CreateProjectSectionArtifact empty returned error: %v", err)
	}
	if ready.ID == "" || empty.ID == "" || ready.ID == empty.ID {
		t.Fatalf("artifact ids ready=%q empty=%q", ready.ID, empty.ID)
	}
	if ready.ByteSize != int64(len("ISO-10303-21; ready section")) || ready.EdgeCount != 3 {
		t.Fatalf("ready geometry metadata = %+v", ready)
	}
	if ready.CADDocumentRevision != 4 || ready.Unit != "millimetre" || ready.PlaneOrigin.X != 10 || ready.PlaneNormal.X != 1 {
		t.Fatalf("ready provenance = %+v", ready)
	}
	if !reflect.DeepEqual(ready.SourceRevisionIDs, []string{"mvr_01", "mvr_02"}) || !reflect.DeepEqual(ready.OccurrenceIDs, []string{"occ_01", "occ_02"}) {
		t.Fatalf("ready inputs = revisions %+v occurrences %+v", ready.SourceRevisionIDs, ready.OccurrenceIDs)
	}
	if empty.Status != ProjectSectionArtifactStatusEmpty || empty.ByteSize != 0 || empty.EdgeCount != 0 {
		t.Fatalf("empty artifact = %+v", empty)
	}

	artifacts, err := svc.ListProjectSectionArtifacts(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectSectionArtifacts returned error: %v", err)
	}
	if len(artifacts) != 2 || artifacts[0].ID != empty.ID || artifacts[1].ID != ready.ID {
		t.Fatalf("artifact order = %+v", artifacts)
	}

	download, err := svc.GetProjectSectionArtifactDownload(ctx, user.ID, project.ID, ready.ID)
	if err != nil {
		t.Fatalf("GetProjectSectionArtifactDownload returned error: %v", err)
	}
	if download.Filename != "center-x-section.step" || string(download.Data) != "ISO-10303-21; ready section" {
		t.Fatalf("download = %+v data=%q", download, string(download.Data))
	}
	if _, err := svc.GetProjectSectionArtifactDownload(ctx, user.ID, project.ID, empty.ID); !errors.Is(err, ErrProjectSectionArtifactGeometryUnavailable) {
		t.Fatalf("empty download error = %v, want ErrProjectSectionArtifactGeometryUnavailable", err)
	}
	if err := svc.DeleteProjectSectionArtifact(ctx, user.ID, project.ID, ready.ID); err != nil {
		t.Fatalf("DeleteProjectSectionArtifact returned error: %v", err)
	}
	artifacts, err = svc.ListProjectSectionArtifacts(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectSectionArtifacts after delete returned error: %v", err)
	}
	if len(artifacts) != 1 || artifacts[0].ID != empty.ID {
		t.Fatalf("artifacts after delete = %+v", artifacts)
	}
}

func TestProjectSectionArtifactValidationAndOwnership(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	owner, project := createTestProjectForSectionArtifact(t, svc, "section-validation-owner@example.com")
	other, err := svc.RegisterUser(ctx, RegisterUserInput{Name: "Other", Email: "section-validation-other@example.com", Password: "correct-horse-battery"})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}
	base := CreateProjectSectionArtifactInput{
		OwnerUserID: owner.ID, ProjectID: project.ID, CADDocumentRevision: 2, Unit: "millimetre",
		Status: ProjectSectionArtifactStatusReady, Filename: "section.step", ContentType: "model/step",
		TargetCount: 1, SourceRevisionIDs: []string{"mvr_01"}, OccurrenceIDs: []string{"occ_01"},
		PlaneNormal: ProjectInspectionVector{X: 1}, EdgeCount: 1, Data: []byte("ISO-10303-21; section"),
	}
	invalid := base
	invalid.PlaneNormal = ProjectInspectionVector{}
	if _, err := svc.CreateProjectSectionArtifact(ctx, invalid); !errors.Is(err, ErrInvalidProjectSectionArtifactInput) {
		t.Fatalf("zero normal error = %v, want ErrInvalidProjectSectionArtifactInput", err)
	}
	invalid = base
	invalid.Status = ProjectSectionArtifactStatusEmpty
	if _, err := svc.CreateProjectSectionArtifact(ctx, invalid); !errors.Is(err, ErrInvalidProjectSectionArtifactInput) {
		t.Fatalf("empty with geometry error = %v, want ErrInvalidProjectSectionArtifactInput", err)
	}
	invalid = base
	invalid.Data = []byte("not step")
	if _, err := svc.CreateProjectSectionArtifact(ctx, invalid); !errors.Is(err, ErrInvalidProjectSectionArtifactInput) {
		t.Fatalf("invalid geometry error = %v, want ErrInvalidProjectSectionArtifactInput", err)
	}

	artifact, err := svc.CreateProjectSectionArtifact(ctx, base)
	if err != nil {
		t.Fatalf("CreateProjectSectionArtifact owner returned error: %v", err)
	}
	if _, err := svc.ListProjectSectionArtifacts(ctx, other.ID, project.ID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("foreign list error = %v, want ErrProjectNotFound", err)
	}
	if _, err := svc.GetProjectSectionArtifactDownload(ctx, other.ID, project.ID, artifact.ID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("foreign download error = %v, want ErrProjectNotFound", err)
	}
	if err := svc.DeleteProjectSectionArtifact(ctx, other.ID, project.ID, artifact.ID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("foreign delete error = %v, want ErrProjectNotFound", err)
	}
}

func TestProjectSectionArtifactAssociativeRegeneration(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForSectionArtifact(t, svc, "section-association@example.com")
	base := CreateProjectSectionArtifactInput{
		OwnerUserID: user.ID, ProjectID: project.ID, CADDocumentRevision: 3, Unit: "millimetre",
		Status: ProjectSectionArtifactStatusReady, Filename: "section.step", ContentType: "model/step",
		TargetCount: 1, SourceRevisionIDs: []string{"pmr_1"}, OccurrenceIDs: []string{"occ_1"},
		PlaneOrigin: ProjectInspectionVector{X: 5}, PlaneNormal: ProjectInspectionVector{X: 1},
		EdgeCount: 4, Data: []byte("ISO-10303-21; generation 1"),
	}
	first, err := svc.CreateProjectSectionArtifact(ctx, base)
	if err != nil {
		t.Fatalf("create generation 1: %v", err)
	}
	if first.AssociationID == "" || first.Generation != 1 || first.SupersedesArtifactID != "" || !first.IsLatest {
		t.Fatalf("generation 1 = %+v", first)
	}
	var association entity.ProjectSectionArtifactAssociation
	if err := svc.DB().First(&association, "id = ?", first.AssociationID).Error; err != nil {
		t.Fatalf("load generation 1 association: %v", err)
	}
	if association.CurrentGeneration != 1 || association.LatestArtifactID != first.ID {
		t.Fatalf("generation 1 association = %+v", association)
	}

	regenerated := base
	regenerated.CADDocumentRevision = 4
	regenerated.SourceRevisionIDs = []string{"pmr_2"}
	regenerated.AssociationID = first.AssociationID
	regenerated.ExpectedGeneration = 1
	regenerated.Data = []byte("ISO-10303-21; generation 2")
	second, err := svc.CreateProjectSectionArtifact(ctx, regenerated)
	if err != nil {
		t.Fatalf("create generation 2: %v", err)
	}
	if second.AssociationID != first.AssociationID || second.Generation != 2 || second.SupersedesArtifactID != first.ID || !second.IsLatest {
		t.Fatalf("generation 2 = %+v", second)
	}
	if err := svc.DB().First(&association, "id = ?", first.AssociationID).Error; err != nil {
		t.Fatalf("load generation 2 association: %v", err)
	}
	if association.CurrentGeneration != 2 || association.LatestArtifactID != second.ID {
		t.Fatalf("generation 2 association = %+v", association)
	}

	if _, err := svc.CreateProjectSectionArtifact(ctx, regenerated); !errors.Is(err, ErrProjectSectionArtifactGenerationConflict) {
		t.Fatalf("stale expected generation error = %v, want conflict", err)
	}
	changedPlane := regenerated
	changedPlane.ExpectedGeneration = 2
	changedPlane.PlaneOrigin = ProjectInspectionVector{X: 6}
	if _, err := svc.CreateProjectSectionArtifact(ctx, changedPlane); !errors.Is(err, ErrInvalidProjectSectionArtifactInput) {
		t.Fatalf("changed association plane error = %v, want invalid input", err)
	}

	artifacts, err := svc.ListProjectSectionArtifacts(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("list generations: %v", err)
	}
	if len(artifacts) != 2 || artifacts[0].ID != second.ID || !artifacts[0].IsLatest || artifacts[1].IsLatest {
		t.Fatalf("listed generations = %+v", artifacts)
	}
}

func createTestProjectForSectionArtifact(t *testing.T, svc *Service, email string) (AuthUser, Project) {
	t.Helper()
	ctx := context.Background()
	user, err := svc.RegisterUser(ctx, RegisterUserInput{Name: "Section Owner", Email: email, Password: "correct-horse-battery"})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Section artifacts"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	return user, project
}
