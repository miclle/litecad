package service

import (
	"context"
	"errors"
	"testing"
)

func TestProjectCADOccurrenceAuthoringIsReversible(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	first := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "first.step")
	second := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "second.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	if len(document.Nodes) != 2 || len(document.Assembly.Occurrences) != 2 {
		t.Fatalf("initial document nodes/occurrences = %d/%d, want 2/2", len(document.Nodes), len(document.Assembly.Occurrences))
	}
	if _, err := svc.DeleteProjectCADOccurrence(ctx, DeleteProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID,
		OccurrenceID: document.Assembly.Occurrences[0].ID, ExpectedRevision: document.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("delete last model occurrence error = %v, want ErrInvalidCADDocumentInput", err)
	}

	duplicated, err := svc.DuplicateProjectCADOccurrence(ctx, DuplicateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID,
		OccurrenceID: document.Assembly.Occurrences[0].ID, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("DuplicateProjectCADOccurrence returned error: %v", err)
	}
	if len(duplicated.Nodes) != 2 || len(duplicated.Assembly.Occurrences) != 3 {
		t.Fatalf("duplicated document nodes/occurrences = %d/%d, want 2/3", len(duplicated.Nodes), len(duplicated.Assembly.Occurrences))
	}
	duplicate := duplicated.Assembly.Occurrences[1]
	if duplicate.ID == document.Assembly.Occurrences[0].ID || duplicate.NodeID != "node_"+first.ID || duplicate.ModelID != first.ID {
		t.Fatalf("duplicate occurrence = %+v", duplicate)
	}
	if duplicate.ModelRevisionID != first.CurrentRevisionID || duplicate.Name != "first.step copy" {
		t.Fatalf("duplicate revision/name = %q/%q", duplicate.ModelRevisionID, duplicate.Name)
	}
	if _, err := svc.DuplicateProjectCADOccurrence(ctx, DuplicateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID,
		OccurrenceID: duplicate.ID, ExpectedRevision: document.Revision,
	}); !errors.Is(err, ErrCADDocumentConflict) {
		t.Fatalf("stale duplicate error = %v, want ErrCADDocumentConflict", err)
	}

	name := "Fixture right"
	suppressed := true
	transform := identityCADTransform()
	transform.Matrix[3] = 42
	updated, err := svc.UpdateProjectCADOccurrence(ctx, UpdateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: duplicate.ID,
		Name: &name, Suppressed: &suppressed, Transform: &transform, ExpectedRevision: duplicated.Revision,
	})
	if err != nil {
		t.Fatalf("UpdateProjectCADOccurrence returned error: %v", err)
	}
	if got := updated.Assembly.Occurrences[1]; got.Name != name || !got.Suppressed || got.Transform != transform {
		t.Fatalf("updated occurrence = %+v", got)
	}

	moved, err := svc.MoveProjectCADOccurrence(ctx, MoveProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: duplicate.ID,
		TargetIndex: 2, ExpectedRevision: updated.Revision,
	})
	if err != nil {
		t.Fatalf("MoveProjectCADOccurrence returned error: %v", err)
	}
	if got := moved.Assembly.Occurrences; got[0].ModelID != first.ID || got[1].ModelID != second.ID || got[2].ID != duplicate.ID {
		t.Fatalf("moved occurrence order = %+v", got)
	}

	deleted, err := svc.DeleteProjectCADOccurrence(ctx, DeleteProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: duplicate.ID, ExpectedRevision: moved.Revision,
	})
	if err != nil {
		t.Fatalf("DeleteProjectCADOccurrence returned error: %v", err)
	}
	if len(deleted.Assembly.Occurrences) != 2 || len(deleted.Nodes) != 2 {
		t.Fatalf("deleted document nodes/occurrences = %d/%d, want 2/2", len(deleted.Nodes), len(deleted.Assembly.Occurrences))
	}

	states := []ProjectCADDocument{deleted}
	for range 4 {
		undone, undoErr := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
			OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: states[len(states)-1].Revision,
		})
		if undoErr != nil {
			t.Fatalf("UndoProjectCADDocument returned error: %v", undoErr)
		}
		states = append(states, undone)
	}
	if got := states[1].Assembly.Occurrences; len(got) != 3 || got[2].ID != duplicate.ID {
		t.Fatalf("undo delete occurrences = %+v", got)
	}
	if got := states[2].Assembly.Occurrences; got[1].ID != duplicate.ID {
		t.Fatalf("undo move occurrences = %+v", got)
	}
	if got := states[3].Assembly.Occurrences[1]; got.Name != "first.step copy" || got.Suppressed || got.Transform != identityCADTransform() {
		t.Fatalf("undo update occurrence = %+v", got)
	}
	if got := states[4].Assembly.Occurrences; len(got) != 2 || got[0].ModelID != first.ID || got[1].ModelID != second.ID {
		t.Fatalf("undo duplicate occurrences = %+v", got)
	}
}

func TestDeleteProjectCADSourceNodeRestoresEveryOccurrence(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	model := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "fixture.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	duplicated, err := svc.DuplicateProjectCADOccurrence(ctx, DuplicateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID,
		OccurrenceID: document.Assembly.Occurrences[0].ID, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("DuplicateProjectCADOccurrence returned error: %v", err)
	}
	deleted, err := svc.DeleteProjectCADNode(ctx, DeleteProjectCADNodeInput{
		OwnerUserID: user.ID, ProjectID: project.ID, NodeID: "node_" + model.ID, ExpectedRevision: duplicated.Revision,
	})
	if err != nil {
		t.Fatalf("DeleteProjectCADNode returned error: %v", err)
	}
	if len(deleted.Nodes) != 0 || len(deleted.Assembly.Occurrences) != 0 {
		t.Fatalf("deleted source nodes/occurrences = %d/%d, want 0/0", len(deleted.Nodes), len(deleted.Assembly.Occurrences))
	}
	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: deleted.Revision,
	})
	if err != nil {
		t.Fatalf("UndoProjectCADDocument returned error: %v", err)
	}
	if len(undone.Nodes) != 1 || len(undone.Assembly.Occurrences) != 2 {
		t.Fatalf("restored source nodes/occurrences = %d/%d, want 1/2", len(undone.Nodes), len(undone.Assembly.Occurrences))
	}
}
