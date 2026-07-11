package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const (
	aiParametricToolBuildModel = "build_parametric_model"
	aiParametricSystemPrompt   = "You are LiteCAD Assistant. When the user asks to create or edit a parameterized CAD model, call build_parametric_model. Do not claim that a model was created unless a valid tool call is returned. The tool input is the source artifact shown in LiteCAD. Use OpenSCAD source for the first milestone. Declare editable parameters at the top of the file with Customizer-style comments."
)

// AIParametricArtifactInput is the validated tool input for generated CAD source.
type AIParametricArtifactInput struct {
	Title      string `json:"title"`
	Version    string `json:"version"`
	SourceKind string `json:"source_kind"`
	Code       string `json:"code"`
}

// AIParametricToolCall is a validated structured Assistant tool call.
type AIParametricToolCall struct {
	Tool  string                    `json:"tool"`
	Input AIParametricArtifactInput `json:"input"`
}

// ProjectAgentMessagePart is one structured part of an Assistant response.
type ProjectAgentMessagePart struct {
	Type       string                `json:"type"`
	Text       string                `json:"text,omitempty"`
	ToolCall   *AIParametricToolCall `json:"tool_call,omitempty"`
	ArtifactID string                `json:"artifact_id,omitempty"`
}

// ProjectAgentStructuredMessage is a structured Assistant message returned by tool routes.
type ProjectAgentStructuredMessage struct {
	ID             string                    `json:"id"`
	ProjectID      string                    `json:"project_id"`
	ConversationID string                    `json:"conversation_id"`
	Role           string                    `json:"role"`
	Body           string                    `json:"body"`
	Parts          []ProjectAgentMessagePart `json:"parts"`
	CreatedAt      string                    `json:"created_at"`
	UpdatedAt      string                    `json:"updated_at"`
}

// ProjectAgentParametricRunInput is the request to generate a parametric artifact from a conversation prompt.
type ProjectAgentParametricRunInput struct {
	OwnerUserID    string
	ProjectID      string
	ConversationID string
	Message        string
}

// ProjectAgentParametricRun is the generated artifact and structured Assistant message.
type ProjectAgentParametricRun struct {
	Message  ProjectAgentStructuredMessage `json:"message"`
	Artifact ProjectParametricArtifact     `json:"artifact"`
}

// ParseAIParametricToolCall validates strict JSON tool output from an AI provider.
func ParseAIParametricToolCall(output string) (AIParametricToolCall, error) {
	var call AIParametricToolCall
	if err := json.Unmarshal([]byte(strings.TrimSpace(output)), &call); err != nil {
		return AIParametricToolCall{}, ErrInvalidAIChatInput
	}
	call.Tool = strings.TrimSpace(call.Tool)
	call.Input.Title = strings.TrimSpace(call.Input.Title)
	call.Input.Version = strings.TrimSpace(call.Input.Version)
	call.Input.SourceKind = strings.TrimSpace(call.Input.SourceKind)
	call.Input.Code = strings.TrimSpace(call.Input.Code)
	if call.Tool != aiParametricToolBuildModel ||
		call.Input.Title == "" ||
		utf8.RuneCountInString(call.Input.Title) > maxProjectParametricArtifactTitleRunes ||
		call.Input.SourceKind != projectParametricSourceKindOpenSCAD ||
		call.Input.Code == "" ||
		len([]byte(call.Input.Code)) > maxProjectParametricArtifactSourceBytes {
		return AIParametricToolCall{}, ErrInvalidAIChatInput
	}
	return call, nil
}

// RunProjectAgentParametric asks the configured AI provider for a parametric artifact tool call and persists it.
func (s *Service) RunProjectAgentParametric(ctx context.Context, input ProjectAgentParametricRunInput) (ProjectAgentParametricRun, error) {
	if s.aiClient == nil {
		return ProjectAgentParametricRun{}, ErrAIUnavailable
	}
	messageBody := strings.TrimSpace(input.Message)
	if messageBody == "" || utf8.RuneCountInString(messageBody) > maxAIChatMessageRunes {
		return ProjectAgentParametricRun{}, ErrInvalidAIChatInput
	}

	projectEntity, conversation, err := s.loadOwnedProjectAgentConversation(ctx, input.OwnerUserID, input.ProjectID, input.ConversationID)
	if err != nil {
		return ProjectAgentParametricRun{}, err
	}
	project := publicProject(projectEntity)
	models, err := s.ListProjectModels(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectAgentParametricRun{}, err
	}
	persistedMessages, err := s.listRecentProjectAgentMessages(ctx, project.ID, conversation.ID, maxAIChatMessages)
	if err != nil {
		return ProjectAgentParametricRun{}, err
	}

	userMessage := AIChatMessage{Role: "user", Body: messageBody}
	providerMessages := make([]AIChatMessage, 0, len(persistedMessages)+3)
	providerMessages = append(providerMessages,
		AIChatMessage{Role: "system", Body: cadAgentSystemPrompt},
		AIChatMessage{Role: "system", Body: aiParametricSystemPrompt},
		AIChatMessage{Role: "system", Body: buildProjectAgentContext(project, models)},
	)
	for _, message := range persistedMessages {
		providerMessages = append(providerMessages, AIChatMessage{Role: message.Role, Body: message.Body})
	}
	providerMessages = append(providerMessages, userMessage)

	reply, err := s.aiClient.Chat(ctx, providerMessages)
	if err != nil {
		return ProjectAgentParametricRun{}, fmt.Errorf("send ai parametric chat: %w", err)
	}
	call, err := ParseAIParametricToolCall(reply)
	if err != nil {
		return ProjectAgentParametricRun{}, err
	}

	var run ProjectAgentParametricRun
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := createProjectAgentMessageInDB(ctx, tx, project.ID, conversation.ID, userMessage); err != nil {
			return err
		}
		assistantMessage, err := createProjectAgentMessageInDB(ctx, tx, project.ID, conversation.ID, AIChatMessage{Role: "assistant", Body: strings.TrimSpace(reply)})
		if err != nil {
			return err
		}
		artifact, err := createProjectParametricArtifactInDB(ctx, tx, project.ID, CreateProjectParametricArtifactInput{
			ConversationID: conversation.ID,
			MessageID:      assistantMessage.ID,
			Title:          call.Input.Title,
			SourceKind:     call.Input.SourceKind,
			SourceCode:     call.Input.Code,
			CompileStatus:  projectParametricCompileStatusPending,
		})
		if err != nil {
			return err
		}
		run = ProjectAgentParametricRun{
			Message: ProjectAgentStructuredMessage{
				ID:             assistantMessage.ID,
				ProjectID:      assistantMessage.ProjectID,
				ConversationID: assistantMessage.ConversationID,
				Role:           assistantMessage.Role,
				Body:           assistantMessage.Body,
				Parts: []ProjectAgentMessagePart{
					{Type: "tool_call", ToolCall: &call},
					{Type: "artifact", ArtifactID: artifact.ID},
				},
				CreatedAt: assistantMessage.CreatedAt,
				UpdatedAt: assistantMessage.UpdatedAt,
			},
			Artifact: artifact,
		}
		return nil
	})
	if err != nil {
		return ProjectAgentParametricRun{}, err
	}
	return run, nil
}

func createProjectParametricArtifactInDB(ctx context.Context, db *gorm.DB, projectID string, input CreateProjectParametricArtifactInput) (ProjectParametricArtifact, error) {
	normalized, err := normalizeProjectParametricArtifactInput(projectParametricArtifactInput{
		Title:           input.Title,
		SourceKind:      input.SourceKind,
		SourceCode:      input.SourceCode,
		ParameterValues: input.ParameterValues,
		CompileStatus:   input.CompileStatus,
		CompileError:    input.CompileError,
		PreviewModelID:  input.PreviewModelID,
	})
	if err != nil {
		return ProjectParametricArtifact{}, err
	}
	artifactID, err := id.NewPrefixed("pma")
	if err != nil {
		return ProjectParametricArtifact{}, err
	}
	artifact := entity.ProjectParametricArtifact{
		ID:                  artifactID,
		ProjectID:           projectID,
		ConversationID:      strings.TrimSpace(input.ConversationID),
		MessageID:           strings.TrimSpace(input.MessageID),
		Title:               normalized.title,
		SourceKind:          normalized.sourceKind,
		SourceCode:          normalized.sourceCode,
		ParameterValuesJSON: normalized.parameterValuesJSON,
		CompileStatus:       normalized.compileStatus,
		CompileError:        normalized.compileError,
		PreviewModelID:      normalized.previewModelID,
	}
	if err := db.WithContext(ctx).Create(&artifact).Error; err != nil {
		return ProjectParametricArtifact{}, fmt.Errorf("create project parametric artifact: %w", err)
	}
	return publicProjectParametricArtifact(artifact), nil
}
