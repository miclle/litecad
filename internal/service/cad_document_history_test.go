package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/miclle/litecad/internal/entity"
	"gorm.io/gorm"
)

func TestProjectCADHistorySummaryUsesUnboundedStorage(t *testing.T) {
	svc := newTestService(t)
	statement := &gorm.Statement{DB: svc.DB()}
	if err := statement.Parse(&entity.ProjectCADHistoryEntry{}); err != nil {
		t.Fatalf("parse CAD history schema: %v", err)
	}
	summaryField := statement.Schema.LookUpField("Summary")
	if summaryField == nil {
		t.Fatal("CAD history summary field was not found")
	}
	if databaseType := string(summaryField.DataType); databaseType != "text" {
		t.Fatalf("history summary database type = %q, want text", databaseType)
	}
}

func TestUpdateProjectCADNodeTransformCreatesHistoryEntry(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "history.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	transform := CADTransform{Matrix: [16]float64{
		1, 0, 0, 15,
		0, 1, 0, -2,
		0, 0, 1, 7,
		0, 0, 0, 1,
	}}

	updated, err := svc.UpdateProjectCADNodeTransform(ctx, UpdateProjectCADNodeTransformInput{
		OwnerUserID:      user.ID,
		ProjectID:        project.ID,
		NodeID:           "node_" + model.ID,
		Transform:        transform,
		ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("UpdateProjectCADNodeTransform returned error: %v", err)
	}
	if !updated.History.CanUndo || updated.History.CanRedo {
		t.Fatalf("history state = %+v, want undo only", updated.History)
	}
	if updated.History.HeadID == "" {
		t.Fatal("history head should identify the applied transform")
	}

	var entries []entity.ProjectCADHistoryEntry
	if err := svc.DB().Order("sequence ASC").Find(&entries, "document_id = ?", document.ID).Error; err != nil {
		t.Fatalf("load history entries: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("history entries = %d, want 1", len(entries))
	}
	entry := entries[0]
	if entry.Status != "applied" || entry.CommandType != "transform" || entry.TargetID != "node_"+model.ID {
		t.Fatalf("history entry = %+v, want applied transform", entry)
	}
	var payload struct {
		Before CADTransform `json:"before"`
		After  CADTransform `json:"after"`
	}
	if err := json.Unmarshal(entry.CommandJSON, &payload); err != nil {
		t.Fatalf("decode history command: %v", err)
	}
	if payload.Before.Matrix != identityCADTransform().Matrix || payload.After.Matrix != transform.Matrix {
		t.Fatalf("history transform payload = %+v, want identity -> requested transform", payload)
	}
}

func TestProjectCADDocumentRejectsStaleRevision(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "stale.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}

	first := CADTransform{Matrix: [16]float64{1, 0, 0, 3, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1}}
	if _, err := svc.UpdateProjectCADModelTransform(ctx, UpdateProjectCADModelTransformInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: model.ID, Transform: first, ExpectedRevision: document.Revision,
	}); err != nil {
		t.Fatalf("first transform returned error: %v", err)
	}
	second := CADTransform{Matrix: [16]float64{1, 0, 0, 9, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1}}
	_, err = svc.UpdateProjectCADModelTransform(ctx, UpdateProjectCADModelTransformInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: model.ID, Transform: second, ExpectedRevision: document.Revision,
	})
	if !errors.Is(err, ErrCADDocumentConflict) {
		t.Fatalf("stale transform error = %v, want ErrCADDocumentConflict", err)
	}

	reloaded, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("reload document: %v", err)
	}
	if reloaded.Nodes[0].Transform.Matrix != first.Matrix || reloaded.Revision != document.Revision+1 {
		t.Fatalf("reloaded document = %+v, want first transform only", reloaded)
	}
	var count int64
	if err := svc.DB().Model(&entity.ProjectCADHistoryEntry{}).Where("document_id = ?", document.ID).Count(&count).Error; err != nil {
		t.Fatalf("count history entries: %v", err)
	}
	if count != 1 {
		t.Fatalf("history entry count = %d, want 1", count)
	}
}

func TestProjectCADDocumentRequiresExpectedRevision(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "required-revision.step")
	_, err := svc.UpdateProjectCADModelTransform(ctx, UpdateProjectCADModelTransformInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		ModelID:     model.ID,
		Transform:   identityCADTransform(),
	})
	if !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("missing expected revision error = %v, want ErrInvalidCADDocumentInput", err)
	}
}

func TestUndoRedoProjectCADTransform(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "undo-transform.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	transform := CADTransform{Matrix: [16]float64{1, 0, 0, 11, 0, 1, 0, -3, 0, 0, 1, 5, 0, 0, 0, 1}}
	updated, err := svc.UpdateProjectCADModelTransform(ctx, UpdateProjectCADModelTransformInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: model.ID, Transform: transform, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("update transform: %v", err)
	}

	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: updated.Revision,
	})
	if err != nil {
		t.Fatalf("undo transform: %v", err)
	}
	if undone.Nodes[0].Transform.Matrix != identityCADTransform().Matrix || len(undone.Operations) != 0 {
		t.Fatalf("undone document = %+v, want identity without operations", undone)
	}
	if undone.Revision != updated.Revision+1 || undone.History.CanUndo || !undone.History.CanRedo || undone.History.HeadID != "" {
		t.Fatalf("undone history = %+v at revision %d", undone.History, undone.Revision)
	}

	reloaded, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("reload undone document: %v", err)
	}
	if !reloaded.History.CanRedo || reloaded.Nodes[0].Transform.Matrix != identityCADTransform().Matrix {
		t.Fatalf("reloaded undone document = %+v", reloaded)
	}

	redone, err := svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: reloaded.Revision,
	})
	if err != nil {
		t.Fatalf("redo transform: %v", err)
	}
	if redone.Nodes[0].Transform.Matrix != transform.Matrix || len(redone.Operations) != 1 {
		t.Fatalf("redone document = %+v, want transformed node and operation", redone)
	}
	if redone.Revision != reloaded.Revision+1 || !redone.History.CanUndo || redone.History.CanRedo || redone.History.HeadID == "" {
		t.Fatalf("redone history = %+v at revision %d", redone.History, redone.Revision)
	}
}

func TestUndoRedoProjectCADBoxUnion(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "undo-box.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	box := CADBoxFeature{Origin: [3]float64{2, 3, 4}, Size: [3]float64{5, 6, 7}}
	updated, err := svc.AddProjectCADModelBoxUnion(ctx, AddProjectCADModelBoxUnionInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: model.ID, Box: box, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("add box union: %v", err)
	}
	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: updated.Revision,
	})
	if err != nil {
		t.Fatalf("undo box union: %v", err)
	}
	if len(undone.Operations) != 0 || !undone.History.CanRedo {
		t.Fatalf("undone box document = %+v", undone)
	}
	redone, err := svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: undone.Revision,
	})
	if err != nil {
		t.Fatalf("redo box union: %v", err)
	}
	if len(redone.Operations) != 1 || redone.Operations[0].Box == nil || *redone.Operations[0].Box != box {
		t.Fatalf("redone box operations = %+v", redone.Operations)
	}
}

func TestUndoRedoProjectCADNodeDelete(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "undo-component.step",
		ContentType: "application/step",
		Data:        []byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1 = PRODUCT('Assembly','Assembly','',(#10));\n#2 = PRODUCT('Bracket','Bracket','',(#10));\nENDSEC;\nEND-ISO-10303-21;"),
	})
	if err != nil {
		t.Fatalf("upload STEP model: %v", err)
	}
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	nodeID := "node_" + model.ID + "_component_2"
	updated, err := svc.DeleteProjectCADNode(ctx, DeleteProjectCADNodeInput{
		OwnerUserID: user.ID, ProjectID: project.ID, NodeID: nodeID, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("delete component: %v", err)
	}
	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: updated.Revision,
	})
	if err != nil {
		t.Fatalf("undo delete: %v", err)
	}
	if !documentHasNode(undone, nodeID) || len(undone.Operations) != 0 {
		t.Fatalf("undone delete document = %+v", undone)
	}
	redone, err := svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: undone.Revision,
	})
	if err != nil {
		t.Fatalf("redo delete: %v", err)
	}
	if documentHasNode(redone, nodeID) || len(redone.Operations) != 1 || redone.Operations[0].Type != "delete-node" {
		t.Fatalf("redone delete document = %+v", redone)
	}
}

func TestUndoRedoLegacyRootDeleteHistoryRestoresAssemblyOccurrence(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "legacy-delete.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	updated, err := svc.DeleteProjectCADNode(ctx, DeleteProjectCADNodeInput{
		OwnerUserID: user.ID, ProjectID: project.ID, NodeID: "node_" + model.ID, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("delete root node: %v", err)
	}
	var entry entity.ProjectCADHistoryEntry
	if err := svc.DB().First(&entry, "id = ?", updated.History.HeadID).Error; err != nil {
		t.Fatalf("load delete history: %v", err)
	}
	var legacyCommand map[string]any
	if err := json.Unmarshal(entry.CommandJSON, &legacyCommand); err != nil {
		t.Fatalf("decode delete history: %v", err)
	}
	delete(legacyCommand, "occurrence")
	delete(legacyCommand, "occurrence_index")
	entry.CommandJSON, err = json.Marshal(legacyCommand)
	if err != nil {
		t.Fatalf("encode legacy delete history: %v", err)
	}
	if err := svc.DB().Model(&entry).Update("command_json", entry.CommandJSON).Error; err != nil {
		t.Fatalf("store legacy delete history: %v", err)
	}

	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: updated.Revision,
	})
	if err != nil {
		t.Fatalf("undo legacy root delete: %v", err)
	}
	if len(undone.Assembly.Occurrences) != 1 || undone.Assembly.Occurrences[0].ModelID != model.ID || undone.Assembly.Occurrences[0].ModelRevisionID != model.CurrentRevisionID {
		t.Fatalf("undone legacy occurrence = %+v, want restored model revision", undone.Assembly.Occurrences)
	}
	redone, err := svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: undone.Revision,
	})
	if err != nil {
		t.Fatalf("redo legacy root delete: %v", err)
	}
	if len(redone.Assembly.Occurrences) != 0 {
		t.Fatalf("redone legacy occurrences = %+v, want none", redone.Assembly.Occurrences)
	}
}

func TestNewEditAfterUndoDiscardsRedoButKeepsHistory(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "branch.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	firstTransform := CADTransform{Matrix: [16]float64{1, 0, 0, 2, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1}}
	first, err := svc.UpdateProjectCADModelTransform(ctx, UpdateProjectCADModelTransformInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: model.ID, Transform: firstTransform, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("first transform: %v", err)
	}
	box, err := svc.AddProjectCADModelBoxUnion(ctx, AddProjectCADModelBoxUnionInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: model.ID,
		Box: CADBoxFeature{Origin: [3]float64{0, 0, 0}, Size: [3]float64{2, 2, 2}}, ExpectedRevision: first.Revision,
	})
	if err != nil {
		t.Fatalf("box union: %v", err)
	}
	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: box.Revision,
	})
	if err != nil {
		t.Fatalf("undo box union: %v", err)
	}
	secondTransform := CADTransform{Matrix: [16]float64{1, 0, 0, 8, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1}}
	branched, err := svc.UpdateProjectCADModelTransform(ctx, UpdateProjectCADModelTransformInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: model.ID, Transform: secondTransform, ExpectedRevision: undone.Revision,
	})
	if err != nil {
		t.Fatalf("branched transform: %v", err)
	}
	if branched.History.CanRedo {
		t.Fatalf("branched history = %+v, redo should be unavailable", branched.History)
	}

	var entries []entity.ProjectCADHistoryEntry
	if err := svc.DB().Order("sequence ASC").Find(&entries, "document_id = ?", document.ID).Error; err != nil {
		t.Fatalf("load history entries: %v", err)
	}
	if len(entries) != 3 || entries[0].Status != cadHistoryStatusApplied || entries[1].Status != cadHistoryStatusDiscarded || entries[2].Status != cadHistoryStatusApplied {
		t.Fatalf("branched history entries = %+v", entries)
	}
}

func documentHasNode(document ProjectCADDocument, nodeID string) bool {
	for _, node := range document.Nodes {
		if node.ID == nodeID {
			return true
		}
	}
	return false
}
