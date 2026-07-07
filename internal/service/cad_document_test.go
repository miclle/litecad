package service

import (
	"context"
	"errors"
	"testing"

	"github.com/miclle/litecad/internal/entity"
)

func TestGetProjectCADDocumentCreatesPersistedIdentityDocument(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "bracket.step")

	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	if document.ID == "" || document.ProjectID != project.ID {
		t.Fatalf("document identity = %+v, want project document", document)
	}
	if document.SchemaVersion != 1 || document.Unit != "millimetre" {
		t.Fatalf("document metadata = schema %d unit %q", document.SchemaVersion, document.Unit)
	}
	if document.Revision != 1 {
		t.Fatalf("document revision = %d, want 1", document.Revision)
	}
	if len(document.Nodes) != 1 {
		t.Fatalf("document node count = %d, want 1: %+v", len(document.Nodes), document.Nodes)
	}
	if document.Nodes[0].ModelID != model.ID || document.Nodes[0].Name != "bracket.step" {
		t.Fatalf("document node = %+v, want uploaded model node", document.Nodes[0])
	}
	if document.Nodes[0].Transform.Matrix != identityCADTransform().Matrix {
		t.Fatalf("document node transform = %+v, want identity", document.Nodes[0].Transform.Matrix)
	}
	if len(document.Operations) != 0 {
		t.Fatalf("document operations = %+v, want none", document.Operations)
	}

	reloaded, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("reload GetProjectCADDocument returned error: %v", err)
	}
	if reloaded.ID != document.ID || reloaded.Revision != document.Revision || len(reloaded.Nodes) != 1 {
		t.Fatalf("reloaded document = %+v, want persisted first document", reloaded)
	}

	var stored entity.ProjectCADDocument
	if err := svc.DB().First(&stored, "project_id = ?", project.ID).Error; err != nil {
		t.Fatalf("load stored CAD document: %v", err)
	}
	if len(stored.DocumentJSON) == 0 {
		t.Fatal("stored CAD document should persist serialized document state")
	}
}

func TestGetProjectCADDocumentReturnsEmptyArraysForEmptyProject(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)

	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	if document.Nodes == nil {
		t.Fatal("document nodes should be an empty array, not nil")
	}
	if document.Operations == nil {
		t.Fatal("document operations should be an empty array, not nil")
	}
	if len(document.Nodes) != 0 || len(document.Operations) != 0 {
		t.Fatalf("document = %+v, want empty nodes and operations", document)
	}
}

func TestUpdateProjectCADModelTransformPersistsOperationAndScopesByOwner(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	owner, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, owner.ID, project.ID, "bracket.step")
	other, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Grace",
		Email:    "cad-document-scope@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}

	transform := CADTransform{
		Matrix: [16]float64{
			1, 0, 0, 12.5,
			0, 1, 0, -4,
			0, 0, 1, 8,
			0, 0, 0, 1,
		},
	}
	document, err := svc.UpdateProjectCADModelTransform(ctx, UpdateProjectCADModelTransformInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		ModelID:     model.ID,
		Transform:   transform,
	})
	if err != nil {
		t.Fatalf("UpdateProjectCADModelTransform returned error: %v", err)
	}
	if document.Revision != 2 {
		t.Fatalf("document revision = %d, want 2 after transform edit", document.Revision)
	}
	if len(document.Nodes) != 1 || document.Nodes[0].Transform.Matrix != transform.Matrix {
		t.Fatalf("document nodes = %+v, want updated transform", document.Nodes)
	}
	if len(document.Operations) != 1 {
		t.Fatalf("document operations = %+v, want one transform operation", document.Operations)
	}
	if document.Operations[0].Type != "transform" || document.Operations[0].ModelID != model.ID || document.Operations[0].Transform.Matrix != transform.Matrix {
		t.Fatalf("document operation = %+v, want transform operation for model", document.Operations[0])
	}

	reloaded, err := svc.GetProjectCADDocument(ctx, owner.ID, project.ID)
	if err != nil {
		t.Fatalf("reload GetProjectCADDocument returned error: %v", err)
	}
	if reloaded.Revision != 2 || reloaded.Nodes[0].Transform.Matrix != transform.Matrix || len(reloaded.Operations) != 1 {
		t.Fatalf("reloaded document = %+v, want persisted transform operation", reloaded)
	}

	_, err = svc.UpdateProjectCADModelTransform(ctx, UpdateProjectCADModelTransformInput{
		OwnerUserID: other.ID,
		ProjectID:   project.ID,
		ModelID:     model.ID,
		Transform:   identityCADTransform(),
	})
	if !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("cross-owner UpdateProjectCADModelTransform error = %v, want ErrProjectNotFound", err)
	}
}

func TestUpdateProjectCADModelTransformRejectsInvalidMatrix(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "bracket.step")

	_, err := svc.UpdateProjectCADModelTransform(ctx, UpdateProjectCADModelTransformInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		ModelID:     model.ID,
		Transform: CADTransform{
			Matrix: [16]float64{
				1, 0, 0, 0,
				0, 1, 0, 0,
				0, 0, 1, 0,
				0, 0, 0, 0,
			},
		},
	})
	if !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("UpdateProjectCADModelTransform error = %v, want ErrInvalidCADDocumentInput", err)
	}
}

func uploadTestSTEPModel(t *testing.T, svc *Service, ctx context.Context, ownerUserID, projectID, filename string) ProjectModel {
	t.Helper()
	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: ownerUserID,
		ProjectID:   projectID,
		Filename:    filename,
		ContentType: "application/step",
		Data:        []byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;"),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	return model
}
