package service

import (
	"context"
	"errors"
	"testing"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
)

func TestUploadProjectModelCreatesInitialRevision(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, err := svc.RegisterUser(ctx, RegisterUserInput{Name: "Revision Owner", Email: "revision-upload@example.com", Password: "correct-horse-battery"})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Versioned upload"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "cube.stl",
		ContentType: "model/stl",
		Data:        []byte("solid cube\nendsolid cube\n"),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	if model.CurrentRevisionID == "" || model.RevisionSequence != 1 {
		t.Fatalf("model revision = %q/%d, want revision 1", model.CurrentRevisionID, model.RevisionSequence)
	}

	var revision entity.ProjectModelRevision
	if err := svc.db.WithContext(ctx).First(&revision, "id = ?", model.CurrentRevisionID).Error; err != nil {
		t.Fatalf("load initial revision: %v", err)
	}
	if revision.ModelID != model.ID || revision.Sequence != 1 || string(revision.SourceData) != "solid cube\nendsolid cube\n" || revision.ContentChecksum == "" {
		t.Fatalf("initial revision = %+v", revision)
	}
}

func TestSaveParametricArtifactAsProjectModelCreatesInitialRevision(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, err := svc.RegisterUser(ctx, RegisterUserInput{Name: "Revision Owner", Email: "revision-generated@example.com", Password: "correct-horse-battery"})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Versioned generated model"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	artifact, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID:   user.ID,
		ProjectID:     project.ID,
		Title:         "Generated box",
		SourceKind:    projectParametricSourceKindLiteCADDSL,
		SourceCode:    `{"version":1,"unit":"millimetre","features":[{"id":"base","type":"box","origin":[0,0,0],"size":[10,10,10]}]}`,
		CompileStatus: "success",
	})
	if err != nil {
		t.Fatalf("CreateProjectParametricArtifact returned error: %v", err)
	}

	model, err := svc.SaveParametricArtifactAsProjectModel(ctx, SaveParametricArtifactAsProjectModelInput{OwnerUserID: user.ID, ProjectID: project.ID, ArtifactID: artifact.ID})
	if err != nil {
		t.Fatalf("SaveParametricArtifactAsProjectModel returned error: %v", err)
	}
	if model.CurrentRevisionID == "" || model.RevisionSequence != 1 {
		t.Fatalf("model revision = %q/%d, want revision 1", model.CurrentRevisionID, model.RevisionSequence)
	}
}

func TestListProjectModelsBackfillsInitialRevisionOnce(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, err := svc.RegisterUser(ctx, RegisterUserInput{Name: "Revision Owner", Email: "revision-backfill@example.com", Password: "correct-horse-battery"})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Legacy model"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	modelID, err := id.NewPrefixed("mdl")
	if err != nil {
		t.Fatalf("create model id: %v", err)
	}
	legacy := entity.ProjectModel{ID: modelID, ProjectID: project.ID, OriginalFilename: "legacy.stl", Format: "stl", ContentType: "model/stl", ByteSize: 29, ParseStatus: "parsed", SourceData: []byte("solid legacy\nendsolid legacy\n")}
	if err := svc.db.WithContext(ctx).Create(&legacy).Error; err != nil {
		t.Fatalf("create legacy model: %v", err)
	}

	for range 2 {
		models, err := svc.ListProjectModels(ctx, user.ID, project.ID)
		if err != nil {
			t.Fatalf("ListProjectModels returned error: %v", err)
		}
		if len(models) != 1 || models[0].CurrentRevisionID == "" || models[0].RevisionSequence != 1 {
			t.Fatalf("models = %+v, want one backfilled revision", models)
		}
	}
	var count int64
	if err := svc.db.WithContext(ctx).Model(&entity.ProjectModelRevision{}).Where("model_id = ?", modelID).Count(&count).Error; err != nil {
		t.Fatalf("count revisions: %v", err)
	}
	if count != 1 {
		t.Fatalf("revision count = %d, want 1", count)
	}
}

func projectCADRevision(t *testing.T, svc *Service, ctx context.Context, ownerUserID, projectID string) int {
	t.Helper()
	document, err := svc.GetProjectCADDocument(ctx, ownerUserID, projectID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	return document.Revision
}

func TestProjectModelRevisionListAndRestore(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, err := svc.RegisterUser(ctx, RegisterUserInput{Name: "Revision Owner", Email: "revision-restore@example.com", Password: "correct-horse-battery"})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Restore versions"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	artifact, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Title: "Versioned box", SourceKind: projectParametricSourceKindLiteCADDSL,
		SourceCode:      `{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":10}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",10,10]}]}`,
		ParameterValues: map[string]any{"width": float64(10)}, CompileStatus: "success",
	})
	if err != nil {
		t.Fatalf("CreateProjectParametricArtifact returned error: %v", err)
	}
	model, err := svc.SaveParametricArtifactAsProjectModel(ctx, SaveParametricArtifactAsProjectModelInput{OwnerUserID: user.ID, ProjectID: project.ID, ArtifactID: artifact.ID})
	if err != nil {
		t.Fatalf("SaveParametricArtifactAsProjectModel returned error: %v", err)
	}
	updated, err := svc.UpdateParametricModelParameters(ctx, UpdateParametricModelParametersInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: model.ID, ParameterValues: map[string]any{"width": float64(24)},
		ExpectedRevision: projectCADRevision(t, svc, ctx, user.ID, project.ID),
	})
	if err != nil {
		t.Fatalf("UpdateParametricModelParameters returned error: %v", err)
	}

	revisions, err := svc.ListProjectModelRevisions(ctx, user.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("ListProjectModelRevisions returned error: %v", err)
	}
	if len(revisions) != 2 || revisions[0].Sequence != 2 || !revisions[0].IsCurrent || revisions[1].Sequence != 1 || revisions[1].IsCurrent {
		t.Fatalf("revisions = %+v", revisions)
	}
	revisionSource, err := svc.GetProjectModelRevisionSource(ctx, user.ID, project.ID, model.ID, revisions[1].ID)
	if err != nil {
		t.Fatalf("GetProjectModelRevisionSource returned error: %v", err)
	}
	if revisionSource.Revision.ID != revisions[1].ID || string(revisionSource.Data) != artifact.SourceCode {
		t.Fatalf("revision source = %+v / %q, want initial immutable source", revisionSource.Revision, revisionSource.Data)
	}

	expectedRevision := projectCADRevision(t, svc, ctx, user.ID, project.ID)
	restored, err := svc.RestoreProjectModelRevision(ctx, RestoreProjectModelRevisionInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: model.ID, RevisionID: model.CurrentRevisionID, ExpectedRevision: expectedRevision,
	})
	if err != nil {
		t.Fatalf("RestoreProjectModelRevision returned error: %v", err)
	}
	if restored.CurrentRevisionID != model.CurrentRevisionID || restored.RevisionSequence != 1 || restored.Metadata.ParameterValues["width"] != float64(10) {
		t.Fatalf("restored model = %+v", restored)
	}
	_, err = svc.RestoreProjectModelRevision(ctx, RestoreProjectModelRevisionInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: model.ID, RevisionID: updated.CurrentRevisionID, ExpectedRevision: expectedRevision,
	})
	if !errors.Is(err, ErrCADDocumentConflict) {
		t.Fatalf("stale restore error = %v, want ErrCADDocumentConflict", err)
	}
}

func TestCADDocumentNodeTracksModelRevisionThroughUndoRedo(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, err := svc.RegisterUser(ctx, RegisterUserInput{Name: "Revision Owner", Email: "revision-node@example.com", Password: "correct-horse-battery"})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Versioned node"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	artifact, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Title: "Node box", SourceKind: projectParametricSourceKindLiteCADDSL,
		SourceCode:      `{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":10}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",10,10]}]}`,
		ParameterValues: map[string]any{"width": float64(10)}, CompileStatus: "success",
	})
	if err != nil {
		t.Fatalf("CreateProjectParametricArtifact returned error: %v", err)
	}
	model, err := svc.SaveParametricArtifactAsProjectModel(ctx, SaveParametricArtifactAsProjectModelInput{OwnerUserID: user.ID, ProjectID: project.ID, ArtifactID: artifact.ID})
	if err != nil {
		t.Fatalf("SaveParametricArtifactAsProjectModel returned error: %v", err)
	}
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	if len(document.Nodes) != 1 || document.Nodes[0].ModelRevisionID != model.CurrentRevisionID {
		t.Fatalf("initial node = %+v, want revision %q", document.Nodes, model.CurrentRevisionID)
	}
	updated, err := svc.UpdateParametricModelParameters(ctx, UpdateParametricModelParametersInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: model.ID, ParameterValues: map[string]any{"width": float64(20)}, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("UpdateParametricModelParameters returned error: %v", err)
	}
	document, err = svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument after update returned error: %v", err)
	}
	if document.Nodes[0].ModelRevisionID != updated.CurrentRevisionID {
		t.Fatalf("updated node revision = %q, want %q", document.Nodes[0].ModelRevisionID, updated.CurrentRevisionID)
	}
	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: document.Revision})
	if err != nil {
		t.Fatalf("UndoProjectCADDocument returned error: %v", err)
	}
	if undone.Nodes[0].ModelRevisionID != model.CurrentRevisionID {
		t.Fatalf("undone node revision = %q, want %q", undone.Nodes[0].ModelRevisionID, model.CurrentRevisionID)
	}
}
