package service

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

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
	if projects[0].Thumbnail.ModelCount != 0 {
		t.Fatalf("new project thumbnail model count = %d, want 0", projects[0].Thumbnail.ModelCount)
	}

	loaded, err := svc.GetProject(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProject returned error: %v", err)
	}
	if loaded.ID != project.ID {
		t.Fatalf("loaded project id = %q, want %q", loaded.ID, project.ID)
	}
}

func TestListProjectsIncludesModelThumbnailSummaries(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "thumbnail@example.com",
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

	var latest ProjectModel
	for index, filename := range []string{"first.step", "second.stl", "third.stl", "fourth.stl", "latest.stl"} {
		data := []byte("solid latest\nendsolid latest\n")
		contentType := "model/stl"
		if strings.HasSuffix(filename, ".step") {
			data = []byte("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;")
			contentType = "application/step"
		}
		model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
			OwnerUserID: user.ID,
			ProjectID:   project.ID,
			Filename:    filename,
			ContentType: contentType,
			Data:        data,
		})
		if err != nil {
			t.Fatalf("UploadProjectModel %s returned error: %v", filename, err)
		}
		createdAt := time.Date(2026, time.July, 8, 12, index, 0, 0, time.UTC)
		if err := svc.db.Model(&entity.ProjectModel{}).Where("id = ?", model.ID).Updates(map[string]any{
			"created_at": createdAt,
			"updated_at": createdAt,
		}).Error; err != nil {
			t.Fatalf("update model timestamps returned error: %v", err)
		}
		latest = model
	}

	projects, err := svc.ListProjects(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListProjects returned error: %v", err)
	}
	if len(projects) != 1 {
		t.Fatalf("project count = %d, want 1", len(projects))
	}
	thumbnail := projects[0].Thumbnail
	if thumbnail.ModelCount != 5 {
		t.Fatalf("thumbnail model count = %d, want 5", thumbnail.ModelCount)
	}
	if len(thumbnail.Models) != 3 {
		t.Fatalf("thumbnail models = %d, want 3", len(thumbnail.Models))
	}
	if thumbnail.Models[0].ID != latest.ID {
		t.Fatalf("first thumbnail model id = %q, want %q", thumbnail.Models[0].ID, latest.ID)
	}
	if thumbnail.Models[0].Format != "stl" {
		t.Fatalf("first thumbnail model format = %q", thumbnail.Models[0].Format)
	}
}

func TestListProjectsIncludesThumbnailSnapshot(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "thumbnail-snapshot@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Snapshot case",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	snapshot := entity.ProjectThumbnailSnapshot{
		ID:          "pth_test",
		ProjectID:   project.ID,
		ContentType: "image/webp",
		ByteSize:    12,
		Width:       640,
		Height:      360,
		Revision:    4,
		Status:      "ready",
		Data:        []byte("thumbnail"),
	}
	if err := svc.db.Create(&snapshot).Error; err != nil {
		t.Fatalf("store thumbnail snapshot: %v", err)
	}

	projects, err := svc.ListProjects(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListProjects returned error: %v", err)
	}
	thumbnail := projects[0].Thumbnail
	if thumbnail.Snapshot == nil {
		t.Fatal("thumbnail snapshot should be included")
	}
	if thumbnail.Snapshot.URL != "/api/v1/projects/"+project.ID+"/thumbnail?revision=4" {
		t.Fatalf("thumbnail snapshot url = %q", thumbnail.Snapshot.URL)
	}
	if thumbnail.Snapshot.Status != "ready" || thumbnail.Snapshot.Width != 640 || thumbnail.Snapshot.Height != 360 {
		t.Fatalf("thumbnail snapshot = %+v", thumbnail.Snapshot)
	}
}

func TestGetProjectThumbnailSnapshotScopesByOwner(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	owner, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "thumbnail-owner@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser owner returned error: %v", err)
	}
	other, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Grace",
		Email:    "thumbnail-other@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: owner.ID,
		Name:        "Private snapshot",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if err := svc.db.Create(&entity.ProjectThumbnailSnapshot{
		ID:          "pth_private",
		ProjectID:   project.ID,
		ContentType: "image/png",
		ByteSize:    7,
		Width:       320,
		Height:      180,
		Revision:    2,
		Status:      "ready",
		Data:        []byte("cover"),
	}).Error; err != nil {
		t.Fatalf("store thumbnail snapshot: %v", err)
	}

	snapshot, err := svc.GetProjectThumbnailSnapshot(ctx, owner.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectThumbnailSnapshot returned error: %v", err)
	}
	if snapshot.ContentType != "image/png" || string(snapshot.Data) != "cover" || snapshot.Revision != 2 {
		t.Fatalf("snapshot = %+v", snapshot)
	}

	_, err = svc.GetProjectThumbnailSnapshot(ctx, other.ID, project.ID)
	if !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("cross-owner GetProjectThumbnailSnapshot error = %v, want ErrProjectNotFound", err)
	}
}

func TestSaveProjectThumbnailSnapshotReplacesCoverAndScopesByOwner(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	owner, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "save-thumbnail-owner@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser owner returned error: %v", err)
	}
	other, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Grace",
		Email:    "save-thumbnail-other@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: owner.ID,
		Name:        "Saved thumbnail",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	summary, err := svc.SaveProjectThumbnailSnapshot(ctx, SaveProjectThumbnailSnapshotInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		ContentType: "image/webp",
		Data:        []byte("first"),
		Width:       640,
		Height:      360,
		Revision:    1,
	})
	if err != nil {
		t.Fatalf("SaveProjectThumbnailSnapshot returned error: %v", err)
	}
	if summary.URL != "/api/v1/projects/"+project.ID+"/thumbnail?revision=1" || summary.Status != "ready" {
		t.Fatalf("summary = %+v", summary)
	}

	summary, err = svc.SaveProjectThumbnailSnapshot(ctx, SaveProjectThumbnailSnapshotInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		ContentType: "image/png",
		Data:        []byte("second"),
		Width:       320,
		Height:      180,
		Revision:    2,
	})
	if err != nil {
		t.Fatalf("second SaveProjectThumbnailSnapshot returned error: %v", err)
	}
	if summary.URL != "/api/v1/projects/"+project.ID+"/thumbnail?revision=2" || summary.Width != 320 || summary.Height != 180 {
		t.Fatalf("updated summary = %+v", summary)
	}

	snapshot, err := svc.GetProjectThumbnailSnapshot(ctx, owner.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectThumbnailSnapshot returned error: %v", err)
	}
	if snapshot.ContentType != "image/png" || string(snapshot.Data) != "second" || snapshot.Revision != 2 {
		t.Fatalf("stored snapshot = %+v", snapshot)
	}

	_, err = svc.SaveProjectThumbnailSnapshot(ctx, SaveProjectThumbnailSnapshotInput{
		OwnerUserID: other.ID,
		ProjectID:   project.ID,
		ContentType: "image/png",
		Data:        []byte("other"),
		Width:       320,
		Height:      180,
		Revision:    3,
	})
	if !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("cross-owner SaveProjectThumbnailSnapshot error = %v, want ErrProjectNotFound", err)
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

func TestGetProjectModelSourceReturnsOwnedSourceBytes(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(t)
	user, project := createTestProjectForModel(t, svc, ctx)
	sourceData := []byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;")

	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "bracket.step",
		ContentType: "application/step",
		Data:        sourceData,
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}

	source, err := svc.GetProjectModelSource(ctx, user.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("GetProjectModelSource returned error: %v", err)
	}
	if source.Model.ID != model.ID || source.Model.ProjectID != project.ID {
		t.Fatalf("source model = %+v, want uploaded model", source.Model)
	}
	if string(source.Data) != string(sourceData) {
		t.Fatalf("source data = %q, want original upload", string(source.Data))
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

func TestUploadProjectModelMarksInvalidLiteCADFeatureDSLError(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)

	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "broken-litecad.lcad.json",
		ContentType: "application/json",
		Data:        []byte("{not-json"),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	if model.Format != "lcad" || model.ParseStatus != "error" {
		t.Fatalf("model = %+v", model)
	}
	if model.ParseError == "" {
		t.Fatal("model should record a parse error")
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
