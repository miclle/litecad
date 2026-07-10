package handler

import (
	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
)

type projectAgentMessageRequest struct {
	Messages []service.AIChatMessage `json:"messages" binding:"required"`
}

type projectAgentMessageResponse struct {
	Message service.ProjectAgentMessage `json:"message"`
}

type projectAgentMessagesResponse struct {
	Messages []service.ProjectAgentMessage `json:"messages"`
}

// ListProjectAgentMessages returns persisted CAD Agent messages for a signed-in user's project.
func (ctrl *Ctrl) ListProjectAgentMessages(c *fox.Context) (projectAgentMessagesResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectAgentMessagesResponse{}, err
	}
	messages, err := ctrl.service.ListProjectAgentMessages(c.Request.Context(), user.ID, c.Param("projectID"))
	if err != nil {
		return projectAgentMessagesResponse{}, projectError(err)
	}
	return projectAgentMessagesResponse{Messages: messages}, nil
}

// SendProjectAgentMessage returns a CAD Agent reply grounded in the signed-in user's project.
func (ctrl *Ctrl) SendProjectAgentMessage(c *fox.Context, req *projectAgentMessageRequest) (projectAgentMessageResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return projectAgentMessageResponse{}, err
	}
	message, err := ctrl.service.SendProjectAgentMessage(c.Request.Context(), service.ProjectAgentMessageInput{
		OwnerUserID: user.ID, ProjectID: c.Param("projectID"), Messages: req.Messages,
	})
	if err != nil {
		return projectAgentMessageResponse{}, projectError(err)
	}
	return projectAgentMessageResponse{Message: message}, nil
}
