package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"gorm.io/gorm"
)

const (
	maxAIChatMessages     = 24
	maxAIChatMessageRunes = 4000
	cadAgentSystemPrompt  = "You are CAD Agent inside LiteCAD. Help the user inspect CAD sources, metadata, design intent, and possible model changes. Be clear about the current product boundary: you can discuss and plan changes, but you cannot directly mutate persisted CAD geometry unless a dedicated tool is available."
	defaultAITimeout      = 30 * time.Second
	defaultAITemperature  = 0.2
)

var (
	// ErrAIUnavailable indicates the AI provider is not configured for this server.
	ErrAIUnavailable = errors.New("ai unavailable")
	// ErrInvalidAIChatInput indicates a malformed CAD Agent message request.
	ErrInvalidAIChatInput = errors.New("invalid ai chat input")
)

// AIClient is the provider-neutral interface used by the CAD Agent service.
type AIClient interface {
	Chat(ctx context.Context, messages []AIChatMessage) (string, error)
}

// AIChatMessage is a provider-neutral chat message.
type AIChatMessage struct {
	Role string `json:"role"`
	Body string `json:"body"`
}

// ProjectAgentMessageInput is the data required to ask the CAD Agent about a project.
type ProjectAgentMessageInput struct {
	OwnerUserID string
	ProjectID   string
	Messages    []AIChatMessage
}

// ProjectAgentMessage is the CAD Agent reply returned to the browser.
type ProjectAgentMessage struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Role      string `json:"role"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// ListProjectAgentMessages returns persisted CAD Agent messages for a project.
func (s *Service) ListProjectAgentMessages(ctx context.Context, ownerUserID, projectID string) ([]ProjectAgentMessage, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return nil, err
	}

	var messages []entity.ProjectAgentMessage
	if err := s.db.WithContext(ctx).
		Where("project_id = ?", project.ID).
		Order("created_at ASC, id ASC").
		Find(&messages).Error; err != nil {
		return nil, fmt.Errorf("list project agent messages: %w", err)
	}

	result := make([]ProjectAgentMessage, 0, len(messages))
	for _, message := range messages {
		result = append(result, publicProjectAgentMessage(message))
	}
	return result, nil
}

// SendProjectAgentMessage sends the current conversation plus project context to the configured AI provider.
func (s *Service) SendProjectAgentMessage(ctx context.Context, input ProjectAgentMessageInput) (ProjectAgentMessage, error) {
	if s.aiClient == nil {
		return ProjectAgentMessage{}, ErrAIUnavailable
	}

	ownerUserID := strings.TrimSpace(input.OwnerUserID)
	projectID := strings.TrimSpace(input.ProjectID)
	if ownerUserID == "" || projectID == "" {
		return ProjectAgentMessage{}, ErrProjectNotFound
	}

	messages, err := normalizeAIChatMessages(input.Messages)
	if err != nil {
		return ProjectAgentMessage{}, err
	}
	userMessage := messages[len(messages)-1]

	projectEntity, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return ProjectAgentMessage{}, err
	}
	project := publicProject(projectEntity)
	models, err := s.ListProjectModels(ctx, ownerUserID, projectID)
	if err != nil {
		return ProjectAgentMessage{}, err
	}
	persistedMessages, err := s.listRecentProjectAgentMessages(ctx, project.ID, maxAIChatMessages)
	if err != nil {
		return ProjectAgentMessage{}, err
	}

	providerMessages := make([]AIChatMessage, 0, len(persistedMessages)+2)
	providerMessages = append(providerMessages,
		AIChatMessage{Role: "system", Body: cadAgentSystemPrompt},
		AIChatMessage{Role: "system", Body: buildProjectAgentContext(project, models)},
	)
	for _, message := range persistedMessages {
		providerMessages = append(providerMessages, AIChatMessage{Role: message.Role, Body: message.Body})
	}
	providerMessages = append(providerMessages, userMessage)

	reply, err := s.aiClient.Chat(ctx, providerMessages)
	if err != nil {
		return ProjectAgentMessage{}, fmt.Errorf("send ai chat: %w", err)
	}
	reply = strings.TrimSpace(reply)
	if reply == "" {
		return ProjectAgentMessage{}, fmt.Errorf("send ai chat: empty provider response")
	}

	var assistantMessage ProjectAgentMessage
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := createProjectAgentMessageInDB(ctx, tx, project.ID, userMessage); err != nil {
			return err
		}
		message, err := createProjectAgentMessageInDB(ctx, tx, project.ID, AIChatMessage{Role: "assistant", Body: reply})
		if err != nil {
			return err
		}
		assistantMessage = message
		return nil
	})
	if err != nil {
		return ProjectAgentMessage{}, err
	}
	return assistantMessage, nil
}

func (s *Service) loadOwnedProject(ctx context.Context, ownerUserID, projectID string) (entity.Project, error) {
	ownerUserID = strings.TrimSpace(ownerUserID)
	projectID = strings.TrimSpace(projectID)
	if ownerUserID == "" || projectID == "" {
		return entity.Project{}, ErrProjectNotFound
	}

	var project entity.Project
	if err := s.db.WithContext(ctx).
		First(&project, "id = ? AND owner_user_id = ?", projectID, ownerUserID).
		Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return entity.Project{}, ErrProjectNotFound
		}
		return entity.Project{}, fmt.Errorf("load project: %w", err)
	}
	return project, nil
}

func createProjectAgentMessageInDB(ctx context.Context, db *gorm.DB, projectID string, input AIChatMessage) (ProjectAgentMessage, error) {
	messageID, err := id.NewPrefixed("agm")
	if err != nil {
		return ProjectAgentMessage{}, err
	}
	message := entity.ProjectAgentMessage{
		ID:        messageID,
		ProjectID: projectID,
		Role:      input.Role,
		Body:      input.Body,
	}
	if err := db.WithContext(ctx).Create(&message).Error; err != nil {
		return ProjectAgentMessage{}, fmt.Errorf("store project agent message: %w", err)
	}
	return publicProjectAgentMessage(message), nil
}

func (s *Service) listRecentProjectAgentMessages(ctx context.Context, projectID string, limit int) ([]ProjectAgentMessage, error) {
	var messages []entity.ProjectAgentMessage
	if err := s.db.WithContext(ctx).
		Where("project_id = ?", projectID).
		Order("created_at DESC, id DESC").
		Limit(limit).
		Find(&messages).Error; err != nil {
		return nil, fmt.Errorf("list recent project agent messages: %w", err)
	}

	result := make([]ProjectAgentMessage, 0, len(messages))
	for index := len(messages) - 1; index >= 0; index-- {
		result = append(result, publicProjectAgentMessage(messages[index]))
	}
	return result, nil
}

func publicProjectAgentMessage(message entity.ProjectAgentMessage) ProjectAgentMessage {
	return ProjectAgentMessage{
		ID:        message.ID,
		ProjectID: message.ProjectID,
		Role:      message.Role,
		Body:      message.Body,
		CreatedAt: message.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt: message.UpdatedAt.Format(timeFormatRFC3339),
	}
}

func normalizeAIChatMessages(messages []AIChatMessage) ([]AIChatMessage, error) {
	if len(messages) == 0 || len(messages) > maxAIChatMessages {
		return nil, ErrInvalidAIChatInput
	}

	result := make([]AIChatMessage, 0, len(messages))
	for _, message := range messages {
		role := strings.TrimSpace(message.Role)
		body := strings.TrimSpace(message.Body)
		if role != "user" && role != "assistant" {
			return nil, ErrInvalidAIChatInput
		}
		if body == "" || utf8.RuneCountInString(body) > maxAIChatMessageRunes {
			return nil, ErrInvalidAIChatInput
		}
		result = append(result, AIChatMessage{Role: role, Body: body})
	}
	if result[len(result)-1].Role != "user" {
		return nil, ErrInvalidAIChatInput
	}
	return result, nil
}

func buildProjectAgentContext(project Project, models []ProjectModel) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Current project:\n- Name: %s\n", project.Name)
	if strings.TrimSpace(project.Description) != "" {
		fmt.Fprintf(&b, "- Description: %s\n", project.Description)
	}
	fmt.Fprintf(&b, "- Source count: %d\n", len(models))
	if len(models) == 0 {
		b.WriteString("- Sources: none imported yet\n")
		return b.String()
	}

	b.WriteString("Sources:\n")
	for _, model := range models {
		fmt.Fprintf(&b, "- %s (%s, %s, %d bytes, %s)", model.OriginalFilename, model.Format, model.ParseStatus, model.ByteSize, model.UpdatedAt)
		if model.Metadata.Schema != "" {
			fmt.Fprintf(&b, "; schema=%s", model.Metadata.Schema)
		}
		if model.Metadata.LengthUnit != "" {
			fmt.Fprintf(&b, "; unit=%s", model.Metadata.LengthUnit)
		}
		if len(model.Metadata.ProductNames) > 0 {
			fmt.Fprintf(&b, "; products=%s", strings.Join(model.Metadata.ProductNames, ", "))
		}
		if model.Metadata.EntityCount > 0 {
			fmt.Fprintf(&b, "; entities=%d", model.Metadata.EntityCount)
		}
		if model.Metadata.TriangleCount > 0 {
			fmt.Fprintf(&b, "; triangles=%d", model.Metadata.TriangleCount)
		}
		if model.ParseError != "" {
			fmt.Fprintf(&b, "; parse_error=%s", model.ParseError)
		}
		b.WriteByte('\n')
	}
	return b.String()
}

// OpenAICompatibleConfig configures an OpenAI-compatible chat completions client.
type OpenAICompatibleConfig struct {
	BaseURL        string
	APIKey         string
	Model          string
	TimeoutSeconds int
}

// NewOpenAICompatibleAIClient creates a chat client for providers that implement /chat/completions.
func NewOpenAICompatibleAIClient(config OpenAICompatibleConfig) (AIClient, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	apiKey := strings.TrimSpace(config.APIKey)
	model := strings.TrimSpace(config.Model)
	if apiKey == "" || model == "" {
		return nil, nil
	}
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}

	timeout := defaultAITimeout
	if config.TimeoutSeconds > 0 {
		timeout = time.Duration(config.TimeoutSeconds) * time.Second
	}
	return &openAICompatibleAIClient{
		baseURL: baseURL,
		apiKey:  apiKey,
		model:   model,
		client:  &http.Client{Timeout: timeout},
	}, nil
}

type openAICompatibleAIClient struct {
	baseURL string
	apiKey  string
	model   string
	client  *http.Client
}

type openAICompatibleChatRequest struct {
	Model       string                        `json:"model"`
	Messages    []openAICompatibleChatMessage `json:"messages"`
	Temperature float64                       `json:"temperature"`
}

type openAICompatibleChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAICompatibleChatResponse struct {
	Choices []struct {
		Message openAICompatibleChatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (c *openAICompatibleAIClient) Chat(ctx context.Context, messages []AIChatMessage) (string, error) {
	providerMessages := make([]openAICompatibleChatMessage, 0, len(messages))
	for _, message := range messages {
		providerMessages = append(providerMessages, openAICompatibleChatMessage{
			Role:    message.Role,
			Content: message.Body,
		})
	}
	payload := openAICompatibleChatRequest{
		Model:       c.model,
		Messages:    providerMessages,
		Temperature: defaultAITemperature,
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

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("call chat provider: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read chat response: %w", err)
	}

	var decoded openAICompatibleChatResponse
	if len(data) > 0 {
		_ = json.Unmarshal(data, &decoded)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		if decoded.Error != nil && strings.TrimSpace(decoded.Error.Message) != "" {
			return "", fmt.Errorf("chat provider returned %d: %s", resp.StatusCode, strings.TrimSpace(decoded.Error.Message))
		}
		return "", fmt.Errorf("chat provider returned %d", resp.StatusCode)
	}
	if len(decoded.Choices) == 0 || strings.TrimSpace(decoded.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("chat provider returned no message")
	}
	return decoded.Choices[0].Message.Content, nil
}
