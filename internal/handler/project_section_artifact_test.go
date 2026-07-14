package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestProjectSectionArtifactRoutesCreateListDownloadAndDelete(t *testing.T) {
	router := newTestRouter(t)
	cookie, projectID := createProjectForInspectionRecordRoutes(t, router, "section-artifact-route@example.com")

	create := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/section-artifacts", map[string]any{
		"cad_document_revision": 3,
		"unit":                  "millimetre",
		"status":                "ready",
		"filename":              "center-x-section.step",
		"content_type":          "model/step",
		"target_count":          1,
		"source_revision_ids":   []string{"mvr_01"},
		"occurrence_ids":        []string{"occ_01"},
		"plane_origin":          map[string]float64{"x": 10, "y": 0, "z": 0},
		"plane_normal":          map[string]float64{"x": 1, "y": 0, "z": 0},
		"edge_count":            2,
		"step_text":             "ISO-10303-21; route section",
	}, cookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
	var createResponse struct {
		Artifact struct {
			ID        string `json:"id"`
			Status    string `json:"status"`
			EdgeCount int    `json:"edge_count"`
			ByteSize  int64  `json:"byte_size"`
		} `json:"artifact"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if createResponse.Artifact.ID == "" || createResponse.Artifact.Status != "ready" || createResponse.Artifact.EdgeCount != 2 || createResponse.Artifact.ByteSize == 0 {
		t.Fatalf("created artifact = %+v", createResponse.Artifact)
	}

	list := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/section-artifacts", cookie)
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", list.Code, list.Body.String())
	}
	var listResponse struct {
		Artifacts []struct {
			ID string `json:"id"`
		} `json:"artifacts"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listResponse.Artifacts) != 1 || listResponse.Artifacts[0].ID != createResponse.Artifact.ID {
		t.Fatalf("listed artifacts = %+v", listResponse.Artifacts)
	}

	download := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/section-artifacts/"+createResponse.Artifact.ID+"/download", cookie)
	if download.Code != http.StatusOK || download.Header().Get("Content-Type") != "model/step" || download.Body.String() != "ISO-10303-21; route section" {
		t.Fatalf("download status=%d content-type=%q body=%q", download.Code, download.Header().Get("Content-Type"), download.Body.String())
	}
	if !strings.Contains(download.Header().Get("Content-Disposition"), "center-x-section.step") {
		t.Fatalf("download content disposition = %q", download.Header().Get("Content-Disposition"))
	}

	deleted := deleteJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/section-artifacts/"+createResponse.Artifact.ID, nil, cookie)
	if deleted.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, body = %s", deleted.Code, deleted.Body.String())
	}
}

func TestProjectSectionArtifactRoutesPersistTypedEmptyResult(t *testing.T) {
	router := newTestRouter(t)
	cookie, projectID := createProjectForInspectionRecordRoutes(t, router, "section-artifact-empty-route@example.com")

	create := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/section-artifacts", map[string]any{
		"cad_document_revision": 3,
		"unit":                  "millimetre",
		"status":                "empty",
		"filename":              "empty-section.step",
		"content_type":          "model/step",
		"target_count":          1,
		"source_revision_ids":   []string{"mvr_01"},
		"occurrence_ids":        []string{"occ_01"},
		"plane_origin":          map[string]float64{"x": 200, "y": 0, "z": 0},
		"plane_normal":          map[string]float64{"x": 1, "y": 0, "z": 0},
		"edge_count":            0,
		"step_text":             "",
	}, cookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create empty status = %d, body = %s", create.Code, create.Body.String())
	}
	var createResponse struct {
		Artifact struct {
			ID string `json:"id"`
		} `json:"artifact"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	download := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/section-artifacts/"+createResponse.Artifact.ID+"/download", cookie)
	if download.Code != http.StatusConflict {
		t.Fatalf("empty download status = %d, want %d, body = %s", download.Code, http.StatusConflict, download.Body.String())
	}
}
