package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/pkg/id"
	"github.com/miclle/litecad/pkg/secret"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const sessionTTL = 30 * 24 * time.Hour

var (
	// ErrInvalidAuthInput indicates missing or malformed auth input.
	ErrInvalidAuthInput = errors.New("invalid auth input")
	// ErrEmailAlreadyRegistered indicates the account email is already in use.
	ErrEmailAlreadyRegistered = errors.New("email already registered")
	// ErrInvalidCredentials indicates the email/password pair is invalid.
	ErrInvalidCredentials = errors.New("invalid credentials")
	// ErrInvalidSession indicates a missing, unknown, or expired session token.
	ErrInvalidSession = errors.New("invalid session")
)

// RegisterUserInput is the account data required to create a user.
type RegisterUserInput struct {
	Name     string
	Email    string
	Password string
}

// AuthenticateUserInput is the credential data required to sign in.
type AuthenticateUserInput struct {
	Email    string
	Password string
}

// AuthUser is the public user shape returned by auth APIs.
type AuthUser struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// AuthSession is an issued browser session.
type AuthSession struct {
	Token     string
	ExpiresAt time.Time
}

// RegisterUser creates a user account with a bcrypt password hash.
func (s *Service) RegisterUser(ctx context.Context, input RegisterUserInput) (AuthUser, error) {
	name := strings.TrimSpace(input.Name)
	email := normalizeEmail(input.Email)
	password := input.Password
	if name == "" || email == "" || len(password) < 8 {
		return AuthUser{}, ErrInvalidAuthInput
	}

	var existing entity.User
	err := s.db.WithContext(ctx).Unscoped().First(&existing, "email = ?", email).Error
	if err == nil {
		return AuthUser{}, ErrEmailAlreadyRegistered
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return AuthUser{}, fmt.Errorf("check existing user: %w", err)
	}

	userID, err := id.NewPrefixed("usr")
	if err != nil {
		return AuthUser{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return AuthUser{}, fmt.Errorf("hash password: %w", err)
	}

	user := entity.User{
		ID:           userID,
		Name:         name,
		Email:        email,
		PasswordHash: string(hash),
	}
	if err := s.db.WithContext(ctx).Create(&user).Error; err != nil {
		return AuthUser{}, fmt.Errorf("create user: %w", err)
	}
	return publicUser(user), nil
}

// AuthenticateUser verifies an email/password pair and returns the public user.
func (s *Service) AuthenticateUser(ctx context.Context, input AuthenticateUserInput) (AuthUser, error) {
	email := normalizeEmail(input.Email)
	if email == "" || input.Password == "" {
		return AuthUser{}, ErrInvalidCredentials
	}

	var user entity.User
	if err := s.db.WithContext(ctx).First(&user, "email = ?", email).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return AuthUser{}, ErrInvalidCredentials
		}
		return AuthUser{}, fmt.Errorf("find user: %w", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return AuthUser{}, ErrInvalidCredentials
	}
	return publicUser(user), nil
}

// CreateSession issues a new browser session token for the user.
func (s *Service) CreateSession(ctx context.Context, userID string) (AuthSession, error) {
	token, err := secret.RandomURLSafe(32)
	if err != nil {
		return AuthSession{}, fmt.Errorf("generate session token: %w", err)
	}
	sessionID, err := id.NewPrefixed("ses")
	if err != nil {
		return AuthSession{}, err
	}
	expiresAt := time.Now().Add(sessionTTL)
	session := entity.UserSession{
		ID:        sessionID,
		UserID:    userID,
		TokenHash: secret.SHA256Hex(token),
		ExpiresAt: expiresAt,
	}
	if err := s.db.WithContext(ctx).Create(&session).Error; err != nil {
		return AuthSession{}, fmt.Errorf("create session: %w", err)
	}
	return AuthSession{Token: token, ExpiresAt: expiresAt}, nil
}

// UserBySessionToken returns the user attached to an unexpired session token.
func (s *Service) UserBySessionToken(ctx context.Context, token string) (AuthUser, error) {
	if token == "" {
		return AuthUser{}, ErrInvalidSession
	}

	var session entity.UserSession
	err := s.db.WithContext(ctx).
		Preload("User").
		First(&session, "token_hash = ? AND expires_at > ?", secret.SHA256Hex(token), time.Now()).
		Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return AuthUser{}, ErrInvalidSession
		}
		return AuthUser{}, fmt.Errorf("find session: %w", err)
	}
	return publicUser(session.User), nil
}

// DeleteSession removes a browser session token.
func (s *Service) DeleteSession(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	if err := s.db.WithContext(ctx).Where("token_hash = ?", secret.SHA256Hex(token)).Delete(&entity.UserSession{}).Error; err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func publicUser(user entity.User) AuthUser {
	return AuthUser{
		ID:    user.ID,
		Name:  user.Name,
		Email: user.Email,
	}
}
