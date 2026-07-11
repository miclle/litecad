package service

import (
	"context"
	"errors"
	"strings"
	"testing"
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
