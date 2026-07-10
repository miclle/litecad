package service

import (
	"context"
	"errors"
	"testing"
)

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

func TestDeleteProjectCADNodeRemovesSourceNodeAndChildren(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "source-delete.step",
		ContentType: "application/step",
		Data: []byte(`ISO-10303-21;
HEADER;
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
#1 = PRODUCT('Assembly','Assembly','',(#10));
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
	sourceNodeID := "node_" + model.ID
	childNodeID := sourceNodeID + "_component_2"

	updated, err := svc.DeleteProjectCADNode(ctx, DeleteProjectCADNodeInput{
		OwnerUserID:      user.ID,
		ProjectID:        project.ID,
		NodeID:           sourceNodeID,
		ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("DeleteProjectCADNode returned error: %v", err)
	}
	if documentHasNode(updated, sourceNodeID) || documentHasNode(updated, childNodeID) {
		t.Fatalf("deleted source or child node still present: %+v", updated.Nodes)
	}
	if len(updated.Operations) != 1 || updated.Operations[0].Type != "delete-node" || updated.Operations[0].NodeID != sourceNodeID || updated.Operations[0].ModelID != model.ID {
		t.Fatalf("operations = %+v, want source node delete operation", updated.Operations)
	}

	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID:      user.ID,
		ProjectID:        project.ID,
		ExpectedRevision: updated.Revision,
	})
	if err != nil {
		t.Fatalf("UndoProjectCADDocument returned error: %v", err)
	}
	if !documentHasNode(undone, sourceNodeID) || !documentHasNode(undone, childNodeID) || len(undone.Operations) != 0 {
		t.Fatalf("undone source delete document = %+v", undone)
	}

	redone, err := svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID:      user.ID,
		ProjectID:        project.ID,
		ExpectedRevision: undone.Revision,
	})
	if err != nil {
		t.Fatalf("RedoProjectCADDocument returned error: %v", err)
	}
	if documentHasNode(redone, sourceNodeID) || documentHasNode(redone, childNodeID) || len(redone.Operations) != 1 {
		t.Fatalf("redone source delete document = %+v", redone)
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
