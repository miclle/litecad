package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/miclle/litecad/internal/service"
)

type testPreviewConverter struct{}

func (testPreviewConverter) ConvertStepToPreview(ctx context.Context, data []byte) (service.ModelPreviewMesh, error) {
	return service.ModelPreviewMesh{
		Format:      "obj",
		ContentType: "model/obj",
		Data:        []byte("# test mesh\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"),
		VertexCount: 3,
		FacetCount:  1,
	}, nil
}

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

func TestProjectRoutesRequireSession(t *testing.T) {
	router := newTestRouter(t)

	create := postJSON(t, router, "/api/v1/projects", map[string]string{
		"name": "Bracket study",
	})
	if create.Code != http.StatusUnauthorized {
		t.Fatalf("create status = %d, want %d", create.Code, http.StatusUnauthorized)
	}
}

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

	upload := postMultipartFileWithCookie(
		t,
		router,
		"/api/v1/projects/"+createResponse.Project.ID+"/models",
		"model",
		"macintosh_ipad_lcd_case.step",
		[]byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;"),
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

	preview := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/models/"+uploadResponse.Model.ID+"/preview", sessionCookie)
	if preview.Code != http.StatusOK {
		t.Fatalf("preview status = %d, body = %s", preview.Code, preview.Body.String())
	}
	if contentType := preview.Header().Get("Content-Type"); contentType != "model/obj" {
		t.Fatalf("preview content type = %q, want model/obj", contentType)
	}
	if !bytes.Contains(preview.Body.Bytes(), []byte("v ")) {
		t.Fatalf("preview body should contain OBJ vertex data, got %q", preview.Body.String())
	}

	previewArtifact := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/models/"+uploadResponse.Model.ID+"/preview-artifact", sessionCookie)
	if previewArtifact.Code != http.StatusOK {
		t.Fatalf("preview artifact status = %d, body = %s", previewArtifact.Code, previewArtifact.Body.String())
	}
	var artifactResponse struct {
		Preview struct {
			ID          string `json:"id"`
			ModelID     string `json:"model_id"`
			Format      string `json:"format"`
			ContentType string `json:"content_type"`
			ByteSize    int64  `json:"byte_size"`
			VertexCount int    `json:"vertex_count"`
			FacetCount  int    `json:"facet_count"`
			Data        []byte `json:"data"`
		} `json:"preview"`
	}
	if err := json.Unmarshal(previewArtifact.Body.Bytes(), &artifactResponse); err != nil {
		t.Fatalf("decode preview artifact response: %v", err)
	}
	if artifactResponse.Preview.ModelID != uploadResponse.Model.ID || artifactResponse.Preview.Format != "obj" {
		t.Fatalf("preview artifact = %+v", artifactResponse.Preview)
	}
	if artifactResponse.Preview.ContentType != "model/obj" || artifactResponse.Preview.VertexCount == 0 || artifactResponse.Preview.FacetCount == 0 {
		t.Fatalf("preview artifact metadata = %+v", artifactResponse.Preview)
	}
	if artifactResponse.Preview.Data != nil {
		t.Fatal("preview artifact metadata response must not include binary data")
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
	if len(geometryResponse.Document.PreviewArtifacts) != 1 || geometryResponse.Document.PreviewArtifacts[0].Format != "obj" || geometryResponse.Document.PreviewArtifacts[0].Data != nil {
		t.Fatalf("geometry preview artifacts = %+v", geometryResponse.Document.PreviewArtifacts)
	}
	if len(geometryResponse.Document.Versions) != 1 || geometryResponse.Document.Versions[0].VersionNumber != 1 {
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
