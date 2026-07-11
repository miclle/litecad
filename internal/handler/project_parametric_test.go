package handler

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestProjectParametricArtifactRoutes(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "parametric-route@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	createProject := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Parametric route project",
	}, sessionCookie)
	if createProject.Code != http.StatusCreated {
		t.Fatalf("create project status = %d, body = %s", createProject.Code, createProject.Body.String())
	}
	var projectResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(createProject.Body.Bytes(), &projectResponse); err != nil {
		t.Fatalf("decode project response: %v", err)
	}

	createArtifact := postJSONWithCookie(t, router, "/api/v1/projects/"+projectResponse.Project.ID+"/parametric-artifacts", map[string]any{
		"title":            "Bracket generator",
		"source_kind":      "openscad",
		"source_code":      "width = 50;\ncube([width, 20, 6]);",
		"parameter_values": map[string]any{"width": 50},
		"compile_status":   "pending",
	}, sessionCookie)
	if createArtifact.Code != http.StatusOK {
		t.Fatalf("create artifact status = %d, body = %s", createArtifact.Code, createArtifact.Body.String())
	}
	var artifactResponse struct {
		Artifact struct {
			ID              string         `json:"id"`
			ProjectID       string         `json:"project_id"`
			Title           string         `json:"title"`
			SourceKind      string         `json:"source_kind"`
			ParameterValues map[string]any `json:"parameter_values"`
		} `json:"artifact"`
	}
	if err := json.Unmarshal(createArtifact.Body.Bytes(), &artifactResponse); err != nil {
		t.Fatalf("decode artifact response: %v", err)
	}
	if artifactResponse.Artifact.ID == "" || artifactResponse.Artifact.ProjectID != projectResponse.Project.ID {
		t.Fatalf("artifact response metadata = %+v", artifactResponse.Artifact)
	}
	if artifactResponse.Artifact.Title != "Bracket generator" || artifactResponse.Artifact.SourceKind != "openscad" {
		t.Fatalf("artifact response = %+v", artifactResponse.Artifact)
	}

	listArtifacts := getWithCookie(t, router, "/api/v1/projects/"+projectResponse.Project.ID+"/parametric-artifacts", sessionCookie)
	if listArtifacts.Code != http.StatusOK {
		t.Fatalf("list artifact status = %d, body = %s", listArtifacts.Code, listArtifacts.Body.String())
	}
	var listResponse struct {
		Artifacts []struct {
			ID string `json:"id"`
		} `json:"artifacts"`
	}
	if err := json.Unmarshal(listArtifacts.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listResponse.Artifacts) != 1 || listResponse.Artifacts[0].ID != artifactResponse.Artifact.ID {
		t.Fatalf("artifact list = %+v", listResponse.Artifacts)
	}

	getArtifact := getWithCookie(t, router, "/api/v1/projects/"+projectResponse.Project.ID+"/parametric-artifacts/"+artifactResponse.Artifact.ID, sessionCookie)
	if getArtifact.Code != http.StatusOK {
		t.Fatalf("get artifact status = %d, body = %s", getArtifact.Code, getArtifact.Body.String())
	}

	updateArtifact := patchJSONWithCookie(t, router, "/api/v1/projects/"+projectResponse.Project.ID+"/parametric-artifacts/"+artifactResponse.Artifact.ID, map[string]any{
		"title":            "Updated bracket generator",
		"source_kind":      "openscad",
		"source_code":      "width = 64;\ncube([width, 20, 6]);",
		"parameter_values": map[string]any{"width": 64},
		"compile_status":   "success",
	}, sessionCookie)
	if updateArtifact.Code != http.StatusOK {
		t.Fatalf("update artifact status = %d, body = %s", updateArtifact.Code, updateArtifact.Body.String())
	}
	var updateResponse struct {
		Artifact struct {
			Title         string `json:"title"`
			CompileStatus string `json:"compile_status"`
		} `json:"artifact"`
	}
	if err := json.Unmarshal(updateArtifact.Body.Bytes(), &updateResponse); err != nil {
		t.Fatalf("decode update response: %v", err)
	}
	if updateResponse.Artifact.Title != "Updated bracket generator" || updateResponse.Artifact.CompileStatus != "success" {
		t.Fatalf("update artifact response = %+v", updateResponse.Artifact)
	}
}

func TestProjectParametricArtifactRejectsInvalidInput(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "parametric-invalid-route@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}
	createProject := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Invalid parametric route project",
	}, sessionCookie)
	if createProject.Code != http.StatusCreated {
		t.Fatalf("create project status = %d, body = %s", createProject.Code, createProject.Body.String())
	}
	var projectResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(createProject.Body.Bytes(), &projectResponse); err != nil {
		t.Fatalf("decode project response: %v", err)
	}

	createArtifact := postJSONWithCookie(t, router, "/api/v1/projects/"+projectResponse.Project.ID+"/parametric-artifacts", map[string]any{
		"title":       "Bad artifact",
		"source_kind": "python",
		"source_code": "print('not cad')",
	}, sessionCookie)
	if createArtifact.Code != http.StatusBadRequest {
		t.Fatalf("create artifact status = %d, want %d, body = %s", createArtifact.Code, http.StatusBadRequest, createArtifact.Body.String())
	}
}
