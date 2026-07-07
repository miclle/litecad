package service

import (
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/miclle/litecad/internal/entity"
)

func TestGetOrCreateProjectModelPreviewDoesNotConvertStepSources(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, project := createTestProjectForModel(t, svc, ctx)
	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "case.step",
		Data:        []byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1 = PRODUCT('Case','Case','',(#2));\nENDSEC;\nEND-ISO-10303-21;"),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}

	_, err = svc.GetOrCreateProjectModelPreview(ctx, user.ID, project.ID, model.ID)
	if !errors.Is(err, ErrModelPreviewUnavailable) {
		t.Fatalf("GetOrCreateProjectModelPreview error = %v, want ErrModelPreviewUnavailable", err)
	}
}

func TestProjectGeometryDocumentQuarantinesLegacyStepPreviewArtifacts(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, project := createTestProjectForModel(t, svc, ctx)
	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "case.step",
		Data:        []byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1 = PRODUCT('Case','Case','',(#2));\nENDSEC;\nEND-ISO-10303-21;"),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	legacyArtifact := entity.ProjectModelPreviewArtifact{
		ID:               "prv_legacy_step",
		ModelID:          model.ID,
		Format:           "obj",
		ContentType:      "model/obj",
		GeneratorVersion: stepPreviewGeneratorVersion,
		ByteSize:         48,
		VertexCount:      3,
		FacetCount:       1,
		Data:             []byte("# legacy step obj\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"),
	}
	if err := svc.DB().Create(&legacyArtifact).Error; err != nil {
		t.Fatalf("store legacy step preview artifact: %v", err)
	}
	legacyVersion := entity.ProjectGeometryVersion{
		ID:                "geo_legacy_step",
		ProjectID:         project.ID,
		SourceModelID:     model.ID,
		PreviewArtifactID: legacyArtifact.ID,
		VersionNumber:     1,
		Summary:           "Legacy STEP preview artifact",
	}
	if err := svc.DB().Create(&legacyVersion).Error; err != nil {
		t.Fatalf("store legacy step geometry version: %v", err)
	}

	document, err := svc.GetProjectGeometryDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectGeometryDocument returned error: %v", err)
	}
	if len(document.PreviewArtifacts) != 0 {
		t.Fatalf("geometry document preview artifacts = %+v, want no legacy STEP artifacts", document.PreviewArtifacts)
	}
	if len(document.Versions) != 0 {
		t.Fatalf("geometry document versions = %+v, want no legacy STEP artifact versions", document.Versions)
	}
	if len(document.ModelTree) != 1 || document.ModelTree[0].ModelID != model.ID {
		t.Fatalf("geometry document model tree = %+v", document.ModelTree)
	}
	if document.ModelTree[0].PreviewArtifactID != "" || document.ModelTree[0].PreviewFormat != "" {
		t.Fatalf("legacy STEP preview should be omitted from model tree, got %+v", document.ModelTree[0])
	}
}

func TestProjectGeometryVersionRejectsDuplicateProjectVersionNumber(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada-duplicate-geometry-version@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Duplicate geometry version case",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	modelA, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "case-a.stl",
		Data:        minimalASCIISTL(),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel A returned error: %v", err)
	}
	modelB, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "case-b.stl",
		Data:        minimalASCIISTL(),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel B returned error: %v", err)
	}
	artifactA := entity.ProjectModelPreviewArtifact{
		ID:               "prv_duplicate_first",
		ModelID:          modelA.ID,
		Format:           "obj",
		ContentType:      "model/obj",
		GeneratorVersion: stlOBJPreviewGeneratorVersion,
		ByteSize:         48,
		VertexCount:      3,
		FacetCount:       1,
		Data:             []byte("# first\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"),
	}
	if err := svc.DB().Create(&artifactA).Error; err != nil {
		t.Fatalf("store first preview artifact: %v", err)
	}
	artifactB := entity.ProjectModelPreviewArtifact{
		ID:               "prv_duplicate_second",
		ModelID:          modelB.ID,
		Format:           "obj",
		ContentType:      "model/obj",
		GeneratorVersion: stlOBJPreviewGeneratorVersion,
		ByteSize:         49,
		VertexCount:      3,
		FacetCount:       1,
		Data:             []byte("# second\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"),
	}
	if err := svc.DB().Create(&artifactB).Error; err != nil {
		t.Fatalf("store second preview artifact: %v", err)
	}

	first := entity.ProjectGeometryVersion{
		ID:                "geo_duplicate_first",
		ProjectID:         project.ID,
		SourceModelID:     modelA.ID,
		PreviewArtifactID: artifactA.ID,
		VersionNumber:     1,
		Summary:           "First version",
	}
	if err := svc.DB().Create(&first).Error; err != nil {
		t.Fatalf("store first geometry version: %v", err)
	}
	duplicate := entity.ProjectGeometryVersion{
		ID:                "geo_duplicate_second",
		ProjectID:         project.ID,
		SourceModelID:     modelB.ID,
		PreviewArtifactID: artifactB.ID,
		VersionNumber:     1,
		Summary:           "Duplicate version",
	}
	if err := svc.DB().Create(&duplicate).Error; err == nil {
		t.Fatal("duplicate project geometry version number should be rejected")
	}
}

func TestGetOrCreateProjectModelPreviewConvertsSTLToOBJArtifact(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada-stl-preview@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "STL preview case",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "case.stl",
		Data:        minimalASCIISTL(),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}

	preview, err := svc.GetOrCreateProjectModelPreview(ctx, user.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("GetOrCreateProjectModelPreview returned error: %v", err)
	}
	if preview.Format != "obj" || preview.ContentType != "model/obj" {
		t.Fatalf("preview = format %q content type %q, want obj model/obj", preview.Format, preview.ContentType)
	}
	if preview.GeneratorVersion != "stl-obj-v1" {
		t.Fatalf("preview generator version = %q, want stl-obj-v1", preview.GeneratorVersion)
	}
	if bytes.Equal(preview.Data, minimalASCIISTL()) {
		t.Fatal("preview data should be generated OBJ, not source-passthrough STL")
	}
	if !bytes.Contains(preview.Data, []byte("f 1 2 3")) {
		t.Fatalf("preview OBJ data = %q, want face data", string(preview.Data))
	}
}
