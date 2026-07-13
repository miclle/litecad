package handler

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProjectRoutesCreateAndList(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "ada@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name":        "Bracket study",
		"description": "Wall-mounted shelf bracket exploration.",
	}, sessionCookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}

	var createResponse struct {
		Project struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Description string `json:"description"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if createResponse.Project.ID == "" {
		t.Fatal("created project should include id")
	}
	if createResponse.Project.Name != "Bracket study" {
		t.Fatalf("created project name = %q", createResponse.Project.Name)
	}

	list := getWithCookie(t, router, "/api/v1/projects", sessionCookie)
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", list.Code, list.Body.String())
	}
	var listResponse struct {
		Projects []struct {
			ID string `json:"id"`
		} `json:"projects"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listResponse.Projects) != 1 || listResponse.Projects[0].ID != createResponse.Project.ID {
		t.Fatalf("listed projects = %+v, want created project", listResponse.Projects)
	}

	detail := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID, sessionCookie)
	if detail.Code != http.StatusOK {
		t.Fatalf("detail status = %d, body = %s", detail.Code, detail.Body.String())
	}
	var detailResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(detail.Body.Bytes(), &detailResponse); err != nil {
		t.Fatalf("decode detail response: %v", err)
	}
	if detailResponse.Project.ID != createResponse.Project.ID {
		t.Fatalf("detail project id = %q, want %q", detailResponse.Project.ID, createResponse.Project.ID)
	}
}

func TestProjectRoutesUpdateAndDelete(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "project-lifecycle@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name":        "Bracket study",
		"description": "Original note",
	}, sessionCookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
	var createResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}

	update := patchJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID, map[string]string{
		"name":        "Wall bracket v2",
		"description": "Updated note",
	}, sessionCookie)
	if update.Code != http.StatusOK {
		t.Fatalf("update status = %d, body = %s", update.Code, update.Body.String())
	}
	var updateResponse struct {
		Project struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Description string `json:"description"`
		} `json:"project"`
	}
	if err := json.Unmarshal(update.Body.Bytes(), &updateResponse); err != nil {
		t.Fatalf("decode update response: %v", err)
	}
	if updateResponse.Project.ID != createResponse.Project.ID || updateResponse.Project.Name != "Wall bracket v2" || updateResponse.Project.Description != "Updated note" {
		t.Fatalf("updated project = %+v", updateResponse.Project)
	}

	deleted := deleteJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID, map[string]any{}, sessionCookie)
	if deleted.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, body = %s", deleted.Code, deleted.Body.String())
	}

	detail := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID, sessionCookie)
	if detail.Code != http.StatusNotFound {
		t.Fatalf("detail after delete status = %d, want %d, body = %s", detail.Code, http.StatusNotFound, detail.Body.String())
	}
	list := getWithCookie(t, router, "/api/v1/projects", sessionCookie)
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", list.Code, list.Body.String())
	}
	var listResponse struct {
		Projects []struct {
			ID string `json:"id"`
		} `json:"projects"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listResponse.Projects) != 0 {
		t.Fatalf("listed projects after delete = %+v, want none", listResponse.Projects)
	}
}

func TestProjectRoutesRequireSession(t *testing.T) {
	router := newTestRouter(t)

	create := postJSON(t, router, "/api/v1/projects", map[string]string{
		"name": "Bracket study",
	})
	if create.Code != http.StatusUnauthorized {
		t.Fatalf("create status = %d, want %d", create.Code, http.StatusUnauthorized)
	}
}

func postMultipartFileWithCookie(t *testing.T, router http.Handler, target, fieldName, filename string, data []byte, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("create multipart file: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatalf("write multipart file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, target, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}
