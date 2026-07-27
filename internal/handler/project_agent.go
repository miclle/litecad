package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
)

type projectAgentMessageRequest struct {
	Messages        []service.AIChatMessage `json:"messages" binding:"required"`
	ActiveModelID   string                  `json:"active_model_id"`
	ClientRequestID string                  `json:"client_request_id"`
}

type projectAgentParametricRunRequest struct {
	Message       string `json:"message" binding:"required"`
	ActiveModelID string `json:"active_model_id"`
}

type projectAgentParametricRunResponse struct {
	Message   service.ProjectAgentStructuredMessage   `json:"message"`
	Artifact  service.ProjectParametricArtifact       `json:"artifact"`
	Telemetry service.ProjectAgentParametricTelemetry `json:"telemetry"`
}

type projectAgentConversationRequest struct {
	Title         string `json:"title"`
	ActiveModelID string `json:"active_model_id"`
}

type projectAgentConversationResponse struct {
	Conversation service.ProjectAgentConversation `json:"conversation"`
}

type projectAgentConversationsResponse struct {
	Conversations []service.ProjectAgentConversation `json:"conversations"`
}

type projectAgentMessageResponse struct {
	Message  service.ProjectAgentMessage        `json:"message"`
	Artifact *service.ProjectParametricArtifact `json:"artifact,omitempty"`
}

type projectAgentMessagesResponse struct {
	Messages []service.ProjectAgentMessage `json:"messages"`
}

// ListProjectAgentConversations returns CAD Agent conversations for a signed-in user's project.
func (ctrl *Ctrl) ListProjectAgentConversations(c *fox.Context) (projectAgentConversationsResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectAgentConversationsResponse{}, err
	}
	conversations, err := ctrl.service.ListProjectAgentConversations(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectAgentConversationsResponse{}, projectError(err)
	}
	return projectAgentConversationsResponse{Conversations: conversations}, nil
}

// CreateProjectAgentConversation starts a CAD Agent conversation for a signed-in user's project.
func (ctrl *Ctrl) CreateProjectAgentConversation(c *fox.Context, req *projectAgentConversationRequest) (projectAgentConversationResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectAgentConversationResponse{}, err
	}
	conversation, err := ctrl.service.CreateProjectAgentConversation(c.Request.Context(), service.CreateProjectAgentConversationInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), Title: req.Title, ActiveModelID: req.ActiveModelID,
	})
	if err != nil {
		return projectAgentConversationResponse{}, projectError(err)
	}
	return projectAgentConversationResponse{Conversation: conversation}, nil
}

// ListProjectAgentMessages returns persisted CAD Agent messages for a signed-in user's project conversation.
func (ctrl *Ctrl) ListProjectAgentMessages(c *fox.Context) (projectAgentMessagesResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectAgentMessagesResponse{}, err
	}
	messages, err := ctrl.service.ListProjectAgentMessages(c.Request.Context(), user.ID, c.Param("projectID"), c.Param("conversationID"))
	if err != nil {
		return projectAgentMessagesResponse{}, projectError(err)
	}
	return projectAgentMessagesResponse{Messages: messages}, nil
}

// SendProjectAgentMessage returns a CAD Agent reply grounded in the signed-in user's project conversation.
func (ctrl *Ctrl) SendProjectAgentMessage(c *fox.Context, req *projectAgentMessageRequest) (projectAgentMessageResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectAgentMessageResponse{}, err
	}
	result, err := ctrl.service.SendProjectAgentMessage(c.Request.Context(), service.ProjectAgentMessageInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), ConversationID: c.Param("conversationID"), Messages: req.Messages, ActiveModelID: req.ActiveModelID, ClientRequestID: req.ClientRequestID,
	})
	if err != nil {
		return projectAgentMessageResponse{}, projectError(err)
	}
	return projectAgentMessageResponse{Message: result.Message, Artifact: result.Artifact}, nil
}

// StreamProjectAgentMessage streams observable Assistant progress and content,
// then returns the same persisted result as SendProjectAgentMessage.
func (ctrl *Ctrl) StreamProjectAgentMessage(c *fox.Context, req *projectAgentMessageRequest) (any, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return nil, err
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)
	c.Abort()

	result, err := ctrl.service.StreamProjectAgentMessage(c.Request.Context(), service.ProjectAgentMessageInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), ConversationID: c.Param("conversationID"), Messages: req.Messages, ActiveModelID: req.ActiveModelID, ClientRequestID: req.ClientRequestID,
	}, func(event service.ProjectAgentStreamEvent) error {
		return writeProjectAgentSSEEvent(c, event.Type, event)
	})
	if err != nil {
		streamError := projectAgentStreamError(err)
		_ = writeProjectAgentSSEEvent(c, "error", streamError)
		return nil, nil
	}
	if err := writeProjectAgentSSEEvent(c, "result", projectAgentMessageResponse{Message: result.Message, Artifact: result.Artifact}); err != nil {
		return nil, nil
	}
	return nil, nil
}

type projectAgentStreamErrorResponse struct {
	Status  int    `json:"status"`
	Message string `json:"message"`
}

func projectAgentStreamError(err error) projectAgentStreamErrorResponse {
	mapped := projectError(err)
	if statusError, ok := mapped.(interface{ StatusCode() int }); ok {
		return projectAgentStreamErrorResponse{
			Status:  statusError.StatusCode(),
			Message: mapped.Error(),
		}
	}
	return projectAgentStreamErrorResponse{
		Status:  http.StatusInternalServerError,
		Message: "Assistant could not answer right now",
	}
}

func writeProjectAgentSSEEvent(c *fox.Context, event string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event, data); err != nil {
		return err
	}
	c.Writer.Flush()
	return nil
}

// RunProjectAgentParametric asks the Assistant to create a project-owned parametric artifact draft.
func (ctrl *Ctrl) RunProjectAgentParametric(c *fox.Context, req *projectAgentParametricRunRequest) (projectAgentParametricRunResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectAgentParametricRunResponse{}, err
	}
	run, err := ctrl.service.RunProjectAgentParametric(c.Request.Context(), service.ProjectAgentParametricRunInput{
		OwnerUserID:    user.ID,
		ProjectID:      c.Param("projectID"),
		ConversationID: c.Param("conversationID"),
		Message:        req.Message,
		ActiveModelID:  req.ActiveModelID,
	})
	if err != nil {
		return projectAgentParametricRunResponse{}, projectError(err)
	}
	return projectAgentParametricRunResponse{Message: run.Message, Artifact: run.Artifact, Telemetry: run.Telemetry}, nil
}
