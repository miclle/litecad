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

	reply, err := svc.SendProjectAgentMessage(ctx, ProjectAgentMessageInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
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

	storedMessages, err := svc.ListProjectAgentMessages(ctx, user.ID, project.ID)
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
	if storedMessages[0].ID == "" || storedMessages[0].ProjectID != project.ID || storedMessages[0].CreatedAt == "" {
		t.Fatalf("stored message metadata = %+v", storedMessages[0])
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

	if _, err := svc.SendProjectAgentMessage(ctx, ProjectAgentMessageInput{
		OwnerUserID: user.ID,
		ProjectID:   project.ID,
		Messages: []AIChatMessage{
			{Role: "user", Body: "Will this be persisted?"},
		},
	}); err == nil {
		t.Fatal("SendProjectAgentMessage should return provider failure")
	}

	storedMessages, err := svc.ListProjectAgentMessages(ctx, user.ID, project.ID)
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
