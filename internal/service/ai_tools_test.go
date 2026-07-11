package service

import (
	"context"
	"errors"
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
}
