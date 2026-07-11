package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/miclle/litecad/internal/entity"
)

func TestCreateProjectParametricArtifactScopesToOwner(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	owner, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-owner@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser owner returned error: %v", err)
	}
	other, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Grace Hopper",
		Email:    "parametric-other@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: owner.ID,
		Name:        "Parametric study",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	artifact, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		Title:       "Shelf bracket generator",
		SourceKind:  "openscad",
		SourceCode:  "width = 50;\ncube([width, 20, 6]);",
		ParameterValues: map[string]any{
			"width": float64(50),
		},
		CompileStatus: "pending",
	})
	if err != nil {
		t.Fatalf("CreateProjectParametricArtifact returned error: %v", err)
	}
	if artifact.ID == "" || artifact.ProjectID != project.ID || artifact.Title != "Shelf bracket generator" {
		t.Fatalf("artifact metadata = %+v", artifact)
	}
	if artifact.ParameterValues["width"] != float64(50) {
		t.Fatalf("artifact parameters = %+v", artifact.ParameterValues)
	}

	if _, err := svc.GetProjectParametricArtifact(ctx, other.ID, project.ID, artifact.ID); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("other user get error = %v, want ErrProjectNotFound", err)
	}
	artifacts, err := svc.ListProjectParametricArtifacts(ctx, owner.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectParametricArtifacts returned error: %v", err)
	}
	if len(artifacts) != 1 || artifacts[0].ID != artifact.ID {
		t.Fatalf("artifacts = %+v, want only %+v", artifacts, artifact)
	}
}

func TestProjectParametricArtifactRejectsInvalidSource(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-invalid@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Invalid source study",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	testCases := []struct {
		name  string
		input CreateProjectParametricArtifactInput
	}{
		{
			name: "unsupported source kind",
			input: CreateProjectParametricArtifactInput{
				OwnerUserID: user.ID,
				ProjectID:   project.ID,
				Title:       "Bad kind",
				SourceKind:  "python",
				SourceCode:  "cube([1, 1, 1]);",
			},
		},
		{
			name: "empty source",
			input: CreateProjectParametricArtifactInput{
				OwnerUserID: user.ID,
				ProjectID:   project.ID,
				Title:       "Empty source",
				SourceKind:  "openscad",
				SourceCode:  "   ",
			},
		},
		{
			name: "oversized source",
			input: CreateProjectParametricArtifactInput{
				OwnerUserID: user.ID,
				ProjectID:   project.ID,
				Title:       "Oversized source",
				SourceKind:  "openscad",
				SourceCode:  strings.Repeat("x", maxProjectParametricArtifactSourceBytes+1),
			},
		},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.CreateProjectParametricArtifact(ctx, tc.input)
			if !errors.Is(err, ErrInvalidProjectParametricArtifactInput) {
				t.Fatalf("CreateProjectParametricArtifact error = %v, want ErrInvalidProjectParametricArtifactInput", err)
			}
		})
	}
}

func TestSaveParametricArtifactCreatesProjectModel(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-save@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Save generated source",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	artifact, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID:     user.ID,
		ProjectID:       project.ID,
		Title:           "Shelf bracket generator",
		SourceKind:      "openscad",
		SourceCode:      "width = 50;\ncube([width, 20, 6]);",
		ParameterValues: map[string]any{"width": float64(50)},
		CompileStatus:   "success",
	})
	if err != nil {
		t.Fatalf("CreateProjectParametricArtifact returned error: %v", err)
	}

	model, err := svc.SaveParametricArtifactAsProjectModel(ctx, SaveParametricArtifactAsProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		ArtifactID:  artifact.ID,
	})
	if err != nil {
		t.Fatalf("SaveParametricArtifactAsProjectModel returned error: %v", err)
	}
	if model.Format != "scad" || model.OriginalFilename != "shelf-bracket-generator-litecad.scad" || model.ContentType != "text/plain; charset=utf-8" {
		t.Fatalf("model = %+v", model)
	}
	if model.ParseStatus != "parsed" {
		t.Fatalf("model parse status = %q", model.ParseStatus)
	}

	source, err := svc.GetProjectModelSource(ctx, user.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("GetProjectModelSource returned error: %v", err)
	}
	if string(source.Data) != artifact.SourceCode {
		t.Fatalf("source = %q, want %q", string(source.Data), artifact.SourceCode)
	}
}

func TestSaveLiteCADFeatureDSLArtifactCreatesProjectModel(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-lcad-save@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Save generated DSL source",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	dslSource := `{
  "version": 1,
  "unit": "millimetre",
  "parameters": {
    "width": { "type": "number", "default": 80, "min": 20, "max": 200 },
    "depth": { "type": "number", "default": 40, "min": 10, "max": 100 }
  },
  "features": [
    { "id": "base", "type": "box", "origin": [0, 0, 0], "size": ["width", "depth", 6] },
    { "id": "mount_hole", "type": "cylinder_cut", "origin": [48, 21, -1], "diameter": 8, "depth": 8 }
  ]
}`
	artifact, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID:     user.ID,
		ProjectID:       project.ID,
		Title:           "Feature DSL bracket",
		SourceKind:      "litecad-feature-dsl",
		SourceCode:      dslSource,
		ParameterValues: map[string]any{"width": float64(96), "depth": float64(42), "unused": float64(999)},
		CompileStatus:   "success",
	})
	if err != nil {
		t.Fatalf("CreateProjectParametricArtifact returned error: %v", err)
	}

	model, err := svc.SaveParametricArtifactAsProjectModel(ctx, SaveParametricArtifactAsProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		ArtifactID:  artifact.ID,
	})
	if err != nil {
		t.Fatalf("SaveParametricArtifactAsProjectModel returned error: %v", err)
	}
	if model.Format != "lcad" || model.OriginalFilename != "feature-dsl-bracket-litecad.lcad.json" || model.ContentType != "application/json" {
		t.Fatalf("model = %+v", model)
	}
	if model.ParseStatus != "parsed" || model.Metadata.AssetType != "lcad" || model.Metadata.SourceKind != "litecad-feature-dsl" || model.Metadata.Schema != "litecad-feature-dsl" {
		t.Fatalf("model metadata = %+v", model.Metadata)
	}
	if model.Metadata.LengthUnit != "millimetre" || model.Metadata.ParameterCount != 2 || model.Metadata.RepresentationCount != 2 {
		t.Fatalf("model metadata counts = %+v", model.Metadata)
	}
	if model.Metadata.ParameterValues["width"] != float64(96) || model.Metadata.ParameterValues["depth"] != float64(42) {
		t.Fatalf("model parameter values = %+v", model.Metadata.ParameterValues)
	}
	if _, ok := model.Metadata.ParameterValues["unused"]; ok {
		t.Fatalf("model parameter values should ignore undeclared parameters: %+v", model.Metadata.ParameterValues)
	}

	source, err := svc.GetProjectModelSource(ctx, user.ID, project.ID, model.ID)
	if err != nil {
		t.Fatalf("GetProjectModelSource returned error: %v", err)
	}
	if string(source.Data) != artifact.SourceCode {
		t.Fatalf("source = %q, want %q", string(source.Data), artifact.SourceCode)
	}
}

func TestCreateLiteCADFeatureDSLArtifactRejectsMalformedSchema(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-lcad-invalid-schema@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Reject invalid generated DSL source",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	_, err = svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID:   user.ID,
		ProjectID:     project.ID,
		Title:         "Invalid feature DSL bracket",
		SourceKind:    "litecad-feature-dsl",
		SourceCode:    `{"version":1,"unit":"millimetre","features":[{"id":"hole","type":"cylinder_cut","origin":[0,0,0],"diameter":8}]}`,
		CompileStatus: "pending",
	})
	if !errors.Is(err, ErrInvalidProjectParametricArtifactInput) {
		t.Fatalf("CreateProjectParametricArtifact error = %v, want ErrInvalidProjectParametricArtifactInput", err)
	}
}

func TestSaveParametricArtifactRejectsFailedCompile(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-save-failed@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Reject failed generated source",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	artifact, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID:   user.ID,
		ProjectID:     project.ID,
		Title:         "Failed bracket generator",
		SourceKind:    "openscad",
		SourceCode:    "cube([10, 10, 10]);",
		CompileStatus: "error",
		CompileError:  "OpenSCAD runtime is not configured",
	})
	if err != nil {
		t.Fatalf("CreateProjectParametricArtifact returned error: %v", err)
	}

	_, err = svc.SaveParametricArtifactAsProjectModel(ctx, SaveParametricArtifactAsProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		ArtifactID:  artifact.ID,
	})
	if !errors.Is(err, ErrInvalidProjectParametricArtifactInput) {
		t.Fatalf("SaveParametricArtifactAsProjectModel error = %v, want ErrInvalidProjectParametricArtifactInput", err)
	}
}

func TestUpdateParametricModelParametersPersistsRevision(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-revision@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Parametric revisions",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	artifact, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID:     user.ID,
		ProjectID:       project.ID,
		Title:           "Adjustable spacer",
		SourceKind:      "openscad",
		SourceCode:      "width = 40;\nheight = 12;\ncentered = true;\ncube([width, height, 6], center = centered);",
		ParameterValues: map[string]any{"width": float64(40), "height": float64(12), "centered": true},
		CompileStatus:   "success",
	})
	if err != nil {
		t.Fatalf("CreateProjectParametricArtifact returned error: %v", err)
	}
	model, err := svc.SaveParametricArtifactAsProjectModel(ctx, SaveParametricArtifactAsProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		ArtifactID:  artifact.ID,
	})
	if err != nil {
		t.Fatalf("SaveParametricArtifactAsProjectModel returned error: %v", err)
	}

	updated, err := svc.UpdateParametricModelParameters(ctx, UpdateParametricModelParametersInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		ModelID:     model.ID,
		ParameterValues: map[string]any{
			"width":    float64(72),
			"centered": false,
		},
	})
	if err != nil {
		t.Fatalf("UpdateParametricModelParameters returned error: %v", err)
	}
	if updated.Metadata.ParameterValues["width"] != float64(72) || updated.Metadata.ParameterValues["height"] != float64(12) || updated.Metadata.ParameterValues["centered"] != false {
		t.Fatalf("updated parameter metadata = %+v", updated.Metadata.ParameterValues)
	}

	var revisions []entity.ProjectParametricRevision
	if err := svc.db.WithContext(ctx).Where("project_id = ? AND model_id = ?", project.ID, model.ID).Find(&revisions).Error; err != nil {
		t.Fatalf("load revisions: %v", err)
	}
	if len(revisions) != 1 {
		t.Fatalf("revision count = %d, want 1", len(revisions))
	}
	if revisions[0].SourceChecksum == "" {
		t.Fatal("revision should store source checksum")
	}
	var revisionValues map[string]any
	if err := json.Unmarshal(revisions[0].ParameterValuesJSON, &revisionValues); err != nil {
		t.Fatalf("decode revision parameter values: %v", err)
	}
	if revisionValues["width"] != float64(72) || revisionValues["height"] != float64(12) || revisionValues["centered"] != false {
		t.Fatalf("revision parameter values = %+v", revisionValues)
	}
}

func TestUpdateLiteCADFeatureDSLModelParametersPersistsRevision(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-lcad-revision@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "LiteCAD DSL revisions",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	artifact, err := svc.CreateProjectParametricArtifact(ctx, CreateProjectParametricArtifactInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Adjustable DSL spacer",
		SourceKind:  "litecad-feature-dsl",
		SourceCode: `{
  "version": 1,
  "unit": "millimetre",
  "parameters": {
    "width": { "type": "number", "default": 40 },
    "height": { "type": "number", "default": 6 }
  },
  "features": [
    { "id": "base", "type": "box", "origin": [0, 0, 0], "size": ["width", 12, "height"] }
  ]
}`,
		ParameterValues: map[string]any{"width": float64(40), "height": float64(6)},
		CompileStatus:   "success",
	})
	if err != nil {
		t.Fatalf("CreateProjectParametricArtifact returned error: %v", err)
	}
	model, err := svc.SaveParametricArtifactAsProjectModel(ctx, SaveParametricArtifactAsProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		ArtifactID:  artifact.ID,
	})
	if err != nil {
		t.Fatalf("SaveParametricArtifactAsProjectModel returned error: %v", err)
	}

	updated, err := svc.UpdateParametricModelParameters(ctx, UpdateParametricModelParametersInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		ModelID:     model.ID,
		ParameterValues: map[string]any{
			"width":  float64(72),
			"height": float64(12),
		},
	})
	if err != nil {
		t.Fatalf("UpdateParametricModelParameters returned error: %v", err)
	}
	if updated.Metadata.ParameterValues["width"] != float64(72) || updated.Metadata.ParameterValues["height"] != float64(12) {
		t.Fatalf("updated parameter metadata = %+v", updated.Metadata.ParameterValues)
	}

	var revisions []entity.ProjectParametricRevision
	if err := svc.db.WithContext(ctx).Where("project_id = ? AND model_id = ?", project.ID, model.ID).Find(&revisions).Error; err != nil {
		t.Fatalf("load revisions: %v", err)
	}
	if len(revisions) != 1 || revisions[0].SourceChecksum == "" {
		t.Fatalf("revisions = %+v", revisions)
	}
}
