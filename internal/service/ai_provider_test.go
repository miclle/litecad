package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestOpenAICompatibleAIClientStreamsReasoningAndContent(t *testing.T) {
	var request openAICompatibleChatRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"Checking the \"}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"reasoning\":\"project context.\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"The bracket \"}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"is ready.\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()

	client, err := NewOpenAICompatibleAIClient(OpenAICompatibleConfig{
		BaseURL: server.URL,
		APIKey:  "sk-test",
		Model:   "thinking-model",
	})
	if err != nil {
		t.Fatalf("NewOpenAICompatibleAIClient returned error: %v", err)
	}
	streamingClient, ok := client.(AIStreamingClient)
	if !ok {
		t.Fatal("OpenAI-compatible client should implement AIStreamingClient")
	}

	var deltas []AIChatStreamDelta
	reply, err := streamingClient.StreamChat(context.Background(), []AIChatMessage{
		{Role: "user", Body: "Inspect the bracket"},
	}, func(delta AIChatStreamDelta) error {
		deltas = append(deltas, delta)
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat returned error: %v", err)
	}

	wantDeltas := []AIChatStreamDelta{
		{Reasoning: "Checking the "},
		{Reasoning: "project context."},
		{Content: "The bracket "},
		{Content: "is ready."},
	}
	if !reflect.DeepEqual(deltas, wantDeltas) {
		t.Fatalf("deltas = %#v, want %#v", deltas, wantDeltas)
	}
	if reply != "The bracket is ready." {
		t.Fatalf("reply = %q, want %q", reply, "The bracket is ready.")
	}
	if !request.Stream {
		t.Fatal("stream request should set stream=true")
	}
}

func TestOpenAICompatibleAIClientRejectsPrematureStreamEOF(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"Partial answer\"}}]}\n\n"))
	}))
	defer server.Close()

	client, err := NewOpenAICompatibleAIClient(OpenAICompatibleConfig{
		BaseURL: server.URL,
		APIKey:  "sk-test",
		Model:   "thinking-model",
	})
	if err != nil {
		t.Fatalf("NewOpenAICompatibleAIClient returned error: %v", err)
	}

	_, err = client.(AIStreamingClient).StreamChat(context.Background(), []AIChatMessage{
		{Role: "user", Body: "Inspect the bracket"},
	}, func(AIChatStreamDelta) error {
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), "ended before a terminal event") {
		t.Fatalf("StreamChat error = %v, want premature EOF error", err)
	}
}

func TestOpenAICompatibleAIClientAcceptsTerminalFinishReasonWithoutDoneMarker(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"Complete answer\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n"))
	}))
	defer server.Close()

	client, err := NewOpenAICompatibleAIClient(OpenAICompatibleConfig{
		BaseURL: server.URL,
		APIKey:  "sk-test",
		Model:   "thinking-model",
	})
	if err != nil {
		t.Fatalf("NewOpenAICompatibleAIClient returned error: %v", err)
	}

	reply, err := client.(AIStreamingClient).StreamChat(context.Background(), []AIChatMessage{
		{Role: "user", Body: "Inspect the bracket"},
	}, func(AIChatStreamDelta) error {
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat returned error: %v", err)
	}
	if reply != "Complete answer" {
		t.Fatalf("reply = %q, want %q", reply, "Complete answer")
	}
}

func TestOpenAICompatibleAIClientRejectsOversizedStream(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		padding := strings.Repeat(": keepalive\n\n", maxAIStreamResponseBytes/len(": keepalive\n\n")+2)
		_, _ = w.Write([]byte(padding))
	}))
	defer server.Close()

	client, err := NewOpenAICompatibleAIClient(OpenAICompatibleConfig{
		BaseURL: server.URL,
		APIKey:  "sk-test",
		Model:   "thinking-model",
	})
	if err != nil {
		t.Fatalf("NewOpenAICompatibleAIClient returned error: %v", err)
	}

	_, err = client.(AIStreamingClient).StreamChat(context.Background(), []AIChatMessage{
		{Role: "user", Body: "Inspect the bracket"},
	}, func(AIChatStreamDelta) error {
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), "exceeded") {
		t.Fatalf("StreamChat error = %v, want response size error", err)
	}
}

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

func TestOpenAICompatibleChatWithToolsRetriesWithoutToolChoiceWhenUnsupported(t *testing.T) {
	var requests []openAICompatibleChatRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request openAICompatibleChatRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		requests = append(requests, request)
		w.Header().Set("Content-Type", "application/json")
		if len(requests) == 1 {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"Thinking mode does not support this tool_choice"}}`))
			return
		}
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
		BaseURL: server.URL,
		APIKey:  "sk-test",
		Model:   "thinking-model",
	})
	if err != nil {
		t.Fatalf("NewOpenAICompatibleAIClient returned error: %v", err)
	}
	toolClient := client.(AIChatToolClient)

	call, err := toolClient.ChatWithTools(context.Background(), []AIChatMessage{
		{Role: "system", Body: "System prompt"},
		{Role: "user", Body: "Make a bracket"},
	}, []AIChatTool{buildParametricModelAITool()})
	if err != nil {
		t.Fatalf("ChatWithTools returned error: %v", err)
	}
	if call.Tool != aiParametricToolBuildModel {
		t.Fatalf("call = %+v", call)
	}
	if len(requests) != 2 {
		t.Fatalf("request count = %d, want 2", len(requests))
	}
	if requests[0].ToolChoice == nil {
		t.Fatalf("first request should force tool choice")
	}
	if requests[1].ToolChoice != nil {
		t.Fatalf("retry request tool choice = %+v, want nil", requests[1].ToolChoice)
	}
	if len(requests[1].Tools) != 1 || requests[1].Tools[0].Function.Name != aiParametricToolBuildModel {
		t.Fatalf("retry tools = %+v", requests[1].Tools)
	}
}
