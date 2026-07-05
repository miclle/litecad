package service

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/miclle/litecad/internal/entity"
)

func TestCreateProjectStoresOwnerScopedProject(t *testing.T) {
	svc := newTestService(t)
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
		Name:        "Bracket study",
		Description: "Wall-mounted shelf bracket exploration.",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if project.ID == "" {
		t.Fatal("project should have an id")
	}
	if project.Name != "Bracket study" {
		t.Fatalf("project name = %q", project.Name)
	}

	projects, err := svc.ListProjects(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListProjects returned error: %v", err)
	}
	if len(projects) != 1 {
		t.Fatalf("project count = %d, want 1", len(projects))
	}
	if projects[0].ID != project.ID {
		t.Fatalf("listed project id = %q, want %q", projects[0].ID, project.ID)
	}

	loaded, err := svc.GetProject(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProject returned error: %v", err)
	}
	if loaded.ID != project.ID {
		t.Fatalf("loaded project id = %q, want %q", loaded.ID, project.ID)
	}
}

func TestCreateProjectRejectsInvalidInput(t *testing.T) {
	svc := newTestService(t)

	_, err := svc.CreateProject(context.Background(), CreateProjectInput{
		OwnerUserID: "usr_test",
		Name:        "",
	})
	if !errors.Is(err, ErrInvalidProjectInput) {
		t.Fatalf("CreateProject error = %v, want ErrInvalidProjectInput", err)
	}
}

func TestGetProjectScopesByOwner(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	owner, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser owner returned error: %v", err)
	}
	other, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Grace",
		Email:    "grace@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: owner.ID,
		Name:        "Bracket study",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	_, err = svc.GetProject(ctx, other.ID, project.ID)
	if !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("GetProject error = %v, want ErrProjectNotFound", err)
	}
}

func TestUploadProjectModelStoresStepAsset(t *testing.T) {
	svc := newTestService(t)
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
		Name:        "Imported case",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "macintosh_ipad_lcd_case.step",
		ContentType: "application/step",
		Data:        []byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;"),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	if model.ID == "" {
		t.Fatal("uploaded model should have an id")
	}
	if model.ProjectID != project.ID {
		t.Fatalf("model project id = %q, want %q", model.ProjectID, project.ID)
	}
	if model.Format != "step" {
		t.Fatalf("model format = %q, want step", model.Format)
	}
	if model.OriginalFilename != "macintosh_ipad_lcd_case.step" {
		t.Fatalf("model filename = %q", model.OriginalFilename)
	}
	if model.ByteSize == 0 {
		t.Fatal("model byte size should be recorded")
	}
	if model.ParseStatus != "parsed" {
		t.Fatalf("model parse status = %q, want parsed", model.ParseStatus)
	}
	if model.Metadata.Schema != "ISO-10303-21" {
		t.Fatalf("model metadata schema = %q, want ISO-10303-21", model.Metadata.Schema)
	}

	models, err := svc.ListProjectModels(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectModels returned error: %v", err)
	}
	if len(models) != 1 || models[0].ID != model.ID {
		t.Fatalf("models = %+v, want uploaded model", models)
	}
}

func TestUploadProjectModelRejectsUnsupportedFormat(t *testing.T) {
	svc := newTestService(t)
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
		Name:        "Imported case",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	_, err = svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "decorative-mesh.obj",
		ContentType: "text/plain",
		Data:        []byte("v 0 0 0"),
	})
	if !errors.Is(err, ErrUnsupportedModelFormat) {
		t.Fatalf("UploadProjectModel error = %v, want ErrUnsupportedModelFormat", err)
	}
}

func TestUploadProjectModelStoresGLBAsset(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)

	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "case.glb",
		ContentType: "model/gltf-binary",
		Data:        minimalGLB(),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	if model.Format != "glb" {
		t.Fatalf("model format = %q, want glb", model.Format)
	}
	if model.ParseStatus != "parsed" {
		t.Fatalf("model parse status = %q, want parsed", model.ParseStatus)
	}
	if model.Metadata.AssetType != "glb" || model.Metadata.Version != "2" {
		t.Fatalf("model metadata = %+v, want glb version 2", model.Metadata)
	}

	preview, err := svc.GetOrCreateProjectModelPreview(ctx, user.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("GetOrCreateProjectModelPreview returned error: %v", err)
	}
	if preview.Format != "glb" || preview.ContentType != "model/gltf-binary" {
		t.Fatalf("preview = format %q content type %q", preview.Format, preview.ContentType)
	}
	if preview.GeneratorVersion != "gltf-preview-v1" {
		t.Fatalf("preview generator version = %q, want gltf-preview-v1", preview.GeneratorVersion)
	}
	if !bytes.Equal(preview.Data, minimalGLB()) {
		t.Fatal("GLB preview should be published by backend after source validation")
	}
}

func TestUploadProjectModelStoresGLTFAsset(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)

	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "case.gltf",
		ContentType: "model/gltf+json",
		Data:        []byte(`{"asset":{"version":"2.0"},"meshes":[{"name":"case"}]}`),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	if model.Format != "gltf" {
		t.Fatalf("model format = %q, want gltf", model.Format)
	}
	if model.Metadata.AssetType != "gltf" || model.Metadata.Version != "2.0" || model.Metadata.RepresentationCount != 1 {
		t.Fatalf("model metadata = %+v, want gltf version 2.0 with one mesh", model.Metadata)
	}

	preview, err := svc.GetOrCreateProjectModelPreview(ctx, user.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("GetOrCreateProjectModelPreview returned error: %v", err)
	}
	if preview.Format != "gltf" || preview.ContentType != "model/gltf+json" {
		t.Fatalf("preview = format %q content type %q", preview.Format, preview.ContentType)
	}
	if preview.GeneratorVersion != "gltf-preview-v1" {
		t.Fatalf("preview generator version = %q, want gltf-preview-v1", preview.GeneratorVersion)
	}
}

func TestUploadProjectModelRejectsExternalGLTFResourcePreview(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)

	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "case.gltf",
		ContentType: "model/gltf+json",
		Data:        []byte(`{"asset":{"version":"2.0"},"buffers":[{"uri":"case.bin","byteLength":12}],"meshes":[{"name":"case"}]}`),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	if model.ParseStatus != "error" {
		t.Fatalf("model parse status = %q, want error", model.ParseStatus)
	}
	if model.ParseError == "" {
		t.Fatal("model parse error should explain unsupported external GLTF resources")
	}

	_, err = svc.GetOrCreateProjectModelPreview(ctx, user.ID, project.ID, model.ID)
	if !errors.Is(err, ErrModelPreviewUnavailable) {
		t.Fatalf("GetOrCreateProjectModelPreview error = %v, want ErrModelPreviewUnavailable", err)
	}
}

func TestUploadProjectModelStoresSTLAsset(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)

	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "case.stl",
		ContentType: "model/stl",
		Data:        minimalASCIISTL(),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	if model.Format != "stl" {
		t.Fatalf("model format = %q, want stl", model.Format)
	}
	if model.ParseStatus != "parsed" {
		t.Fatalf("model parse status = %q, want parsed", model.ParseStatus)
	}
	if model.Metadata.AssetType != "stl" || model.Metadata.TriangleCount != 1 {
		t.Fatalf("model metadata = %+v, want stl with one triangle", model.Metadata)
	}

	preview, err := svc.GetOrCreateProjectModelPreview(ctx, user.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("GetOrCreateProjectModelPreview returned error: %v", err)
	}
	if preview.Format != "obj" || preview.ContentType != "model/obj" {
		t.Fatalf("preview = format %q content type %q", preview.Format, preview.ContentType)
	}
	if preview.GeneratorVersion != "stl-obj-v1" {
		t.Fatalf("preview generator version = %q, want stl-obj-v1", preview.GeneratorVersion)
	}
	if preview.FacetCount != 1 || preview.VertexCount != 3 {
		t.Fatalf("preview counts = facets %d vertices %d, want 1 and 3", preview.FacetCount, preview.VertexCount)
	}
	if !bytes.Contains(preview.Data, []byte("f 1 2 3")) {
		t.Fatalf("preview OBJ data = %q, want face data", string(preview.Data))
	}
}

func TestUploadProjectModelScopesByOwner(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	owner, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser owner returned error: %v", err)
	}
	other, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Grace",
		Email:    "grace@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: owner.ID,
		Name:        "Imported case",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	_, err = svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: other.ID,
		ProjectID:   project.ID,
		Filename:    "macintosh_ipad_lcd_case.step",
		Data:        []byte(strings.Repeat("0", 32)),
	})
	if !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("UploadProjectModel error = %v, want ErrProjectNotFound", err)
	}
}

func createTestProjectForModel(t *testing.T, svc *Service, ctx context.Context) (AuthUser, Project) {
	t.Helper()
	emailSlug := strings.NewReplacer("/", "-", " ", "-", "_", "-").Replace(strings.ToLower(t.Name()))
	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada-" + emailSlug + "@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Imported model",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	return user, project
}

func minimalGLB() []byte {
	return []byte{
		'g', 'l', 'T', 'F',
		0x02, 0x00, 0x00, 0x00,
		0x18, 0x00, 0x00, 0x00,
		0x08, 0x00, 0x00, 0x00,
		'J', 'S', 'O', 'N',
		'{', '}', ' ', ' ',
	}
}

func minimalASCIISTL() []byte {
	return []byte(`solid case
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 1 0 0
    vertex 0 1 0
  endloop
endfacet
endsolid case
`)
}

func TestUploadProjectModelStoresExternalStepFileWhenConfigured(t *testing.T) {
	stepPath := os.Getenv("LITECAD_TEST_STEP_FILE")
	if stepPath == "" {
		t.Skip("set LITECAD_TEST_STEP_FILE to run the local STEP upload integration check")
	}
	data, err := os.ReadFile(stepPath)
	if err != nil {
		t.Fatalf("read STEP file: %v", err)
	}

	svc := newTestService(t)
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
		Name:        "External STEP import",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    filepath.Base(stepPath),
		ContentType: "application/step",
		Data:        data,
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	if model.ByteSize != int64(len(data)) {
		t.Fatalf("model byte size = %d, want %d", model.ByteSize, len(data))
	}
	if model.ParseStatus != "parsed" {
		t.Fatalf("model parse status = %q, want parsed", model.ParseStatus)
	}
	if len(model.Metadata.ProductNames) == 0 || model.Metadata.ProductNames[0] != "Compact_Retro_iPad_LCD_Case" {
		t.Fatalf("model product names = %+v", model.Metadata.ProductNames)
	}
	if model.Metadata.Schema != "AUTOMOTIVE_DESIGN" {
		t.Fatalf("model schema = %q, want AUTOMOTIVE_DESIGN", model.Metadata.Schema)
	}
}

func TestListProjectModelsBackfillsPendingStepMetadata(t *testing.T) {
	svc := newTestService(t)
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
		Name:        "Imported case",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	stored := entity.ProjectModel{
		ID:               "mdl_pending",
		ProjectID:        project.ID,
		OriginalFilename: "legacy.step",
		Format:           "step",
		ByteSize:         128,
		ParseStatus:      "pending",
		SourceData:       []byte("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n#1 = PRODUCT('Legacy_Case','Legacy_Case','',(#2));\nENDSEC;\nEND-ISO-10303-21;"),
	}
	if err := svc.DB().Create(&stored).Error; err != nil {
		t.Fatalf("store pending model: %v", err)
	}

	models, err := svc.ListProjectModels(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectModels returned error: %v", err)
	}
	if len(models) != 1 {
		t.Fatalf("model count = %d, want 1", len(models))
	}
	if models[0].ParseStatus != "parsed" {
		t.Fatalf("parse status = %q, want parsed", models[0].ParseStatus)
	}
	if len(models[0].Metadata.ProductNames) != 1 || models[0].Metadata.ProductNames[0] != "Legacy_Case" {
		t.Fatalf("product names = %+v", models[0].Metadata.ProductNames)
	}
}
