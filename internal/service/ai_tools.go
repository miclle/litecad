package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const (
	aiParametricToolBuildModel            = "build_parametric_model"
	aiParametricSystemPrompt              = "You are LiteCAD Assistant. When the user asks to create or edit a parameterized CAD model, call build_parametric_model. Do not claim that a model was created unless a valid tool call is returned. The tool input is the source artifact shown in LiteCAD. Prefer source_kind litecad-feature-dsl with a valid JSON document using version, unit, parameters, and features. Use extrude features for rectangular or circular sketched bases, plates, and bosses when that better describes design intent, extrude_cut features for rectangular or circular sketch-based slots, pockets, notches, and holes, box features for direct rectangular bodies, box_cut features for direct rectangular slots, pockets, and edge notches, cylinder features for bosses or posts, and cylinder_cut features for round holes. In LiteCAD feature DSL, extrude uses an optional origin, a rectangle sketch with size or a circle sketch with radius or diameter, height, and optional direction positive, negative, or symmetric; extrude_cut uses origin, a rectangle sketch with size or a circle sketch with radius or diameter, depth, and optional direction positive, negative, or symmetric; box and box_cut use origin and size; cylinder uses origin, optional non-zero axis, radius or diameter, and height; cylinder_cut uses origin, optional non-zero axis, radius or diameter, and depth. Omit direction for default positive Z extrusion; use negative for downward cuts and symmetric for cuts centered on the sketch plane. Omit axis for default Z-axis cylinders, and use axis such as [1,0,0] or [0,1,0] for side holes or horizontal posts. Use repeat with integer count from 1 to 128 and a step vector for linear patterns such as repeated holes, slots, or posts; keep count literal and make step spacing parameterized when useful. Use numeric parameters or structured numeric expression objects such as {\"op\":\"add\",\"args\":[\"width\",2]} for geometry expressions; supported ops are add, sub, mul, and div. You may include boolean or string parameters as editable UI metadata, but do not reference them from geometry expressions. Use openscad only when the user explicitly asks for OpenSCAD source. Declare editable parameters in the artifact so LiteCAD can preview and save them."
	aiParametricJSONFallbackPrompt        = "Native function calling is unavailable for this request. Return only strict JSON with no Markdown and no explanation, using exactly this shape: {\"tool\":\"build_parametric_model\",\"input\":{\"title\":\"...\",\"version\":\"v1\",\"source_kind\":\"litecad-feature-dsl\",\"code\":\"...\"}}. The input.code value must be a JSON-encoded string containing the generated source document."
	aiParametricInvalidToolFailureMessage = "I could not create a valid parametric model from that response. Please try again with a more specific request."
	aiParametricToolModeJSONFallback      = "json_fallback"
	aiParametricToolModeNativeTool        = "native_tool"
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
	Message   ProjectAgentStructuredMessage   `json:"message"`
	Artifact  ProjectParametricArtifact       `json:"artifact"`
	Telemetry ProjectAgentParametricTelemetry `json:"telemetry"`
}

// ProjectAgentParametricTelemetry describes one non-durable Assistant generation run.
type ProjectAgentParametricTelemetry struct {
	ToolMode   string `json:"tool_mode"`
	SourceKind string `json:"source_kind"`
	DurationMS int64  `json:"duration_ms"`
}

func appendAIParametricJSONFallbackPrompt(messages []AIChatMessage) []AIChatMessage {
	fallbackMessages := make([]AIChatMessage, 0, len(messages)+1)
	fallbackMessages = append(fallbackMessages, messages...)
	fallbackMessages = append(fallbackMessages, AIChatMessage{Role: "system", Body: aiParametricJSONFallbackPrompt})
	return fallbackMessages
}

// ParseAIParametricToolCall validates strict JSON tool output from an AI provider.
func ParseAIParametricToolCall(output string) (AIParametricToolCall, error) {
	var envelope struct {
		Tool       string          `json:"tool"`
		Input      json.RawMessage `json:"input"`
		Parameters json.RawMessage `json:"parameters"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(output)), &envelope); err != nil {
		return AIParametricToolCall{}, ErrInvalidAIChatInput
	}
	inputBody := envelope.Input
	if len(inputBody) == 0 {
		inputBody = envelope.Parameters
	}
	input, err := parseAIParametricArtifactInput(inputBody)
	if err != nil {
		return AIParametricToolCall{}, err
	}
	return validateAIParametricToolCall(AIParametricToolCall{Tool: envelope.Tool, Input: input})
}

// ParseAIParametricNativeToolCall validates a native provider function call.
func ParseAIParametricNativeToolCall(nativeCall AIChatToolCall) (AIParametricToolCall, error) {
	input, err := parseAIParametricArtifactInput(nativeCall.Arguments)
	if err != nil {
		return AIParametricToolCall{}, ErrInvalidAIChatInput
	}
	return validateAIParametricToolCall(AIParametricToolCall{Tool: nativeCall.Tool, Input: input})
}

func parseAIParametricArtifactInput(raw json.RawMessage) (AIParametricArtifactInput, error) {
	if len(raw) == 0 {
		return AIParametricArtifactInput{}, ErrInvalidAIChatInput
	}
	var input struct {
		Title      string          `json:"title"`
		Version    string          `json:"version"`
		SourceKind string          `json:"source_kind"`
		Code       json.RawMessage `json:"code"`
		Source     json.RawMessage `json:"source"`
	}
	if err := json.Unmarshal(raw, &input); err != nil {
		return AIParametricArtifactInput{}, ErrInvalidAIChatInput
	}
	code, ok := normalizeAIParametricSource(input.Code)
	if !ok {
		code, ok = normalizeAIParametricSource(input.Source)
	}
	if !ok {
		return AIParametricArtifactInput{}, ErrInvalidAIChatInput
	}
	return AIParametricArtifactInput{
		Title:      input.Title,
		Version:    input.Version,
		SourceKind: input.SourceKind,
		Code:       code,
	}, nil
}

func normalizeAIParametricSource(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", false
	}
	var source string
	if err := json.Unmarshal(raw, &source); err == nil {
		return strings.TrimSpace(source), true
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, raw); err != nil {
		return "", false
	}
	return compact.String(), true
}

func validateAIParametricToolCall(call AIParametricToolCall) (AIParametricToolCall, error) {
	call.Tool = strings.TrimSpace(call.Tool)
	call.Input.Title = strings.TrimSpace(call.Input.Title)
	call.Input.Version = strings.TrimSpace(call.Input.Version)
	call.Input.SourceKind = strings.TrimSpace(call.Input.SourceKind)
	call.Input.Code = strings.TrimSpace(call.Input.Code)
	if call.Input.SourceKind == projectParametricSourceKindLiteCADDSL {
		normalizedCode, err := normalizeAIParametricLiteCADFeatureDSLSource(call.Input.Code)
		if err != nil {
			return AIParametricToolCall{}, ErrInvalidAIChatInput
		}
		call.Input.Code = normalizedCode
	}
	if call.Tool != aiParametricToolBuildModel ||
		call.Input.Title == "" ||
		utf8.RuneCountInString(call.Input.Title) > maxProjectParametricArtifactTitleRunes ||
		!isProjectParametricSourceKind(call.Input.SourceKind) ||
		call.Input.Code == "" ||
		len([]byte(call.Input.Code)) > maxProjectParametricArtifactSourceBytes {
		return AIParametricToolCall{}, ErrInvalidAIChatInput
	}
	if call.Input.SourceKind == projectParametricSourceKindLiteCADDSL && validateLiteCADFeatureDSLSource([]byte(call.Input.Code)) != nil {
		return AIParametricToolCall{}, ErrInvalidAIChatInput
	}
	return call, nil
}

func normalizeAIParametricLiteCADFeatureDSLSource(source string) (string, error) {
	var document map[string]any
	if err := json.Unmarshal([]byte(source), &document); err != nil {
		return "", err
	}
	if version, ok := document["version"].(string); ok {
		switch strings.ToLower(strings.TrimSpace(version)) {
		case "v1", "1.0":
			document["version"] = float64(1)
		}
	}
	if unit, ok := document["unit"].(string); ok {
		switch strings.ToLower(strings.TrimSpace(unit)) {
		case "millimeter", "millimeters", "mm":
			document["unit"] = "millimetre"
		}
	}
	switch parameters := document["parameters"].(type) {
	case map[string]any:
		for name, value := range parameters {
			switch typedValue := value.(type) {
			case float64:
				parameters[name] = map[string]any{"type": "number", "default": typedValue}
			case map[string]any:
				if parameterType, ok := typedValue["type"].(string); ok && strings.EqualFold(strings.TrimSpace(parameterType), "length") {
					typedValue["type"] = "number"
				}
				if _, hasType := typedValue["type"]; !hasType {
					if _, ok := typedValue["default"].(float64); ok {
						typedValue["type"] = "number"
					}
				}
			}
		}
	case []any:
		normalizedParameters := map[string]any{}
		for _, value := range parameters {
			parameter, ok := value.(map[string]any)
			if !ok {
				continue
			}
			name, _ := parameter["name"].(string)
			name = strings.TrimSpace(name)
			if name == "" {
				continue
			}
			delete(parameter, "name")
			if defaultValue, ok := parameter["value"]; ok {
				delete(parameter, "value")
				if _, hasDefault := parameter["default"]; !hasDefault {
					parameter["default"] = defaultValue
				}
			}
			if _, hasType := parameter["type"]; !hasType {
				if _, ok := parameter["default"].(float64); ok {
					parameter["type"] = "number"
				}
			} else if parameterType, ok := parameter["type"].(string); ok && strings.EqualFold(strings.TrimSpace(parameterType), "length") {
				parameter["type"] = "number"
			}
			normalizedParameters[name] = parameter
		}
		document["parameters"] = normalizedParameters
	}
	if features, ok := document["features"].([]any); ok {
		for index, value := range features {
			feature, ok := value.(map[string]any)
			if !ok {
				continue
			}
			featureType, _ := feature["type"].(string)
			featureType = strings.TrimSpace(featureType)
			if featureType == "box" || featureType == "box_cut" {
				if size, ok := feature["size"].(map[string]any); ok {
					feature["size"] = []any{size["x"], size["y"], size["z"]}
				}
			}
			if id, ok := feature["id"].(string); ok && strings.TrimSpace(id) != "" {
				continue
			}
			if featureType == "" {
				featureType = "feature"
			}
			feature["id"] = fmt.Sprintf("%s_%d", featureType, index+1)
		}
	}
	data, err := json.Marshal(document)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func buildParametricModelAITool() AIChatTool {
	return AIChatTool{
		Name:        aiParametricToolBuildModel,
		Description: "Create or edit one parameterized CAD source artifact for LiteCAD.",
		Parameters: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"title", "version", "source_kind", "code"},
			"properties": map[string]any{
				"title": map[string]any{
					"type":        "string",
					"description": "Short human-readable model title.",
				},
				"version": map[string]any{
					"type":        "string",
					"description": "Artifact version, currently v1.",
				},
				"source_kind": map[string]any{
					"type":        "string",
					"enum":        []string{projectParametricSourceKindLiteCADDSL, projectParametricSourceKindOpenSCAD},
					"description": "Prefer litecad-feature-dsl unless the user explicitly asks for OpenSCAD.",
				},
				"code": map[string]any{
					"type":        "string",
					"description": "Complete source text. For litecad-feature-dsl, use version 1 JSON with extrude, extrude_cut, box, box_cut, cylinder, and cylinder_cut features. extrude uses an optional origin, a rectangle sketch with size or circle sketch with radius/diameter, height, and optional direction positive/negative/symmetric; extrude_cut uses origin, a rectangle sketch with size or circle sketch with radius/diameter, depth, and optional direction positive/negative/symmetric. box_cut uses origin and size for rectangular slots, pockets, and notches. Cylinders and cylinder cuts may include an optional non-zero axis vector, and features may include repeat with integer count 1..128 plus a step vector. Geometry expressions may reference numeric parameters directly or use structured numeric expression objects with op add/sub/mul/div and two args; boolean and string parameters are UI metadata.",
				},
			},
		},
	}
}

func marshalAIParametricToolCall(call AIParametricToolCall) string {
	data, err := json.Marshal(call)
	if err != nil {
		return ""
	}
	return string(data)
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

	var reply string
	var call AIParametricToolCall
	toolMode := aiParametricToolModeJSONFallback
	startedAt := time.Now()
	if toolClient, ok := s.aiClient.(AIChatToolClient); ok {
		nativeCall, err := toolClient.ChatWithTools(ctx, providerMessages, []AIChatTool{buildParametricModelAITool()})
		if err != nil {
			providerReply, fallbackErr := s.aiClient.Chat(ctx, appendAIParametricJSONFallbackPrompt(providerMessages))
			if fallbackErr != nil {
				return ProjectAgentParametricRun{}, fmt.Errorf("send ai parametric chat: native tool call failed: %v; json fallback failed: %w", err, fallbackErr)
			}
			call, err = ParseAIParametricToolCall(providerReply)
			if err != nil {
				if persistErr := s.persistProjectAgentParametricFailure(ctx, project.ID, conversation.ID, userMessage); persistErr != nil {
					return ProjectAgentParametricRun{}, persistErr
				}
				return ProjectAgentParametricRun{}, err
			}
			reply = strings.TrimSpace(providerReply)
		} else {
			call, err = ParseAIParametricNativeToolCall(nativeCall)
			if err != nil {
				if persistErr := s.persistProjectAgentParametricFailure(ctx, project.ID, conversation.ID, userMessage); persistErr != nil {
					return ProjectAgentParametricRun{}, persistErr
				}
				return ProjectAgentParametricRun{}, err
			}
			reply = marshalAIParametricToolCall(call)
			toolMode = aiParametricToolModeNativeTool
		}
	} else {
		providerReply, err := s.aiClient.Chat(ctx, appendAIParametricJSONFallbackPrompt(providerMessages))
		if err != nil {
			return ProjectAgentParametricRun{}, fmt.Errorf("send ai parametric chat: %w", err)
		}
		call, err = ParseAIParametricToolCall(providerReply)
		if err != nil {
			if persistErr := s.persistProjectAgentParametricFailure(ctx, project.ID, conversation.ID, userMessage); persistErr != nil {
				return ProjectAgentParametricRun{}, persistErr
			}
			return ProjectAgentParametricRun{}, err
		}
		reply = strings.TrimSpace(providerReply)
	}
	telemetry := ProjectAgentParametricTelemetry{
		ToolMode:   toolMode,
		SourceKind: call.Input.SourceKind,
		DurationMS: time.Since(startedAt).Milliseconds(),
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
			ConversationID:       conversation.ID,
			MessageID:            assistantMessage.ID,
			Title:                call.Input.Title,
			SourceKind:           call.Input.SourceKind,
			SourceCode:           call.Input.Code,
			CompileStatus:        projectParametricCompileStatusPending,
			GenerationToolMode:   telemetry.ToolMode,
			GenerationDurationMS: telemetry.DurationMS,
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
			Artifact:  artifact,
			Telemetry: telemetry,
		}
		return nil
	})
	if err != nil {
		return ProjectAgentParametricRun{}, err
	}
	return run, nil
}

func (s *Service) persistProjectAgentParametricFailure(ctx context.Context, projectID, conversationID string, userMessage AIChatMessage) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := createProjectAgentMessageInDB(ctx, tx, projectID, conversationID, userMessage); err != nil {
			return err
		}
		_, err := createProjectAgentMessageInDB(ctx, tx, projectID, conversationID, AIChatMessage{
			Role: "assistant",
			Body: aiParametricInvalidToolFailureMessage,
		})
		return err
	})
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
		ID:                   artifactID,
		ProjectID:            projectID,
		ConversationID:       strings.TrimSpace(input.ConversationID),
		MessageID:            strings.TrimSpace(input.MessageID),
		Title:                normalized.title,
		SourceKind:           normalized.sourceKind,
		SourceCode:           normalized.sourceCode,
		ParameterValuesJSON:  normalized.parameterValuesJSON,
		CompileStatus:        normalized.compileStatus,
		CompileError:         normalized.compileError,
		PreviewModelID:       normalized.previewModelID,
		GenerationToolMode:   strings.TrimSpace(input.GenerationToolMode),
		GenerationDurationMS: max(input.GenerationDurationMS, 0),
	}
	if err := db.WithContext(ctx).Create(&artifact).Error; err != nil {
		return ProjectParametricArtifact{}, fmt.Errorf("create project parametric artifact: %w", err)
	}
	return publicProjectParametricArtifact(artifact), nil
}
