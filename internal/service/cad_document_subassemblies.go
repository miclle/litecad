package service

import (
	"context"
	"strings"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const cadSubassemblyDefinitionRevision1 = 1

// CaptureProjectCADSubassemblyInput captures one direct-occurrence group as an immutable revision-1 definition.
type CaptureProjectCADSubassemblyInput struct {
	OwnerUserID      string
	ProjectID        string
	GroupID          string
	Name             string
	ExpectedRevision int
}

// InstantiateProjectCADSubassemblyInput expands one definition into an immutable tagged group and ordinary occurrences.
type InstantiateProjectCADSubassemblyInput struct {
	OwnerUserID      string
	ProjectID        string
	DefinitionID     string
	ParentGroupID    string
	Name             string
	Translation      [3]float64
	ExpectedRevision int
}

// CaptureProjectCADSubassembly stores one immutable project-local reusable definition.
func (s *Service) CaptureProjectCADSubassembly(ctx context.Context, input CaptureProjectCADSubassemblyInput) (ProjectCADDocument, error) {
	project, err := s.validateOwnedAssemblyProject(ctx, input.OwnerUserID, input.ProjectID, input.ExpectedRevision)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	groupID := strings.TrimSpace(input.GroupID)
	name := strings.TrimSpace(input.Name)
	if groupID == "" || name == "" || len(name) > 200 {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	return s.mutateCADOccurrence(ctx, project, input.ExpectedRevision, func(tx *gorm.DB, document *entity.ProjectCADDocument, state *cadDocumentState) error {
		groupIndex := cadAssemblyGroupIndex(state.Assembly.Groups, groupID)
		if groupIndex < 0 {
			return ErrProjectNotFound
		}
		group := state.Assembly.Groups[groupIndex]
		if group.SubassemblyDefinitionID != "" {
			return ErrInvalidCADDocumentInput
		}
		for _, candidate := range state.Assembly.Groups {
			if candidate.ParentGroupID == group.ID {
				return ErrInvalidCADDocumentInput
			}
		}
		sourceOccurrences := make([]CADAssemblyOccurrence, 0)
		for _, occurrence := range state.Assembly.Occurrences {
			if occurrence.ParentGroupID == group.ID {
				if occurrence.SubassemblyMemberID != "" {
					return ErrInvalidCADDocumentInput
				}
				sourceOccurrences = append(sourceOccurrences, occurrence)
			}
		}
		if len(sourceOccurrences) == 0 {
			return ErrInvalidCADDocumentInput
		}
		definitionID, err := id.NewPrefixed("sub")
		if err != nil {
			return err
		}
		baseTranslation := cadTransformTranslation(sourceOccurrences[0].Transform)
		members := make([]CADSubassemblyMember, 0, len(sourceOccurrences))
		for _, occurrence := range sourceOccurrences {
			memberID, err := id.NewPrefixed("smb")
			if err != nil {
				return err
			}
			relativeTransform := occurrence.Transform
			for axis := 0; axis < 3; axis++ {
				relativeTransform.Matrix[axis*4+3] -= baseTranslation[axis]
			}
			members = append(members, CADSubassemblyMember{
				ID: memberID, NodeID: occurrence.NodeID, ModelID: occurrence.ModelID, ModelRevisionID: occurrence.ModelRevisionID,
				Name: occurrence.Name, Suppressed: occurrence.Suppressed, RelativeTransform: relativeTransform,
			})
		}
		definition := CADSubassemblyDefinitionRevision{
			ID: definitionID, Revision: cadSubassemblyDefinitionRevision1, Name: name, Members: members,
		}
		index := len(state.Assembly.Subassemblies)
		state.Assembly.Subassemblies = append(state.Assembly.Subassemblies, definition)
		if err := validateCADAssembly(state.Assembly); err != nil {
			return err
		}
		_, err = appendProjectCADHistoryEntry(ctx, tx, document, "subassembly-definition-create", definition.ID, "Capture subassembly "+definition.Name, cadSubassemblyDefinitionCreateHistoryCommand{
			Definition: definition, Index: index,
		})
		return err
	})
}

// InstantiateProjectCADSubassembly expands one immutable definition at an explicit translation.
func (s *Service) InstantiateProjectCADSubassembly(ctx context.Context, input InstantiateProjectCADSubassemblyInput) (ProjectCADDocument, error) {
	project, err := s.validateOwnedAssemblyProject(ctx, input.OwnerUserID, input.ProjectID, input.ExpectedRevision)
	if err != nil {
		return ProjectCADDocument{}, err
	}
	definitionID := strings.TrimSpace(input.DefinitionID)
	parentGroupID := strings.TrimSpace(input.ParentGroupID)
	name := strings.TrimSpace(input.Name)
	if definitionID == "" || name == "" || len(name) > 200 || !isFiniteCADVector3(input.Translation) {
		return ProjectCADDocument{}, ErrInvalidCADDocumentInput
	}
	return s.mutateCADOccurrence(ctx, project, input.ExpectedRevision, func(tx *gorm.DB, document *entity.ProjectCADDocument, state *cadDocumentState) error {
		definitionIndex := cadSubassemblyDefinitionIndex(state.Assembly.Subassemblies, definitionID, cadSubassemblyDefinitionRevision1)
		if definitionIndex < 0 {
			return ErrProjectNotFound
		}
		if parentGroupID != "" {
			parentIndex := cadAssemblyGroupIndex(state.Assembly.Groups, parentGroupID)
			if parentIndex < 0 || state.Assembly.Groups[parentIndex].SubassemblyDefinitionID != "" {
				return ErrInvalidCADDocumentInput
			}
		}
		definition := state.Assembly.Subassemblies[definitionIndex]
		groupID, err := id.NewPrefixed("grp")
		if err != nil {
			return err
		}
		group := CADAssemblyGroup{
			ID: groupID, ParentGroupID: parentGroupID, Name: name,
			SubassemblyDefinitionID: definition.ID, SubassemblyDefinitionRevision: definition.Revision,
		}
		groupIndex := len(state.Assembly.Groups)
		state.Assembly.Groups = append(state.Assembly.Groups, group)
		occurrences := make([]cadDeletedAssemblyOccurrence, 0, len(definition.Members))
		for _, member := range definition.Members {
			occurrenceID, err := id.NewPrefixed("occ")
			if err != nil {
				return err
			}
			transform := member.RelativeTransform
			for axis := 0; axis < 3; axis++ {
				transform.Matrix[axis*4+3] += input.Translation[axis]
			}
			occurrence := CADAssemblyOccurrence{
				ID: occurrenceID, NodeID: member.NodeID, ModelID: member.ModelID, ModelRevisionID: member.ModelRevisionID,
				ParentGroupID: group.ID, SubassemblyMemberID: member.ID, Name: member.Name,
				Suppressed: member.Suppressed, Transform: transform,
			}
			index := len(state.Assembly.Occurrences)
			state.Assembly.Occurrences = append(state.Assembly.Occurrences, occurrence)
			occurrences = append(occurrences, cadDeletedAssemblyOccurrence{Occurrence: occurrence, Index: index})
		}
		if err := validateCADAssembly(state.Assembly); err != nil {
			return err
		}
		_, err = appendProjectCADHistoryEntry(ctx, tx, document, "subassembly-instance-create", group.ID, "Instantiate subassembly "+group.Name, cadSubassemblyInstanceCreateHistoryCommand{
			Group: group, GroupIndex: groupIndex, Occurrences: occurrences,
		})
		return err
	})
}

func cadTransformTranslation(transform CADTransform) [3]float64 {
	return [3]float64{transform.Matrix[3], transform.Matrix[7], transform.Matrix[11]}
}

func cadSubassemblyDefinitionIndex(definitions []CADSubassemblyDefinitionRevision, definitionID string, revision int) int {
	for index := range definitions {
		if definitions[index].ID == definitionID && definitions[index].Revision == revision {
			return index
		}
	}
	return -1
}

func cadAssemblyOccurrenceIsSubassemblyMember(assembly CADAssembly, occurrence CADAssemblyOccurrence) bool {
	if occurrence.SubassemblyMemberID == "" {
		return false
	}
	groupIndex := cadAssemblyGroupIndex(assembly.Groups, occurrence.ParentGroupID)
	return groupIndex >= 0 && assembly.Groups[groupIndex].SubassemblyDefinitionID != ""
}

func validateCADSubassemblies(assembly CADAssembly) (map[string]struct{}, error) {
	definitionByKey := make(map[string]CADSubassemblyDefinitionRevision, len(assembly.Subassemblies))
	for _, definition := range assembly.Subassemblies {
		if strings.TrimSpace(definition.ID) == "" || definition.Revision != cadSubassemblyDefinitionRevision1 || strings.TrimSpace(definition.Name) == "" || len(definition.Members) == 0 {
			return nil, ErrInvalidCADDocumentInput
		}
		key := definition.ID + ":1"
		if _, exists := definitionByKey[key]; exists {
			return nil, ErrInvalidCADDocumentInput
		}
		memberIDs := make(map[string]struct{}, len(definition.Members))
		for _, member := range definition.Members {
			if strings.TrimSpace(member.ID) == "" || strings.TrimSpace(member.NodeID) == "" || strings.TrimSpace(member.ModelID) == "" ||
				strings.TrimSpace(member.ModelRevisionID) == "" || strings.TrimSpace(member.Name) == "" || !isValidCADTransform(member.RelativeTransform) {
				return nil, ErrInvalidCADDocumentInput
			}
			if _, exists := memberIDs[member.ID]; exists {
				return nil, ErrInvalidCADDocumentInput
			}
			memberIDs[member.ID] = struct{}{}
		}
		definitionByKey[key] = definition
	}

	instanceDefinitionByGroupID := make(map[string]CADSubassemblyDefinitionRevision)
	for _, group := range assembly.Groups {
		if group.SubassemblyDefinitionID == "" && group.SubassemblyDefinitionRevision == 0 {
			continue
		}
		if group.SubassemblyDefinitionID == "" || group.SubassemblyDefinitionRevision != cadSubassemblyDefinitionRevision1 {
			return nil, ErrInvalidCADDocumentInput
		}
		definition, exists := definitionByKey[group.SubassemblyDefinitionID+":1"]
		if !exists {
			return nil, ErrInvalidCADDocumentInput
		}
		instanceDefinitionByGroupID[group.ID] = definition
	}
	for _, group := range assembly.Groups {
		if _, instanceParent := instanceDefinitionByGroupID[group.ParentGroupID]; instanceParent {
			return nil, ErrInvalidCADDocumentInput
		}
	}

	instanceOccurrencesByGroupID := make(map[string][]CADAssemblyOccurrence, len(instanceDefinitionByGroupID))
	linkedOccurrenceIDs := make(map[string]struct{})
	for _, occurrence := range assembly.Occurrences {
		_, instanceMember := instanceDefinitionByGroupID[occurrence.ParentGroupID]
		if !instanceMember {
			if occurrence.SubassemblyMemberID != "" {
				return nil, ErrInvalidCADDocumentInput
			}
			continue
		}
		if occurrence.SubassemblyMemberID == "" {
			return nil, ErrInvalidCADDocumentInput
		}
		instanceOccurrencesByGroupID[occurrence.ParentGroupID] = append(instanceOccurrencesByGroupID[occurrence.ParentGroupID], occurrence)
		linkedOccurrenceIDs[occurrence.ID] = struct{}{}
	}

	for groupID, definition := range instanceDefinitionByGroupID {
		occurrences := instanceOccurrencesByGroupID[groupID]
		if len(occurrences) != len(definition.Members) {
			return nil, ErrInvalidCADDocumentInput
		}
		instanceTranslation := [3]float64{}
		for index, member := range definition.Members {
			occurrence := occurrences[index]
			if occurrence.SubassemblyMemberID != member.ID || occurrence.NodeID != member.NodeID || occurrence.ModelID != member.ModelID ||
				occurrence.ModelRevisionID != member.ModelRevisionID || occurrence.Name != member.Name || occurrence.Suppressed != member.Suppressed {
				return nil, ErrInvalidCADDocumentInput
			}
			for matrixIndex := range occurrence.Transform.Matrix {
				if matrixIndex == 3 || matrixIndex == 7 || matrixIndex == 11 {
					continue
				}
				if occurrence.Transform.Matrix[matrixIndex] != member.RelativeTransform.Matrix[matrixIndex] {
					return nil, ErrInvalidCADDocumentInput
				}
			}
			translation := cadTransformTranslation(occurrence.Transform)
			relativeTranslation := cadTransformTranslation(member.RelativeTransform)
			if index == 0 {
				for axis := 0; axis < 3; axis++ {
					instanceTranslation[axis] = translation[axis] - relativeTranslation[axis]
				}
				continue
			}
			for axis := 0; axis < 3; axis++ {
				if translation[axis]-relativeTranslation[axis] != instanceTranslation[axis] {
					return nil, ErrInvalidCADDocumentInput
				}
			}
		}
	}
	return linkedOccurrenceIDs, nil
}
