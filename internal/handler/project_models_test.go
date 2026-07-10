package handler

import (
	"bytes"
	"encoding/json"
	"github.com/miclle/litecad/internal/service"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProjectModelRoutesUploadAndListStep(t *testing.T) {
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
		"name": "Imported case",
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

	stepSource := []byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;")
	upload := postMultipartFileWithCookie(
		t,
		router,
		"/api/v1/projects/"+createResponse.Project.ID+"/models",
		"model",
		"macintosh_ipad_lcd_case.step",
		stepSource,
		sessionCookie,
	)
	if upload.Code != http.StatusCreated {
		t.Fatalf("upload status = %d, body = %s", upload.Code, upload.Body.String())
	}
	var uploadResponse struct {
		Model struct {
			ID               string `json:"id"`
			ProjectID        string `json:"project_id"`
			Format           string `json:"format"`
			OriginalFilename string `json:"original_filename"`
			ByteSize         int64  `json:"byte_size"`
			ParseStatus      string `json:"parse_status"`
			Metadata         struct {
				Schema       string   `json:"schema"`
				ProductNames []string `json:"product_names"`
				LengthUnit   string   `json:"length_unit"`
			} `json:"metadata"`
		} `json:"model"`
	}
	if err := json.Unmarshal(upload.Body.Bytes(), &uploadResponse); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}
	if uploadResponse.Model.ID == "" {
		t.Fatal("uploaded model should include id")
	}
	if uploadResponse.Model.ProjectID != createResponse.Project.ID {
		t.Fatalf("uploaded model project id = %q", uploadResponse.Model.ProjectID)
	}
	if uploadResponse.Model.Format != "step" {
		t.Fatalf("uploaded model format = %q, want step", uploadResponse.Model.Format)
	}
	if uploadResponse.Model.OriginalFilename != "macintosh_ipad_lcd_case.step" {
		t.Fatalf("uploaded model filename = %q", uploadResponse.Model.OriginalFilename)
	}
	if uploadResponse.Model.ByteSize == 0 {
		t.Fatal("uploaded model should include byte size")
	}
	if uploadResponse.Model.ParseStatus != "parsed" {
		t.Fatalf("uploaded model parse status = %q, want parsed", uploadResponse.Model.ParseStatus)
	}
	if uploadResponse.Model.Metadata.Schema != "ISO-10303-21" {
		t.Fatalf("uploaded model metadata schema = %q", uploadResponse.Model.Metadata.Schema)
	}

	list := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/models", sessionCookie)
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", list.Code, list.Body.String())
	}
	var listResponse struct {
		Models []struct {
			ID          string `json:"id"`
			ParseStatus string `json:"parse_status"`
		} `json:"models"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listResponse.Models) != 1 || listResponse.Models[0].ID != uploadResponse.Model.ID {
		t.Fatalf("listed models = %+v, want uploaded model", listResponse.Models)
	}
	if listResponse.Models[0].ParseStatus != "parsed" {
		t.Fatalf("listed model parse status = %q, want parsed", listResponse.Models[0].ParseStatus)
	}

	source := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/models/"+uploadResponse.Model.ID+"/source", sessionCookie)
	if source.Code != http.StatusOK {
		t.Fatalf("source status = %d, body = %s", source.Code, source.Body.String())
	}
	if !bytes.Equal(source.Body.Bytes(), stepSource) {
		t.Fatalf("source body = %q, want original upload", source.Body.String())
	}
	if disposition := source.Header().Get("Content-Disposition"); disposition != `attachment; filename=macintosh_ipad_lcd_case.step` {
		t.Fatalf("source content disposition = %q", disposition)
	}

	preview := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/models/"+uploadResponse.Model.ID+"/preview", sessionCookie)
	if preview.Code != http.StatusBadRequest {
		t.Fatalf("preview status = %d, want %d, body = %s", preview.Code, http.StatusBadRequest, preview.Body.String())
	}
	if !bytes.Contains(preview.Body.Bytes(), []byte("model preview unavailable")) {
		t.Fatalf("preview body = %q, want unavailable message", preview.Body.String())
	}

	previewArtifact := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/models/"+uploadResponse.Model.ID+"/preview-artifact", sessionCookie)
	if previewArtifact.Code != http.StatusBadRequest {
		t.Fatalf("preview artifact status = %d, want %d, body = %s", previewArtifact.Code, http.StatusBadRequest, previewArtifact.Body.String())
	}

	geometry := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/geometry", sessionCookie)
	if geometry.Code != http.StatusOK {
		t.Fatalf("geometry status = %d, body = %s", geometry.Code, geometry.Body.String())
	}
	var geometryResponse struct {
		Document struct {
			ProjectID string `json:"project_id"`
			ModelTree []struct {
				ModelID           string `json:"model_id"`
				PreviewArtifactID string `json:"preview_artifact_id"`
				Format            string `json:"format"`
				PreviewFormat     string `json:"preview_format"`
			} `json:"model_tree"`
			PreviewArtifacts []struct {
				ID     string `json:"id"`
				Format string `json:"format"`
				Data   []byte `json:"data"`
			} `json:"preview_artifacts"`
			Versions []struct {
				ID                string `json:"id"`
				ProjectID         string `json:"project_id"`
				PreviewArtifactID string `json:"preview_artifact_id"`
				VersionNumber     int    `json:"version_number"`
			} `json:"versions"`
		} `json:"document"`
	}
	if err := json.Unmarshal(geometry.Body.Bytes(), &geometryResponse); err != nil {
		t.Fatalf("decode geometry response: %v", err)
	}
	if geometryResponse.Document.ProjectID != createResponse.Project.ID {
		t.Fatalf("geometry document project id = %q", geometryResponse.Document.ProjectID)
	}
	if len(geometryResponse.Document.ModelTree) != 1 || geometryResponse.Document.ModelTree[0].ModelID != uploadResponse.Model.ID || geometryResponse.Document.ModelTree[0].Format != "step" {
		t.Fatalf("geometry model tree = %+v", geometryResponse.Document.ModelTree)
	}
	if geometryResponse.Document.ModelTree[0].PreviewArtifactID != "" || geometryResponse.Document.ModelTree[0].PreviewFormat != "" {
		t.Fatalf("geometry model tree should not expose STEP backend preview artifact = %+v", geometryResponse.Document.ModelTree)
	}
	if len(geometryResponse.Document.PreviewArtifacts) != 0 {
		t.Fatalf("geometry preview artifacts = %+v", geometryResponse.Document.PreviewArtifacts)
	}
	if len(geometryResponse.Document.Versions) != 0 {
		t.Fatalf("geometry versions = %+v", geometryResponse.Document.Versions)
	}
}

func TestProjectModelRoutesUploadSTLPreview(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "stl@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "STL case",
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

	upload := postMultipartFileWithCookie(
		t,
		router,
		"/api/v1/projects/"+createResponse.Project.ID+"/models",
		"model",
		"case.stl",
		minimalHandlerASCIISTL(),
		sessionCookie,
	)
	if upload.Code != http.StatusCreated {
		t.Fatalf("upload status = %d, body = %s", upload.Code, upload.Body.String())
	}
	var uploadResponse struct {
		Model struct {
			ID       string `json:"id"`
			Format   string `json:"format"`
			Metadata struct {
				AssetType     string `json:"asset_type"`
				TriangleCount int    `json:"triangle_count"`
			} `json:"metadata"`
		} `json:"model"`
	}
	if err := json.Unmarshal(upload.Body.Bytes(), &uploadResponse); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}
	if uploadResponse.Model.Format != "stl" || uploadResponse.Model.Metadata.AssetType != "stl" || uploadResponse.Model.Metadata.TriangleCount != 1 {
		t.Fatalf("upload response = %+v", uploadResponse.Model)
	}

	preview := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/models/"+uploadResponse.Model.ID+"/preview", sessionCookie)
	if preview.Code != http.StatusOK {
		t.Fatalf("preview status = %d, body = %s", preview.Code, preview.Body.String())
	}
	if contentType := preview.Header().Get("Content-Type"); contentType != "model/obj" {
		t.Fatalf("preview content type = %q, want model/obj", contentType)
	}
	if !bytes.Contains(preview.Body.Bytes(), []byte("f 1 2 3")) {
		t.Fatalf("preview body should contain OBJ face data, got %q", preview.Body.String())
	}
}

func TestProjectModelRoutesRejectOversizedUploadBeforeMultipartParsing(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "oversized@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Oversized upload",
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

	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects/"+createResponse.Project.ID+"/models", bytes.NewReader([]byte("not multipart")))
	req.ContentLength = service.MaxProjectModelUploadBytes + 1
	req.Header.Set("Content-Type", "multipart/form-data; boundary=oversized")
	req.AddCookie(sessionCookie)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("upload status = %d, want %d, body = %s", rec.Code, http.StatusRequestEntityTooLarge, rec.Body.String())
	}
}

func minimalHandlerASCIISTL() []byte {
	return []byte(`solid case
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 1 0 0
    vertex 0 1 0
  endloop
endfacet
endsolid case
`)
}
