package service

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestProjectExportArtifactLifecycle(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForExportArtifact(t, svc, "export-owner@example.com")

	first, err := svc.CreateProjectExportArtifact(ctx, CreateProjectExportArtifactInput{
		OwnerUserID:       user.ID,
		ProjectID:         project.ID,
		Filename:          "bracket.step",
		ContentType:       "model/step",
		ExportKind:        "single",
		TargetCount:       1,
		SourceRevisionIDs: []string{"rev_01"},
		OccurrenceIDs:     []string{"occ_01"},
		Data:              []byte("ISO-10303-21; first export"),
	})
	if err != nil {
		t.Fatalf("CreateProjectExportArtifact first returned error: %v", err)
	}
	second, err := svc.CreateProjectExportArtifact(ctx, CreateProjectExportArtifactInput{
		OwnerUserID:       user.ID,
		ProjectID:         project.ID,
		Filename:          "assembly.step",
		ContentType:       "model/step",
		ExportKind:        "merged",
		TargetCount:       2,
		SourceRevisionIDs: []string{"rev_01", "rev_02"},
		OccurrenceIDs:     []string{"occ_01", "occ_02"},
		Data:              []byte("ISO-10303-21; merged export"),
	})
	if err != nil {
		t.Fatalf("CreateProjectExportArtifact second returned error: %v", err)
	}
	if first.ID == "" || second.ID == "" || first.ID == second.ID {
		t.Fatalf("artifact ids first=%q second=%q", first.ID, second.ID)
	}
	if second.ByteSize != int64(len("ISO-10303-21; merged export")) {
		t.Fatalf("second byte size = %d", second.ByteSize)
	}
	if second.ProjectID != project.ID || second.Filename != "assembly.step" || second.ExportKind != "merged" || second.TargetCount != 2 {
		t.Fatalf("second artifact metadata = %+v", second)
	}
	if !reflect.DeepEqual(second.SourceRevisionIDs, []string{"rev_01", "rev_02"}) || !reflect.DeepEqual(second.OccurrenceIDs, []string{"occ_01", "occ_02"}) {
		t.Fatalf("second artifact ids = revisions %+v occurrences %+v", second.SourceRevisionIDs, second.OccurrenceIDs)
	}

	artifacts, err := svc.ListProjectExportArtifacts(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectExportArtifacts returned error: %v", err)
	}
	if len(artifacts) != 2 || artifacts[0].ID != second.ID || artifacts[1].ID != first.ID {
		t.Fatalf("artifact order = %+v", artifacts)
	}

	download, err := svc.GetProjectExportArtifactDownload(ctx, user.ID, project.ID, second.ID)
	if err != nil {
		t.Fatalf("GetProjectExportArtifactDownload returned error: %v", err)
	}
	if download.Filename != "assembly.step" || download.ContentType != "model/step" || string(download.Data) != "ISO-10303-21; merged export" {
		t.Fatalf("download = %+v data=%q", download, string(download.Data))
	}
}

func TestProjectExportArtifactValidationAndOwnership(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	owner, project := createTestProjectForExportArtifact(t, svc, "export-validation-owner@example.com")
	other, err := svc.RegisterUser(ctx, RegisterUserInput{Name: "Other", Email: "export-validation-other@example.com", Password: "correct-horse-battery"})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}

	_, err = svc.CreateProjectExportArtifact(ctx, CreateProjectExportArtifactInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		Filename:    "empty.step",
		ContentType: "model/step",
		ExportKind:  "single",
		TargetCount: 1,
		Data:        nil,
	})
	if !errors.Is(err, ErrInvalidProjectExportArtifactInput) {
		t.Fatalf("empty artifact error = %v, want ErrInvalidProjectExportArtifactInput", err)
	}

	manyRevisions := make([]string, maxProjectExportArtifactMetadataIDs+1)
	for index := range manyRevisions {
		manyRevisions[index] = "rev_overflow"
	}
	_, err = svc.CreateProjectExportArtifact(ctx, CreateProjectExportArtifactInput{
		OwnerUserID:       owner.ID,
		ProjectID:         project.ID,
		Filename:          "overflow.step",
		ContentType:       "model/step",
		ExportKind:        "merged",
		TargetCount:       1,
		SourceRevisionIDs: manyRevisions,
		Data:              []byte("ISO-10303-21;"),
	})
	if !errors.Is(err, ErrInvalidProjectExportArtifactInput) {
		t.Fatalf("metadata overflow error = %v, want ErrInvalidProjectExportArtifactInput", err)
	}

	artifact, err := svc.CreateProjectExportArtifact(ctx, CreateProjectExportArtifactInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		Filename:    "owned.step",
		ContentType: "model/step",
		ExportKind:  "single",
		TargetCount: 1,
		Data:        []byte("ISO-10303-21; owned"),
	})
	if err != nil {
		t.Fatalf("CreateProjectExportArtifact owner returned error: %v", err)
	}
	if _, err := svc.ListProjectExportArtifacts(ctx, other.ID, project.ID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("other list error = %v, want ErrProjectNotFound", err)
	}
	if _, err := svc.GetProjectExportArtifactDownload(ctx, other.ID, project.ID, artifact.ID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("other download error = %v, want ErrProjectNotFound", err)
	}
}

func createTestProjectForExportArtifact(t *testing.T, svc *Service, email string) (AuthUser, Project) {
	t.Helper()
	ctx := context.Background()
	user, err := svc.RegisterUser(ctx, RegisterUserInput{Name: "Export Owner", Email: email, Password: "correct-horse-battery"})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Export history"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	return user, project
}
