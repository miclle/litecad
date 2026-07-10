package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
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

func TestUpdateProjectCADNodeTransformPersistsChildNodeOperation(t *testing.T) {
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
#3 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );
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
	childNodeID := "node_" + model.ID + "_component_2"
	transform := CADTransform{
		Matrix: [16]float64{
			1, 0, 0, 5,
			0, 1, 0, 6,
			0, 0, 1, 7,
			0, 0, 0, 1,
		},
	}

	updated, err := svc.UpdateProjectCADNodeTransform(ctx, UpdateProjectCADNodeTransformInput{
		OwnerUserID:      user.ID,
		ProjectID:        project.ID,
		NodeID:           childNodeID,
		Transform:        transform,
		ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("UpdateProjectCADNodeTransform returned error: %v", err)
	}
	if updated.Revision != document.Revision+1 {
		t.Fatalf("updated revision = %d, want %d", updated.Revision, document.Revision+1)
	}
	var childNode, parentNode CADDocumentNode
	for _, node := range updated.Nodes {
		if node.ID == childNodeID {
			childNode = node
		}
		if node.ID == "node_"+model.ID {
			parentNode = node
		}
	}
	if childNode.Transform.Matrix != transform.Matrix {
		t.Fatalf("child node transform = %+v, want %+v", childNode.Transform.Matrix, transform.Matrix)
	}
	if parentNode.Transform.Matrix != identityCADTransform().Matrix {
		t.Fatalf("parent node transform = %+v, want identity", parentNode.Transform.Matrix)
	}
	if len(updated.Operations) != 1 || updated.Operations[0].NodeID != childNodeID || updated.Operations[0].ModelID != model.ID {
		t.Fatalf("operations = %+v, want node-scoped transform operation", updated.Operations)
	}
}

func TestDeleteProjectCADNodeRemovesChildNodeAndPersistsDeletion(t *testing.T) {
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
	childNodeID := "node_" + model.ID + "_component_2"

	updated, err := svc.DeleteProjectCADNode(ctx, DeleteProjectCADNodeInput{
		OwnerUserID:      user.ID,
		ProjectID:        project.ID,
		NodeID:           childNodeID,
		ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("DeleteProjectCADNode returned error: %v", err)
	}
	if updated.Revision != document.Revision+1 {
		t.Fatalf("updated revision = %d, want %d", updated.Revision, document.Revision+1)
	}
	for _, node := range updated.Nodes {
		if node.ID == childNodeID {
			t.Fatalf("deleted node %q still present in document nodes: %+v", childNodeID, updated.Nodes)
		}
	}
	if len(updated.Operations) != 1 || updated.Operations[0].Type != "delete-node" || updated.Operations[0].NodeID != childNodeID || updated.Operations[0].ModelID != model.ID {
		t.Fatalf("operations = %+v, want node-scoped delete operation", updated.Operations)
	}

	reloaded, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument after delete returned error: %v", err)
	}
	for _, node := range reloaded.Nodes {
		if node.ID == childNodeID {
			t.Fatalf("deleted node %q was re-created by document sync: %+v", childNodeID, reloaded.Nodes)
		}
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
		OwnerUserID:      owner.ID,
		ProjectID:        project.ID,
		ModelID:          model.ID,
		Transform:        transform,
		ExpectedRevision: 1,
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
	if document.Operations[0].Type != "transform" || document.Operations[0].ModelID != model.ID || document.Operations[0].Transform == nil || document.Operations[0].Transform.Matrix != transform.Matrix {
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
		OwnerUserID:      other.ID,
		ProjectID:        project.ID,
		ModelID:          model.ID,
		Transform:        identityCADTransform(),
		ExpectedRevision: document.Revision,
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
		ExpectedRevision: 1,
	})
	if !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("UpdateProjectCADModelTransform error = %v, want ErrInvalidCADDocumentInput", err)
	}
}

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
