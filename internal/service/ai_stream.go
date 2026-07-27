package service

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const maxAIStreamResponseBytes = 8 << 20

// StreamProjectAgentMessage emits observable progress and provider deltas, then
// persists the same final result as SendProjectAgentMessage.
func (s *Service) StreamProjectAgentMessage(
	ctx context.Context,
	input ProjectAgentMessageInput,
	emit func(ProjectAgentStreamEvent) error,
) (ProjectAgentMessageResult, error) {
	if err := emit(ProjectAgentStreamEvent{Type: "status", Stage: "accepted"}); err != nil {
		return ProjectAgentMessageResult{}, err
	}
	prepared, err := s.prepareProjectAgentMessage(ctx, input)
	if err != nil {
		return ProjectAgentMessageResult{}, err
	}
	if err := emit(ProjectAgentStreamEvent{Type: "status", Stage: "context"}); err != nil {
		return ProjectAgentMessageResult{}, err
	}
	if err := emit(ProjectAgentStreamEvent{Type: "status", Stage: "provider"}); err != nil {
		return ProjectAgentMessageResult{}, err
	}

	var reply string
	if streamingClient, ok := s.aiClient.(AIStreamingClient); ok {
		reply, err = streamingClient.StreamChat(ctx, prepared.providerMessages, func(delta AIChatStreamDelta) error {
			if delta.Reasoning != "" {
				if emitErr := emit(ProjectAgentStreamEvent{Type: "reasoning", Delta: delta.Reasoning}); emitErr != nil {
					return emitErr
				}
			}
			if delta.Content != "" {
				if emitErr := emit(ProjectAgentStreamEvent{Type: "content", Delta: delta.Content}); emitErr != nil {
					return emitErr
				}
			}
			return nil
		})
	} else {
		reply, err = s.aiClient.Chat(ctx, prepared.providerMessages)
		if err == nil && reply != "" {
			err = emit(ProjectAgentStreamEvent{Type: "content", Delta: reply})
		}
	}
	if err != nil {
		return ProjectAgentMessageResult{}, fmt.Errorf("%w: %v", ErrAIProviderRequestFailed, err)
	}
	if err := emit(ProjectAgentStreamEvent{Type: "status", Stage: "persisting"}); err != nil {
		return ProjectAgentMessageResult{}, err
	}
	result, err := s.persistProjectAgentReply(ctx, prepared, reply)
	if err != nil {
		return ProjectAgentMessageResult{}, err
	}
	if err := emit(ProjectAgentStreamEvent{Type: "status", Stage: "complete"}); err != nil {
		return ProjectAgentMessageResult{}, err
	}
	return result, nil
}

func (c *openAICompatibleAIClient) StreamChat(
	ctx context.Context,
	messages []AIChatMessage,
	onDelta func(AIChatStreamDelta) error,
) (string, error) {
	payload := openAICompatibleChatRequest{
		Model:               c.model,
		Messages:            openAICompatibleMessages(messages),
		Temperature:         defaultAITemperature,
		MaxCompletionTokens: c.maxOutputTokens,
		Stream:              true,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal chat request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create chat request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("call chat provider: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", openAICompatibleStreamStatusError(resp)
	}

	var reply strings.Builder
	limitedBody := &io.LimitedReader{R: resp.Body, N: maxAIStreamResponseBytes + 1}
	scanner := bufio.NewScanner(limitedBody)
	scanner.Buffer(make([]byte, 64*1024), 1<<20)
	terminated := false
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		if data == "[DONE]" {
			terminated = true
			break
		}
		var chunk struct {
			Choices []struct {
				FinishReason *string `json:"finish_reason"`
				Delta        struct {
					Content          string `json:"content"`
					Reasoning        string `json:"reasoning"`
					ReasoningContent string `json:"reasoning_content"`
				} `json:"delta"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			return "", fmt.Errorf("decode streaming chat response: %w", err)
		}
		if chunk.Error != nil && strings.TrimSpace(chunk.Error.Message) != "" {
			return "", fmt.Errorf("chat provider stream error: %s", strings.TrimSpace(chunk.Error.Message))
		}
		for _, choice := range chunk.Choices {
			if choice.FinishReason != nil && strings.TrimSpace(*choice.FinishReason) != "" {
				terminated = true
			}
			reasoning := choice.Delta.ReasoningContent
			if reasoning == "" {
				reasoning = choice.Delta.Reasoning
			}
			delta := AIChatStreamDelta{
				Reasoning: reasoning,
				Content:   choice.Delta.Content,
			}
			if delta.Reasoning == "" && delta.Content == "" {
				continue
			}
			if err := onDelta(delta); err != nil {
				return "", err
			}
			reply.WriteString(delta.Content)
		}
	}
	if limitedBody.N == 0 {
		return "", fmt.Errorf("streaming chat response exceeded %d bytes", maxAIStreamResponseBytes)
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("read streaming chat response: %w", err)
	}
	if !terminated {
		return "", fmt.Errorf("streaming chat response ended before a terminal event")
	}
	return reply.String(), nil
}

func openAICompatibleStreamStatusError(resp *http.Response) error {
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("read chat response: %w", err)
	}
	var decoded openAICompatibleChatResponse
	if len(data) > 0 {
		_ = json.Unmarshal(data, &decoded)
	}
	if decoded.Error != nil && strings.TrimSpace(decoded.Error.Message) != "" {
		return fmt.Errorf("chat provider returned %d: %s", resp.StatusCode, strings.TrimSpace(decoded.Error.Message))
	}
	return fmt.Errorf("chat provider returned %d", resp.StatusCode)
}
