package service

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
)

type recordingAIClient struct {
	messages []AIChatMessage
	reply    string
}

func (c *recordingAIClient) Chat(ctx context.Context, messages []AIChatMessage) (string, error) {
	c.messages = append([]AIChatMessage(nil), messages...)
	return c.reply, nil
}

type recordingAIToolClient struct {
	messages     []AIChatMessage
	chatMessages []AIChatMessage
	tools        []AIChatTool
	call         AIChatToolCall
	toolErr      error
	chatReply    string
	chatErr      error
	chatCalled   bool
}

func (c *recordingAIToolClient) Chat(ctx context.Context, messages []AIChatMessage) (string, error) {
	c.chatCalled = true
	c.chatMessages = append([]AIChatMessage(nil), messages...)
	if c.chatErr != nil {
		return "", c.chatErr
	}
	if c.chatReply != "" {
		return c.chatReply, nil
	}
	return "", errors.New("plain chat should not be used")
}

func (c *recordingAIToolClient) ChatWithTools(ctx context.Context, messages []AIChatMessage, tools []AIChatTool) (AIChatToolCall, error) {
	c.messages = append([]AIChatMessage(nil), messages...)
	c.tools = append([]AIChatTool(nil), tools...)
	if c.toolErr != nil {
		return AIChatToolCall{}, c.toolErr
	}
	return c.call, nil
}

type failingAIClient struct{}

func (c failingAIClient) Chat(ctx context.Context, messages []AIChatMessage) (string, error) {
	return "", errors.New("provider timeout")
}

type recordingStreamingAIClient struct {
	messages []AIChatMessage
	deltas   []AIChatStreamDelta
}

func (c *recordingStreamingAIClient) Chat(context.Context, []AIChatMessage) (string, error) {
	return "", errors.New("non-streaming chat should not be used")
}

func (c *recordingStreamingAIClient) StreamChat(_ context.Context, messages []AIChatMessage, onDelta func(AIChatStreamDelta) error) (string, error) {
	c.messages = append([]AIChatMessage(nil), messages...)
	var reply strings.Builder
	for _, delta := range c.deltas {
		if err := onDelta(delta); err != nil {
			return "", err
		}
		reply.WriteString(delta.Content)
	}
	return reply.String(), nil
}

func TestStreamProjectAgentMessageEmitsProgressAndPersistsFinalReply(t *testing.T) {
	svc := newTestService(t)
	aiClient := &recordingStreamingAIClient{
		deltas: []AIChatStreamDelta{
			{Reasoning: "Checking project sources."},
			{Content: "The bracket "},
			{Content: "is ready."},
		},
	}
	svc.aiClient = aiClient
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "agent-stream@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Streaming bracket study",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Streaming review",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	var events []ProjectAgentStreamEvent
	result, err := svc.StreamProjectAgentMessage(ctx, ProjectAgentMessageInput{
		OwnerUserID:     user.ID,
		ProjectID:       project.ID,
		ConversationID:  conversation.ID,
		ClientRequestID: "assistant_stream_request_01",
		Messages: []AIChatMessage{
			{Role: "user", Body: "Inspect this bracket"},
		},
	}, func(event ProjectAgentStreamEvent) error {
		events = append(events, event)
		return nil
	})
	if err != nil {
		t.Fatalf("StreamProjectAgentMessage returned error: %v", err)
	}

	var gotEvents []string
	for _, event := range events {
		gotEvents = append(gotEvents, event.Type+":"+event.Stage+event.Delta)
	}
	wantEvents := []string{
		"status:accepted",
		"status:context",
		"status:provider",
		"reasoning:Checking project sources.",
		"content:The bracket ",
		"content:is ready.",
		"status:persisting",
		"status:complete",
	}
	if !reflect.DeepEqual(gotEvents, wantEvents) {
		t.Fatalf("events = %#v, want %#v", gotEvents, wantEvents)
	}
	if result.Message.Body != "The bracket is ready." || result.Message.Role != "assistant" {
		t.Fatalf("result = %+v", result)
	}
	if !strings.Contains(joinAIMessageBodies(aiClient.messages), "Streaming bracket study") {
		t.Fatalf("provider messages missing project context: %+v", aiClient.messages)
	}
	storedMessages, err := svc.ListProjectAgentMessages(ctx, user.ID, project.ID, conversation.ID)
	if err != nil {
		t.Fatalf("ListProjectAgentMessages returned error: %v", err)
	}
	if len(storedMessages) != 2 || storedMessages[1].Body != "The bracket is ready." {
		t.Fatalf("stored messages = %+v", storedMessages)
	}
	if storedMessages[0].ClientRequestID != "assistant_stream_request_01" ||
		storedMessages[1].ClientRequestID != "assistant_stream_request_01" {
		t.Fatalf("stored request IDs = %q, %q", storedMessages[0].ClientRequestID, storedMessages[1].ClientRequestID)
	}
}

func TestSendProjectAgentMessageUsesProjectContext(t *testing.T) {
	svc := newTestService(t)
	aiClient := &recordingAIClient{reply: "The bracket source is ready to inspect."}
	svc.aiClient = aiClient
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "agent@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Bracket study",
		Description: "Wall-mounted shelf bracket exploration.",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if _, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "bracket.step",
		ContentType: "model/step",
		Data:        []byte("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n#1=PRODUCT('Bracket','Bracket','',());\nENDSEC;\nEND-ISO-10303-21;"),
	}); err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Bracket review",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	result, err := svc.SendProjectAgentMessage(ctx, ProjectAgentMessageInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Messages: []AIChatMessage{
			{Role: "user", Body: "What sources are attached?"},
		},
	})
	if err != nil {
		t.Fatalf("SendProjectAgentMessage returned error: %v", err)
	}
	if result.Message.Role != "assistant" || result.Message.Body != "The bracket source is ready to inspect." || result.Artifact != nil {
		t.Fatalf("result = %+v", result)
	}

	joined := joinAIMessageBodies(aiClient.messages)
	for _, want := range []string{"Bracket study", "Wall-mounted shelf bracket", "bracket.step", "AUTOMOTIVE_DESIGN"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("AI messages should include %q, got:\n%s", want, joined)
		}
	}

	storedMessages, err := svc.ListProjectAgentMessages(ctx, user.ID, project.ID, conversation.ID)
	if err != nil {
		t.Fatalf("ListProjectAgentMessages returned error: %v", err)
	}
	if len(storedMessages) != 2 {
		t.Fatalf("stored message count = %d, want 2: %+v", len(storedMessages), storedMessages)
	}
	if storedMessages[0].Role != "user" || storedMessages[0].Body != "What sources are attached?" {
		t.Fatalf("stored user message = %+v", storedMessages[0])
	}
	if storedMessages[1].Role != "assistant" || storedMessages[1].Body != "The bracket source is ready to inspect." {
		t.Fatalf("stored assistant message = %+v", storedMessages[1])
	}
	if storedMessages[0].ID == "" || storedMessages[0].ProjectID != project.ID || storedMessages[0].ConversationID != conversation.ID || storedMessages[0].CreatedAt == "" {
		t.Fatalf("stored message metadata = %+v", storedMessages[0])
	}
}

func TestProjectAgentConversationsAreProjectScoped(t *testing.T) {
	svc := newTestService(t)
	svc.aiClient = &recordingAIClient{reply: "ok"}
	ctx := context.Background()

	owner, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "agent-conversation-owner@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser owner returned error: %v", err)
	}
	other, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Grace Hopper",
		Email:    "agent-conversation-other@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: owner.ID,
		Name:        "Scoped conversation study",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: owner.ID,
		ProjectID:   project.ID,
		Title:       "First pass",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	conversations, err := svc.ListProjectAgentConversations(ctx, owner.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectAgentConversations returned error: %v", err)
	}
	if len(conversations) != 1 || conversations[0].ID != conversation.ID {
		t.Fatalf("conversations = %+v, want only %+v", conversations, conversation)
	}

	if _, err := svc.ListProjectAgentConversations(ctx, other.ID, project.ID); err != ErrProjectNotFound {
		t.Fatalf("other user list error = %v, want ErrProjectNotFound", err)
	}
	if _, err := svc.SendProjectAgentMessage(ctx, ProjectAgentMessageInput{
		OwnerUserID:    other.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Messages: []AIChatMessage{
			{Role: "user", Body: "Can I use this conversation?"},
		},
	}); err != ErrProjectNotFound {
		t.Fatalf("other user send error = %v, want ErrProjectNotFound", err)
	}
}

func TestProjectAgentConversationRejectsUnknownActiveModel(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "agent-conversation-model@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Conversation active model study",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	_, err = svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID:   user.ID,
		ProjectID:     project.ID,
		Title:         "Missing model",
		ActiveModelID: "mdl_missing",
	})
	if err != ErrProjectNotFound {
		t.Fatalf("CreateProjectAgentConversation error = %v, want ErrProjectNotFound", err)
	}
}

func TestNewProjectAgentConversationStartsWithoutOldMessages(t *testing.T) {
	svc := newTestService(t)
	aiClient := &recordingAIClient{reply: "ok"}
	svc.aiClient = aiClient
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "agent-conversation-isolation@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Conversation isolation study",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	firstConversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Old thread",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation first returned error: %v", err)
	}
	if _, err := svc.SendProjectAgentMessage(ctx, ProjectAgentMessageInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: firstConversation.ID,
		Messages: []AIChatMessage{
			{Role: "user", Body: "This old-context marker must stay in the old conversation."},
		},
	}); err != nil {
		t.Fatalf("SendProjectAgentMessage first returned error: %v", err)
	}

	secondConversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Fresh thread",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation second returned error: %v", err)
	}
	if _, err := svc.SendProjectAgentMessage(ctx, ProjectAgentMessageInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: secondConversation.ID,
		Messages: []AIChatMessage{
			{Role: "user", Body: "Fresh prompt only."},
		},
	}); err != nil {
		t.Fatalf("SendProjectAgentMessage second returned error: %v", err)
	}

	joined := joinAIMessageBodies(aiClient.messages)
	if strings.Contains(joined, "old-context marker") {
		t.Fatalf("new conversation provider context should not include old conversation messages, got:\n%s", joined)
	}
	if !strings.Contains(joined, "Fresh prompt only.") {
		t.Fatalf("new conversation provider context should include fresh prompt, got:\n%s", joined)
	}
}

func TestSendProjectAgentMessagePersistsJSONToolReplyAsArtifact(t *testing.T) {
	svc := newTestService(t)
	svc.aiClient = &recordingAIClient{reply: `{
  "tool": "build_parametric_model",
  "input": {
    "title": "Sphere 50 mm",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":1,\"unit\":\"millimetre\",\"parameters\":{\"diameter\":{\"type\":\"number\",\"default\":50,\"min\":1,\"max\":200}},\"features\":[{\"id\":\"body\",\"type\":\"sphere\",\"origin\":[0,0,0],\"diameter\":\"diameter\"}]}"
  }
}`}
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "agent-json-tool-artifact@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Sphere study",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Direct sphere",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	result, err := svc.SendProjectAgentMessage(ctx, ProjectAgentMessageInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Messages: []AIChatMessage{
			{Role: "user", Body: "添加一个直径 50 的球"},
		},
	})
	if err != nil {
		t.Fatalf("SendProjectAgentMessage returned error: %v", err)
	}
	if result.Message.Role != "assistant" || !strings.Contains(result.Message.Body, "build_parametric_model") {
		t.Fatalf("result = %+v", result)
	}
	if result.Artifact == nil || result.Artifact.Title != "Sphere 50 mm" {
		t.Fatalf("result artifact = %+v", result.Artifact)
	}

	artifacts, err := svc.ListProjectParametricArtifacts(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("ListProjectParametricArtifacts returned error: %v", err)
	}
	if len(artifacts) != 1 || artifacts[0].Title != "Sphere 50 mm" || artifacts[0].GenerationToolMode != "json_fallback" || artifacts[0].MessageID != result.Message.ID {
		t.Fatalf("artifacts = %+v", artifacts)
	}
}

func TestSendProjectAgentMessageUsesActiveModelRevisionContextForToolReply(t *testing.T) {
	svc := newTestService(t)
	aiClient := &recordingAIClient{reply: `{
  "tool": "build_parametric_model",
  "input": {
    "title": "球体三轴通孔",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":1,\"unit\":\"millimetre\",\"parameters\":{\"sphere_diameter\":{\"type\":\"number\",\"default\":30},\"hole_diameter\":{\"type\":\"number\",\"default\":5}},\"features\":[{\"id\":\"body\",\"type\":\"sphere\",\"origin\":[0,0,0],\"diameter\":\"sphere_diameter\"},{\"id\":\"hole_x\",\"type\":\"cylinder_cut\",\"origin\":[-16,0,0],\"axis\":[1,0,0],\"diameter\":\"hole_diameter\",\"depth\":32},{\"id\":\"hole_y\",\"type\":\"cylinder_cut\",\"origin\":[0,-16,0],\"axis\":[0,1,0],\"diameter\":\"hole_diameter\",\"depth\":32},{\"id\":\"hole_z\",\"type\":\"cylinder_cut\",\"origin\":[0,0,-16],\"axis\":[0,0,1],\"diameter\":\"hole_diameter\",\"depth\":32}]}"
  }
}`}
	svc.aiClient = aiClient
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "agent-active-model-tool@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{OwnerUserID: user.ID, Name: "Assistant active model chat"})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	model, err := svc.UploadProjectModel(ctx, UploadProjectModelInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Filename:    "球体三轴通孔-litecad.lcad.json",
		ContentType: "application/json",
		Data:        []byte(`{"version":1,"unit":"millimetre","features":[{"id":"body","type":"sphere","origin":[0,0,0],"diameter":30}]}`),
	})
	if err != nil {
		t.Fatalf("UploadProjectModel returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Direct revision",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	result, err := svc.SendProjectAgentMessage(ctx, ProjectAgentMessageInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		ActiveModelID:  model.ID,
		Messages: []AIChatMessage{
			{Role: "user", Body: "直接修改模型，让 xyz 轴各有一个通孔"},
		},
	})
	if err != nil {
		t.Fatalf("SendProjectAgentMessage returned error: %v", err)
	}
	if result.Artifact == nil || result.Artifact.Title != "球体三轴通孔 修正版" {
		t.Fatalf("result artifact = %+v", result.Artifact)
	}
	providerContext := joinAIMessageBodies(aiClient.messages)
	for _, want := range []string{"currently selected project model", model.ID, "cylinder_cut starts at origin", "[1,0,0]", "[0,1,0]", "[0,0,1]"} {
		if !strings.Contains(providerContext, want) {
			t.Fatalf("provider context should mention %q, got:\n%s", want, providerContext)
		}
	}
	if !strings.Contains(result.Message.Body, "球体三轴通孔 修正版") {
		t.Fatalf("assistant tool message should use the final distinct title, got %s", result.Message.Body)
	}
}

func TestSendProjectAgentMessagePersistsToolFailureForInvalidJSONToolReply(t *testing.T) {
	svc := newTestService(t)
	svc.aiClient = &recordingAIClient{reply: `{
  "tool": "build_parametric_model",
  "input": {
    "title": "Impossible Cone",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":1,\"unit\":\"millimetre\",\"features\":[{\"id\":\"body\",\"type\":\"cone\",\"origin\":[0,0,0],\"diameter\":30,\"height\":20}]}"
  }
}`}
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "agent-json-tool-failure@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Invalid tool study",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Invalid JSON tool reply",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	result, err := svc.SendProjectAgentMessage(ctx, ProjectAgentMessageInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Messages: []AIChatMessage{
			{Role: "user", Body: "Create a cone"},
		},
	})
	if err != nil {
		t.Fatalf("SendProjectAgentMessage returned error: %v", err)
	}
	if result.Artifact != nil {
		t.Fatalf("result artifact = %+v, want nil", result.Artifact)
	}
	if result.Message.Body != aiParametricInvalidToolFailureMessage {
		t.Fatalf("result message body = %q", result.Message.Body)
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
	if len(messages) != 2 || messages[1].Body != aiParametricInvalidToolFailureMessage {
		t.Fatalf("messages = %+v", messages)
	}
	if strings.Contains(messages[1].Body, "Impossible Cone") || strings.Contains(messages[1].Body, "build_parametric_model") {
		t.Fatalf("assistant failure body should not store raw invalid provider output: %q", messages[1].Body)
	}
}

func TestSendProjectAgentMessageDoesNotPersistOnProviderFailure(t *testing.T) {
	svc := newTestService(t)
	svc.aiClient = failingAIClient{}
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "agent-failure@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Provider failure study",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	conversation, err := svc.CreateProjectAgentConversation(ctx, CreateProjectAgentConversationInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Title:       "Failure test",
	})
	if err != nil {
		t.Fatalf("CreateProjectAgentConversation returned error: %v", err)
	}

	if _, err := svc.SendProjectAgentMessage(ctx, ProjectAgentMessageInput{
		OwnerUserID:    user.ID,
		ProjectID:      project.ID,
		ConversationID: conversation.ID,
		Messages: []AIChatMessage{
			{Role: "user", Body: "Will this be persisted?"},
		},
	}); err == nil {
		t.Fatal("SendProjectAgentMessage should return provider failure")
	}

	storedMessages, err := svc.ListProjectAgentMessages(ctx, user.ID, project.ID, conversation.ID)
	if err != nil {
		t.Fatalf("ListProjectAgentMessages returned error: %v", err)
	}
	if len(storedMessages) != 0 {
		t.Fatalf("stored message count = %d, want 0: %+v", len(storedMessages), storedMessages)
	}
}

func TestSendProjectAgentMessageRequiresConfiguredAI(t *testing.T) {
	svc := newTestService(t)
	_, err := svc.SendProjectAgentMessage(context.Background(), ProjectAgentMessageInput{
		OwnerUserID: "usr_01test",
		ProjectID:   "prj_01test",
		Messages: []AIChatMessage{
			{Role: "user", Body: "Hello"},
		},
	})
	if err != ErrAIUnavailable {
		t.Fatalf("error = %v, want ErrAIUnavailable", err)
	}
}

func TestSendProjectAgentMessageValidatesMessages(t *testing.T) {
	svc := newTestService(t)
	svc.aiClient = &recordingAIClient{reply: "ok"}
	_, err := svc.SendProjectAgentMessage(context.Background(), ProjectAgentMessageInput{
		OwnerUserID: "usr_01test",
		ProjectID:   "prj_01test",
		Messages: []AIChatMessage{
			{Role: "assistant", Body: "Hello"},
		},
	})
	if err != ErrInvalidAIChatInput {
		t.Fatalf("error = %v, want ErrInvalidAIChatInput", err)
	}
	_, err = svc.SendProjectAgentMessage(context.Background(), ProjectAgentMessageInput{
		OwnerUserID:     "usr_01test",
		ProjectID:       "prj_01test",
		ClientRequestID: "invalid request id",
		Messages: []AIChatMessage{
			{Role: "user", Body: "Hello"},
		},
	})
	if err != ErrInvalidAIChatInput {
		t.Fatalf("invalid client request ID error = %v, want ErrInvalidAIChatInput", err)
	}
}

func joinAIMessageBodies(messages []AIChatMessage) string {
	var b strings.Builder
	for _, message := range messages {
		b.WriteString(message.Body)
		b.WriteByte('\n')
	}
	return b.String()
}
