package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestAddProjectCADModelBoxUnionPersistsFeatureOperation(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	owner, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, owner.ID, project.ID, "bracket.step")

	box := CADBoxFeature{
		Origin: [3]float64{2, -1, 4},
		Size:   [3]float64{8, 6, 3},
	}
	document, err := svc.AddProjectCADModelBoxUnion(ctx, AddProjectCADModelBoxUnionInput{
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ModelID:          model.ID,
		Box:              box,
		ExpectedRevision: 1,
	})
	if err != nil {
		t.Fatalf("AddProjectCADModelBoxUnion returned error: %v", err)
	}
	if document.Revision != 2 {
		t.Fatalf("document revision = %d, want 2 after feature edit", document.Revision)
	}
	if len(document.Operations) != 1 {
		t.Fatalf("document operations = %+v, want one box-union operation", document.Operations)
	}
	operation := document.Operations[0]
	if operation.Type != "box-union" || operation.ModelID != model.ID {
		t.Fatalf("operation identity = %+v, want box-union for model", operation)
	}
	if operation.Box == nil || operation.Box.Origin != box.Origin || operation.Box.Size != box.Size {
		t.Fatalf("operation box = %+v, want %+v", operation.Box, box)
	}

	reloaded, err := svc.GetProjectCADDocument(ctx, owner.ID, project.ID)
	if err != nil {
		t.Fatalf("reload GetProjectCADDocument returned error: %v", err)
	}
	if reloaded.Revision != 2 || len(reloaded.Operations) != 1 || reloaded.Operations[0].Box == nil {
		t.Fatalf("reloaded document = %+v, want persisted box-union operation", reloaded)
	}
	operationJSON, err := json.Marshal(reloaded.Operations[0])
	if err != nil {
		t.Fatalf("marshal operation: %v", err)
	}
	if strings.Contains(string(operationJSON), "transform") {
		t.Fatalf("box-union operation JSON = %s, should not include transform payload", operationJSON)
	}
}

func TestAddProjectCADModelBoxUnionRejectsInvalidFeature(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "bracket.step")

	_, err := svc.AddProjectCADModelBoxUnion(ctx, AddProjectCADModelBoxUnionInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		ModelID:     model.ID,
		Box: CADBoxFeature{
			Origin: [3]float64{0, 0, 0},
			Size:   [3]float64{10, 0, 10},
		},
		ExpectedRevision: 1,
	})
	if !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("AddProjectCADModelBoxUnion error = %v, want ErrInvalidCADDocumentInput", err)
	}
}
