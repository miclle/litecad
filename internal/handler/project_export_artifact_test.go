package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestProjectExportArtifactRoutesCreateListAndDownload(t *testing.T) {
	router := newTestRouter(t)
	cookie, projectID := createProjectForExportArtifactRoutes(t, router, "export-route-owner@example.com")

	create := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/export-artifacts", map[string]any{
		"filename":            "assembly.step",
		"content_type":        "model/step",
		"export_kind":         "merged",
		"target_count":        2,
		"source_revision_ids": []string{"rev_01", "rev_02"},
		"occurrence_ids":      []string{"occ_01", "occ_02"},
		"step_text":           "ISO-10303-21; merged route export",
	}, cookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
	var createResponse struct {
		Artifact struct {
			ID                string   `json:"id"`
			ProjectID         string   `json:"project_id"`
			Filename          string   `json:"filename"`
			ContentType       string   `json:"content_type"`
			ExportKind        string   `json:"export_kind"`
			TargetCount       int      `json:"target_count"`
			SourceRevisionIDs []string `json:"source_revision_ids"`
			OccurrenceIDs     []string `json:"occurrence_ids"`
			ByteSize          int64    `json:"byte_size"`
		} `json:"artifact"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if createResponse.Artifact.ID == "" || createResponse.Artifact.ProjectID != projectID || createResponse.Artifact.Filename != "assembly.step" || createResponse.Artifact.ExportKind != "merged" || createResponse.Artifact.TargetCount != 2 {
		t.Fatalf("create artifact = %+v", createResponse.Artifact)
	}

	list := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/export-artifacts", cookie)
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", list.Code, list.Body.String())
	}
	var listResponse struct {
		Artifacts []struct {
			ID       string `json:"id"`
			Filename string `json:"filename"`
		} `json:"artifacts"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listResponse.Artifacts) != 1 || listResponse.Artifacts[0].ID != createResponse.Artifact.ID || listResponse.Artifacts[0].Filename != "assembly.step" {
		t.Fatalf("list artifacts = %+v", listResponse.Artifacts)
	}

	download := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/export-artifacts/"+createResponse.Artifact.ID+"/download", cookie)
	if download.Code != http.StatusOK {
		t.Fatalf("download status = %d, body = %s", download.Code, download.Body.String())
	}
	if download.Header().Get("Content-Type") != "model/step" {
		t.Fatalf("download content type = %q", download.Header().Get("Content-Type"))
	}
	if !strings.Contains(download.Header().Get("Content-Disposition"), "assembly.step") {
		t.Fatalf("download content disposition = %q", download.Header().Get("Content-Disposition"))
	}
	if download.Body.String() != "ISO-10303-21; merged route export" {
		t.Fatalf("download body = %q", download.Body.String())
	}
}

func TestProjectExportArtifactRoutesRejectInvalidAndForeignAccess(t *testing.T) {
	router := newTestRouter(t)
	ownerCookie, projectID := createProjectForExportArtifactRoutes(t, router, "export-route-validation-owner@example.com")
	otherCookie, _ := createProjectForExportArtifactRoutes(t, router, "export-route-validation-other@example.com")

	signedOut := postJSON(t, router, "/api/v1/projects/"+projectID+"/export-artifacts", map[string]any{
		"filename":     "assembly.step",
		"content_type": "model/step",
		"export_kind":  "single",
		"target_count": 1,
		"step_text":    "ISO-10303-21;",
	})
	if signedOut.Code != http.StatusUnauthorized {
		t.Fatalf("signed out status = %d, want %d", signedOut.Code, http.StatusUnauthorized)
	}

	invalid := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/export-artifacts", map[string]any{
		"filename":     "empty.step",
		"content_type": "model/step",
		"export_kind":  "single",
		"target_count": 1,
		"step_text":    "",
	}, ownerCookie)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid status = %d, want %d, body = %s", invalid.Code, http.StatusBadRequest, invalid.Body.String())
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/export-artifacts", map[string]any{
		"filename":     "owned.step",
		"content_type": "model/step",
		"export_kind":  "single",
		"target_count": 1,
		"step_text":    "ISO-10303-21; owned",
	}, ownerCookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
	var createResponse struct {
		Artifact struct {
			ID string `json:"id"`
		} `json:"artifact"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}

	foreignList := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/export-artifacts", otherCookie)
	if foreignList.Code != http.StatusNotFound {
		t.Fatalf("foreign list status = %d, want %d", foreignList.Code, http.StatusNotFound)
	}
	foreignDownload := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/export-artifacts/"+createResponse.Artifact.ID+"/download", otherCookie)
	if foreignDownload.Code != http.StatusNotFound {
		t.Fatalf("foreign download status = %d, want %d", foreignDownload.Code, http.StatusNotFound)
	}
}

func createProjectForExportArtifactRoutes(t *testing.T, router http.Handler, email string) (*http.Cookie, string) {
	t.Helper()
	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Export Route Owner",
		"email":    email,
		"password": "correct-horse-battery",
	})
	cookie := findCookie(register.Result(), SessionCookieName)
	if cookie == nil {
		t.Fatal("register should set a session cookie")
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{"name": "Export route history"}, cookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create project status = %d, body = %s", create.Code, create.Body.String())
	}
	var createResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode project response: %v", err)
	}
	return cookie, createResponse.Project.ID
}
