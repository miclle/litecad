package service

import (
	"context"
	"github.com/miclle/litecad/internal/entity"
	"testing"
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

func TestGetProjectCADDocumentGroupsStepComponentsUnderSourceModel(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "robot.step",
		ContentType: "application/step",
		Data: []byte(`ISO-10303-21;
HEADER;
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
#1 = PRODUCT('Robot Assembly','Robot Assembly','',(#10));
#2 = PRODUCT('Left Bracket','Left Bracket','',(#10));
#3 = PRODUCT('Right Bracket','Right Bracket','',(#10));
#4 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );
ENDSEC;
END-ISO-10303-21;`),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}

	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	if len(document.Nodes) != 4 {
		t.Fatalf("document nodes = %+v, want source group plus three components", document.Nodes)
	}
	parent := document.Nodes[0]
	if parent.ID != "node_"+model.ID || parent.ModelID != model.ID || parent.ParentNodeID != "" || parent.Name != "robot.step" {
		t.Fatalf("parent node = %+v, want uploaded STEP source group", parent)
	}
	for index, want := range []string{"Robot Assembly", "Left Bracket", "Right Bracket"} {
		node := document.Nodes[index+1]
		if node.ModelID != "" || node.ParentNodeID != parent.ID || node.Name != want || node.SourceFormat != "step-component" {
			t.Fatalf("component node %d = %+v, want child component %q", index, node, want)
		}
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
