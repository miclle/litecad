package service

import (
	"context"
	"fmt"
	"strings"
	"testing"

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

func newTestService(t *testing.T) *Service {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.NewReplacer("/", "_", " ", "_").Replace(t.Name()))), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err := db.AutoMigrate(&entity.User{}, &entity.Project{}, &entity.ProjectModel{}, &entity.ProjectModelPreviewArtifact{}, &entity.ProjectGeometryVersion{}, &entity.ProjectCADDocument{}, &entity.ProjectAgentMessage{}); err != nil {
		t.Fatalf("migrate test db: %v", err)
	}

	svc, err := New(context.Background(), db)
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	return svc
}
