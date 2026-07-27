package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/miclle/litecad/internal/service"
)

type testAIClient struct {
	reply string
}

func (c testAIClient) Chat(ctx context.Context, messages []service.AIChatMessage) (string, error) {
	return c.reply, nil
}

type failingToolAIClient struct{}

func (c failingToolAIClient) Chat(ctx context.Context, messages []service.AIChatMessage) (string, error) {
	return "", errors.New("json fallback unavailable")
}

func (c failingToolAIClient) ChatWithTools(ctx context.Context, messages []service.AIChatMessage, tools []service.AIChatTool) (service.AIChatToolCall, error) {
	return service.AIChatToolCall{}, errors.New("native tools unavailable")
}

type failingChatAIClient struct{}

func (failingChatAIClient) Chat(context.Context, []service.AIChatMessage) (string, error) {
	return "", errors.New("provider connection closed")
}

func TestProjectAgentStreamReturnsOrderedSSEEvents(t *testing.T) {
	router := newTestRouterWithAI(t, testAIClient{reply: "The bracket is ready."})
	projectID, conversationID, sessionCookie := createAgentStreamFixture(t, router, "agent-stream-route@example.com")

	stream := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/agent/conversations/"+conversationID+"/messages/stream", map[string]any{
		"client_request_id": "assistant_stream_route_01",
		"messages": []map[string]string{
			{"role": "user", "body": "Inspect the bracket"},
		},
	}, sessionCookie)

	if stream.Code != http.StatusOK {
		t.Fatalf("stream status = %d, body = %s", stream.Code, stream.Body.String())
	}
	if got := stream.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/event-stream") {
		t.Fatalf("Content-Type = %q, want text/event-stream", got)
	}
	if got := stream.Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("Cache-Control = %q, want no-cache", got)
	}
	body := stream.Body.String()
	orderedFragments := []string{
		`event: status` + "\n" + `data: {"type":"status","stage":"accepted"}`,
		`data: {"type":"status","stage":"context"}`,
		`data: {"type":"status","stage":"provider"}`,
		`event: content` + "\n" + `data: {"type":"content","delta":"The bracket is ready."}`,
		`data: {"type":"status","stage":"persisting"}`,
		`data: {"type":"status","stage":"complete"}`,
		`event: result`,
		`"body":"The bracket is ready."`,
	}
	lastIndex := -1
	for _, fragment := range orderedFragments {
		index := strings.Index(body, fragment)
		if index == -1 {
			t.Fatalf("stream body missing %q:\n%s", fragment, body)
		}
		if index <= lastIndex {
			t.Fatalf("stream fragment %q is out of order:\n%s", fragment, body)
		}
		lastIndex = index
	}
	if !stream.Flushed {
		t.Fatal("stream response should flush SSE events")
	}
	if !strings.Contains(body, `"client_request_id":"assistant_stream_route_01"`) {
		t.Fatalf("stream result missing client request correlation:\n%s", body)
	}
}

func TestProjectAgentStreamMapsPostHeaderFailureToSSEError(t *testing.T) {
	router := newTestRouter(t)
	projectID, conversationID, sessionCookie := createAgentStreamFixture(t, router, "agent-stream-error@example.com")

	stream := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/agent/conversations/"+conversationID+"/messages/stream", map[string]any{
		"messages": []map[string]string{
			{"role": "user", "body": "Inspect the bracket"},
		},
	}, sessionCookie)

	if stream.Code != http.StatusOK {
		t.Fatalf("stream status = %d, body = %s", stream.Code, stream.Body.String())
	}
	body := stream.Body.String()
	if !strings.Contains(body, `event: status`+"\n"+`data: {"type":"status","stage":"accepted"}`) {
		t.Fatalf("stream body missing accepted event:\n%s", body)
	}
	if !strings.Contains(body, `event: error`+"\n"+`data: {"status":503,"message":"AI provider is not configured"}`) {
		t.Fatalf("stream body missing safe error event:\n%s", body)
	}
}

func TestProjectAgentStreamReportsProviderFailuresAsBadGateway(t *testing.T) {
	router := newTestRouterWithAI(t, failingChatAIClient{})
	projectID, conversationID, sessionCookie := createAgentStreamFixture(t, router, "agent-stream-provider-error@example.com")

	stream := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/agent/conversations/"+conversationID+"/messages/stream", map[string]any{
		"messages": []map[string]string{
			{"role": "user", "body": "Inspect the bracket"},
		},
	}, sessionCookie)

	if !strings.Contains(stream.Body.String(), `event: error`+"\n"+`data: {"status":502,"message":"AI provider request failed. Retry generation; if it keeps failing, check provider model compatibility and timeout settings."}`) {
		t.Fatalf("stream body missing provider failure event:\n%s", stream.Body.String())
	}
}

func TestProjectAgentStreamAuthenticatesBeforeOpeningSSE(t *testing.T) {
	router := newTestRouterWithAI(t, testAIClient{reply: "The bracket is ready."})
	projectID, conversationID, _ := createAgentStreamFixture(t, router, "agent-stream-auth@example.com")

	response := postJSON(t, router, "/api/v1/projects/"+projectID+"/agent/conversations/"+conversationID+"/messages/stream", map[string]any{
		"messages": []map[string]string{
			{"role": "user", "body": "Inspect the bracket"},
		},
	})

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("stream status = %d, want %d, body = %s", response.Code, http.StatusUnauthorized, response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); strings.HasPrefix(got, "text/event-stream") {
		t.Fatalf("unauthorized response should not open SSE, Content-Type = %q", got)
	}
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

func createAgentStreamFixture(t *testing.T, router http.Handler, email string) (string, string, *http.Cookie) {
	t.Helper()
	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    email,
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Streaming Agent project",
	}, sessionCookie)
	var createResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	conversation := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/conversations", map[string]string{
		"title": "Streaming review",
	}, sessionCookie)
	var conversationResponse struct {
		Conversation struct {
			ID string `json:"id"`
		} `json:"conversation"`
	}
	if err := json.Unmarshal(conversation.Body.Bytes(), &conversationResponse); err != nil {
		t.Fatalf("decode conversation response: %v", err)
	}
	return createResponse.Project.ID, conversationResponse.Conversation.ID, sessionCookie
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

func TestProjectAgentRouteCreatesArtifactFromJSONToolMessage(t *testing.T) {
	router := newTestRouterWithAI(t, testAIClient{reply: `{
  "tool": "build_parametric_model",
  "input": {
    "title": "Sphere 50 mm",
    "version": "v1",
    "source_kind": "litecad-feature-dsl",
    "code": "{\"version\":1,\"unit\":\"millimetre\",\"parameters\":{\"diameter\":{\"type\":\"number\",\"default\":50,\"min\":1,\"max\":200}},\"features\":[{\"id\":\"body\",\"type\":\"sphere\",\"origin\":[0,0,0],\"diameter\":\"diameter\"}]}"
  }
}`})

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "agent-message-json-tool-route@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Agent JSON tool message project",
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
		"title": "JSON tool message",
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
			{"role": "user", "body": "添加一个直径 50 的球"},
		},
	}, sessionCookie)
	if agent.Code != http.StatusOK {
		t.Fatalf("agent status = %d, body = %s", agent.Code, agent.Body.String())
	}
	var agentResponse projectAgentMessageResponse
	if err := json.Unmarshal(agent.Body.Bytes(), &agentResponse); err != nil {
		t.Fatalf("decode agent response: %v", err)
	}
	if agentResponse.Message.Role != "assistant" || !strings.Contains(agentResponse.Message.Body, "build_parametric_model") {
		t.Fatalf("agent response = %+v", agentResponse.Message)
	}
	if agentResponse.Artifact == nil || agentResponse.Artifact.Title != "Sphere 50 mm" || agentResponse.Artifact.MessageID != agentResponse.Message.ID {
		t.Fatalf("agent artifact = %+v", agentResponse.Artifact)
	}

	artifacts := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/parametric-artifacts", sessionCookie)
	if artifacts.Code != http.StatusOK {
		t.Fatalf("artifacts status = %d, body = %s", artifacts.Code, artifacts.Body.String())
	}
	var artifactsResponse struct {
		Artifacts []struct {
			Title              string `json:"title"`
			SourceKind         string `json:"source_kind"`
			GenerationToolMode string `json:"generation_tool_mode"`
		} `json:"artifacts"`
	}
	if err := json.Unmarshal(artifacts.Body.Bytes(), &artifactsResponse); err != nil {
		t.Fatalf("decode artifacts response: %v", err)
	}
	if len(artifactsResponse.Artifacts) != 1 ||
		artifactsResponse.Artifacts[0].Title != "Sphere 50 mm" ||
		artifactsResponse.Artifacts[0].SourceKind != "litecad-feature-dsl" ||
		artifactsResponse.Artifacts[0].GenerationToolMode != "json_fallback" {
		t.Fatalf("artifacts response = %+v", artifactsResponse.Artifacts)
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
			ID                   string `json:"id"`
			Title                string `json:"title"`
			SourceKind           string `json:"source_kind"`
			CompileStatus        string `json:"compile_status"`
			GenerationToolMode   string `json:"generation_tool_mode"`
			GenerationDurationMS int64  `json:"generation_duration_ms"`
		} `json:"artifact"`
		Telemetry struct {
			ToolMode   string `json:"tool_mode"`
			SourceKind string `json:"source_kind"`
			DurationMS int64  `json:"duration_ms"`
		} `json:"telemetry"`
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
	if runResponse.Artifact.GenerationToolMode != "json_fallback" || runResponse.Artifact.GenerationDurationMS < 0 {
		t.Fatalf("run artifact generation telemetry = %+v", runResponse.Artifact)
	}
	if runResponse.Telemetry.ToolMode != "json_fallback" || runResponse.Telemetry.SourceKind != "openscad" || runResponse.Telemetry.DurationMS < 0 {
		t.Fatalf("run telemetry = %+v", runResponse.Telemetry)
	}
}

func TestProjectAgentParametricRunRouteReturnsProviderFailure(t *testing.T) {
	router := newTestRouterWithAI(t, failingToolAIClient{})

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "agent-parametric-provider-failure@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Provider failure project",
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
		"title": "Provider failure run",
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
	if run.Code != http.StatusBadGateway {
		t.Fatalf("parametric run status = %d, want %d, body = %s", run.Code, http.StatusBadGateway, run.Body.String())
	}
	var errorResponse struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(run.Body.Bytes(), &errorResponse); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if !strings.Contains(errorResponse.Message, "AI provider request failed") {
		t.Fatalf("error response = %+v", errorResponse)
	}
}

func TestProjectAgentParametricRunRouteReturnsInvalidProviderOutput(t *testing.T) {
	router := newTestRouterWithAI(t, testAIClient{reply: "I created the model for you."})

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "agent-parametric-invalid-output@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Invalid provider output project",
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
		"title": "Invalid provider output run",
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
	if run.Code != http.StatusUnprocessableEntity {
		t.Fatalf("parametric run status = %d, want %d, body = %s", run.Code, http.StatusUnprocessableEntity, run.Body.String())
	}
	var errorResponse struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(run.Body.Bytes(), &errorResponse); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if !strings.Contains(errorResponse.Message, "could not validate") {
		t.Fatalf("error response = %+v", errorResponse)
	}
}
