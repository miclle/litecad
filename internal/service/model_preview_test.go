package service

import (
	"bytes"
	"context"
	"errors"
	"os"
	"testing"
)

type fakePreviewConverter struct{}

func (fakePreviewConverter) ConvertStepToPreview(ctx context.Context, data []byte) (ModelPreviewMesh, error) {
	return ModelPreviewMesh{
		Format:      "obj",
		ContentType: "model/obj",
		Data:        []byte("# real mesh\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"),
		FacetCount:  1,
		VertexCount: 3,
	}, nil
}

func TestGetOrCreateProjectModelPreviewCreatesOBJArtifact(t *testing.T) {
	svc := newTestService(t)
	svc.previewConverter = fakePreviewConverter{}
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Preview case",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "case.step",
		Data:        []byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1 = PRODUCT('Case','Case','',(#2));\nENDSEC;\nEND-ISO-10303-21;"),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}

	preview, err := svc.GetOrCreateProjectModelPreview(ctx, user.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("GetOrCreateProjectModelPreview returned error: %v", err)
	}
	if preview.ID == "" {
		t.Fatal("preview should include id")
	}
	if preview.ModelID != model.ID {
		t.Fatalf("preview model id = %q, want %q", preview.ModelID, model.ID)
	}
	if preview.Format != "obj" {
		t.Fatalf("preview format = %q, want obj", preview.Format)
	}
	if preview.ContentType != "model/obj" {
		t.Fatalf("preview content type = %q, want model/obj", preview.ContentType)
	}
	if preview.GeneratorVersion != "step-preview-v1" {
		t.Fatalf("preview generator version = %q, want step-preview-v1", preview.GeneratorVersion)
	}
	if preview.FacetCount != 1 || preview.VertexCount != 3 {
		t.Fatalf("preview counts = facets %d vertices %d", preview.FacetCount, preview.VertexCount)
	}
	if !bytes.Contains(preview.Data, []byte("f 1 2 3")) {
		t.Fatalf("preview data = %q, want OBJ face data", string(preview.Data))
	}

	again, err := svc.GetOrCreateProjectModelPreview(ctx, user.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("GetOrCreateProjectModelPreview second call returned error: %v", err)
	}
	if again.ID != preview.ID {
		t.Fatalf("second preview id = %q, want %q", again.ID, preview.ID)
	}

	document, err := svc.GetProjectGeometryDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectGeometryDocument returned error: %v", err)
	}
	if document.ProjectID != project.ID {
		t.Fatalf("geometry document project id = %q, want %q", document.ProjectID, project.ID)
	}
	if len(document.ModelTree) != 1 || document.ModelTree[0].ModelID != model.ID || document.ModelTree[0].PreviewArtifactID != preview.ID {
		t.Fatalf("geometry document model tree = %+v", document.ModelTree)
	}
	if len(document.PreviewArtifacts) != 1 || document.PreviewArtifacts[0].ID != preview.ID || len(document.PreviewArtifacts[0].Data) != 0 {
		t.Fatalf("geometry document preview artifacts = %+v", document.PreviewArtifacts)
	}
	if len(document.Versions) != 1 || document.Versions[0].ProjectID != project.ID || document.Versions[0].PreviewArtifactID != preview.ID {
		t.Fatalf("geometry document versions = %+v", document.Versions)
	}
}

type fakeGLBPreviewConverter struct{}

func (fakeGLBPreviewConverter) ConvertStepToPreview(ctx context.Context, data []byte) (ModelPreviewMesh, error) {
	return ModelPreviewMesh{
		Format:      "glb",
		ContentType: "model/gltf-binary",
		Data:        minimalGLB(),
		FacetCount:  2,
		VertexCount: 4,
	}, nil
}

func TestGetOrCreateProjectModelPreviewStoresConverterPreviewFormat(t *testing.T) {
	svc := newTestService(t)
	svc.previewConverter = fakeGLBPreviewConverter{}
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada-glb-preview@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "GLB preview case",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "case.step",
		Data:        []byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1 = PRODUCT('Case','Case','',(#2));\nENDSEC;\nEND-ISO-10303-21;"),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}

	preview, err := svc.GetOrCreateProjectModelPreview(ctx, user.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("GetOrCreateProjectModelPreview returned error: %v", err)
	}
	if preview.Format != "glb" {
		t.Fatalf("preview format = %q, want glb", preview.Format)
	}
	if preview.ContentType != "model/gltf-binary" {
		t.Fatalf("preview content type = %q, want model/gltf-binary", preview.ContentType)
	}
	if preview.GeneratorVersion != "step-preview-v1" {
		t.Fatalf("preview generator version = %q, want step-preview-v1", preview.GeneratorVersion)
	}
	if !bytes.Equal(preview.Data, minimalGLB()) {
		t.Fatal("preview data should preserve converter GLB data")
	}
}

func TestGetOrCreateProjectModelPreviewRejectsSourcePassthroughFormats(t *testing.T) {
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

	_, err = svc.GetOrCreateProjectModelPreview(ctx, user.ID, project.ID, model.ID)
	if err == nil {
		t.Fatal("GetOrCreateProjectModelPreview returned nil error for source passthrough format")
	}
	if !errors.Is(err, ErrModelPreviewUnavailable) {
		t.Fatalf("GetOrCreateProjectModelPreview error = %v, want ErrModelPreviewUnavailable", err)
	}
}

func TestFreeCADPreviewConverterConvertsExternalStepFileWhenConfigured(t *testing.T) {
	stepPath := os.Getenv("LITECAD_TEST_STEP_FILE")
	if stepPath == "" {
		t.Skip("set LITECAD_TEST_STEP_FILE to run the local STEP preview conversion check")
	}
	data, err := os.ReadFile(stepPath)
	if err != nil {
		t.Fatalf("read STEP file: %v", err)
	}

	mesh, err := NewFreeCADPreviewConverter().ConvertStepToPreview(context.Background(), data)
	if err != nil {
		t.Fatalf("ConvertStepToPreview returned error: %v", err)
	}
	if mesh.Format != "obj" {
		t.Fatalf("format = %q, want obj", mesh.Format)
	}
	if mesh.ContentType != "model/obj" {
		t.Fatalf("content type = %q, want model/obj", mesh.ContentType)
	}
	if mesh.VertexCount == 0 || mesh.FacetCount == 0 {
		t.Fatalf("mesh counts = vertices %d facets %d", mesh.VertexCount, mesh.FacetCount)
	}
	if !bytes.Contains(mesh.Data, []byte("\nv ")) || !bytes.Contains(mesh.Data, []byte("\nf ")) {
		t.Fatal("OBJ data should contain vertex and face records")
	}
}
