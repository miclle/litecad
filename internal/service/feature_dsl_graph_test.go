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

const featureDSLGraphDuplicateNestedIDSource = `{
  "version": 1,
  "unit": "millimetre",
  "parameters": {
    "width": { "type": "number", "default": 40 }
  },
  "features": [
    {
      "id": "body",
      "type": "boolean",
      "operation": "subtract",
      "operands": [
        { "id": "blank", "type": "box", "origin": [0, 0, 0], "size": ["width", 20, 6] },
        { "id": "body", "type": "cylinder", "origin": [20, 10, -1], "diameter": 4, "height": 8 }
      ]
    }
  ]
}`

const featureDSLGraphNestedInitialSource = `{
  "version": 1,
  "unit": "millimetre",
  "parameters": {
    "width": { "type": "number", "default": 40 }
  },
  "features": [
    {
      "id": "body",
      "type": "boolean",
      "operation": "subtract",
      "operands": [
        { "id": "blank", "type": "box", "origin": [0, 0, 0], "size": ["width", 20, 6] },
        { "id": "bore", "type": "cylinder", "origin": [20, 10, -1], "diameter": 4, "height": 8 }
      ]
    }
  ]
}`

const featureDSLGraphNestedUpdatedSource = `{
  "version": 1,
  "unit": "millimetre",
  "parameters": {
    "width": { "type": "number", "default": 40 }
  },
  "features": [
    {
      "id": "body",
      "type": "boolean",
      "operation": "subtract",
      "operands": [
        { "id": "blank", "type": "box", "origin": [0, 0, 0], "size": ["width", 20, 6] },
        { "id": "bore", "type": "cylinder", "origin": [20, 10, -1], "diameter": 6, "height": 8 }
      ]
    }
  ]
}`

const featureDSLGraphNestedReorderedSource = `{
  "version": 1,
  "unit": "millimetre",
  "parameters": {
    "width": { "type": "number", "default": 40 }
  },
  "features": [
    {
      "id": "body",
      "type": "boolean",
      "operation": "subtract",
      "operands": [
        { "id": "bore", "type": "cylinder", "origin": [20, 10, -1], "diameter": 6, "height": 8 },
        { "id": "blank", "type": "box", "origin": [0, 0, 0], "size": ["width", 20, 6] }
      ]
    }
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
		{
			NodeID: "base", Change: "updated", BeforeType: "box", AfterType: "box",
			BeforePath: "features/base", AfterPath: "features/base", BeforeIndex: featureGraphIndex(0), AfterIndex: featureGraphIndex(0),
		},
		{NodeID: "slot", Change: "added", AfterType: "box_cut", AfterPath: "features/slot", AfterIndex: featureGraphIndex(1)},
	}
	if history.Entries[0].FeatureGraphVersion != 1 {
		t.Fatalf("public graph version = %d, want 1", history.Entries[0].FeatureGraphVersion)
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
	if command.ModelID != model.ID || command.BeforeRevisionID != initialRevisionID || command.AfterRevisionID != updated.CurrentRevisionID || command.GraphVersion != 1 {
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

func TestUpdateLiteCADFeatureGraphPersistsRecursiveVersionedTransitions(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	owner, project, model := createFeatureDSLGraphTestModel(t, svc, ctx, "graph-recursive-history@example.com", featureDSLGraphNestedInitialSource)
	initialRevisionID := model.CurrentRevisionID

	updated, err := svc.UpdateLiteCADFeatureGraph(ctx, UpdateLiteCADFeatureGraphInput{
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ModelID:          model.ID,
		SourceCode:       featureDSLGraphNestedUpdatedSource,
		ExpectedRevision: projectCADRevision(t, svc, ctx, owner.ID, project.ID),
	})
	if err != nil {
		t.Fatalf("UpdateLiteCADFeatureGraph nested update returned error: %v", err)
	}
	history, err := svc.ListProjectCADHistory(ctx, owner.ID, project.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListProjectCADHistory nested update returned error: %v", err)
	}
	if len(history.Entries) != 1 || history.Entries[0].FeatureGraphVersion != 1 || len(history.Entries[0].FeatureGraphTransitions) != 1 {
		t.Fatalf("nested update history = %+v, want one v1 transition", history.Entries)
	}
	transition := history.Entries[0].FeatureGraphTransitions[0]
	if transition.NodeID != "bore" || transition.Change != "updated" || transition.BeforePath != "features/body/operands/bore" || transition.AfterPath != "features/body/operands/bore" {
		t.Fatalf("nested update transition = %+v", transition)
	}
	if transition.BeforeIndex == nil || *transition.BeforeIndex != 1 || transition.AfterIndex == nil || *transition.AfterIndex != 1 {
		t.Fatalf("nested update indexes = %+v", transition)
	}

	document, err := svc.GetProjectCADDocument(ctx, owner.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument nested update returned error: %v", err)
	}
	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("UndoProjectCADDocument nested update returned error: %v", err)
	}
	assertFeatureDSLGraphSource(t, svc, ctx, owner.ID, project.ID, model.ID, featureDSLGraphNestedInitialSource, initialRevisionID, 1)
	_, err = svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ExpectedRevision: undone.Revision,
	})
	if err != nil {
		t.Fatalf("RedoProjectCADDocument nested update returned error: %v", err)
	}
	assertFeatureDSLGraphSource(t, svc, ctx, owner.ID, project.ID, model.ID, featureDSLGraphNestedUpdatedSource, updated.CurrentRevisionID, 2)

	reordered, err := svc.UpdateLiteCADFeatureGraph(ctx, UpdateLiteCADFeatureGraphInput{
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ModelID:          model.ID,
		SourceCode:       featureDSLGraphNestedReorderedSource,
		ExpectedRevision: projectCADRevision(t, svc, ctx, owner.ID, project.ID),
	})
	if err != nil {
		t.Fatalf("UpdateLiteCADFeatureGraph nested reorder returned error: %v", err)
	}
	history, err = svc.ListProjectCADHistory(ctx, owner.ID, project.ID, 10, 0)
	if err != nil {
		t.Fatalf("ListProjectCADHistory nested reorder returned error: %v", err)
	}
	if len(history.Entries) != 2 || history.Entries[0].FeatureGraphVersion != 1 || len(history.Entries[0].FeatureGraphTransitions) != 2 {
		t.Fatalf("nested reorder history = %+v, want two v1 move transitions", history.Entries)
	}
	for index, wantNodeID := range []string{"bore", "blank"} {
		move := history.Entries[0].FeatureGraphTransitions[index]
		if move.NodeID != wantNodeID || move.Change != "moved" || move.BeforeIndex == nil || move.AfterIndex == nil || *move.BeforeIndex == *move.AfterIndex {
			t.Fatalf("nested reorder transition %d = %+v", index, move)
		}
	}

	document, err = svc.GetProjectCADDocument(ctx, owner.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument nested reorder returned error: %v", err)
	}
	undone, err = svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("UndoProjectCADDocument nested reorder returned error: %v", err)
	}
	assertFeatureDSLGraphSource(t, svc, ctx, owner.ID, project.ID, model.ID, featureDSLGraphNestedUpdatedSource, updated.CurrentRevisionID, 2)
	_, err = svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ExpectedRevision: undone.Revision,
	})
	if err != nil {
		t.Fatalf("RedoProjectCADDocument nested reorder returned error: %v", err)
	}
	assertFeatureDSLGraphSource(t, svc, ctx, owner.ID, project.ID, model.ID, featureDSLGraphNestedReorderedSource, reordered.CurrentRevisionID, 3)
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
			name:       "duplicate nested node ids",
			ownerID:    owner.ID,
			modelID:    model.ID,
			sourceCode: featureDSLGraphDuplicateNestedIDSource,
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

	_, err = svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID:   owner.ID,
		ProjectID:     project.ID,
		Title:         "Duplicate nested graph IDs",
		SourceKind:    "litecad-feature-dsl",
		SourceCode:    featureDSLGraphDuplicateNestedIDSource,
		CompileStatus: "success",
	})
	if !errors.Is(err, ErrInvalidProjectParametricArtifactInput) {
		t.Fatalf("CreateProjectParametricArtifact nested duplicate error = %v, want ErrInvalidProjectParametricArtifactInput", err)
	}

	for name, sourceCode := range map[string]string{
		"surrounding whitespace": strings.Replace(featureDSLGraphInitialSource, `"id": "base"`, `"id": " base "`, 1),
		"non-boolean operands":   strings.Replace(featureDSLGraphInitialSource, `"size": ["width", 20, 6]`, `"size": ["width", 20, 6], "operands": [{"id":"hidden","type":"box","size":[1,1,1]}]`, 1),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
				OwnerUserID:   owner.ID,
				ProjectID:     project.ID,
				Title:         name,
				SourceKind:    "litecad-feature-dsl",
				SourceCode:    sourceCode,
				CompileStatus: "success",
			})
			if !errors.Is(err, ErrInvalidProjectParametricArtifactInput) {
				t.Fatalf("CreateProjectParametricArtifact error = %v, want ErrInvalidProjectParametricArtifactInput", err)
			}
		})
	}
}

func TestParseLiteCADFeatureGraphEscapesStablePathSegments(t *testing.T) {
	source := strings.ReplaceAll(featureDSLGraphNestedInitialSource, `"id": "body"`, `"id": "body/root~v1"`)
	source = strings.Replace(source, `"id": "bore"`, `"id": "bore/primary~"`, 1)
	nodes, _, _, err := parseLiteCADFeatureGraph([]byte(source))
	if err != nil {
		t.Fatalf("parseLiteCADFeatureGraph returned error: %v", err)
	}
	wantPaths := []string{
		"features/body~1root~0v1",
		"features/body~1root~0v1/operands/blank",
		"features/body~1root~0v1/operands/bore~1primary~0",
	}
	for index, wantPath := range wantPaths {
		if nodes[index].Path != wantPath {
			t.Fatalf("nodes[%d].Path = %q, want %q", index, nodes[index].Path, wantPath)
		}
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
		if got[index].NodeID != want[index].NodeID ||
			got[index].Change != want[index].Change ||
			got[index].BeforeType != want[index].BeforeType ||
			got[index].AfterType != want[index].AfterType ||
			got[index].BeforePath != want[index].BeforePath ||
			got[index].AfterPath != want[index].AfterPath ||
			!equalOptionalInt(got[index].BeforeIndex, want[index].BeforeIndex) ||
			!equalOptionalInt(got[index].AfterIndex, want[index].AfterIndex) {
			return false
		}
	}
	return true
}

func equalOptionalInt(left, right *int) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}
