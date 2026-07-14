package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/miclle/litecad/internal/entity"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestNewRejectsNilDB(t *testing.T) {
	if _, err := New(context.Background(), nil); err == nil {
		t.Fatal("New should reject nil db")
	}
}

func TestRegisterUserStoresNormalizedAccount(t *testing.T) {
	svc := newTestService(t)

	user, err := svc.RegisterUser(context.Background(), RegisterUserInput{
		Name:     "Ada Lovelace",
		Email:    "  ADA@Example.COM ",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}

	if user.ID == "" {
		t.Fatal("registered user should have an id")
	}
	if user.Name != "Ada Lovelace" {
		t.Fatalf("registered name = %q", user.Name)
	}
	if user.Email != "ada@example.com" {
		t.Fatalf("registered email = %q", user.Email)
	}

	var stored entity.User
	if err := svc.DB().First(&stored, "id = ?", user.ID).Error; err != nil {
		t.Fatalf("load stored user: %v", err)
	}
	if stored.PasswordHash == "" {
		t.Fatal("password hash should be stored")
	}
	if stored.PasswordHash == "correct-horse-battery" {
		t.Fatal("password should not be stored in plaintext")
	}
}

func TestRegisterUserRejectsDuplicateEmail(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	_, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}

	_, err = svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Grace",
		Email:    "ADA@example.com",
		Password: "correct-horse-battery",
	})
	if err == nil {
		t.Fatal("RegisterUser should reject duplicate emails")
	}
}

func TestAuthenticateUserChecksPassword(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	registered, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}

	authenticated, err := svc.AuthenticateUser(ctx, AuthenticateUserInput{
		Email:    " ADA@example.com ",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("AuthenticateUser returned error: %v", err)
	}
	if authenticated.ID != registered.ID {
		t.Fatalf("authenticated id = %q, want %q", authenticated.ID, registered.ID)
	}

	if _, err := svc.AuthenticateUser(ctx, AuthenticateUserInput{
		Email:    "ada@example.com",
		Password: "wrong-password",
	}); err == nil {
		t.Fatal("AuthenticateUser should reject wrong passwords")
	}
}

func TestSessionLifecycleRejectsExpiredAndDeletedSessions(t *testing.T) {
	now := time.Date(2026, 7, 13, 10, 0, 0, 0, time.UTC)
	svc := newTestServiceWithOptions(t, WithClock(func() time.Time { return now }))
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	session, err := svc.CreateSession(ctx, user.ID)
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	if !session.ExpiresAt.Equal(now.Add(sessionTTL)) {
		t.Fatalf("session expires at %s, want %s", session.ExpiresAt, now.Add(sessionTTL))
	}

	if _, err := svc.UserBySessionToken(ctx, session.Token); err != nil {
		t.Fatalf("UserBySessionToken returned error for active session: %v", err)
	}

	now = session.ExpiresAt
	if _, err := svc.UserBySessionToken(ctx, session.Token); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("UserBySessionToken expired error = %v, want ErrInvalidSession", err)
	}

	now = time.Date(2026, 7, 13, 10, 0, 0, 0, time.UTC)
	session, err = svc.CreateSession(ctx, user.ID)
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	if err := svc.DeleteSession(ctx, session.Token); err != nil {
		t.Fatalf("DeleteSession returned error: %v", err)
	}
	if _, err := svc.UserBySessionToken(ctx, session.Token); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("UserBySessionToken deleted error = %v, want ErrInvalidSession", err)
	}
}

func TestPruneExpiredSessionsRemovesOnlyExpiredRows(t *testing.T) {
	now := time.Date(2026, 7, 13, 10, 0, 0, 0, time.UTC)
	svc := newTestServiceWithOptions(t, WithClock(func() time.Time { return now }))
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	expired, err := svc.CreateSession(ctx, user.ID)
	if err != nil {
		t.Fatalf("CreateSession expired returned error: %v", err)
	}
	now = now.Add(sessionTTL + time.Minute)
	active, err := svc.CreateSession(ctx, user.ID)
	if err != nil {
		t.Fatalf("CreateSession active returned error: %v", err)
	}

	pruned, err := svc.PruneExpiredSessions(ctx)
	if err != nil {
		t.Fatalf("PruneExpiredSessions returned error: %v", err)
	}
	if pruned != 1 {
		t.Fatalf("pruned = %d, want 1", pruned)
	}
	if _, err := svc.UserBySessionToken(ctx, expired.Token); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("expired session error = %v, want ErrInvalidSession", err)
	}
	if _, err := svc.UserBySessionToken(ctx, active.Token); err != nil {
		t.Fatalf("active session should survive prune: %v", err)
	}
}

func newTestService(t *testing.T) *Service {
	return newTestServiceWithOptions(t)
}

func newTestServiceWithOptions(t *testing.T, options ...Option) *Service {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.NewReplacer("/", "_", " ", "_").Replace(t.Name()))), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err := db.AutoMigrate(&entity.User{}, &entity.UserSession{}, &entity.Project{}, &entity.ProjectModel{}, &entity.ProjectModelRevision{}, &entity.ProjectModelPreviewArtifact{}, &entity.ProjectThumbnailSnapshot{}, &entity.ProjectGeometryVersion{}, &entity.ProjectCADDocument{}, &entity.ProjectCADHistoryEntry{}, &entity.ProjectAgentConversation{}, &entity.ProjectAgentMessage{}, &entity.ProjectParametricArtifact{}); err != nil {
		t.Fatalf("migrate test db: %v", err)
	}

	svc, err := New(context.Background(), db, options...)
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	return svc
}
