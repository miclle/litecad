package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/service"
	"github.com/miclle/litecad/pkg/httperr"
)

// SessionCookieName is the browser cookie used for LiteCAD auth sessions.
const SessionCookieName = "litecad_session"

type registerRequest struct {
	Name     string `json:"name" binding:"required,min=1,max=120"`
	Email    string `json:"email" binding:"required,email,max=320"`
	Password string `json:"password" binding:"required,min=8,max=128"`
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email,max=320"`
	Password string `json:"password" binding:"required,max=128"`
}

type authResponse struct {
	User service.AuthUser `json:"user"`
}

// Register creates a user account and signs the browser in.
func (ctrl *Ctrl) Register(c *fox.Context, req *registerRequest) (authResponse, error) {
	user, err := ctrl.service.RegisterUser(c.Request.Context(), service.RegisterUserInput{
		Name:     req.Name,
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		return authResponse{}, authError(err)
	}
	if err := ctrl.issueSession(c, user.ID); err != nil {
		return authResponse{}, err
	}
	return authResponse{User: user}, nil
}

// Login verifies credentials and signs the browser in.
func (ctrl *Ctrl) Login(c *fox.Context, req *loginRequest) (authResponse, error) {
	user, err := ctrl.service.AuthenticateUser(c.Request.Context(), service.AuthenticateUserInput{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		return authResponse{}, authError(err)
	}
	if err := ctrl.issueSession(c, user.ID); err != nil {
		return authResponse{}, err
	}
	return authResponse{User: user}, nil
}

// Me returns the user attached to the current session cookie.
func (ctrl *Ctrl) Me(c *fox.Context) (authResponse, error) {
	user, err := ctrl.currentUser(c)
	if err != nil {
		return authResponse{}, err
	}
	return authResponse{User: user}, nil
}

// Logout clears the current browser session.
func (ctrl *Ctrl) Logout(c *fox.Context) (map[string]bool, error) {
	if token, err := c.Cookie(SessionCookieName); err == nil {
		if err := ctrl.service.DeleteSession(c.Request.Context(), token); err != nil {
			return nil, err
		}
	}
	clearSessionCookie(c)
	return map[string]bool{"ok": true}, nil
}

func (ctrl *Ctrl) issueSession(c *fox.Context, userID string) error {
	session, err := ctrl.service.CreateSession(c.Request.Context(), userID)
	if err != nil {
		return err
	}
	maxAge := int(time.Until(session.ExpiresAt).Seconds())
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(SessionCookieName, session.Token, maxAge, "/", "", c.Request.TLS != nil, true)
	return nil
}

func clearSessionCookie(c *fox.Context) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(SessionCookieName, "", -1, "/", "", c.Request.TLS != nil, true)
}

func authError(err error) error {
	switch {
	case errors.Is(err, service.ErrInvalidAuthInput):
		return httperr.NewBadRequest("invalid account information")
	case errors.Is(err, service.ErrEmailAlreadyRegistered):
		return httperr.NewConflict("email is already registered")
	case errors.Is(err, service.ErrInvalidCredentials):
		return httperr.NewUnauthorized("invalid email or password")
	case errors.Is(err, service.ErrInvalidSession):
		return httperr.NewUnauthorized("not signed in")
	default:
		return err
	}
}
