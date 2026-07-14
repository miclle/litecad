package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/miclle/litecad/internal/entity"
)

const featureDSLGraphInitialSource = `{
  "version": 1,
  "unit": "millimetre",
  "parameters": {
    "width": { "type": "number", "default": 40 }
  },
  "features": [
    { "id": "base", "type": "box", "origin": [0, 0, 0], "size": ["width", 20, 6] }
  ]
}`

const featureDSLGraphUpdatedSource = `{
  "version": 1,
  "unit": "millimetre",
  "parameters": {
    "width": { "type": "number", "default": 40 }
  },
  "features": [
    { "id": "base", "type": "box", "origin": [0, 0, 0], "size": ["width", 24, 6] },
    { "id": "slot", "type": "box_cut", "origin": [10, 4, 0], "size": [8, 12, 6] }
  ]
}`

func TestUpdateLiteCADFeatureGraphPersistsReversibleNodeTransitions(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	owner, project, model := createFeatureDSLGraphTestModel(t, svc, ctx, "graph-history@example.com", featureDSLGraphInitialSource)
	initialRevisionID := model.CurrentRevisionID

	updated, err := svc.UpdateLiteCADFeatureGraph(ctx, UpdateLiteCADFeatureGraphInput{
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ModelID:          model.ID,
		SourceCode:       featureDSLGraphUpdatedSource,
		ExpectedRevision: projectCADRevision(t, svc, ctx, owner.ID, project.ID),
	})
	if err != nil {
		t.Fatalf("UpdateLiteCADFeatureGraph returned error: %v", err)
	}
	if updated.CurrentRevisionID == initialRevisionID || updated.RevisionSequence != 2 {
		t.Fatalf("updated revision = %q/%d, want new sequence 2 after %q", updated.CurrentRevisionID, updated.RevisionSequence, initialRevisionID)
	}
	if updated.Metadata.RepresentationCount != 2 {
		t.Fatalf("updated representation count = %d, want 2", updated.Metadata.RepresentationCount)
	}
	if updated.Metadata.ParameterValues["width"] != float64(55) {
		t.Fatalf("updated parameter values = %+v, want current width 55 preserved", updated.Metadata.ParameterValues)
	}

	source, err := svc.GetProjectModelSource(ctx, owner.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("GetProjectModelSource after update returned error: %v", err)
	}
	if string(source.Data) != strings.TrimSpace(featureDSLGraphUpdatedSource) {
		t.Fatalf("updated source = %q", source.Data)
	}
	revisions, err := svc.ListProjectModelRevisions(ctx, owner.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("ListProjectModelRevisions returned error: %v", err)
	}
	if len(revisions) != 2 || !revisions[0].IsCurrent || revisions[0].Summary != "Updated Feature DSL graph" {
		t.Fatalf("revisions = %+v, want current graph revision followed by initial revision", revisions)
	}

	history, err := svc.ListProjectCADHistory(ctx, owner.ID, project.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListProjectCADHistory returned error: %v", err)
	}
	if len(history.Entries) != 1 || history.Entries[0].CommandType != "feature-graph-change" {
		t.Fatalf("history entries = %+v, want one feature-graph-change", history.Entries)
	}
	wantTransitions := []CADFeatureGraphNodeTransition{
		{NodeID: "base", Change: "updated", BeforeType: "box", AfterType: "box"},
		{NodeID: "slot", Change: "added", AfterType: "box_cut"},
	}
	if !equalFeatureGraphTransitions(history.Entries[0].FeatureGraphTransitions, wantTransitions) {
		t.Fatalf("public transitions = %+v, want %+v", history.Entries[0].FeatureGraphTransitions, wantTransitions)
	}

	var storedEntry entity.ProjectCADHistoryEntry
	if err := svc.db.WithContext(ctx).First(&storedEntry, "id = ?", history.Entries[0].ID).Error; err != nil {
		t.Fatalf("load stored graph history entry: %v", err)
	}
	var command cadFeatureGraphHistoryCommand
	if err := json.Unmarshal(storedEntry.CommandJSON, &command); err != nil {
		t.Fatalf("decode stored graph history command: %v", err)
	}
	if command.ModelID != model.ID || command.BeforeRevisionID != initialRevisionID || command.AfterRevisionID != updated.CurrentRevisionID {
		t.Fatalf("stored graph history command = %+v", command)
	}
	if !equalFeatureGraphTransitions(command.NodeTransitions, wantTransitions) {
		t.Fatalf("stored transitions = %+v, want %+v", command.NodeTransitions, wantTransitions)
	}

	document, err := svc.GetProjectCADDocument(ctx, owner.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("UndoProjectCADDocument returned error: %v", err)
	}
	assertFeatureDSLGraphSource(t, svc, ctx, owner.ID, project.ID, model.ID, featureDSLGraphInitialSource, initialRevisionID, 1)

	_, err = svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ExpectedRevision: undone.Revision,
	})
	if err != nil {
		t.Fatalf("RedoProjectCADDocument returned error: %v", err)
	}
	assertFeatureDSLGraphSource(t, svc, ctx, owner.ID, project.ID, model.ID, featureDSLGraphUpdatedSource, updated.CurrentRevisionID, 2)
}

func TestUpdateLiteCADFeatureGraphRejectsInvalidTransitionsAndAccess(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	owner, project, model := createFeatureDSLGraphTestModel(t, svc, ctx, "graph-validation@example.com", featureDSLGraphInitialSource)
	other, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Grace Hopper",
		Email:    "graph-validation-other@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}
	revision := projectCADRevision(t, svc, ctx, owner.ID, project.ID)

	tests := []struct {
		name       string
		ownerID    string
		modelID    string
		sourceCode string
		revision   int
		wantErr    error
	}{
		{
			name:       "unchanged graph",
			ownerID:    owner.ID,
			modelID:    model.ID,
			sourceCode: featureDSLGraphInitialSource,
			revision:   revision,
			wantErr:    ErrInvalidProjectParametricArtifactInput,
		},
		{
			name:       "invalid source",
			ownerID:    owner.ID,
			modelID:    model.ID,
			sourceCode: `{"version":1,"unit":"millimetre","features":[]}`,
			revision:   revision,
			wantErr:    ErrInvalidProjectParametricArtifactInput,
		},
		{
			name:       "duplicate node ids",
			ownerID:    owner.ID,
			modelID:    model.ID,
			sourceCode: strings.Replace(featureDSLGraphUpdatedSource, `"id": "slot"`, `"id": "base"`, 1),
			revision:   revision,
			wantErr:    ErrInvalidProjectParametricArtifactInput,
		},
		{
			name:       "parameter schema changed with graph",
			ownerID:    owner.ID,
			modelID:    model.ID,
			sourceCode: strings.Replace(featureDSLGraphUpdatedSource, `"default": 40`, `"default": 42`, 1),
			revision:   revision,
			wantErr:    ErrInvalidProjectParametricArtifactInput,
		},
		{
			name:       "stale document revision",
			ownerID:    owner.ID,
			modelID:    model.ID,
			sourceCode: featureDSLGraphUpdatedSource,
			revision:   revision + 1,
			wantErr:    ErrCADDocumentConflict,
		},
		{
			name:       "foreign owner",
			ownerID:    other.ID,
			modelID:    model.ID,
			sourceCode: featureDSLGraphUpdatedSource,
			revision:   revision,
			wantErr:    ErrProjectNotFound,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.UpdateLiteCADFeatureGraph(ctx, UpdateLiteCADFeatureGraphInput{
				OwnerUserID:      tc.ownerID,
				ProjectID:        project.ID,
				ModelID:          tc.modelID,
				SourceCode:       tc.sourceCode,
				ExpectedRevision: tc.revision,
			})
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("UpdateLiteCADFeatureGraph error = %v, want %v", err, tc.wantErr)
			}
		})
	}

	openSCADArtifact, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID:     owner.ID,
		ProjectID:       project.ID,
		Title:           "OpenSCAD graph rejection",
		SourceKind:      "openscad",
		SourceCode:      "width = 40;\ncube([width, 20, 6]);",
		ParameterValues: map[string]any{"width": float64(40)},
		CompileStatus:   "success",
	})
	if err != nil {
		t.Fatalf("CreateProjectParametricArtifact OpenSCAD returned error: %v", err)
	}
	openSCADModel, err := svc.SaveParametricArtifactAsProjectModel(ctx, SaveParametricArtifactAsProjectModelInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		ArtifactID:  openSCADArtifact.ID,
	})
	if err != nil {
		t.Fatalf("SaveParametricArtifactAsProjectModel OpenSCAD returned error: %v", err)
	}
	_, err = svc.UpdateLiteCADFeatureGraph(ctx, UpdateLiteCADFeatureGraphInput{
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ModelID:          openSCADModel.ID,
		SourceCode:       featureDSLGraphUpdatedSource,
		ExpectedRevision: projectCADRevision(t, svc, ctx, owner.ID, project.ID),
	})
	if !errors.Is(err, ErrInvalidProjectParametricArtifactInput) {
		t.Fatalf("UpdateLiteCADFeatureGraph OpenSCAD error = %v, want ErrInvalidProjectParametricArtifactInput", err)
	}
}

func TestCreateProjectParametricArtifactRejectsDuplicateFeatureGraphNodeIDs(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	owner, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "graph-duplicate-create@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: owner.ID, Name: "Duplicate graph IDs"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	_, err = svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID:   owner.ID,
		ProjectID:     project.ID,
		Title:         "Duplicate graph IDs",
		SourceKind:    "litecad-feature-dsl",
		SourceCode:    strings.Replace(featureDSLGraphUpdatedSource, `"id": "slot"`, `"id": "base"`, 1),
		CompileStatus: "success",
	})
	if !errors.Is(err, ErrInvalidProjectParametricArtifactInput) {
		t.Fatalf("CreateProjectParametricArtifact error = %v, want ErrInvalidProjectParametricArtifactInput", err)
	}
}

func createFeatureDSLGraphTestModel(
	t *testing.T,
	svc *Service,
	ctx context.Context,
	email string,
	sourceCode string,
) (AuthUser, Project, ProjectModel) {
	t.Helper()
	owner, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    email,
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: owner.ID, Name: "Feature graph history"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	artifact, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID:     owner.ID,
		ProjectID:       project.ID,
		Title:           "Graph bracket",
		SourceKind:      "litecad-feature-dsl",
		SourceCode:      sourceCode,
		ParameterValues: map[string]any{"width": float64(55)},
		CompileStatus:   "success",
	})
	if err != nil {
		t.Fatalf("CreateProjectParametricArtifact returned error: %v", err)
	}
	model, err := svc.SaveParametricArtifactAsProjectModel(ctx, SaveParametricArtifactAsProjectModelInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		ArtifactID:  artifact.ID,
	})
	if err != nil {
		t.Fatalf("SaveParametricArtifactAsProjectModel returned error: %v", err)
	}
	return owner, project, model
}

func assertFeatureDSLGraphSource(
	t *testing.T,
	svc *Service,
	ctx context.Context,
	ownerUserID string,
	projectID string,
	modelID string,
	wantSource string,
	wantRevisionID string,
	wantRevisionSequence int,
) {
	t.Helper()
	source, err := svc.GetProjectModelSource(ctx, ownerUserID, projectID, modelID)
	if err != nil {
		t.Fatalf("GetProjectModelSource returned error: %v", err)
	}
	if string(source.Data) != strings.TrimSpace(wantSource) {
		t.Fatalf("source after history move = %q, want %q", source.Data, strings.TrimSpace(wantSource))
	}
	if source.Model.CurrentRevisionID != wantRevisionID || source.Model.RevisionSequence != wantRevisionSequence {
		t.Fatalf("revision after history move = %q/%d, want %q/%d", source.Model.CurrentRevisionID, source.Model.RevisionSequence, wantRevisionID, wantRevisionSequence)
	}
}

func equalFeatureGraphTransitions(got, want []CADFeatureGraphNodeTransition) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		if got[index] != want[index] {
			return false
		}
	}
	return true
}
