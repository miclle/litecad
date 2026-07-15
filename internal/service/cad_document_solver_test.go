package service

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"testing"

	"github.com/miclle/litecad/internal/entity"
)

func TestProjectCADAssemblyPointMateSolvesPropagatesAndReverses(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "driver.step")
	uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "driven.step")

	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	if document.SchemaVersion != 4 {
		t.Fatalf("schema version = %d, want 4", document.SchemaVersion)
	}
	driverID := document.Assembly.Occurrences[0].ID
	drivenID := document.Assembly.Occurrences[1].ID

	driverTransform := identityCADTransform()
	driverTransform.Matrix[3] = 10
	driverPlaced, err := svc.UpdateProjectCADOccurrence(ctx, UpdateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: driverID,
		Transform: &driverTransform, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("place driver returned error: %v", err)
	}
	drivenTransform := CADTransform{Matrix: [16]float64{
		0, -1, 0, 0,
		1, 0, 0, 0,
		0, 0, 1, 0,
		0, 0, 0, 1,
	}}
	placed, err := svc.UpdateProjectCADOccurrence(ctx, UpdateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: drivenID,
		Transform: &drivenTransform, ExpectedRevision: driverPlaced.Revision,
	})
	if err != nil {
		t.Fatalf("place driven returned error: %v", err)
	}

	created, err := svc.CreateProjectCADAssemblyConstraint(ctx, CreateProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "Driver point to driven point", Kind: "mate",
		FirstOccurrenceID: driverID, SecondOccurrenceID: drivenID,
		FirstAnchor: [3]float64{1, 0, 0}, SecondAnchor: [3]float64{2, 0, 0}, Offset: [3]float64{0, 3, 0},
		ExpectedRevision: placed.Revision,
	})
	if err != nil {
		t.Fatalf("CreateProjectCADAssemblyConstraint returned error: %v", err)
	}
	if len(created.Assembly.Constraints) != 1 {
		t.Fatalf("constraints = %+v", created.Assembly.Constraints)
	}
	constraint := created.Assembly.Constraints[0]
	if constraint.Solver != "point-coincident-v1" || constraint.Status != "solved" || math.Abs(constraint.Residual) > 1e-9 {
		t.Fatalf("solved constraint = %+v", constraint)
	}
	assertCADTranslation(t, created.Assembly.Occurrences[1].Transform, [3]float64{11, 1, 0})

	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: created.Revision,
	})
	if err != nil {
		t.Fatalf("UndoProjectCADDocument create mate returned error: %v", err)
	}
	if len(undone.Assembly.Constraints) != 0 {
		t.Fatalf("undo constraints = %+v", undone.Assembly.Constraints)
	}
	assertCADTranslation(t, undone.Assembly.Occurrences[1].Transform, [3]float64{0, 0, 0})

	redone, err := svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: undone.Revision,
	})
	if err != nil {
		t.Fatalf("RedoProjectCADDocument create mate returned error: %v", err)
	}
	assertCADTranslation(t, redone.Assembly.Occurrences[1].Transform, [3]float64{11, 1, 0})

	movedDriver := driverTransform
	movedDriver.Matrix[3] = 20
	propagated, err := svc.UpdateProjectCADOccurrence(ctx, UpdateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: driverID,
		Transform: &movedDriver, ExpectedRevision: redone.Revision,
	})
	if err != nil {
		t.Fatalf("move constraint driver returned error: %v", err)
	}
	assertCADTranslation(t, propagated.Assembly.Occurrences[0].Transform, [3]float64{20, 0, 0})
	assertCADTranslation(t, propagated.Assembly.Occurrences[1].Transform, [3]float64{21, 1, 0})

	undoMove, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: propagated.Revision,
	})
	if err != nil {
		t.Fatalf("UndoProjectCADDocument propagated move returned error: %v", err)
	}
	assertCADTranslation(t, undoMove.Assembly.Occurrences[0].Transform, [3]float64{10, 0, 0})
	assertCADTranslation(t, undoMove.Assembly.Occurrences[1].Transform, [3]float64{11, 1, 0})
}

func TestProjectCADDocumentV4PreservesLegacyUnresolvedMateWithoutMovingGeometry(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	firstModel := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "legacy-left.step")
	secondModel := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "legacy-right.step")
	firstTransform := identityCADTransform()
	firstTransform.Matrix[3] = 4
	secondTransform := identityCADTransform()
	secondTransform.Matrix[3] = 19
	state := cadDocumentState{
		Unit: "millimetre",
		Assembly: CADAssembly{
			ID: "assembly_" + project.ID, Name: project.Name,
			Occurrences: []CADAssemblyOccurrence{
				{ID: "occ_legacy_left", NodeID: "node_" + firstModel.ID, ModelID: firstModel.ID, ModelRevisionID: firstModel.CurrentRevisionID, Name: "Left", Transform: firstTransform},
				{ID: "occ_legacy_right", NodeID: "node_" + secondModel.ID, ModelID: secondModel.ID, ModelRevisionID: secondModel.CurrentRevisionID, Name: "Right", Transform: secondTransform},
			},
			Groups: []CADAssemblyGroup{},
			Constraints: []CADAssemblyConstraintRecord{{
				ID: "cst_legacy", Kind: "mate", Name: "Legacy mate", FirstOccurrenceID: "occ_legacy_left", SecondOccurrenceID: "occ_legacy_right", Status: "unresolved",
			}},
		},
		Nodes: []CADDocumentNode{
			{ID: "node_" + firstModel.ID, ModelID: firstModel.ID, Name: "Left", SourceFormat: "step", Transform: identityCADTransform()},
			{ID: "node_" + secondModel.ID, ModelID: secondModel.ID, Name: "Right", SourceFormat: "step", Transform: identityCADTransform()},
		},
	}
	documentJSON, err := json.Marshal(state)
	if err != nil {
		t.Fatalf("marshal legacy schema v3 document: %v", err)
	}
	stored := entity.ProjectCADDocument{ID: "doc_legacy_solver", ProjectID: project.ID, SchemaVersion: 3, Revision: 7, DocumentJSON: documentJSON}
	if err := svc.DB().Create(&stored).Error; err != nil {
		t.Fatalf("create legacy schema v3 document: %v", err)
	}

	upgraded, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	if upgraded.SchemaVersion != 4 || upgraded.Revision != 8 || len(upgraded.Assembly.Constraints) != 1 || upgraded.Assembly.Constraints[0].Status != "unresolved" {
		t.Fatalf("upgraded legacy constraint = schema %d revision %d %+v", upgraded.SchemaVersion, upgraded.Revision, upgraded.Assembly.Constraints)
	}
	assertCADTranslation(t, upgraded.Assembly.Occurrences[0].Transform, [3]float64{4, 0, 0})
	assertCADTranslation(t, upgraded.Assembly.Occurrences[1].Transform, [3]float64{19, 0, 0})
}

func TestProjectCADAssemblyPointMateRejectsAmbiguousOrCyclicGraphs(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	for _, name := range []string{"a.step", "b.step", "c.step"} {
		uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, name)
	}
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	aID := document.Assembly.Occurrences[0].ID
	bID := document.Assembly.Occurrences[1].ID
	cID := document.Assembly.Occurrences[2].ID

	first, err := svc.CreateProjectCADAssemblyConstraint(ctx, CreateProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "A drives B", Kind: "mate",
		FirstOccurrenceID: aID, SecondOccurrenceID: bID, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("create A -> B returned error: %v", err)
	}
	if _, err := svc.CreateProjectCADAssemblyConstraint(ctx, CreateProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "C also drives B", Kind: "mate",
		FirstOccurrenceID: cID, SecondOccurrenceID: bID, ExpectedRevision: first.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("multiple inbound driver error = %v, want ErrInvalidCADDocumentInput", err)
	}
	if _, err := svc.CreateProjectCADAssemblyConstraint(ctx, CreateProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "B cycles to A", Kind: "mate",
		FirstOccurrenceID: bID, SecondOccurrenceID: aID, ExpectedRevision: first.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("cycle error = %v, want ErrInvalidCADDocumentInput", err)
	}

	directMove := identityCADTransform()
	directMove.Matrix[7] = 9
	if _, err := svc.UpdateProjectCADOccurrence(ctx, UpdateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: bID,
		Transform: &directMove, ExpectedRevision: first.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("direct driven move error = %v, want ErrInvalidCADDocumentInput", err)
	}

	second, err := svc.CreateProjectCADAssemblyConstraint(ctx, CreateProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "B drives C", Kind: "mate",
		FirstOccurrenceID: bID, SecondOccurrenceID: cID, Offset: [3]float64{5, 0, 0}, ExpectedRevision: first.Revision,
	})
	if err != nil {
		t.Fatalf("create B -> C returned error: %v", err)
	}
	moved := identityCADTransform()
	moved.Matrix[3] = 7
	propagated, err := svc.UpdateProjectCADOccurrence(ctx, UpdateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: aID,
		Transform: &moved, ExpectedRevision: second.Revision,
	})
	if err != nil {
		t.Fatalf("propagate A -> B -> C returned error: %v", err)
	}
	assertCADTranslation(t, propagated.Assembly.Occurrences[1].Transform, [3]float64{7, 0, 0})
	assertCADTranslation(t, propagated.Assembly.Occurrences[2].Transform, [3]float64{12, 0, 0})
}

func TestLegacyModelTransformHonorsAssemblyPointMateSolverAndHistory(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	driverModel := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "legacy-driver.step")
	drivenModel := uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "legacy-driven.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	driverID := document.Assembly.Occurrences[0].ID
	drivenID := document.Assembly.Occurrences[1].ID
	constrained, err := svc.CreateProjectCADAssemblyConstraint(ctx, CreateProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "Legacy API point mate", Kind: "mate",
		FirstOccurrenceID: driverID, SecondOccurrenceID: drivenID, Offset: [3]float64{4, 0, 0}, ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("CreateProjectCADAssemblyConstraint returned error: %v", err)
	}

	driverTransform := identityCADTransform()
	driverTransform.Matrix[3] = 9
	propagated, err := svc.UpdateProjectCADModelTransform(ctx, UpdateProjectCADModelTransformInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: driverModel.ID,
		Transform: driverTransform, ExpectedRevision: constrained.Revision,
	})
	if err != nil {
		t.Fatalf("legacy driver transform returned error: %v", err)
	}
	assertCADTranslation(t, propagated.Assembly.Occurrences[0].Transform, [3]float64{9, 0, 0})
	assertCADTranslation(t, propagated.Assembly.Occurrences[1].Transform, [3]float64{13, 0, 0})

	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: propagated.Revision,
	})
	if err != nil {
		t.Fatalf("UndoProjectCADDocument legacy driver transform returned error: %v", err)
	}
	assertCADTranslation(t, undone.Assembly.Occurrences[0].Transform, [3]float64{0, 0, 0})
	assertCADTranslation(t, undone.Assembly.Occurrences[1].Transform, [3]float64{4, 0, 0})

	drivenTransform := identityCADTransform()
	drivenTransform.Matrix[3] = 20
	if _, err := svc.UpdateProjectCADModelTransform(ctx, UpdateProjectCADModelTransformInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ModelID: drivenModel.ID,
		Transform: drivenTransform, ExpectedRevision: undone.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("legacy driven transform error = %v, want ErrInvalidCADDocumentInput", err)
	}
}

func assertCADTranslation(t *testing.T, transform CADTransform, want [3]float64) {
	t.Helper()
	got := [3]float64{transform.Matrix[3], transform.Matrix[7], transform.Matrix[11]}
	for index := range got {
		if math.Abs(got[index]-want[index]) > 1e-9 {
			t.Fatalf("translation = %v, want %v", got, want)
		}
	}
}
