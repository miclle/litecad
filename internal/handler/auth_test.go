package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fox-gonic/fox"
	"github.com/miclle/litecad/internal/entity"
	"github.com/miclle/litecad/internal/service"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestAuthRoutesRegisterAndLogin(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "ada@example.com",
		"password": "correct-horse-battery",
	})
	if register.Code != http.StatusOK {
		t.Fatalf("register status = %d, body = %s", register.Code, register.Body.String())
	}
	assertAuthUser(t, register.Body.Bytes(), "Ada Lovelace", "ada@example.com")
	registerCookie := findCookie(register.Result(), SessionCookieName)
	if registerCookie == nil || registerCookie.Value == "" {
		t.Fatal("register should set a session cookie")
	}
	if !registerCookie.HttpOnly {
		t.Fatal("session cookie should be http only")
	}

	login := postJSON(t, router, "/api/v1/auth/login", map[string]string{
		"email":    " ADA@example.com ",
		"password": "correct-horse-battery",
	})
	if login.Code != http.StatusOK {
		t.Fatalf("login status = %d, body = %s", login.Code, login.Body.String())
	}
	assertAuthUser(t, login.Body.Bytes(), "Ada Lovelace", "ada@example.com")
	if cookie := findCookie(login.Result(), SessionCookieName); cookie == nil || cookie.Value == "" {
		t.Fatal("login should set a session cookie")
	}
}

func TestAuthRoutesRejectInvalidLogin(t *testing.T) {
	router := newTestRouter(t)

	_ = postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "ada@example.com",
		"password": "correct-horse-battery",
	})

	login := postJSON(t, router, "/api/v1/auth/login", map[string]string{
		"email":    "ada@example.com",
		"password": "wrong-password",
	})
	if login.Code != http.StatusUnauthorized {
		t.Fatalf("login status = %d, want %d, body = %s", login.Code, http.StatusUnauthorized, login.Body.String())
	}
}

func newTestRouter(t *testing.T) *fox.Engine {
	return newTestRouterWithAI(t, nil)
}

func newTestRouterWithAI(t *testing.T, aiClient service.AIClient) *fox.Engine {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.NewReplacer("/", "_", " ", "_").Replace(t.Name()))), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err := db.AutoMigrate(&entity.User{}, &entity.UserSession{}, &entity.Project{}, &entity.ProjectModel{}, &entity.ProjectModelPreviewArtifact{}, &entity.ProjectThumbnailSnapshot{}, &entity.ProjectGeometryVersion{}, &entity.ProjectCADDocument{}, &entity.ProjectCADHistoryEntry{}, &entity.ProjectAgentConversation{}, &entity.ProjectAgentMessage{}, &entity.ProjectParametricArtifact{}); err != nil {
		t.Fatalf("migrate test db: %v", err)
	}

	svc, err := service.New(context.Background(), db, service.WithAIClient(aiClient))
	if err != nil {
		t.Fatalf("create service: %v", err)
	}

	router := fox.New()
	New(svc).RegisterRoutes(router)
	return router
}

func postJSON(t *testing.T, router http.Handler, target string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	return postJSONWithCookie(t, router, target, payload, nil)
}

func postJSONWithCookie(t *testing.T, router http.Handler, target string, payload any, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, target, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func patchJSONWithCookie(t *testing.T, router http.Handler, target string, payload any, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPatch, target, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func deleteJSONWithCookie(t *testing.T, router http.Handler, target string, payload any, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodDelete, target, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func getWithCookie(t *testing.T, router http.Handler, target string, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, target, nil)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func assertAuthUser(t *testing.T, body []byte, name, email string) {
	t.Helper()

	var response struct {
		User struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Email string `json:"email"`
		} `json:"user"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.User.ID == "" {
		t.Fatal("response user should include id")
	}
	if response.User.Name != name {
		t.Fatalf("response name = %q, want %q", response.User.Name, name)
	}
	if response.User.Email != email {
		t.Fatalf("response email = %q, want %q", response.User.Email, email)
	}
}

func findCookie(response *http.Response, name string) *http.Cookie {
	for _, cookie := range response.Cookies() {
		if cookie.Name == name {
			return cookie
		}
	}
	return nil
}
