package service

import (
	"context"
	"errors"
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

	reply, err := svc.SendProjectAgentMessage(ctx, ProjectAgentMessageInput{
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
	if reply.Role != "assistant" || reply.Body != "The bracket source is ready to inspect." {
		t.Fatalf("reply = %+v", reply)
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
}

func joinAIMessageBodies(messages []AIChatMessage) string {
	var b strings.Builder
	for _, message := range messages {
		b.WriteString(message.Body)
		b.WriteByte('\n')
	}
	return b.String()
}
