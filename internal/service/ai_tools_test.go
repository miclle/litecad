package service

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestAIParametricToolCallParser(t *testing.T) {
	call, err := ParseAIParametricToolCall(`{
  "tool": "build_parametric_model",
  "input": {
    "title": "Mounting bracket",
    "version": "v1",
    "source_kind": "openscad",
    "code": "width = 40; // [10:1:100]\ncube([width, 10, 5]);"
  }
}`)
	if err != nil {
		t.Fatalf("ParseAIParametricToolCall returned error: %v", err)
	}
	if call.Tool != "build_parametric_model" {
		t.Fatalf("tool = %q", call.Tool)
	}
	if call.Input.Title != "Mounting bracket" || call.Input.Version != "v1" || call.Input.SourceKind != "openscad" || call.Input.Code == "" {
		t.Fatalf("call input = %+v", call.Input)
	}

	call, err = ParseAIParametricToolCall("```json\n" + `{
  "tool": "build_parametric_model",
  "input": {
    "title": "Fenced sphere",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":1,\"unit\":\"millimetre\",\"features\":[{\"id\":\"body\",\"type\":\"sphere\",\"origin\":[0,0,0],\"diameter\":30}]}"
  }
}` + "\n```")
	if err != nil {
		t.Fatalf("ParseAIParametricToolCall fenced JSON returned error: %v", err)
	}
	if call.Input.Title != "Fenced sphere" || !strings.Contains(call.Input.Code, `"sphere"`) {
		t.Fatalf("parsed fenced call = %+v", call)
	}
}

func TestAIParametricToolCallParserAcceptsLiteCADFeatureDSL(t *testing.T) {
	call, err := ParseAIParametricToolCall(`{
  "tool": "build_parametric_model",
  "input": {
    "title": "Feature DSL bracket",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":1,\"unit\":\"millimetre\",\"parameters\":{\"width\":{\"type\":\"number\",\"default\":80}},\"features\":[{\"id\":\"base\",\"type\":\"box\",\"origin\":[0,0,0],\"size\":[\"width\",40,6]}]}"
  }
}`)
	if err != nil {
		t.Fatalf("ParseAIParametricToolCall returned error: %v", err)
	}
	if call.Input.SourceKind != "litecad-feature-dsl" || call.Input.Code == "" {
		t.Fatalf("call input = %+v", call.Input)
	}
}

func TestAIParametricToolCallParserAcceptsLiteCADFeatureDSLCylinderCuts(t *testing.T) {
	call, err := ParseAIParametricToolCall(`{
  "tool": "build_parametric_model",
  "input": {
    "title": "Feature DSL plate with hole",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":1,\"unit\":\"millimetre\",\"parameters\":{\"hole_diameter\":{\"type\":\"number\",\"default\":8,\"min\":2,\"max\":20},\"boss_radius\":{\"type\":\"number\",\"default\":6}},\"features\":[{\"id\":\"plate\",\"type\":\"box\",\"origin\":[0,0,0],\"size\":[80,40,6]},{\"id\":\"boss\",\"type\":\"cylinder\",\"origin\":[20,20,6],\"radius\":\"boss_radius\",\"height\":10},{\"id\":\"hole\",\"type\":\"cylinder_cut\",\"origin\":[40,20,-1],\"diameter\":\"hole_diameter\",\"depth\":8}]}"
  }
}`)
	if err != nil {
		t.Fatalf("ParseAIParametricToolCall returned error: %v", err)
	}
	if call.Input.SourceKind != "litecad-feature-dsl" || call.Input.Code == "" {
		t.Fatalf("call input = %+v", call.Input)
	}
}

func TestAIParametricToolCallParserAcceptsLiteCADFeatureDSLEllipseFeatures(t *testing.T) {
	call, err := ParseAIParametricToolCall(`{
  "tool": "build_parametric_model",
  "input": {
    "title": "Feature DSL oval body",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":1,\"unit\":\"millimetre\",\"parameters\":{\"major\":{\"type\":\"number\",\"default\":30},\"minor\":{\"type\":\"number\",\"default\":18},\"height\":{\"type\":\"number\",\"default\":50}},\"features\":[{\"id\":\"ellipsoid\",\"type\":\"ellipsoid\",\"origin\":[0,0,0],\"radius_x\":{\"op\":\"div\",\"args\":[\"major\",2]},\"radius_y\":{\"op\":\"div\",\"args\":[\"minor\",2]},\"radius_z\":12},{\"id\":\"oval_post\",\"type\":\"ellipse_extrude\",\"origin\":[45,0,0],\"radius_x\":{\"op\":\"div\",\"args\":[\"major\",2]},\"radius_y\":{\"op\":\"div\",\"args\":[\"minor\",2]},\"height\":\"height\"}]}"
  }
}`)
	if err != nil {
		t.Fatalf("ParseAIParametricToolCall returned error: %v", err)
	}
	if call.Input.SourceKind != "litecad-feature-dsl" || !strings.Contains(call.Input.Code, `"ellipse_extrude"`) {
		t.Fatalf("call input = %+v", call.Input)
	}
}

func TestAIParametricToolCallParserAcceptsFallbackAliasesAndObjectCode(t *testing.T) {
	call, err := ParseAIParametricToolCall(`{
  "tool": "build_parametric_model",
  "parameters": {
    "title": "Object DSL plate",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": {
      "version": 1,
      "unit": "millimetre",
      "parameters": {
        "width": { "type": "number", "default": 80 }
      },
      "features": [
        { "id": "base", "type": "box", "origin": [0, 0, 0], "size": ["width", 40, 6] }
      ]
    }
  }
}`)
	if err != nil {
		t.Fatalf("ParseAIParametricToolCall returned error: %v", err)
	}
	if call.Input.Title != "Object DSL plate" || call.Input.SourceKind != "litecad-feature-dsl" {
		t.Fatalf("call input = %+v", call.Input)
	}
	if !strings.Contains(call.Input.Code, `"features"`) || strings.Contains(call.Input.Code, "\n") {
		t.Fatalf("code should be compact JSON source, got %q", call.Input.Code)
	}

	call, err = ParseAIParametricToolCall(`{
  "tool": "build_parametric_model",
  "parameters": {
    "title": "Source alias plate",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "source": "{\"version\":1,\"unit\":\"millimetre\",\"features\":[{\"id\":\"base\",\"type\":\"box\",\"origin\":[0,0,0],\"size\":[80,40,6]}]}"
  }
}`)
	if err != nil {
		t.Fatalf("ParseAIParametricToolCall with source alias returned error: %v", err)
	}
	if call.Input.Title != "Source alias plate" || !strings.Contains(call.Input.Code, `"box"`) {
		t.Fatalf("source alias call input = %+v", call.Input)
	}
}

func TestAIParametricToolCallParserNormalizesProviderLiteCADDSLShorthand(t *testing.T) {
	call, err := ParseAIParametricToolCall(`{
  "tool": "build_parametric_model",
  "input": {
    "title": "Simple box",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":\"v1\",\"unit\":\"millimeter\",\"parameters\":{\"width\":80,\"depth\":40,\"thickness\":6},\"features\":[{\"type\":\"box\",\"origin\":[0,0,0],\"size\":[\"width\",\"depth\",\"thickness\"]}]}"
  }
}`)
	if err != nil {
		t.Fatalf("ParseAIParametricToolCall returned error: %v", err)
	}
	if !strings.Contains(call.Input.Code, `"unit":"millimetre"`) ||
		!strings.Contains(call.Input.Code, `"width":{"default":80,"type":"number"}`) ||
		!strings.Contains(call.Input.Code, `"id":"box_1"`) {
		t.Fatalf("normalized code = %s", call.Input.Code)
	}

	call, err = ParseAIParametricToolCall(`{
  "tool": "build_parametric_model",
  "input": {
    "title": "Array parameters box",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":\"v1\",\"unit\":\"mm\",\"parameters\":[{\"name\":\"width\",\"type\":\"number\",\"value\":80},{\"name\":\"depth\",\"type\":\"number\",\"value\":40},{\"name\":\"thickness\",\"type\":\"number\",\"value\":6}],\"features\":[{\"type\":\"box\",\"origin\":[0,0,0],\"size\":[\"width\",\"depth\",\"thickness\"]}]}"
  }
}`)
	if err != nil {
		t.Fatalf("ParseAIParametricToolCall with array parameters returned error: %v", err)
	}
	if !strings.Contains(call.Input.Code, `"depth":{"default":40,"type":"number"}`) ||
		!strings.Contains(call.Input.Code, `"thickness":{"default":6,"type":"number"}`) {
		t.Fatalf("normalized array parameter code = %s", call.Input.Code)
	}

	call, err = ParseAIParametricToolCall(`{
  "tool": "build_parametric_model",
  "input": {
    "title": "Length parameter box",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":\"1.0\",\"unit\":\"mm\",\"parameters\":[{\"name\":\"width\",\"type\":\"length\",\"default\":80},{\"name\":\"depth\",\"type\":\"length\",\"default\":40},{\"name\":\"thickness\",\"type\":\"length\",\"default\":6}],\"features\":[{\"type\":\"box\",\"center\":true,\"size\":{\"x\":\"width\",\"y\":\"depth\",\"z\":\"thickness\"}}]}"
  }
}`)
	if err != nil {
		t.Fatalf("ParseAIParametricToolCall with length parameters and size object returned error: %v", err)
	}
	if !strings.Contains(call.Input.Code, `"version":1`) ||
		!strings.Contains(call.Input.Code, `"width":{"default":80,"type":"number"}`) ||
		!strings.Contains(call.Input.Code, `"size":["width","depth","thickness"]`) {
		t.Fatalf("normalized length parameter code = %s", call.Input.Code)
	}
}

func TestAIParametricToolCallParserRejectsMalformedLiteCADFeatureDSL(t *testing.T) {
	for _, output := range []string{
		`{"tool":"build_parametric_model","input":{"title":"Unknown feature","version":"v1","source_kind":"litecad-feature-dsl","code":"{\"version\":1,\"unit\":\"millimetre\",\"features\":[{\"id\":\"base\",\"type\":\"cone\",\"radius\":4}]}"}}`,
		`{"tool":"build_parametric_model","input":{"title":"Ambiguous cylinder","version":"v1","source_kind":"litecad-feature-dsl","code":"{\"version\":1,\"unit\":\"millimetre\",\"features\":[{\"id\":\"boss\",\"type\":\"cylinder\",\"origin\":[0,0,0],\"radius\":4,\"diameter\":8,\"height\":10}]}"}}`,
		`{"tool":"build_parametric_model","input":{"title":"Undeclared parameter","version":"v1","source_kind":"litecad-feature-dsl","code":"{\"version\":1,\"unit\":\"millimetre\",\"features\":[{\"id\":\"base\",\"type\":\"box\",\"size\":[\"width\",40,6]}]}"}}`,
		`{"tool":"build_parametric_model","input":{"title":"Inverted range","version":"v1","source_kind":"litecad-feature-dsl","code":"{\"version\":1,\"unit\":\"millimetre\",\"parameters\":{\"width\":{\"type\":\"number\",\"default\":8,\"min\":10,\"max\":6}},\"features\":[{\"id\":\"base\",\"type\":\"box\",\"size\":[\"width\",40,6]}]}"}}`,
	} {
		if _, err := ParseAIParametricToolCall(output); !errors.Is(err, ErrInvalidAIChatInput) {
			t.Fatalf("ParseAIParametricToolCall(%q) error = %v, want ErrInvalidAIChatInput", output, err)
		}
	}
}

func TestAIParametricToolCallParserRejectsInvalidOutput(t *testing.T) {
	for _, output := range []string{
		`{"tool":"build_parametric_model","input":{"title":"No code","version":"v1","source_kind":"openscad","code":""}}`,
		`{"tool":"build_parametric_model","input":{"title":"Bad kind","version":"v1","source_kind":"python","code":"print(1)"}}`,
		`I created the model for you.`,
	} {
		if _, err := ParseAIParametricToolCall(output); !errors.Is(err, ErrInvalidAIChatInput) {
			t.Fatalf("ParseAIParametricToolCall(%q) error = %v, want ErrInvalidAIChatInput", output, err)
		}
	}
}

func TestAIParametricRunCreatesPendingArtifact(t *testing.T) {
	svc := newTestService(t)
	svc.aiClient = &recordingAIClient{reply: `{
  "tool": "build_parametric_model",
  "input": {
    "title": "Mounting bracket",
    "version": "v1",
    "source_kind": "openscad",
    "code": "width = 40; // [10:1:100]\ncube([width, 10, 5]);"
  }
}`}
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-run@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Parametric run study"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Design run",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	run, err := svc.RunProjectAgentParametric(ctx, ProjectAgentParametricRunInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Message:        "Make a parametric mounting bracket",
	})
	if err != nil {
		t.Fatalf("RunProjectAgentParametric returned error: %v", err)
	}
	if run.Artifact.ID == "" || run.Artifact.Title != "Mounting bracket" || run.Artifact.CompileStatus != "pending" {
		t.Fatalf("artifact = %+v", run.Artifact)
	}
	if run.Message.Role != "assistant" || len(run.Message.Parts) == 0 {
		t.Fatalf("message = %+v", run.Message)
	}
	if run.Telemetry.ToolMode != "json_fallback" || run.Telemetry.SourceKind != "openscad" || run.Telemetry.DurationMS < 0 {
		t.Fatalf("telemetry = %+v", run.Telemetry)
	}
	if run.Artifact.GenerationToolMode != "json_fallback" || run.Artifact.GenerationDurationMS < 0 {
		t.Fatalf("artifact generation telemetry = %+v", run.Artifact)
	}

	messages, err := svc.ListProjectAgentMessages(ctx, user.ID, project.ID, conversation.ID)
	if err != nil {
		t.Fatalf("ListProjectAgentMessages returned error: %v", err)
	}
	if len(messages) != 2 || messages[0].Role != "user" || messages[1].Role != "assistant" {
		t.Fatalf("messages = %+v", messages)
	}
	artifacts, err := svc.ListProjectParametricArtifacts(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectParametricArtifacts returned error: %v", err)
	}
	if len(artifacts) != 1 || artifacts[0].GenerationToolMode != "json_fallback" || artifacts[0].GenerationDurationMS < 0 {
		t.Fatalf("persisted artifact telemetry = %+v", artifacts)
	}
}

func TestAIParametricRunCreatesPendingLiteCADFeatureDSLArtifact(t *testing.T) {
	svc := newTestService(t)
	svc.aiClient = &recordingAIClient{reply: `{
  "tool": "build_parametric_model",
  "input": {
    "title": "Feature DSL bracket",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":1,\"unit\":\"millimetre\",\"parameters\":{\"width\":{\"type\":\"number\",\"default\":80}},\"features\":[{\"id\":\"base\",\"type\":\"box\",\"origin\":[0,0,0],\"size\":[\"width\",40,6]}]}"
  }
}`}
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-run-lcad@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Feature DSL run study"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "DSL run",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	run, err := svc.RunProjectAgentParametric(ctx, ProjectAgentParametricRunInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Message:        "Make a native LiteCAD feature DSL bracket",
	})
	if err != nil {
		t.Fatalf("RunProjectAgentParametric returned error: %v", err)
	}
	if run.Artifact.SourceKind != "litecad-feature-dsl" || run.Artifact.CompileStatus != "pending" {
		t.Fatalf("artifact = %+v", run.Artifact)
	}

	joined := joinAIMessageBodies(svc.aiClient.(*recordingAIClient).messages)
	for _, want := range []string{"litecad-feature-dsl", "box", "extrude", "extrude_cut", "circle", "direction", "symmetric", "cylinder", "cylinder_cut", "holes", "non-zero axis", "repeat", "expression", "add", "boolean", "string", "geometry"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("provider context should mention %q, got:\n%s", want, joined)
		}
	}
}

func TestAIParametricRunUsesNativeToolClient(t *testing.T) {
	toolClient := &recordingAIToolClient{call: AIChatToolCall{
		Tool: aiParametricToolBuildModel,
		Arguments: []byte(`{
		  "title": "Native tool bracket",
		  "version": "v1",
		  "source_kind": "litecad-feature-dsl",
		  "code": "{\"version\":1,\"unit\":\"millimetre\",\"parameters\":{\"width\":{\"type\":\"number\",\"default\":80}},\"features\":[{\"id\":\"base\",\"type\":\"box\",\"origin\":[0,0,0],\"size\":[\"width\",40,6]}]}"
		}`),
	}}
	svc := newTestService(t)
	svc.aiClient = toolClient
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-run-native-tool@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Native tool run study"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Native tool run",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	run, err := svc.RunProjectAgentParametric(ctx, ProjectAgentParametricRunInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Message:        "Make a native LiteCAD feature DSL bracket",
	})
	if err != nil {
		t.Fatalf("RunProjectAgentParametric returned error: %v", err)
	}
	if toolClient.chatCalled {
		t.Fatal("RunProjectAgentParametric should use ChatWithTools when the provider supports it")
	}
	if len(toolClient.tools) != 1 || toolClient.tools[0].Name != aiParametricToolBuildModel {
		t.Fatalf("tools = %+v", toolClient.tools)
	}
	if run.Artifact.Title != "Native tool bracket" || run.Artifact.SourceKind != "litecad-feature-dsl" {
		t.Fatalf("artifact = %+v", run.Artifact)
	}
	if run.Message.Body == "" || !strings.Contains(run.Message.Body, aiParametricToolBuildModel) {
		t.Fatalf("assistant message body should contain the canonical tool call JSON, got %q", run.Message.Body)
	}
	if run.Telemetry.ToolMode != "native_tool" || run.Telemetry.SourceKind != "litecad-feature-dsl" || run.Telemetry.DurationMS < 0 {
		t.Fatalf("telemetry = %+v", run.Telemetry)
	}
	if run.Artifact.GenerationToolMode != "native_tool" || run.Artifact.GenerationDurationMS < 0 {
		t.Fatalf("artifact generation telemetry = %+v", run.Artifact)
	}
}

func TestAIParametricRunFallsBackToJSONWhenNativeToolCallFails(t *testing.T) {
	toolClient := &recordingAIToolClient{
		toolErr: errors.New("provider returned no tool call"),
		chatReply: `{
  "tool": "build_parametric_model",
  "input": {
    "title": "Fallback feature DSL bracket",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":1,\"unit\":\"millimetre\",\"parameters\":{\"width\":{\"type\":\"number\",\"default\":80}},\"features\":[{\"id\":\"base\",\"type\":\"box\",\"origin\":[0,0,0],\"size\":[\"width\",40,6]}]}"
  }
}`,
	}
	svc := newTestService(t)
	svc.aiClient = toolClient
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-run-tool-fallback@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Native tool fallback study"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Fallback run",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	run, err := svc.RunProjectAgentParametric(ctx, ProjectAgentParametricRunInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Message:        "Make a LiteCAD feature DSL bracket",
	})
	if err != nil {
		t.Fatalf("RunProjectAgentParametric returned error: %v", err)
	}
	if !toolClient.chatCalled {
		t.Fatal("RunProjectAgentParametric should fall back to plain JSON chat after native tool call failure")
	}
	if len(toolClient.tools) != 1 || toolClient.tools[0].Name != aiParametricToolBuildModel {
		t.Fatalf("tools = %+v", toolClient.tools)
	}
	fallbackPrompt := joinAIMessageBodies(toolClient.chatMessages)
	if len(toolClient.chatMessages) == 0 || !strings.Contains(fallbackPrompt, "build_parametric_model") || !strings.Contains(fallbackPrompt, "strict JSON") {
		t.Fatalf("fallback chat messages should retain parametric tool instructions, got %+v", toolClient.chatMessages)
	}
	if run.Artifact.Title != "Fallback feature DSL bracket" || run.Artifact.SourceKind != "litecad-feature-dsl" {
		t.Fatalf("artifact = %+v", run.Artifact)
	}
	if run.Telemetry.ToolMode != "json_fallback" || run.Telemetry.SourceKind != "litecad-feature-dsl" || run.Telemetry.DurationMS < 0 {
		t.Fatalf("telemetry = %+v", run.Telemetry)
	}
	if run.Artifact.GenerationToolMode != "json_fallback" || run.Artifact.GenerationDurationMS < 0 {
		t.Fatalf("artifact generation telemetry = %+v", run.Artifact)
	}
}

func TestAIParametricRunRejectsInvalidToolOutput(t *testing.T) {
	svc := newTestService(t)
	svc.aiClient = &recordingAIClient{reply: "I created the model for you."}
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-run-invalid@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Invalid parametric run study"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Invalid run",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	if _, err := svc.RunProjectAgentParametric(ctx, ProjectAgentParametricRunInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Message:        "Make a parametric mounting bracket",
	}); !errors.Is(err, ErrInvalidAIChatInput) {
		t.Fatalf("RunProjectAgentParametric error = %v, want ErrInvalidAIChatInput", err)
	}

	artifacts, err := svc.ListProjectParametricArtifacts(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectParametricArtifacts returned error: %v", err)
	}
	if len(artifacts) != 0 {
		t.Fatalf("artifacts = %+v, want none", artifacts)
	}

	messages, err := svc.ListProjectAgentMessages(ctx, user.ID, project.ID, conversation.ID)
	if err != nil {
		t.Fatalf("ListProjectAgentMessages returned error: %v", err)
	}
	if len(messages) != 2 || messages[0].Role != "user" || messages[1].Role != "assistant" {
		t.Fatalf("messages = %+v, want persisted user and assistant failure messages", messages)
	}
	if messages[0].Body != "Make a parametric mounting bracket" {
		t.Fatalf("user message body = %q", messages[0].Body)
	}
	if !strings.Contains(messages[1].Body, "could not create a valid parametric model") {
		t.Fatalf("assistant failure body = %q", messages[1].Body)
	}
	if strings.Contains(messages[1].Body, "I created the model for you") {
		t.Fatalf("assistant failure body should not store raw invalid provider output: %q", messages[1].Body)
	}
}

func TestAIParametricRunPersistsNativeToolFailureWithoutArtifact(t *testing.T) {
	svc := newTestService(t)
	svc.aiClient = &recordingAIToolClient{call: AIChatToolCall{
		Tool:      aiParametricToolBuildModel,
		Arguments: []byte(`{"title":"Bad native output","version":"v1","source_kind":"python","code":"print(1)"}`),
	}}
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-run-native-invalid@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Invalid native run study"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Invalid native run",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	if _, err := svc.RunProjectAgentParametric(ctx, ProjectAgentParametricRunInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Message:        "Make a native parametric mounting bracket",
	}); !errors.Is(err, ErrInvalidAIChatInput) {
		t.Fatalf("RunProjectAgentParametric error = %v, want ErrInvalidAIChatInput", err)
	}

	artifacts, err := svc.ListProjectParametricArtifacts(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectParametricArtifacts returned error: %v", err)
	}
	if len(artifacts) != 0 {
		t.Fatalf("artifacts = %+v, want none", artifacts)
	}

	messages, err := svc.ListProjectAgentMessages(ctx, user.ID, project.ID, conversation.ID)
	if err != nil {
		t.Fatalf("ListProjectAgentMessages returned error: %v", err)
	}
	if len(messages) != 2 || messages[0].Role != "user" || messages[1].Role != "assistant" {
		t.Fatalf("messages = %+v, want persisted user and assistant failure messages", messages)
	}
	if messages[0].Body != "Make a native parametric mounting bracket" {
		t.Fatalf("user message body = %q", messages[0].Body)
	}
	if !strings.Contains(messages[1].Body, "could not create a valid parametric model") {
		t.Fatalf("assistant failure body = %q", messages[1].Body)
	}
}

func TestAIParametricRunDoesNotPersistOnProviderFailure(t *testing.T) {
	svc := newTestService(t)
	svc.aiClient = failingAIClient{}
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-run-provider-failure@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Provider failure parametric study"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Provider failure run",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	if _, err := svc.RunProjectAgentParametric(ctx, ProjectAgentParametricRunInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Message:        "Make a parametric mounting bracket",
	}); err == nil {
		t.Fatal("RunProjectAgentParametric should return provider failure")
	}

	artifacts, err := svc.ListProjectParametricArtifacts(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectParametricArtifacts returned error: %v", err)
	}
	if len(artifacts) != 0 {
		t.Fatalf("artifacts = %+v, want none", artifacts)
	}
	messages, err := svc.ListProjectAgentMessages(ctx, user.ID, project.ID, conversation.ID)
	if err != nil {
		t.Fatalf("ListProjectAgentMessages returned error: %v", err)
	}
	if len(messages) != 0 {
		t.Fatalf("messages = %+v, want none", messages)
	}
}

func TestAIParametricRunDoesNotPersistWhenNativeToolAndFallbackBothFail(t *testing.T) {
	svc := newTestService(t)
	svc.aiClient = &recordingAIToolClient{
		toolErr: errors.New("native tools unavailable"),
		chatErr: errors.New("json fallback unavailable"),
	}
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "parametric-run-double-provider-failure@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Double provider failure study"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Double provider failure run",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	if _, err := svc.RunProjectAgentParametric(ctx, ProjectAgentParametricRunInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Message:        "Make a parametric mounting bracket",
	}); err == nil || !strings.Contains(err.Error(), "native tool call failed") || !strings.Contains(err.Error(), "json fallback failed") {
		t.Fatalf("RunProjectAgentParametric error = %v, want combined native and fallback provider failure", err)
	}

	artifacts, err := svc.ListProjectParametricArtifacts(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectParametricArtifacts returned error: %v", err)
	}
	if len(artifacts) != 0 {
		t.Fatalf("artifacts = %+v, want none", artifacts)
	}
	messages, err := svc.ListProjectAgentMessages(ctx, user.ID, project.ID, conversation.ID)
	if err != nil {
		t.Fatalf("ListProjectAgentMessages returned error: %v", err)
	}
	if len(messages) != 0 {
		t.Fatalf("messages = %+v, want none", messages)
	}
}
