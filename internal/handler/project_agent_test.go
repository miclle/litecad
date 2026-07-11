package handler

import (
	"context"
	"encoding/json"
	"github.com/miclle/litecad/internal/service"
	"net/http"
	"testing"
)

type testAIClient struct {
	reply string
}

func (c testAIClient) Chat(ctx context.Context, messages []service.AIChatMessage) (string, error) {
	return c.reply, nil
}

func TestProjectAgentRouteReturnsAIReply(t *testing.T) {
	router := newTestRouterWithAI(t, testAIClient{reply: "This project has usable CAD context."})

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "agent-route@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Agent project",
	}, sessionCookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
	var createResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}

	conversation := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/conversations", map[string]string{
		"title": "Initial review",
	}, sessionCookie)
	if conversation.Code != http.StatusOK {
		t.Fatalf("conversation status = %d, body = %s", conversation.Code, conversation.Body.String())
	}
	var conversationResponse struct {
		Conversation struct {
			ID        string `json:"id"`
			ProjectID string `json:"project_id"`
			Title     string `json:"title"`
		} `json:"conversation"`
	}
	if err := json.Unmarshal(conversation.Body.Bytes(), &conversationResponse); err != nil {
		t.Fatalf("decode conversation response: %v", err)
	}
	if conversationResponse.Conversation.ID == "" || conversationResponse.Conversation.ProjectID != createResponse.Project.ID || conversationResponse.Conversation.Title != "Initial review" {
		t.Fatalf("conversation response = %+v", conversationResponse.Conversation)
	}

	agent := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/conversations/"+conversationResponse.Conversation.ID+"/messages", map[string]any{
		"messages": []map[string]string{
			{"role": "user", "body": "What can you see?"},
		},
	}, sessionCookie)
	if agent.Code != http.StatusOK {
		t.Fatalf("agent status = %d, body = %s", agent.Code, agent.Body.String())
	}
	var agentResponse struct {
		Message struct {
			ID             string `json:"id"`
			ProjectID      string `json:"project_id"`
			ConversationID string `json:"conversation_id"`
			Role           string `json:"role"`
			Body           string `json:"body"`
			CreatedAt      string `json:"created_at"`
		} `json:"message"`
	}
	if err := json.Unmarshal(agent.Body.Bytes(), &agentResponse); err != nil {
		t.Fatalf("decode agent response: %v", err)
	}
	if agentResponse.Message.Role != "assistant" || agentResponse.Message.Body != "This project has usable CAD context." {
		t.Fatalf("agent response = %+v", agentResponse.Message)
	}
	if agentResponse.Message.ID == "" || agentResponse.Message.ProjectID != createResponse.Project.ID || agentResponse.Message.ConversationID != conversationResponse.Conversation.ID || agentResponse.Message.CreatedAt == "" {
		t.Fatalf("agent response metadata = %+v", agentResponse.Message)
	}

	listConversations := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/conversations", sessionCookie)
	if listConversations.Code != http.StatusOK {
		t.Fatalf("conversation list status = %d, body = %s", listConversations.Code, listConversations.Body.String())
	}
	var listConversationsResponse struct {
		Conversations []struct {
			ID string `json:"id"`
		} `json:"conversations"`
	}
	if err := json.Unmarshal(listConversations.Body.Bytes(), &listConversationsResponse); err != nil {
		t.Fatalf("decode conversation list response: %v", err)
	}
	if len(listConversationsResponse.Conversations) != 1 || listConversationsResponse.Conversations[0].ID != conversationResponse.Conversation.ID {
		t.Fatalf("conversation list = %+v", listConversationsResponse.Conversations)
	}

	list := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/conversations/"+conversationResponse.Conversation.ID+"/messages", sessionCookie)
	if list.Code != http.StatusOK {
		t.Fatalf("agent message list status = %d, body = %s", list.Code, list.Body.String())
	}
	var listResponse struct {
		Messages []struct {
			ID        string `json:"id"`
			ProjectID string `json:"project_id"`
			Role      string `json:"role"`
			Body      string `json:"body"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("decode agent message list response: %v", err)
	}
	if len(listResponse.Messages) != 2 {
		t.Fatalf("agent message count = %d, want 2: %+v", len(listResponse.Messages), listResponse.Messages)
	}
	if listResponse.Messages[0].Role != "user" || listResponse.Messages[0].Body != "What can you see?" {
		t.Fatalf("stored user message = %+v", listResponse.Messages[0])
	}
	if listResponse.Messages[1].Role != "assistant" || listResponse.Messages[1].Body != "This project has usable CAD context." {
		t.Fatalf("stored assistant message = %+v", listResponse.Messages[1])
	}
}

func TestProjectAgentRouteRequiresAIConfiguration(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "agent-unconfigured@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Agent project",
	}, sessionCookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
	var createResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}

	conversation := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/conversations", map[string]string{
		"title": "Unconfigured test",
	}, sessionCookie)
	if conversation.Code != http.StatusOK {
		t.Fatalf("conversation status = %d, body = %s", conversation.Code, conversation.Body.String())
	}
	var conversationResponse struct {
		Conversation struct {
			ID string `json:"id"`
		} `json:"conversation"`
	}
	if err := json.Unmarshal(conversation.Body.Bytes(), &conversationResponse); err != nil {
		t.Fatalf("decode conversation response: %v", err)
	}

	agent := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/conversations/"+conversationResponse.Conversation.ID+"/messages", map[string]any{
		"messages": []map[string]string{
			{"role": "user", "body": "Hello"},
		},
	}, sessionCookie)
	if agent.Code != http.StatusServiceUnavailable {
		t.Fatalf("agent status = %d, want %d, body = %s", agent.Code, http.StatusServiceUnavailable, agent.Body.String())
	}
}

func TestProjectAgentParametricRunRouteCreatesArtifact(t *testing.T) {
	router := newTestRouterWithAI(t, testAIClient{reply: `{
  "tool": "build_parametric_model",
  "input": {
    "title": "Mounting bracket",
    "version": "v1",
    "source_kind": "openscad",
    "code": "width = 40; // [10:1:100]\ncube([width, 10, 5]);"
  }
}`})

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "agent-parametric-route@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Agent parametric project",
	}, sessionCookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
	var createResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	conversation := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/conversations", map[string]string{
		"title": "Design run",
	}, sessionCookie)
	if conversation.Code != http.StatusOK {
		t.Fatalf("conversation status = %d, body = %s", conversation.Code, conversation.Body.String())
	}
	var conversationResponse struct {
		Conversation struct {
			ID string `json:"id"`
		} `json:"conversation"`
	}
	if err := json.Unmarshal(conversation.Body.Bytes(), &conversationResponse); err != nil {
		t.Fatalf("decode conversation response: %v", err)
	}

	run := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/conversations/"+conversationResponse.Conversation.ID+"/parametric-runs", map[string]string{
		"message": "Make a parametric mounting bracket",
	}, sessionCookie)
	if run.Code != http.StatusOK {
		t.Fatalf("parametric run status = %d, body = %s", run.Code, run.Body.String())
	}
	var runResponse struct {
		Message struct {
			Role  string `json:"role"`
			Parts []struct {
				Type       string `json:"type"`
				ArtifactID string `json:"artifact_id"`
			} `json:"parts"`
		} `json:"message"`
		Artifact struct {
			ID            string `json:"id"`
			Title         string `json:"title"`
			SourceKind    string `json:"source_kind"`
			CompileStatus string `json:"compile_status"`
		} `json:"artifact"`
	}
	if err := json.Unmarshal(run.Body.Bytes(), &runResponse); err != nil {
		t.Fatalf("decode run response: %v", err)
	}
	if runResponse.Message.Role != "assistant" || len(runResponse.Message.Parts) != 2 {
		t.Fatalf("run message = %+v", runResponse.Message)
	}
	if runResponse.Artifact.ID == "" || runResponse.Artifact.Title != "Mounting bracket" || runResponse.Artifact.SourceKind != "openscad" || runResponse.Artifact.CompileStatus != "pending" {
		t.Fatalf("run artifact = %+v", runResponse.Artifact)
	}
}
