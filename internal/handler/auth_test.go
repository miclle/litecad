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
	"time"

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

func TestAuthRoutesRejectExpiredSessionCookie(t *testing.T) {
	now := time.Date(2026, 7, 13, 10, 0, 0, 0, time.UTC)
	router := newTestRouterWithOptions(t, []service.Option{
		service.WithClock(func() time.Time { return now }),
	}, nil)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "ada@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	now = now.Add(30*24*time.Hour + time.Second)

	me := getWithCookie(t, router, "/api/v1/auth/me", sessionCookie)
	if me.Code != http.StatusUnauthorized {
		t.Fatalf("me status = %d, want %d, body = %s", me.Code, http.StatusUnauthorized, me.Body.String())
	}
	if strings.Contains(me.Body.String(), "invalid email or password") {
		t.Fatalf("expired session should not report credential failure: %s", me.Body.String())
	}
	projects := getWithCookie(t, router, "/api/v1/projects", sessionCookie)
	if projects.Code != http.StatusUnauthorized {
		t.Fatalf("projects status = %d, want %d, body = %s", projects.Code, http.StatusUnauthorized, projects.Body.String())
	}
}

func TestAuthRoutesLogoutClearsStaleSessionCookie(t *testing.T) {
	router := newTestRouter(t)
	staleCookie := &http.Cookie{Name: SessionCookieName, Value: "stale-token"}

	logout := postJSONWithCookie(t, router, "/api/v1/auth/logout", map[string]bool{}, staleCookie)
	if logout.Code != http.StatusOK {
		t.Fatalf("logout status = %d, want %d, body = %s", logout.Code, http.StatusOK, logout.Body.String())
	}
	cleared := findCookie(logout.Result(), SessionCookieName)
	if cleared == nil {
		t.Fatal("logout should clear the session cookie")
	}
	if cleared.MaxAge >= 0 {
		t.Fatalf("cleared cookie max age = %d, want negative", cleared.MaxAge)
	}
}

func newTestRouter(t *testing.T) *fox.Engine {
	return newTestRouterWithAI(t, nil)
}

func newTestRouterWithAI(t *testing.T, aiClient service.AIClient) *fox.Engine {
	return newTestRouterWithOptions(t, nil, aiClient)
}

func newTestRouterWithOptions(t *testing.T, options []service.Option, aiClient service.AIClient) *fox.Engine {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.NewReplacer("/", "_", " ", "_").Replace(t.Name()))), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	if err := db.AutoMigrate(&entity.User{}, &entity.UserSession{}, &entity.Project{}, &entity.ProjectModel{}, &entity.ProjectModelRevision{}, &entity.ProjectModelPreviewArtifact{}, &entity.ProjectThumbnailSnapshot{}, &entity.ProjectGeometryVersion{}, &entity.ProjectCADDocument{}, &entity.ProjectCADHistoryEntry{}, &entity.ProjectAgentConversation{}, &entity.ProjectAgentMessage{}, &entity.ProjectParametricArtifact{}); err != nil {
		t.Fatalf("migrate test db: %v", err)
	}

	options = append(options, service.WithAIClient(aiClient))
	svc, err := service.New(context.Background(), db, options...)
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
