package service

import (
	"context"
	"errors"
	"testing"
)

func TestProjectCADSubassemblyCaptureInstantiateAndHistory(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "motor.step")
	uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "gearbox.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	grouped, groupID := createSubassemblySourceGroup(t, svc, ctx, user.ID, project.ID, document)

	captured, err := svc.CaptureProjectCADSubassembly(ctx, CaptureProjectCADSubassemblyInput{
		OwnerUserID: user.ID, ProjectID: project.ID, GroupID: groupID,
		Name: "Drive module", ExpectedRevision: grouped.Revision,
	})
	if err != nil {
		t.Fatalf("CaptureProjectCADSubassembly returned error: %v", err)
	}
	if len(captured.Assembly.Subassemblies) != 1 {
		t.Fatalf("subassemblies = %+v", captured.Assembly.Subassemblies)
	}
	definition := captured.Assembly.Subassemblies[0]
	if definition.Revision != 1 || definition.Name != "Drive module" || len(definition.Members) != 2 {
		t.Fatalf("definition = %+v", definition)
	}
	assertCADTranslation(t, definition.Members[0].RelativeTransform, [3]float64{0, 0, 0})
	assertCADTranslation(t, definition.Members[1].RelativeTransform, [3]float64{15, 5, 0})
	if definition.Members[0].ModelRevisionID != grouped.Assembly.Occurrences[0].ModelRevisionID || definition.Members[1].ModelRevisionID != grouped.Assembly.Occurrences[1].ModelRevisionID {
		t.Fatalf("definition members did not pin source revisions: %+v", definition.Members)
	}

	undoCapture, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: captured.Revision,
	})
	if err != nil {
		t.Fatalf("undo capture returned error: %v", err)
	}
	if len(undoCapture.Assembly.Subassemblies) != 0 {
		t.Fatalf("undo capture subassemblies = %+v", undoCapture.Assembly.Subassemblies)
	}
	redoCapture, err := svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: undoCapture.Revision,
	})
	if err != nil {
		t.Fatalf("redo capture returned error: %v", err)
	}
	if len(redoCapture.Assembly.Subassemblies) != 1 || redoCapture.Assembly.Subassemblies[0].ID != definition.ID {
		t.Fatalf("redo capture subassemblies = %+v", redoCapture.Assembly.Subassemblies)
	}

	instantiated, err := svc.InstantiateProjectCADSubassembly(ctx, InstantiateProjectCADSubassemblyInput{
		OwnerUserID: user.ID, ProjectID: project.ID, DefinitionID: definition.ID,
		Name: "Drive module A", Translation: [3]float64{100, 20, 0}, ExpectedRevision: redoCapture.Revision,
	})
	if err != nil {
		t.Fatalf("InstantiateProjectCADSubassembly returned error: %v", err)
	}
	instanceGroup := instantiated.Assembly.Groups[len(instantiated.Assembly.Groups)-1]
	if instanceGroup.SubassemblyDefinitionID != definition.ID || instanceGroup.SubassemblyDefinitionRevision != 1 {
		t.Fatalf("instance group = %+v", instanceGroup)
	}
	instanceOccurrences := instantiated.Assembly.Occurrences[len(instantiated.Assembly.Occurrences)-2:]
	assertCADTranslation(t, instanceOccurrences[0].Transform, [3]float64{100, 20, 0})
	assertCADTranslation(t, instanceOccurrences[1].Transform, [3]float64{115, 25, 0})
	for index, occurrence := range instanceOccurrences {
		if occurrence.ParentGroupID != instanceGroup.ID || occurrence.SubassemblyMemberID != definition.Members[index].ID {
			t.Fatalf("instance occurrence %d = %+v", index, occurrence)
		}
	}

	undoInstance, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: instantiated.Revision,
	})
	if err != nil {
		t.Fatalf("undo instance returned error: %v", err)
	}
	if cadAssemblyGroupIndex(undoInstance.Assembly.Groups, instanceGroup.ID) >= 0 || len(undoInstance.Assembly.Occurrences) != 2 {
		t.Fatalf("undo instance groups/occurrences = %+v / %+v", undoInstance.Assembly.Groups, undoInstance.Assembly.Occurrences)
	}
	redoInstance, err := svc.RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: undoInstance.Revision,
	})
	if err != nil {
		t.Fatalf("redo instance returned error: %v", err)
	}
	if cadAssemblyGroupIndex(redoInstance.Assembly.Groups, instanceGroup.ID) < 0 || len(redoInstance.Assembly.Occurrences) != 4 {
		t.Fatalf("redo instance groups/occurrences = %+v / %+v", redoInstance.Assembly.Groups, redoInstance.Assembly.Occurrences)
	}

	secondInstance, err := svc.InstantiateProjectCADSubassembly(ctx, InstantiateProjectCADSubassemblyInput{
		OwnerUserID: user.ID, ProjectID: project.ID, DefinitionID: definition.ID,
		Name: "Drive module B", Translation: [3]float64{200, 0, 0}, ExpectedRevision: redoInstance.Revision,
	})
	if err != nil {
		t.Fatalf("instantiate second subassembly returned error: %v", err)
	}
	if len(secondInstance.Assembly.Groups) != 3 || len(secondInstance.Assembly.Occurrences) != 6 {
		t.Fatalf("second instance groups/occurrences = %d/%d", len(secondInstance.Assembly.Groups), len(secondInstance.Assembly.Occurrences))
	}
	assertCADTranslation(t, secondInstance.Assembly.Occurrences[4].Transform, [3]float64{200, 0, 0})
	assertCADTranslation(t, secondInstance.Assembly.Occurrences[5].Transform, [3]float64{215, 5, 0})
}

func TestProjectCADSubassemblyInstancesAreImmutableAndSuppressible(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "left.step")
	uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "right.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	grouped, groupID := createSubassemblySourceGroup(t, svc, ctx, user.ID, project.ID, document)
	captured, err := svc.CaptureProjectCADSubassembly(ctx, CaptureProjectCADSubassemblyInput{
		OwnerUserID: user.ID, ProjectID: project.ID, GroupID: groupID, Name: "Pair", ExpectedRevision: grouped.Revision,
	})
	if err != nil {
		t.Fatalf("capture subassembly returned error: %v", err)
	}
	definition := captured.Assembly.Subassemblies[0]
	instantiated, err := svc.InstantiateProjectCADSubassembly(ctx, InstantiateProjectCADSubassemblyInput{
		OwnerUserID: user.ID, ProjectID: project.ID, DefinitionID: definition.ID,
		Name: "Pair A", Translation: [3]float64{50, 0, 0}, ExpectedRevision: captured.Revision,
	})
	if err != nil {
		t.Fatalf("instantiate subassembly returned error: %v", err)
	}
	instanceGroup := instantiated.Assembly.Groups[len(instantiated.Assembly.Groups)-1]
	member := instantiated.Assembly.Occurrences[len(instantiated.Assembly.Occurrences)-2]
	newName := "Edited member"
	if _, err := svc.UpdateProjectCADOccurrence(ctx, UpdateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: member.ID,
		Name: &newName, ExpectedRevision: instantiated.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("update linked member error = %v, want ErrInvalidCADDocumentInput", err)
	}
	if _, err := svc.DuplicateProjectCADOccurrence(ctx, DuplicateProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: member.ID, ExpectedRevision: instantiated.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("duplicate linked member error = %v, want ErrInvalidCADDocumentInput", err)
	}
	if _, err := svc.DeleteProjectCADOccurrence(ctx, DeleteProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: member.ID, ExpectedRevision: instantiated.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("delete linked member error = %v, want ErrInvalidCADDocumentInput", err)
	}
	if _, err := svc.MoveProjectCADOccurrence(ctx, MoveProjectCADOccurrenceInput{
		OwnerUserID: user.ID, ProjectID: project.ID, OccurrenceID: member.ID,
		TargetIndex: 0, ExpectedRevision: instantiated.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("move linked member error = %v, want ErrInvalidCADDocumentInput", err)
	}
	if _, err := svc.CreateProjectCADAssemblyConstraint(ctx, CreateProjectCADAssemblyConstraintInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "Invalid linked mate", Kind: "mate",
		FirstOccurrenceID: instantiated.Assembly.Occurrences[0].ID, SecondOccurrenceID: member.ID,
		ExpectedRevision: instantiated.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("linked member constraint error = %v, want ErrInvalidCADDocumentInput", err)
	}
	if _, err := svc.CreateProjectCADAssemblyGroup(ctx, CreateProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ParentGroupID: instanceGroup.ID,
		Name: "Invalid nested group", ExpectedRevision: instantiated.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("instance child group error = %v, want ErrInvalidCADDocumentInput", err)
	}
	if _, err := svc.DeleteProjectCADNode(ctx, DeleteProjectCADNodeInput{
		OwnerUserID: user.ID, ProjectID: project.ID, NodeID: member.NodeID, ExpectedRevision: instantiated.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("delete definition source error = %v, want ErrInvalidCADDocumentInput", err)
	}
	rename := "Renamed instance"
	if _, err := svc.UpdateProjectCADAssemblyGroup(ctx, UpdateProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: project.ID, GroupID: instanceGroup.ID,
		Name: &rename, ExpectedRevision: instantiated.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("rename instance group error = %v, want ErrInvalidCADDocumentInput", err)
	}

	suppressed := true
	suppressedDocument, err := svc.UpdateProjectCADAssemblyGroup(ctx, UpdateProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: project.ID, GroupID: instanceGroup.ID,
		Suppressed: &suppressed, ExpectedRevision: instantiated.Revision,
	})
	if err != nil {
		t.Fatalf("suppress instance group returned error: %v", err)
	}
	if !cadAssemblyOccurrenceEffectivelySuppressed(suppressedDocument.Assembly, member) {
		t.Fatal("instance group suppression should hide linked members")
	}
	undone, err := svc.UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ExpectedRevision: suppressedDocument.Revision,
	})
	if err != nil {
		t.Fatalf("undo instance suppression returned error: %v", err)
	}
	if undone.Assembly.Groups[cadAssemblyGroupIndex(undone.Assembly.Groups, instanceGroup.ID)].Suppressed {
		t.Fatal("undo should restore visible instance group")
	}

	state := cadDocumentState{Assembly: undone.Assembly}
	newRevisionID := "mvr_new_source_revision"
	if err := setCADDocumentModelRevision(&state, member.ModelID, newRevisionID); err != nil {
		t.Fatalf("setCADDocumentModelRevision returned error: %v", err)
	}
	updatedOrdinary := false
	for _, occurrence := range state.Assembly.Occurrences {
		if occurrence.ModelID != member.ModelID {
			continue
		}
		if occurrence.SubassemblyMemberID == "" && occurrence.ModelRevisionID == newRevisionID {
			updatedOrdinary = true
		}
		if occurrence.SubassemblyMemberID != "" && occurrence.ModelRevisionID != member.ModelRevisionID {
			t.Fatalf("linked member revision changed = %+v", occurrence)
		}
	}
	if !updatedOrdinary {
		t.Fatal("ordinary occurrence should follow the active model revision")
	}

	onlyLinked := state.Assembly.Occurrences[:0]
	for _, occurrence := range state.Assembly.Occurrences {
		if occurrence.ModelID != member.ModelID || occurrence.SubassemblyMemberID != "" {
			onlyLinked = append(onlyLinked, occurrence)
		}
	}
	state.Assembly.Occurrences = onlyLinked
	if err := setCADDocumentModelRevision(&state, member.ModelID, "mvr_without_ordinary_occurrence"); err != nil {
		t.Fatalf("setCADDocumentModelRevision with only linked members returned error: %v", err)
	}
	for _, occurrence := range state.Assembly.Occurrences {
		if occurrence.ModelID == member.ModelID && occurrence.ModelRevisionID != member.ModelRevisionID {
			t.Fatalf("linked-only member revision changed = %+v", occurrence)
		}
	}
}

func TestProjectCADSubassemblyCaptureRejectsInvalidSourcesAndStaleRevision(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	user, project := createTestProjectForModel(t, svc, ctx)
	uploadTestSTEPModel(t, svc, ctx, user.ID, project.ID, "part.step")
	document, err := svc.GetProjectCADDocument(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProjectCADDocument returned error: %v", err)
	}
	empty, err := svc.CreateProjectCADAssemblyGroup(ctx, CreateProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: project.ID, Name: "Empty", ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("create empty group returned error: %v", err)
	}
	emptyID := empty.Assembly.Groups[0].ID
	if _, err := svc.CaptureProjectCADSubassembly(ctx, CaptureProjectCADSubassemblyInput{
		OwnerUserID: user.ID, ProjectID: project.ID, GroupID: emptyID, Name: "Empty", ExpectedRevision: empty.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("empty capture error = %v, want ErrInvalidCADDocumentInput", err)
	}
	child, err := svc.CreateProjectCADAssemblyGroup(ctx, CreateProjectCADAssemblyGroupInput{
		OwnerUserID: user.ID, ProjectID: project.ID, ParentGroupID: emptyID, Name: "Child", ExpectedRevision: empty.Revision,
	})
	if err != nil {
		t.Fatalf("create child group returned error: %v", err)
	}
	if _, err := svc.CaptureProjectCADSubassembly(ctx, CaptureProjectCADSubassemblyInput{
		OwnerUserID: user.ID, ProjectID: project.ID, GroupID: emptyID, Name: "Nested", ExpectedRevision: child.Revision,
	}); !errors.Is(err, ErrInvalidCADDocumentInput) {
		t.Fatalf("nested capture error = %v, want ErrInvalidCADDocumentInput", err)
	}
	if _, err := svc.CaptureProjectCADSubassembly(ctx, CaptureProjectCADSubassemblyInput{
		OwnerUserID: user.ID, ProjectID: project.ID, GroupID: emptyID, Name: "Stale", ExpectedRevision: empty.Revision,
	}); !errors.Is(err, ErrCADDocumentConflict) {
		t.Fatalf("stale capture error = %v, want ErrCADDocumentConflict", err)
	}
}

func createSubassemblySourceGroup(t *testing.T, svc *Service, ctx context.Context, userID, projectID string, document ProjectCADDocument) (ProjectCADDocument, string) {
	t.Helper()
	created, err := svc.CreateProjectCADAssemblyGroup(ctx, CreateProjectCADAssemblyGroupInput{
		OwnerUserID: userID, ProjectID: projectID, Name: "Source module", ExpectedRevision: document.Revision,
	})
	if err != nil {
		t.Fatalf("create source group returned error: %v", err)
	}
	groupID := created.Assembly.Groups[len(created.Assembly.Groups)-1].ID
	firstTransform := identityCADTransform()
	firstTransform.Matrix[3] = 10
	first, err := svc.UpdateProjectCADOccurrence(ctx, UpdateProjectCADOccurrenceInput{
		OwnerUserID: userID, ProjectID: projectID, OccurrenceID: created.Assembly.Occurrences[0].ID,
		ParentGroupID: &groupID, Transform: &firstTransform, ExpectedRevision: created.Revision,
	})
	if err != nil {
		t.Fatalf("group first source occurrence returned error: %v", err)
	}
	secondTransform := identityCADTransform()
	secondTransform.Matrix[0] = 0
	secondTransform.Matrix[1] = -1
	secondTransform.Matrix[4] = 1
	secondTransform.Matrix[5] = 0
	secondTransform.Matrix[3] = 25
	secondTransform.Matrix[7] = 5
	second, err := svc.UpdateProjectCADOccurrence(ctx, UpdateProjectCADOccurrenceInput{
		OwnerUserID: userID, ProjectID: projectID, OccurrenceID: first.Assembly.Occurrences[1].ID,
		ParentGroupID: &groupID, Transform: &secondTransform, ExpectedRevision: first.Revision,
	})
	if err != nil {
		t.Fatalf("group second source occurrence returned error: %v", err)
	}
	return second, groupID
}
