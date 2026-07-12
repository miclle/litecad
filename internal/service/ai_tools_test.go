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

func TestAIParametricToolCallParserRejectsMalformedLiteCADFeatureDSL(t *testing.T) {
	for _, output := range []string{
		`{"tool":"build_parametric_model","input":{"title":"Unknown feature","version":"v1","source_kind":"litecad-feature-dsl","code":"{\"version\":1,\"unit\":\"millimetre\",\"features\":[{\"id\":\"base\",\"type\":\"sphere\",\"radius\":4}]}"}}`,
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

	messages, err := svc.ListProjectAgentMessages(ctx, user.ID, project.ID, conversation.ID)
	if err != nil {
		t.Fatalf("ListProjectAgentMessages returned error: %v", err)
	}
	if len(messages) != 2 || messages[0].Role != "user" || messages[1].Role != "assistant" {
		t.Fatalf("messages = %+v", messages)
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
	for _, want := range []string{"litecad-feature-dsl", "box", "cylinder", "cylinder_cut", "holes", "Z-axis"} {
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
