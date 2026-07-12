package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOpenAICompatibleChatWithToolsSendsToolSchemaAndParsesToolCall(t *testing.T) {
	var request openAICompatibleChatRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Fatalf("path = %q, want /chat/completions", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			t.Fatalf("Authorization = %q", r.Header.Get("Authorization"))
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
		  "choices": [{
		    "message": {
		      "role": "assistant",
		      "tool_calls": [{
		        "id": "call_01",
		        "type": "function",
		        "function": {
		          "name": "build_parametric_model",
		          "arguments": "{\"title\":\"Tool bracket\",\"version\":\"v1\",\"source_kind\":\"litecad-feature-dsl\",\"code\":\"{\\\"version\\\":1,\\\"unit\\\":\\\"millimetre\\\",\\\"features\\\":[{\\\"id\\\":\\\"base\\\",\\\"type\\\":\\\"box\\\",\\\"size\\\":[80,40,6]}]}\"}"
		        }
		      }]
		    }
		  }]
		}`))
	}))
	defer server.Close()

	client, err := NewOpenAICompatibleAIClient(OpenAICompatibleConfig{
		BaseURL:         server.URL,
		APIKey:          "sk-test",
		Model:           "cad-model",
		MaxOutputTokens: 768,
	})
	if err != nil {
		t.Fatalf("NewOpenAICompatibleAIClient returned error: %v", err)
	}
	toolClient, ok := client.(AIChatToolClient)
	if !ok {
		t.Fatal("OpenAI-compatible client should implement AIChatToolClient")
	}

	call, err := toolClient.ChatWithTools(context.Background(), []AIChatMessage{
		{Role: "system", Body: "System prompt"},
		{Role: "user", Body: "Make a bracket"},
	}, []AIChatTool{buildParametricModelAITool()})
	if err != nil {
		t.Fatalf("ChatWithTools returned error: %v", err)
	}
	if call.Tool != aiParametricToolBuildModel || len(call.Arguments) == 0 {
		t.Fatalf("call = %+v", call)
	}
	if request.Model != "cad-model" || request.MaxCompletionTokens != 768 {
		t.Fatalf("request model/tokens = %+v", request)
	}
	if len(request.Tools) != 1 || request.Tools[0].Function.Name != aiParametricToolBuildModel {
		t.Fatalf("request tools = %+v", request.Tools)
	}
	if request.ToolChoice == nil || request.ToolChoice.Type != "function" || request.ToolChoice.Function.Name != aiParametricToolBuildModel {
		t.Fatalf("request tool choice = %+v", request.ToolChoice)
	}
}
