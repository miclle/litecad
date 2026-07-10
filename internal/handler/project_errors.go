package handler

import (
	"errors"

	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
	"github.com/miclle/litecad/pkg/httperr"
)

func (ctrl *Ctrl) currentUser(c *fox.Context) (service.AuthUser, error) {
	token, err := c.Cookie(SessionCookieName)
	if err != nil {
		return service.AuthUser{}, httperr.NewUnauthorized("not signed in")
	}
	user, err := ctrl.service.UserBySessionToken(c.Request.Context(), token)
	if err != nil {
		return service.AuthUser{}, authError(err)
	}
	return user, nil
}

func projectError(err error) error {
	switch {
	case errors.Is(err, service.ErrInvalidProjectInput):
		return httperr.NewBadRequest("invalid project information")
	case errors.Is(err, service.ErrInvalidProjectModelInput):
		return httperr.NewBadRequest("invalid model upload")
	case errors.Is(err, service.ErrUnsupportedModelFormat):
		return httperr.NewBadRequest("unsupported model format")
	case errors.Is(err, service.ErrInvalidCADDocumentInput):
		return httperr.NewBadRequest("invalid CAD document input")
	case errors.Is(err, service.ErrCADDocumentConflict):
		return httperr.NewConflict("CAD document changed in another session")
	case errors.Is(err, service.ErrModelPreviewUnavailable):
		return httperr.NewBadRequest("model preview unavailable")
	case errors.Is(err, service.ErrInvalidAIChatInput):
		return httperr.NewBadRequest("invalid agent message")
	case errors.Is(err, service.ErrAIUnavailable):
		return httperr.NewServiceUnavailable("AI provider is not configured")
	case errors.Is(err, service.ErrProjectNotFound):
		return httperr.NewNotFound("project not found")
	default:
		return err
	}
}
