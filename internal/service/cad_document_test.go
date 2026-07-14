package service

import (
	"context"
	"encoding/json"
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
	if document.SchemaVersion != 3 || document.Unit != "millimetre" {
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
	if document.Assembly.ID != "assembly_"+project.ID || document.Assembly.Name != project.Name || len(document.Assembly.Occurrences) != 1 {
		t.Fatalf("document assembly = %+v, want one project assembly occurrence", document.Assembly)
	}
	occurrence := document.Assembly.Occurrences[0]
	if occurrence.ID != "occurrence_"+model.ID || occurrence.NodeID != document.Nodes[0].ID || occurrence.ModelID != model.ID || occurrence.ModelRevisionID != model.CurrentRevisionID {
		t.Fatalf("document occurrence = %+v, want uploaded model binding", occurrence)
	}
	if occurrence.Transform.Matrix != identityCADTransform().Matrix {
		t.Fatalf("document occurrence transform = %+v, want identity", occurrence.Transform.Matrix)
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

func TestGetProjectCADDocumentCreatesOneOccurrencePerModel(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	first := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "first.step")
	second := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "second.step")

	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	if len(document.Assembly.Occurrences) != 2 {
		t.Fatalf("assembly occurrences = %+v, want two", document.Assembly.Occurrences)
	}
	for index, model := range []ProjectModel{first, second} {
		occurrence := document.Assembly.Occurrences[index]
		if occurrence.ID != "occurrence_"+model.ID || occurrence.ModelID != model.ID || occurrence.ModelRevisionID != model.CurrentRevisionID {
			t.Fatalf("assembly occurrence %d = %+v, want model %+v", index, occurrence, model)
		}
	}
}

func TestGetProjectCADDocumentPreservesExistingV2OccurrenceIdentityAndDuplicates(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "fixture.step")
	firstTransform := identityCADTransform()
	firstTransform.Matrix[3] = 12
	secondTransform := identityCADTransform()
	secondTransform.Matrix[7] = -8
	node := cadDocumentNodeFromModel(model)
	state := cadDocumentState{
		Unit: "millimetre",
		Assembly: CADAssembly{
			ID:   "assembly_" + project.ID,
			Name: project.Name,
			Occurrences: []CADAssemblyOccurrence{
				{
					ID: "occurrence_existing_left", NodeID: "node_" + model.ID, ModelID: model.ID,
					ModelRevisionID: model.CurrentRevisionID, Name: "Fixture left", Transform: firstTransform,
				},
				{
					ID: "occurrence_existing_right", NodeID: "node_" + model.ID, ModelID: model.ID,
					ModelRevisionID: model.CurrentRevisionID, Name: "Fixture right", Suppressed: true, Transform: secondTransform,
				},
			},
		},
		Nodes: []CADDocumentNode{node},
	}
	documentJSON, err := json.Marshal(state)
	if err != nil {
		t.Fatalf("marshal schema v2 document: %v", err)
	}
	stored := entity.ProjectCADDocument{
		ID: "doc_existing_v2", ProjectID: project.ID, SchemaVersion: 2, Revision: 7, DocumentJSON: documentJSON,
	}
	if err := svc.DB().Create(&stored).Error; err != nil {
		t.Fatalf("create schema v2 CAD document: %v", err)
	}

	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	if document.SchemaVersion != 3 || document.Revision != 8 || len(document.Assembly.Occurrences) != 2 {
		t.Fatalf("synced document schema/revision/occurrences = %d/%d/%d, want 3/8/2", document.SchemaVersion, document.Revision, len(document.Assembly.Occurrences))
	}
	left, right := document.Assembly.Occurrences[0], document.Assembly.Occurrences[1]
	if left.ID != "occurrence_existing_left" || left.Name != "Fixture left" || left.Transform != firstTransform {
		t.Fatalf("left occurrence = %+v, want preserved identity and placement", left)
	}
	if right.ID != "occurrence_existing_right" || right.Name != "Fixture right" || !right.Suppressed || right.Transform != secondTransform {
		t.Fatalf("right occurrence = %+v, want preserved identity, suppression, and placement", right)
	}
}

func TestGetProjectCADDocumentUpgradesV1TransformToAssemblyOccurrence(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "legacy.step")
	legacyTransform := CADTransform{Matrix: [16]float64{
		1, 0, 0, 24,
		0, 1, 0, -6,
		0, 0, 1, 3,
		0, 0, 0, 1,
	}}
	legacyJSON, err := json.Marshal(cadDocumentState{
		Unit: "millimetre",
		Nodes: []CADDocumentNode{
			{
				ID:              "node_" + model.ID,
				ModelID:         model.ID,
				ModelRevisionID: model.CurrentRevisionID,
				SourceModelID:   model.ID,
				Name:            model.OriginalFilename,
				SourceFormat:    model.Format,
				Transform:       legacyTransform,
			},
			{
				ID:            "node_" + model.ID + "_component_1",
				SourceModelID: model.ID,
				ParentNodeID:  "node_" + model.ID,
				Name:          "Legacy component",
				SourceFormat:  "step-component",
				Transform:     identityCADTransform(),
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal legacy document: %v", err)
	}
	legacy := entity.ProjectCADDocument{
		ID:            "doc_legacy",
		ProjectID:     project.ID,
		SchemaVersion: 1,
		Revision:      4,
		DocumentJSON:  legacyJSON,
	}
	if err := svc.DB().Create(&legacy).Error; err != nil {
		t.Fatalf("create legacy CAD document: %v", err)
	}

	upgraded, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("upgrade GetProjectCADDocument returned error: %v", err)
	}
	if upgraded.SchemaVersion != 3 || upgraded.Revision != 5 {
		t.Fatalf("upgraded document schema/revision = %d/%d, want 3/5", upgraded.SchemaVersion, upgraded.Revision)
	}
	if len(upgraded.Assembly.Occurrences) != 1 || upgraded.Assembly.Occurrences[0].Transform.Matrix != legacyTransform.Matrix {
		t.Fatalf("upgraded assembly = %+v, want preserved legacy transform", upgraded.Assembly)
	}
	if upgraded.Nodes[0].Transform.Matrix != legacyTransform.Matrix {
		t.Fatalf("public compatibility node transform = %+v, want occurrence projection", upgraded.Nodes[0].Transform.Matrix)
	}
	if len(upgraded.Nodes) != 2 || upgraded.Nodes[1].ParentNodeID != upgraded.Nodes[0].ID || upgraded.Nodes[1].Name != "Legacy component" {
		t.Fatalf("upgraded nodes = %+v, want preserved component child", upgraded.Nodes)
	}

	reloaded, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("reload upgraded document returned error: %v", err)
	}
	if reloaded.Revision != upgraded.Revision {
		t.Fatalf("reloaded revision = %d, want stable upgraded revision %d", reloaded.Revision, upgraded.Revision)
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
