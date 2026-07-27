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
	maxAIChatMessages                     = 24
	maxAIChatMessageRunes                 = 4000
	maxProjectAgentConversationTitleRunes = 120
	defaultProjectAgentConversationTitle  = "Project chat"
	cadAgentSystemPrompt                  = "You are CAD Agent inside LiteCAD. Help the user inspect CAD sources, metadata, design intent, and possible model changes. When a dedicated model-generation tool or JSON contract is available, use it to create project-owned parametric source artifacts instead of only describing manual steps."
	defaultAITimeout                      = 90 * time.Second
	defaultAITemperature                  = 0.2
	defaultAIMaxOutputTokens              = 2048
)

var (
	// ErrAIUnavailable indicates the AI provider is not configured for this server.
	ErrAIUnavailable = errors.New("ai unavailable")
	// ErrAIProviderRequestFailed indicates the configured AI provider could not complete a request.
	ErrAIProviderRequestFailed = errors.New("ai provider request failed")
	// ErrAIProviderInvalidOutput indicates the provider returned a model draft LiteCAD could not validate.
	ErrAIProviderInvalidOutput = errors.New("ai provider invalid output")
	// ErrInvalidAIChatInput indicates a malformed CAD Agent message request.
	ErrInvalidAIChatInput = errors.New("invalid ai chat input")
)

// AIClient is the provider-neutral interface used by the CAD Agent service.
type AIClient interface {
	Chat(ctx context.Context, messages []AIChatMessage) (string, error)
}

// AIStreamingClient is implemented by providers that can return incremental
// reasoning summaries and answer content.
type AIStreamingClient interface {
	StreamChat(ctx context.Context, messages []AIChatMessage, onDelta func(AIChatStreamDelta) error) (string, error)
}

// AIChatStreamDelta is one provider-supplied incremental chat update.
type AIChatStreamDelta struct {
	Reasoning string
	Content   string
}

// AIChatToolClient is implemented by providers that support native function tools.
type AIChatToolClient interface {
	ChatWithTools(ctx context.Context, messages []AIChatMessage, tools []AIChatTool) (AIChatToolCall, error)
}

// AIChatMessage is a provider-neutral chat message.
type AIChatMessage struct {
	Role            string `json:"role"`
	Body            string `json:"body"`
	ClientRequestID string `json:"client_request_id,omitempty"`
}

// AIChatTool is a provider-neutral function tool definition.
type AIChatTool struct {
	Name        string
	Description string
	Parameters  map[string]any
}

// AIChatToolCall is a provider-neutral function tool call.
type AIChatToolCall struct {
	Tool      string
	Arguments json.RawMessage
}

// CreateProjectAgentConversationInput is the data required to start a CAD Agent thread.
type CreateProjectAgentConversationInput struct {
	OwnerUserID   string
	ProjectID     string
	Title         string
	ActiveModelID string
}

// ProjectAgentMessageInput is the data required to ask the CAD Agent about a project.
type ProjectAgentMessageInput struct {
	OwnerUserID     string
	ProjectID       string
	ConversationID  string
	Messages        []AIChatMessage
	ActiveModelID   string
	ClientRequestID string
}

// ProjectAgentMessageResult is the CAD Agent reply plus any generated artifact
// created from a model-building tool response.
type ProjectAgentMessageResult struct {
	Message  ProjectAgentMessage
	Artifact *ProjectParametricArtifact
}

// ProjectAgentStreamEvent reports observable Assistant work before the final
// persisted message result is available.
type ProjectAgentStreamEvent struct {
	Type  string `json:"type"`
	Stage string `json:"stage,omitempty"`
	Delta string `json:"delta,omitempty"`
}

// ProjectAgentConversation is a persisted CAD Agent thread returned to the browser.
type ProjectAgentConversation struct {
	ID            string `json:"id"`
	ProjectID     string `json:"project_id"`
	Title         string `json:"title"`
	ActiveModelID string `json:"active_model_id,omitempty"`
	ArchivedAt    string `json:"archived_at,omitempty"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

// ProjectAgentMessage is the CAD Agent reply returned to the browser.
type ProjectAgentMessage struct {
	ID              string `json:"id"`
	ProjectID       string `json:"project_id"`
	ConversationID  string `json:"conversation_id"`
	ClientRequestID string `json:"client_request_id,omitempty"`
	Role            string `json:"role"`
	Body            string `json:"body"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

// ListProjectAgentConversations returns CAD Agent threads for a project.
func (s *Service) ListProjectAgentConversations(ctx context.Context, ownerUserID, projectID string) ([]ProjectAgentConversation, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return nil, err
	}

	var conversations []entity.ProjectAgentConversation
	if err := s.db.WithContext(ctx).
		Where("project_id = ?", project.ID).
		Order("updated_at DESC, created_at DESC, id DESC").
		Find(&conversations).Error; err != nil {
		return nil, fmt.Errorf("list project agent conversations: %w", err)
	}

	result := make([]ProjectAgentConversation, 0, len(conversations))
	for _, conversation := range conversations {
		result = append(result, publicProjectAgentConversation(conversation))
	}
	return result, nil
}

// CreateProjectAgentConversation creates a fresh CAD Agent thread for a project.
func (s *Service) CreateProjectAgentConversation(ctx context.Context, input CreateProjectAgentConversationInput) (ProjectAgentConversation, error) {
	project, err := s.loadOwnedProject(ctx, input.OwnerUserID, input.ProjectID)
	if err != nil {
		return ProjectAgentConversation{}, err
	}

	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = defaultProjectAgentConversationTitle
	}
	if utf8.RuneCountInString(title) > maxProjectAgentConversationTitleRunes {
		return ProjectAgentConversation{}, ErrInvalidAIChatInput
	}
	activeModelID := strings.TrimSpace(input.ActiveModelID)
	if activeModelID != "" {
		var model entity.ProjectModel
		if err := s.db.WithContext(ctx).First(&model, "id = ? AND project_id = ?", activeModelID, project.ID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ProjectAgentConversation{}, ErrProjectNotFound
			}
			return ProjectAgentConversation{}, fmt.Errorf("load project agent active model: %w", err)
		}
	}

	conversationID, err := id.NewPrefixed("agc")
	if err != nil {
		return ProjectAgentConversation{}, err
	}
	conversation := entity.ProjectAgentConversation{
		ID:            conversationID,
		ProjectID:     project.ID,
		Title:         title,
		ActiveModelID: activeModelID,
	}
	if err := s.db.WithContext(ctx).Create(&conversation).Error; err != nil {
		return ProjectAgentConversation{}, fmt.Errorf("create project agent conversation: %w", err)
	}
	return publicProjectAgentConversation(conversation), nil
}

// ListProjectAgentMessages returns persisted CAD Agent messages for a project conversation.
func (s *Service) ListProjectAgentMessages(ctx context.Context, ownerUserID, projectID, conversationID string) ([]ProjectAgentMessage, error) {
	project, conversation, err := s.loadOwnedProjectAgentConversation(ctx, ownerUserID, projectID, conversationID)
	if err != nil {
		return nil, err
	}

	var messages []entity.ProjectAgentMessage
	if err := s.db.WithContext(ctx).
		Where("project_id = ? AND conversation_id = ?", project.ID, conversation.ID).
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
func (s *Service) SendProjectAgentMessage(ctx context.Context, input ProjectAgentMessageInput) (ProjectAgentMessageResult, error) {
	prepared, err := s.prepareProjectAgentMessage(ctx, input)
	if err != nil {
		return ProjectAgentMessageResult{}, err
	}

	reply, err := s.aiClient.Chat(ctx, prepared.providerMessages)
	if err != nil {
		return ProjectAgentMessageResult{}, fmt.Errorf("%w: %v", ErrAIProviderRequestFailed, err)
	}
	return s.persistProjectAgentReply(ctx, prepared, reply)
}

type preparedProjectAgentMessage struct {
	projectID        string
	conversationID   string
	userMessage      AIChatMessage
	providerMessages []AIChatMessage
	models           []ProjectModel
	activeModelID    string
}

func (s *Service) prepareProjectAgentMessage(ctx context.Context, input ProjectAgentMessageInput) (preparedProjectAgentMessage, error) {
	ownerUserID := strings.TrimSpace(input.OwnerUserID)
	projectID := strings.TrimSpace(input.ProjectID)
	if ownerUserID == "" || projectID == "" {
		return preparedProjectAgentMessage{}, ErrProjectNotFound
	}

	messages, err := normalizeAIChatMessages(input.Messages)
	if err != nil {
		return preparedProjectAgentMessage{}, err
	}
	clientRequestID, err := normalizeAIClientRequestID(input.ClientRequestID)
	if err != nil {
		return preparedProjectAgentMessage{}, err
	}
	userMessage := messages[len(messages)-1]
	userMessage.ClientRequestID = clientRequestID

	if s.aiClient == nil {
		return preparedProjectAgentMessage{}, ErrAIUnavailable
	}

	projectEntity, conversation, err := s.loadOwnedProjectAgentConversation(ctx, ownerUserID, projectID, input.ConversationID)
	if err != nil {
		return preparedProjectAgentMessage{}, err
	}
	project := publicProject(projectEntity)
	models, err := s.ListProjectModels(ctx, ownerUserID, projectID)
	if err != nil {
		return preparedProjectAgentMessage{}, err
	}
	activeModelContext := buildAIParametricActiveModelContext(input.ActiveModelID, models)
	persistedMessages, err := s.listRecentProjectAgentMessages(ctx, project.ID, conversation.ID, maxAIChatMessages)
	if err != nil {
		return preparedProjectAgentMessage{}, err
	}

	providerMessages := make([]AIChatMessage, 0, len(persistedMessages)+4)
	providerMessages = append(providerMessages,
		AIChatMessage{Role: "system", Body: cadAgentSystemPrompt},
		AIChatMessage{Role: "system", Body: aiParametricSystemPrompt},
		AIChatMessage{Role: "system", Body: aiParametricConversationPrompt},
		AIChatMessage{Role: "system", Body: buildProjectAgentContext(project, models)},
	)
	if activeModelContext != "" {
		providerMessages = append(providerMessages, AIChatMessage{Role: "system", Body: activeModelContext})
	}
	for _, message := range persistedMessages {
		providerMessages = append(providerMessages, AIChatMessage{Role: message.Role, Body: message.Body})
	}
	providerMessages = append(providerMessages, userMessage)

	return preparedProjectAgentMessage{
		projectID:        project.ID,
		conversationID:   conversation.ID,
		userMessage:      userMessage,
		providerMessages: providerMessages,
		models:           models,
		activeModelID:    input.ActiveModelID,
	}, nil
}

func (s *Service) persistProjectAgentReply(ctx context.Context, prepared preparedProjectAgentMessage, reply string) (ProjectAgentMessageResult, error) {
	reply = strings.TrimSpace(reply)
	if reply == "" {
		return ProjectAgentMessageResult{}, fmt.Errorf("%w: empty provider response", ErrAIProviderRequestFailed)
	}

	call, err := ParseAIParametricToolCall(reply)
	if err != nil && isAIParametricToolOutputAttempt(reply) {
		message, persistErr := s.persistProjectAgentParametricFailureMessage(ctx, prepared.projectID, prepared.conversationID, prepared.userMessage)
		if persistErr != nil {
			return ProjectAgentMessageResult{}, persistErr
		}
		return ProjectAgentMessageResult{Message: message}, nil
	}
	if err == nil {
		originalTitle := call.Input.Title
		call.Input.Title = distinguishAIParametricRevisionTitle(call.Input.Title, prepared.activeModelID, prepared.models)
		if call.Input.Title != originalTitle {
			reply = marshalAIParametricToolCall(call)
		}
		run, err := s.persistProjectAgentParametricRun(ctx, prepared.projectID, prepared.conversationID, prepared.userMessage, call, reply, ProjectAgentParametricTelemetry{
			ToolMode:   aiParametricToolModeJSONFallback,
			SourceKind: call.Input.SourceKind,
			DurationMS: 0,
		})
		if err != nil {
			return ProjectAgentMessageResult{}, err
		}
		message := ProjectAgentMessage{
			ID:              run.Message.ID,
			ProjectID:       run.Message.ProjectID,
			ConversationID:  run.Message.ConversationID,
			ClientRequestID: run.Message.ClientRequestID,
			Role:            run.Message.Role,
			Body:            run.Message.Body,
			CreatedAt:       run.Message.CreatedAt,
			UpdatedAt:       run.Message.UpdatedAt,
		}
		return ProjectAgentMessageResult{Message: message, Artifact: &run.Artifact}, nil
	}

	var assistantMessage ProjectAgentMessage
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if _, err := createProjectAgentMessageInDB(ctx, tx, prepared.projectID, prepared.conversationID, prepared.userMessage); err != nil {
			return err
		}
		message, err := createProjectAgentMessageInDB(ctx, tx, prepared.projectID, prepared.conversationID, AIChatMessage{
			Role:            "assistant",
			Body:            reply,
			ClientRequestID: prepared.userMessage.ClientRequestID,
		})
		if err != nil {
			return err
		}
		assistantMessage = message
		return nil
	})
	if err != nil {
		return ProjectAgentMessageResult{}, err
	}
	return ProjectAgentMessageResult{Message: assistantMessage}, nil
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

func (s *Service) loadOwnedProjectAgentConversation(ctx context.Context, ownerUserID, projectID, conversationID string) (entity.Project, entity.ProjectAgentConversation, error) {
	project, err := s.loadOwnedProject(ctx, ownerUserID, projectID)
	if err != nil {
		return entity.Project{}, entity.ProjectAgentConversation{}, err
	}

	conversationID = strings.TrimSpace(conversationID)
	if conversationID == "" {
		return entity.Project{}, entity.ProjectAgentConversation{}, ErrProjectNotFound
	}

	var conversation entity.ProjectAgentConversation
	if err := s.db.WithContext(ctx).
		First(&conversation, "id = ? AND project_id = ?", conversationID, project.ID).
		Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return entity.Project{}, entity.ProjectAgentConversation{}, ErrProjectNotFound
		}
		return entity.Project{}, entity.ProjectAgentConversation{}, fmt.Errorf("load project agent conversation: %w", err)
	}
	return project, conversation, nil
}

func createProjectAgentMessageInDB(ctx context.Context, db *gorm.DB, projectID, conversationID string, input AIChatMessage) (ProjectAgentMessage, error) {
	messageID, err := id.NewPrefixed("agm")
	if err != nil {
		return ProjectAgentMessage{}, err
	}
	message := entity.ProjectAgentMessage{
		ID:              messageID,
		ProjectID:       projectID,
		ConversationID:  conversationID,
		ClientRequestID: input.ClientRequestID,
		Role:            input.Role,
		Body:            input.Body,
	}
	if err := db.WithContext(ctx).Create(&message).Error; err != nil {
		return ProjectAgentMessage{}, fmt.Errorf("store project agent message: %w", err)
	}
	return publicProjectAgentMessage(message), nil
}

func (s *Service) listRecentProjectAgentMessages(ctx context.Context, projectID, conversationID string, limit int) ([]ProjectAgentMessage, error) {
	var messages []entity.ProjectAgentMessage
	if err := s.db.WithContext(ctx).
		Where("project_id = ? AND conversation_id = ?", projectID, conversationID).
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

func publicProjectAgentConversation(conversation entity.ProjectAgentConversation) ProjectAgentConversation {
	result := ProjectAgentConversation{
		ID:            conversation.ID,
		ProjectID:     conversation.ProjectID,
		Title:         conversation.Title,
		ActiveModelID: conversation.ActiveModelID,
		CreatedAt:     conversation.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:     conversation.UpdatedAt.Format(timeFormatRFC3339),
	}
	if conversation.ArchivedAt != nil {
		result.ArchivedAt = conversation.ArchivedAt.Format(timeFormatRFC3339)
	}
	return result
}

func publicProjectAgentMessage(message entity.ProjectAgentMessage) ProjectAgentMessage {
	return ProjectAgentMessage{
		ID:              message.ID,
		ProjectID:       message.ProjectID,
		ConversationID:  message.ConversationID,
		ClientRequestID: message.ClientRequestID,
		Role:            message.Role,
		Body:            message.Body,
		CreatedAt:       message.CreatedAt.Format(timeFormatRFC3339),
		UpdatedAt:       message.UpdatedAt.Format(timeFormatRFC3339),
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

func normalizeAIClientRequestID(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	if len(value) > 96 {
		return "", ErrInvalidAIChatInput
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			character == '-' ||
			character == '_' {
			continue
		}
		return "", ErrInvalidAIChatInput
	}
	return value, nil
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
	BaseURL         string
	APIKey          string
	Model           string
	TimeoutSeconds  int
	MaxOutputTokens int
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
	maxOutputTokens := config.MaxOutputTokens
	if maxOutputTokens <= 0 {
		maxOutputTokens = defaultAIMaxOutputTokens
	}
	return &openAICompatibleAIClient{
		baseURL:         baseURL,
		apiKey:          apiKey,
		model:           model,
		maxOutputTokens: maxOutputTokens,
		client:          &http.Client{Timeout: timeout},
	}, nil
}

type openAICompatibleAIClient struct {
	baseURL         string
	apiKey          string
	model           string
	maxOutputTokens int
	client          *http.Client
}

type openAICompatibleChatRequest struct {
	Model               string                        `json:"model"`
	Messages            []openAICompatibleChatMessage `json:"messages"`
	Temperature         float64                       `json:"temperature"`
	MaxCompletionTokens int                           `json:"max_completion_tokens,omitempty"`
	Stream              bool                          `json:"stream,omitempty"`
	Tools               []openAICompatibleTool        `json:"tools,omitempty"`
	ToolChoice          *openAICompatibleToolChoice   `json:"tool_choice,omitempty"`
}

type openAICompatibleChatMessage struct {
	Role      string                         `json:"role"`
	Content   string                         `json:"content,omitempty"`
	ToolCalls []openAICompatibleToolCallItem `json:"tool_calls,omitempty"`
}

type openAICompatibleTool struct {
	Type     string                       `json:"type"`
	Function openAICompatibleToolFunction `json:"function"`
}

type openAICompatibleToolFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Parameters  map[string]any `json:"parameters,omitempty"`
	Strict      bool           `json:"strict,omitempty"`
}

type openAICompatibleToolChoice struct {
	Type     string `json:"type"`
	Function struct {
		Name string `json:"name"`
	} `json:"function"`
}

type openAICompatibleToolCallItem struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
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
	payload := openAICompatibleChatRequest{
		Model:               c.model,
		Messages:            openAICompatibleMessages(messages),
		Temperature:         defaultAITemperature,
		MaxCompletionTokens: c.maxOutputTokens,
	}
	decoded, err := c.sendChatCompletion(ctx, payload)
	if err != nil {
		return "", err
	}
	if len(decoded.Choices) == 0 || strings.TrimSpace(decoded.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("chat provider returned no message")
	}
	return decoded.Choices[0].Message.Content, nil
}

func (c *openAICompatibleAIClient) ChatWithTools(ctx context.Context, messages []AIChatMessage, tools []AIChatTool) (AIChatToolCall, error) {
	if len(tools) == 0 {
		return AIChatToolCall{}, ErrInvalidAIChatInput
	}
	payload := openAICompatibleChatRequest{
		Model:               c.model,
		Messages:            openAICompatibleMessages(messages),
		Temperature:         defaultAITemperature,
		MaxCompletionTokens: c.maxOutputTokens,
		Tools:               openAICompatibleTools(tools),
		ToolChoice:          openAICompatibleRequiredToolChoice(tools),
	}
	decoded, err := c.sendChatCompletion(ctx, payload)
	if err != nil {
		if !isOpenAICompatibleToolChoiceUnsupportedError(err) {
			return AIChatToolCall{}, err
		}
		payload.ToolChoice = nil
		decoded, err = c.sendChatCompletion(ctx, payload)
		if err != nil {
			return AIChatToolCall{}, err
		}
	}
	if len(decoded.Choices) == 0 {
		return AIChatToolCall{}, fmt.Errorf("chat provider returned no message")
	}
	for _, toolCall := range decoded.Choices[0].Message.ToolCalls {
		if toolCall.Type == "function" && strings.TrimSpace(toolCall.Function.Name) != "" {
			return AIChatToolCall{
				Tool:      strings.TrimSpace(toolCall.Function.Name),
				Arguments: json.RawMessage(strings.TrimSpace(toolCall.Function.Arguments)),
			}, nil
		}
	}
	return AIChatToolCall{}, fmt.Errorf("chat provider returned no tool call")
}

func isOpenAICompatibleToolChoiceUnsupportedError(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "tool_choice") ||
		strings.Contains(message, "tool choice")
}

func openAICompatibleMessages(messages []AIChatMessage) []openAICompatibleChatMessage {
	providerMessages := make([]openAICompatibleChatMessage, 0, len(messages))
	for _, message := range messages {
		providerMessages = append(providerMessages, openAICompatibleChatMessage{
			Role:    message.Role,
			Content: message.Body,
		})
	}
	return providerMessages
}

func openAICompatibleTools(tools []AIChatTool) []openAICompatibleTool {
	result := make([]openAICompatibleTool, 0, len(tools))
	for _, tool := range tools {
		result = append(result, openAICompatibleTool{
			Type: "function",
			Function: openAICompatibleToolFunction{
				Name:        tool.Name,
				Description: tool.Description,
				Parameters:  tool.Parameters,
			},
		})
	}
	return result
}

func openAICompatibleRequiredToolChoice(tools []AIChatTool) *openAICompatibleToolChoice {
	if len(tools) != 1 {
		return nil
	}
	choice := &openAICompatibleToolChoice{Type: "function"}
	choice.Function.Name = tools[0].Name
	return choice
}

func (c *openAICompatibleAIClient) sendChatCompletion(ctx context.Context, payload openAICompatibleChatRequest) (openAICompatibleChatResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return openAICompatibleChatResponse{}, fmt.Errorf("marshal chat request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return openAICompatibleChatResponse{}, fmt.Errorf("create chat request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return openAICompatibleChatResponse{}, fmt.Errorf("call chat provider: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return openAICompatibleChatResponse{}, fmt.Errorf("read chat response: %w", err)
	}

	var decoded openAICompatibleChatResponse
	if len(data) > 0 {
		_ = json.Unmarshal(data, &decoded)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		if decoded.Error != nil && strings.TrimSpace(decoded.Error.Message) != "" {
			return openAICompatibleChatResponse{}, fmt.Errorf("chat provider returned %d: %s", resp.StatusCode, strings.TrimSpace(decoded.Error.Message))
		}
		return openAICompatibleChatResponse{}, fmt.Errorf("chat provider returned %d", resp.StatusCode)
	}
	return decoded, nil
}
