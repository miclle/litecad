package service

import (
	"context"
	"errors"
	"testing"
)

func TestProjectCADAssemblyGroupsAreNestedSuppressedAndReversible(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	first := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "motor.step")
	uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "gearbox.step")

	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	if document.SchemaVersion != 3 || len(document.Assembly.Groups) != 0 || len(document.Assembly.Constraints) != 0 {
		t.Fatalf("initial schema/groups/constraints = %d/%d/%d, want 3/0/0", document.SchemaVersion, len(document.Assembly.Groups), len(document.Assembly.Constraints))
	}

	root, err := svc.CreateProjectCADAssemblyGroup(ctx, CreateProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "Drive train", ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("CreateProjectCADAssemblyGroup root returned error: %v", err)
	}
	if len(root.Assembly.Groups) != 1 || root.Assembly.Groups[0].Name != "Drive train" {
		t.Fatalf("root groups = %+v", root.Assembly.Groups)
	}
	rootGroupID := root.Assembly.Groups[0].ID

	child, err := svc.CreateProjectCADAssemblyGroup(ctx, CreateProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ParentGroupID: rootGroupID,
		Name: "Reduction stage", ExpectedRevision: root.Revision,
	})
	if err != nil {
		t.Fatalf("CreateProjectCADAssemblyGroup child returned error: %v", err)
	}
	if len(child.Assembly.Groups) != 2 || child.Assembly.Groups[1].ParentGroupID != rootGroupID {
		t.Fatalf("nested groups = %+v", child.Assembly.Groups)
	}
	childGroupID := child.Assembly.Groups[1].ID

	firstOccurrence := child.Assembly.Occurrences[0]
	grouped, err := svc.UpdateProjectCADOccurrence(ctx, UpdateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: firstOccurrence.ID,
		ParentGroupID: &childGroupID, ExpectedRevision: child.Revision,
	})
	if err != nil {
		t.Fatalf("UpdateProjectCADOccurrence parent returned error: %v", err)
	}
	if grouped.Assembly.Occurrences[0].ModelID != first.ID || grouped.Assembly.Occurrences[0].ParentGroupID != childGroupID {
		t.Fatalf("grouped occurrence = %+v", grouped.Assembly.Occurrences[0])
	}

	suppressed := true
	suppressedDocument, err := svc.UpdateProjectCADAssemblyGroup(ctx, UpdateProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: project.ID, GroupID: rootGroupID,
		Suppressed: &suppressed, ExpectedRevision: grouped.Revision,
	})
	if err != nil {
		t.Fatalf("UpdateProjectCADAssemblyGroup returned error: %v", err)
	}
	if !cadAssemblyOccurrenceEffectivelySuppressed(suppressedDocument.Assembly, suppressedDocument.Assembly.Occurrences[0]) {
		t.Fatal("ancestor group suppression should suppress the nested occurrence")
	}
	if cadAssemblyOccurrenceEffectivelySuppressed(suppressedDocument.Assembly, suppressedDocument.Assembly.Occurrences[1]) {
		t.Fatal("ungrouped occurrence should remain active")
	}

	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: suppressedDocument.Revision,
	})
	if err != nil {
		t.Fatalf("UndoProjectCADDocument returned error: %v", err)
	}
	if undone.Assembly.Groups[0].Suppressed || cadAssemblyOccurrenceEffectivelySuppressed(undone.Assembly, undone.Assembly.Occurrences[0]) {
		t.Fatalf("undo group suppression = %+v", undone.Assembly.Groups[0])
	}

	redone, err := svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: undone.Revision,
	})
	if err != nil {
		t.Fatalf("RedoProjectCADDocument returned error: %v", err)
	}
	if !redone.Assembly.Groups[0].Suppressed || !cadAssemblyOccurrenceEffectivelySuppressed(redone.Assembly, redone.Assembly.Occurrences[0]) {
		t.Fatalf("redo group suppression = %+v", redone.Assembly.Groups[0])
	}

	if _, err := svc.UpdateProjectCADAssemblyGroup(ctx, UpdateProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: project.ID, GroupID: rootGroupID,
		ParentGroupID: &childGroupID, ExpectedRevision: redone.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("cyclic group parent error = %v, want ErrInvalidCADDocumentInput", err)
	}
	if _, err := svc.DeleteProjectCADAssemblyGroup(ctx, DeleteProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: project.ID, GroupID: rootGroupID, ExpectedRevision: redone.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("delete non-empty group error = %v, want ErrInvalidCADDocumentInput", err)
	}

	reloaded, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument reload returned error: %v", err)
	}
	if len(reloaded.Assembly.Groups) != 2 || reloaded.Assembly.Occurrences[0].ParentGroupID != childGroupID || !reloaded.Assembly.Groups[0].Suppressed {
		t.Fatalf("reloaded nested assembly = %+v / %+v", reloaded.Assembly.Groups, reloaded.Assembly.Occurrences)
	}
}

func TestProjectCADAssemblyConstraintRecordsAreValidatedAndReversible(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "left.step")
	uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "right.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	leftID := document.Assembly.Occurrences[0].ID
	rightID := document.Assembly.Occurrences[1].ID

	created, err := svc.CreateProjectCADAssemblyConstraint(ctx, CreateProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "Motor to gearbox", Kind: "mate",
		FirstOccurrenceID: leftID, SecondOccurrenceID: rightID, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("CreateProjectCADAssemblyConstraint returned error: %v", err)
	}
	if len(created.Assembly.Constraints) != 1 {
		t.Fatalf("constraints = %+v", created.Assembly.Constraints)
	}
	constraint := created.Assembly.Constraints[0]
	if constraint.Kind != "mate" || constraint.Status != "unresolved" || constraint.FirstOccurrenceID != leftID || constraint.SecondOccurrenceID != rightID {
		t.Fatalf("constraint = %+v", constraint)
	}

	if _, err := svc.CreateProjectCADAssemblyConstraint(ctx, CreateProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "Self mate", Kind: "mate",
		FirstOccurrenceID: leftID, SecondOccurrenceID: leftID, ExpectedRevision: created.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("self constraint error = %v, want ErrInvalidCADDocumentInput", err)
	}
	if _, err := svc.CreateProjectCADAssemblyConstraint(ctx, CreateProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "Fake solve", Kind: "coincident",
		FirstOccurrenceID: leftID, SecondOccurrenceID: rightID, ExpectedRevision: created.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("unsupported constraint error = %v, want ErrInvalidCADDocumentInput", err)
	}

	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: created.Revision,
	})
	if err != nil {
		t.Fatalf("UndoProjectCADDocument returned error: %v", err)
	}
	if len(undone.Assembly.Constraints) != 0 {
		t.Fatalf("undo constraints = %+v", undone.Assembly.Constraints)
	}
	redone, err := svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: undone.Revision,
	})
	if err != nil {
		t.Fatalf("RedoProjectCADDocument returned error: %v", err)
	}
	if len(redone.Assembly.Constraints) != 1 || redone.Assembly.Constraints[0].ID != constraint.ID {
		t.Fatalf("redo constraints = %+v", redone.Assembly.Constraints)
	}

	deleted, err := svc.DeleteProjectCADAssemblyConstraint(ctx, DeleteProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ConstraintID: constraint.ID, ExpectedRevision: redone.Revision,
	})
	if err != nil {
		t.Fatalf("DeleteProjectCADAssemblyConstraint returned error: %v", err)
	}
	if len(deleted.Assembly.Constraints) != 0 {
		t.Fatalf("deleted constraints = %+v", deleted.Assembly.Constraints)
	}
}
