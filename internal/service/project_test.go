package service

import (
	"context"
	"errors"
	"testing"
)

func TestCreateProjectStoresOwnerScopedProject(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	user, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}

	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: user.ID,
		Name:        "Bracket study",
		Description: "Wall-mounted shelf bracket exploration.",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if project.ID == "" {
		t.Fatal("project should have an id")
	}
	if project.Name != "Bracket study" {
		t.Fatalf("project name = %q", project.Name)
	}

	projects, err := svc.ListProjects(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListProjects returned error: %v", err)
	}
	if len(projects) != 1 {
		t.Fatalf("project count = %d, want 1", len(projects))
	}
	if projects[0].ID != project.ID {
		t.Fatalf("listed project id = %q, want %q", projects[0].ID, project.ID)
	}

	loaded, err := svc.GetProject(ctx, user.ID, project.ID)
	if err != nil {
		t.Fatalf("GetProject returned error: %v", err)
	}
	if loaded.ID != project.ID {
		t.Fatalf("loaded project id = %q, want %q", loaded.ID, project.ID)
	}
}

func TestCreateProjectRejectsInvalidInput(t *testing.T) {
	svc := newTestService(t)

	_, err := svc.CreateProject(context.Background(), CreateProjectInput{
		OwnerUserID: "usr_test",
		Name:        "",
	})
	if !errors.Is(err, ErrInvalidProjectInput) {
		t.Fatalf("CreateProject error = %v, want ErrInvalidProjectInput", err)
	}
}

func TestGetProjectScopesByOwner(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	owner, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Ada",
		Email:    "ada@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser owner returned error: %v", err)
	}
	other, err := svc.RegisterUser(ctx, RegisterUserInput{
		Name:     "Grace",
		Email:    "grace@example.com",
		Password: "correct-horse-battery",
	})
	if err != nil {
		t.Fatalf("RegisterUser other returned error: %v", err)
	}
	project, err := svc.CreateProject(ctx, CreateProjectInput{
		OwnerUserID: owner.ID,
		Name:        "Bracket study",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	_, err = svc.GetProject(ctx, other.ID, project.ID)
	if !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("GetProject error = %v, want ErrProjectNotFound", err)
	}
}
