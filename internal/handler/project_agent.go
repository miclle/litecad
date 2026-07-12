package handler

import (
	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
)

type projectAgentMessageRequest struct {
	Messages []service.AIChatMessage `json:"messages" binding:"required"`
}

type projectAgentParametricRunRequest struct {
	Message string `json:"message" binding:"required"`
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
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), ConversationID: c.Param("conversationID"), Messages: req.Messages,
	})
	if err != nil {
		return projectAgentMessageResponse{}, projectError(err)
	}
	return projectAgentMessageResponse{Message: result.Message, Artifact: result.Artifact}, nil
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
	})
	if err != nil {
		return projectAgentParametricRunResponse{}, projectError(err)
	}
	return projectAgentParametricRunResponse{Message: run.Message, Artifact: run.Artifact, Telemetry: run.Telemetry}, nil
}
