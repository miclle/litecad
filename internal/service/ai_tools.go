package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/fox-gonic/fox/logger"
	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const (
	aiParametricToolBuildModel            = "build_parametric_model"
	aiParametricSystemPrompt              = "You are LiteCAD Assistant. When the user asks to create or edit a parameterized CAD model, call build_parametric_model. Do not claim that a model was created unless a valid tool call is returned. The tool input is the source artifact shown in LiteCAD. Prefer source_kind litecad-feature-dsl with a valid JSON document using version, unit, parameters, and features. The backend-owned LiteCAD feature DSL capability registry currently includes box, box_cut, extrude, extrude_cut, cylinder, cylinder_cut, sphere, ellipsoid, ellipse_extrude, sketch, revolve, sweep, loft, fillet, chamfer, and boolean. Use extrude features for rectangular, circular, or elliptical sketched bases, plates, and bosses when that better describes design intent, extrude_cut features for rectangular, circular, or elliptical sketch-based slots, pockets, notches, and holes, box features for direct rectangular bodies, box_cut features for direct rectangular slots, pockets, and edge notches, cylinder features for bosses or posts, sphere features for balls or spherical bodies, ellipsoid features for oval or three-axis spherical bodies, ellipse_extrude features for elliptical cylinders or oval posts, and cylinder_cut features for round holes. For a sphere with centered through holes along X, Y, and Z, prefer three cylinder_cut features with axes [1,0,0], [0,1,0], and [0,0,1], and set each origin to negative half the cut depth along its axis so every cutter fully passes through the sphere. Use sketch nodes with plane XY for reusable extrude profiles, and use XY, XZ, or YZ sketch nodes for profiles referenced by revolve, sweep, or loft. Use revolve for lathe-like parts, sweep for straight profile sweeps along a path, loft for two or more profile sections, boolean with operation union/subtract/intersect and inline solid operands for explicit boolean trees, fillet for rounded edges, and chamfer only when the user asks for a bevel; chamfer is accepted as a conservative modifier until edge-face selection is expanded. In LiteCAD feature DSL, extrude uses an optional origin, a rectangle/circle/ellipse sketch, height, and optional direction positive, negative, or symmetric; extrude_cut uses origin, a rectangle/circle/ellipse sketch, depth, and optional direction positive, negative, or symmetric; box and box_cut use origin and size; cylinder uses origin, optional non-zero axis, radius or diameter, and height; sphere uses origin plus radius or diameter; ellipsoid uses origin plus radius_x/radius_y/radius_z or diameter_x/diameter_y/diameter_z; ellipse_extrude uses origin, radius_x or diameter_x, radius_y or diameter_y, and height; cylinder_cut uses origin, optional non-zero axis, radius or diameter, and depth. Omit direction for default positive Z extrusion; use negative for downward cuts and symmetric for cuts centered on the sketch plane. Omit axis for default Z-axis cylinders, and use axis such as [1,0,0] or [0,1,0] for side holes or horizontal posts. Use repeat with integer count from 1 to 128 and a step vector for linear patterns such as repeated holes, slots, posts, spheres, ellipsoids, oval posts, or generated graph nodes; keep count literal and make step spacing parameterized when useful. Any generated solid feature may include transform with optional translate [x,y,z], rotate {axis:[x,y,z], angle_degrees:n, origin:[x,y,z]}, and positive scale [sx,sy,sz]; scale is feature-local and use it for stretched or proportionally varied primitives. Use numeric parameters or structured numeric expression objects such as {\"op\":\"add\",\"args\":[\"width\",2]} for geometry expressions; supported ops are add, sub, mul, and div. You may include boolean or string parameters as editable UI metadata, but do not reference them from geometry expressions. Use openscad only when the user explicitly asks for OpenSCAD source. Declare editable parameters in the artifact so LiteCAD can preview and save them."
	aiParametricConversationPrompt        = "In ordinary Assistant conversations, answer normally for inspection, metadata, design discussion, and planning requests. If the user asks to create, generate, add, or edit a CAD model or parametric source, return only strict JSON with no Markdown and no explanation, using exactly this shape: {\"tool\":\"build_parametric_model\",\"input\":{\"title\":\"...\",\"version\":\"v1\",\"source_kind\":\"litecad-feature-dsl\",\"code\":\"...\"}}. The input.code value must be a JSON-encoded string containing the generated source document."
	aiParametricJSONFallbackPrompt        = "Native function calling is unavailable for this request. Return only strict JSON with no Markdown and no explanation, using exactly this shape: {\"tool\":\"build_parametric_model\",\"input\":{\"title\":\"...\",\"version\":\"v1\",\"source_kind\":\"litecad-feature-dsl\",\"code\":\"...\"}}. The input.code value must be a JSON-encoded string containing the generated source document."
	aiParametricInvalidToolFailureMessage = "I could not create a valid parametric model from that response. Please try again with a more specific request."
	aiParametricToolModeJSONFallback      = "json_fallback"
	aiParametricToolModeNativeTool        = "native_tool"
)

var errAIParametricProviderChatFailed = errors.New("ai parametric provider chat failed")

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
	ActiveModelID  string
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

func buildAIParametricSystemPrompt() string {
	return replaceCapabilityList(
		aiParametricSystemPrompt,
		"The backend-owned LiteCAD feature DSL capability registry currently includes ",
		". Use extrude features",
	)
}

// ParseAIParametricToolCall validates strict JSON tool output from an AI provider.
func ParseAIParametricToolCall(output string) (AIParametricToolCall, error) {
	output = normalizeAIParametricToolOutput(output)
	var envelope struct {
		Tool       string          `json:"tool"`
		Input      json.RawMessage `json:"input"`
		Parameters json.RawMessage `json:"parameters"`
	}
	if err := json.Unmarshal([]byte(output), &envelope); err != nil {
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

func isAIParametricToolOutputAttempt(output string) bool {
	output = normalizeAIParametricToolOutput(output)
	var envelope struct {
		Tool string `json:"tool"`
	}
	if err := json.Unmarshal([]byte(output), &envelope); err != nil {
		return false
	}
	return envelope.Tool == aiParametricToolBuildModel
}

func normalizeAIParametricToolOutput(output string) string {
	trimmed := strings.TrimSpace(output)
	if !strings.HasPrefix(trimmed, "```") {
		return trimmed
	}
	lines := strings.Split(trimmed, "\n")
	if len(lines) < 3 || !strings.HasPrefix(strings.TrimSpace(lines[0]), "```") || strings.TrimSpace(lines[len(lines)-1]) != "```" {
		return trimmed
	}
	return strings.TrimSpace(strings.Join(lines[1:len(lines)-1], "\n"))
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
			if feature["origin"] == nil && liteCADFeatureDSLTypeDefaultsToOrigin(featureType) {
				feature["origin"] = []any{float64(0), float64(0), float64(0)}
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

func liteCADFeatureDSLTypeDefaultsToOrigin(featureType string) bool {
	switch featureType {
	case "cylinder", "sphere", "ellipsoid", "ellipse_extrude", "cylinder_cut":
		return true
	default:
		return false
	}
}

func buildParametricModelAITool() AIChatTool {
	tool := AIChatTool{
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
					"description": "Complete source text. For litecad-feature-dsl, use version 1 JSON and the backend capability registry: sketch, box, box_cut, extrude, extrude_cut, cylinder, cylinder_cut, sphere, ellipsoid, ellipse_extrude, revolve, sweep, loft, fillet, chamfer, and boolean. sketch defines reusable rectangle/circle/ellipse profiles; extrude sketch references must use XY profiles, while revolve/sweep/loft may use XY/XZ/YZ profiles. revolve references a sketch plus axis_origin/axis/angle_degrees; sweep uses a sketch and path points; loft uses two or more sections; boolean uses operation union/subtract/intersect and inline solid operands; fillet uses radius and chamfer uses distance as conservative edge modifiers. Features may include repeat with integer count 1..128 plus a step vector, and generated solid features may include transform with optional translate [x,y,z], rotate {axis, angle_degrees, origin}, and positive scale [sx,sy,sz]. Geometry expressions may reference numeric parameters directly or use structured numeric expression objects with op add/sub/mul/div and two args; boolean and string parameters are UI metadata.",
				},
			},
		},
	}
	properties := tool.Parameters["properties"].(map[string]any)
	codeSchema := properties["code"].(map[string]any)
	codeSchema["description"] = replaceCapabilityList(
		codeSchema["description"].(string),
		"the backend capability registry: ",
		". sketch defines",
	)
	return tool
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
	messageBody := strings.TrimSpace(input.Message)
	if messageBody == "" || utf8.RuneCountInString(messageBody) > maxAIChatMessageRunes {
		return ProjectAgentParametricRun{}, ErrInvalidAIChatInput
	}

	projectEntity, conversation, err := s.loadOwnedProjectAgentConversation(ctx, input.OwnerUserID, input.ProjectID, input.ConversationID)
	if err != nil {
		return ProjectAgentParametricRun{}, err
	}
	project := publicProject(projectEntity)
	userMessage := AIChatMessage{Role: "user", Body: messageBody}
	if s.aiClient == nil {
		return ProjectAgentParametricRun{}, ErrAIUnavailable
	}
	models, err := s.ListProjectModels(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectAgentParametricRun{}, err
	}
	activeModelContext := buildAIParametricActiveModelContext(input.ActiveModelID, models)
	persistedMessages, err := s.listRecentProjectAgentMessages(ctx, project.ID, conversation.ID, maxAIChatMessages)
	if err != nil {
		return ProjectAgentParametricRun{}, err
	}

	providerMessages := make([]AIChatMessage, 0, len(persistedMessages)+3)
	providerMessages = append(providerMessages,
		AIChatMessage{Role: "system", Body: cadAgentSystemPrompt},
		AIChatMessage{Role: "system", Body: buildAIParametricSystemPrompt()},
		AIChatMessage{Role: "system", Body: buildProjectAgentContext(project, models)},
	)
	if activeModelContext != "" {
		providerMessages = append(providerMessages, AIChatMessage{Role: "system", Body: activeModelContext})
	}
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
			fallbackCall, fallbackReply, fallbackErr := s.runAIParametricJSONFallback(ctx, providerMessages, "native tool call failed: "+err.Error())
			if fallbackErr != nil {
				logAIParametricRunFailure(ctx, "native_tool_failed_json_fallback_failed", fallbackErr)
				return ProjectAgentParametricRun{}, fmt.Errorf("send ai parametric chat: native tool call failed: %v; json fallback failed: %w", err, fallbackErr)
			}
			call = fallbackCall
			reply = fallbackReply
		} else {
			call, err = ParseAIParametricNativeToolCall(nativeCall)
			if err != nil {
				fallbackCall, fallbackReply, fallbackErr := s.runAIParametricJSONFallback(ctx, providerMessages, "native tool arguments were invalid: "+err.Error())
				if fallbackErr != nil {
					logAIParametricRunFailure(ctx, "native_tool_invalid_fallback_failed", fallbackErr)
					if persistErr := s.persistProjectAgentParametricFailure(ctx, project.ID, conversation.ID, userMessage); persistErr != nil {
						return ProjectAgentParametricRun{}, persistErr
					}
					return ProjectAgentParametricRun{}, err
				}
				call = fallbackCall
				reply = fallbackReply
			} else {
				reply = marshalAIParametricToolCall(call)
				toolMode = aiParametricToolModeNativeTool
			}
		}
	} else {
		call, reply, err = s.runAIParametricJSONFallback(ctx, providerMessages, "")
		if err != nil {
			if errors.Is(err, errAIParametricProviderChatFailed) {
				return ProjectAgentParametricRun{}, err
			}
			logAIParametricRunFailure(ctx, "json_fallback_failed", err)
			if persistErr := s.persistProjectAgentParametricFailure(ctx, project.ID, conversation.ID, userMessage); persistErr != nil {
				return ProjectAgentParametricRun{}, persistErr
			}
			return ProjectAgentParametricRun{}, err
		}
	}
	telemetry := ProjectAgentParametricTelemetry{
		ToolMode:   toolMode,
		SourceKind: call.Input.SourceKind,
		DurationMS: time.Since(startedAt).Milliseconds(),
	}
	originalTitle := call.Input.Title
	call.Input.Title = distinguishAIParametricRevisionTitle(call.Input.Title, input.ActiveModelID, models)
	if call.Input.Title != originalTitle {
		reply = marshalAIParametricToolCall(call)
	}

	return s.persistProjectAgentParametricRun(ctx, project.ID, conversation.ID, userMessage, call, reply, telemetry)
}

func buildAIParametricActiveModelContext(activeModelID string, models []ProjectModel) string {
	activeModelID = strings.TrimSpace(activeModelID)
	if activeModelID == "" {
		return ""
	}
	for _, model := range models {
		if model.ID != activeModelID {
			continue
		}
		displayName := strings.TrimSpace(model.OriginalFilename)
		if names := model.Metadata.ProductNames; len(names) > 0 && strings.TrimSpace(names[0]) != "" {
			displayName = strings.TrimSpace(names[0])
		}
		return fmt.Sprintf(
			"The user is revising the currently selected project model. Treat the request as a corrected source draft for that selected model, not as a claim that the existing canvas model already changed. Selected model data: id=%q, name=%q, format=%q. Return one complete replacement source draft. If generating a revised draft, choose a title that distinguishes it from the selected model, for example by adding \" revised\" or \" 修正版\". For centered through holes made with cylinder_cut, remember cylinder_cut starts at origin and extends in the positive axis direction; it is not centered automatically. To cut a sphere along X/Y/Z, use three cylinder_cut features with axes [1,0,0], [0,1,0], [0,0,1] and origins offset by negative half the cut depth along each axis so every cutter fully passes through the body.",
			sanitizeAIParametricContextValue(model.ID),
			sanitizeAIParametricContextValue(displayName),
			sanitizeAIParametricContextValue(model.Format),
		)
	}
	return "The user referenced a selected model, but that model was not found in the current project context. Return a corrected source draft and make the title distinguishable from existing project models."
}

func sanitizeAIParametricContextValue(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	return value
}

func distinguishAIParametricRevisionTitle(title, activeModelID string, models []ProjectModel) string {
	title = strings.TrimSpace(title)
	activeModelID = strings.TrimSpace(activeModelID)
	if activeModelID == "" || title == "" {
		return title
	}
	for _, model := range models {
		if model.ID != activeModelID {
			continue
		}
		modelNames := []string{strings.TrimSpace(model.OriginalFilename)}
		modelNames = append(modelNames, model.Metadata.ProductNames...)
		if titleAlreadyDistinctFromModel(title, modelNames) {
			return title
		}
		if containsCJK(title) {
			return title + " 修正版"
		}
		return title + " revised"
	}
	return title
}

func titleAlreadyDistinctFromModel(title string, modelNames []string) bool {
	normalizedTitle := normalizeAIParametricComparableTitle(title)
	lowerTitle := strings.ToLower(title)
	if strings.Contains(lowerTitle, "revised") || strings.Contains(title, "修正版") {
		return true
	}
	for _, name := range modelNames {
		if normalizedTitle != "" && normalizedTitle == normalizeAIParametricComparableTitle(name) {
			return false
		}
	}
	return true
}

func normalizeAIParametricComparableTitle(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	for _, suffix := range []string{".lcad.json", ".scad", "-litecad"} {
		value = strings.TrimSuffix(value, suffix)
	}
	return strings.TrimSpace(value)
}

func containsCJK(value string) bool {
	for _, r := range value {
		if r >= '\u4e00' && r <= '\u9fff' {
			return true
		}
	}
	return false
}

func (s *Service) runAIParametricJSONFallback(ctx context.Context, providerMessages []AIChatMessage, repairReason string) (AIParametricToolCall, string, error) {
	messages := appendAIParametricJSONFallbackPrompt(providerMessages)
	if strings.TrimSpace(repairReason) != "" {
		messages = append(messages, AIChatMessage{
			Role: "system",
			Body: "The previous parametric model response was not accepted: " + summarizeAIParametricToolError(repairReason) + ". Return one corrected strict JSON build_parametric_model tool call only.",
		})
	}

	providerReply, err := s.aiClient.Chat(ctx, messages)
	if err != nil {
		return AIParametricToolCall{}, "", fmt.Errorf("%w: %v", errAIParametricProviderChatFailed, err)
	}
	call, err := ParseAIParametricToolCall(providerReply)
	if err == nil {
		return call, strings.TrimSpace(providerReply), nil
	}

	repairMessages := appendAIParametricJSONFallbackPrompt(providerMessages)
	repairMessages = append(repairMessages, AIChatMessage{
		Role: "assistant",
		Body: strings.TrimSpace(providerReply),
	})
	repairMessages = append(repairMessages, AIChatMessage{
		Role: "system",
		Body: "Repair the previous response. It was rejected because: " + summarizeAIParametricToolError(err.Error()) + ". Return one corrected strict JSON build_parametric_model tool call only.",
	})
	repairedReply, repairErr := s.aiClient.Chat(ctx, repairMessages)
	if repairErr != nil {
		return AIParametricToolCall{}, "", fmt.Errorf("initial json fallback invalid: %v; repair chat failed: %w", err, repairErr)
	}
	repairedCall, repairParseErr := ParseAIParametricToolCall(repairedReply)
	if repairParseErr != nil {
		return AIParametricToolCall{}, "", fmt.Errorf("initial json fallback invalid: %v; repair invalid: %w", err, repairParseErr)
	}
	return repairedCall, strings.TrimSpace(repairedReply), nil
}

func summarizeAIParametricToolError(message string) string {
	message = strings.TrimSpace(strings.ReplaceAll(message, "\n", " "))
	if len(message) > 600 {
		return message[:600] + "..."
	}
	if message == "" {
		return "invalid tool output"
	}
	return message
}

func logAIParametricRunFailure(ctx context.Context, phase string, err error) {
	logger.NewWithContext(ctx).WithFields(map[string]any{
		"type":  "AI_PARAMETRIC",
		"phase": phase,
		"error": summarizeAIParametricToolError(err.Error()),
	}).Warn("parametric model generation failed")
}

func (s *Service) persistProjectAgentParametricRun(ctx context.Context, projectID, conversationID string, userMessage AIChatMessage, call AIParametricToolCall, reply string, telemetry ProjectAgentParametricTelemetry) (ProjectAgentParametricRun, error) {
	var run ProjectAgentParametricRun
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := createProjectAgentMessageInDB(ctx, tx, projectID, conversationID, userMessage); err != nil {
			return err
		}
		assistantMessage, err := createProjectAgentMessageInDB(ctx, tx, projectID, conversationID, AIChatMessage{Role: "assistant", Body: strings.TrimSpace(reply)})
		if err != nil {
			return err
		}
		artifact, err := createProjectParametricArtifactInDB(ctx, tx, projectID, CreateProjectParametricArtifactInput{
			ConversationID:       conversationID,
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
	_, err := s.persistProjectAgentParametricFailureMessage(ctx, projectID, conversationID, userMessage)
	return err
}

func (s *Service) persistProjectAgentParametricFailureMessage(ctx context.Context, projectID, conversationID string, userMessage AIChatMessage) (ProjectAgentMessage, error) {
	var assistantMessage ProjectAgentMessage
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := createProjectAgentMessageInDB(ctx, tx, projectID, conversationID, userMessage); err != nil {
			return err
		}
		message, err := createProjectAgentMessageInDB(ctx, tx, projectID, conversationID, AIChatMessage{
			Role: "assistant",
			Body: aiParametricInvalidToolFailureMessage,
		})
		if err != nil {
			return err
		}
		assistantMessage = message
		return nil
	})
	if err != nil {
		return ProjectAgentMessage{}, err
	}
	if assistantMessage.ID == "" {
		return ProjectAgentMessage{}, ErrInvalidAIChatInput
	}
	return assistantMessage, nil
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
