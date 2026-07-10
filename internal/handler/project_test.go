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

type testAIClient struct {
	reply string
}

func (c testAIClient) Chat(ctx context.Context, messages []service.AIChatMessage) (string, error) {
	return c.reply, nil
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

func TestProjectAgentRouteReturnsAIReply(t *testing.T) {
	router := newTestRouterWithAI(t, testAIClient{reply: "This project has usable CAD context."})

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "agent-route@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Agent project",
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

	agent := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/messages", map[string]any{
		"messages": []map[string]string{
			{"role": "user", "body": "What can you see?"},
		},
	}, sessionCookie)
	if agent.Code != http.StatusOK {
		t.Fatalf("agent status = %d, body = %s", agent.Code, agent.Body.String())
	}
	var agentResponse struct {
		Message struct {
			ID        string `json:"id"`
			ProjectID string `json:"project_id"`
			Role      string `json:"role"`
			Body      string `json:"body"`
			CreatedAt string `json:"created_at"`
		} `json:"message"`
	}
	if err := json.Unmarshal(agent.Body.Bytes(), &agentResponse); err != nil {
		t.Fatalf("decode agent response: %v", err)
	}
	if agentResponse.Message.Role != "assistant" || agentResponse.Message.Body != "This project has usable CAD context." {
		t.Fatalf("agent response = %+v", agentResponse.Message)
	}
	if agentResponse.Message.ID == "" || agentResponse.Message.ProjectID != createResponse.Project.ID || agentResponse.Message.CreatedAt == "" {
		t.Fatalf("agent response metadata = %+v", agentResponse.Message)
	}

	list := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/messages", sessionCookie)
	if list.Code != http.StatusOK {
		t.Fatalf("agent message list status = %d, body = %s", list.Code, list.Body.String())
	}
	var listResponse struct {
		Messages []struct {
			ID        string `json:"id"`
			ProjectID string `json:"project_id"`
			Role      string `json:"role"`
			Body      string `json:"body"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("decode agent message list response: %v", err)
	}
	if len(listResponse.Messages) != 2 {
		t.Fatalf("agent message count = %d, want 2: %+v", len(listResponse.Messages), listResponse.Messages)
	}
	if listResponse.Messages[0].Role != "user" || listResponse.Messages[0].Body != "What can you see?" {
		t.Fatalf("stored user message = %+v", listResponse.Messages[0])
	}
	if listResponse.Messages[1].Role != "assistant" || listResponse.Messages[1].Body != "This project has usable CAD context." {
		t.Fatalf("stored assistant message = %+v", listResponse.Messages[1])
	}
}

func TestProjectAgentRouteRequiresAIConfiguration(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "agent-unconfigured@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Agent project",
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

	agent := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/agent/messages", map[string]any{
		"messages": []map[string]string{
			{"role": "user", "body": "Hello"},
		},
	}, sessionCookie)
	if agent.Code != http.StatusServiceUnavailable {
		t.Fatalf("agent status = %d, want %d, body = %s", agent.Code, http.StatusServiceUnavailable, agent.Body.String())
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

func TestProjectCADDocumentRoutesPersistModelTransform(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "cad-document@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Editable case",
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
		"editable.step",
		[]byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;"),
		sessionCookie,
	)
	if upload.Code != http.StatusCreated {
		t.Fatalf("upload status = %d, body = %s", upload.Code, upload.Body.String())
	}
	var uploadResponse struct {
		Model struct {
			ID string `json:"id"`
		} `json:"model"`
	}
	if err := json.Unmarshal(upload.Body.Bytes(), &uploadResponse); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}

	document := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document", sessionCookie)
	if document.Code != http.StatusOK {
		t.Fatalf("document status = %d, body = %s", document.Code, document.Body.String())
	}
	var documentResponse struct {
		Document struct {
			ID       string `json:"id"`
			Revision int    `json:"revision"`
			Nodes    []struct {
				ModelID   string `json:"model_id"`
				Transform struct {
					Matrix [16]float64 `json:"matrix"`
				} `json:"transform"`
			} `json:"nodes"`
		} `json:"document"`
	}
	if err := json.Unmarshal(document.Body.Bytes(), &documentResponse); err != nil {
		t.Fatalf("decode document response: %v", err)
	}
	if documentResponse.Document.ID == "" || documentResponse.Document.Revision != 1 {
		t.Fatalf("document response = %+v", documentResponse.Document)
	}
	if len(documentResponse.Document.Nodes) != 1 || documentResponse.Document.Nodes[0].ModelID != uploadResponse.Model.ID {
		t.Fatalf("document nodes = %+v, want uploaded model", documentResponse.Document.Nodes)
	}

	transformMatrix := [16]float64{
		1, 0, 0, 18,
		0, 1, 0, 2,
		0, 0, 1, -6,
		0, 0, 0, 1,
	}
	patch := patchJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document/models/"+uploadResponse.Model.ID+"/transform", map[string]any{
		"transform": map[string]any{
			"matrix": transformMatrix,
		},
	}, sessionCookie)
	if patch.Code != http.StatusOK {
		t.Fatalf("patch status = %d, body = %s", patch.Code, patch.Body.String())
	}
	var patchResponse struct {
		Document struct {
			Revision int `json:"revision"`
			Nodes    []struct {
				ModelID   string `json:"model_id"`
				Transform struct {
					Matrix [16]float64 `json:"matrix"`
				} `json:"transform"`
			} `json:"nodes"`
			Operations []struct {
				Type    string `json:"type"`
				ModelID string `json:"model_id"`
				NodeID  string `json:"node_id"`
			} `json:"operations"`
		} `json:"document"`
	}
	if err := json.Unmarshal(patch.Body.Bytes(), &patchResponse); err != nil {
		t.Fatalf("decode patch response: %v", err)
	}
	if patchResponse.Document.Revision != 2 || len(patchResponse.Document.Operations) != 1 {
		t.Fatalf("patch document = %+v, want revision 2 with one operation", patchResponse.Document)
	}
	if len(patchResponse.Document.Nodes) != 1 || patchResponse.Document.Nodes[0].Transform.Matrix != transformMatrix {
		t.Fatalf("patch document nodes = %+v, want updated transform", patchResponse.Document.Nodes)
	}

	nodeTransformMatrix := [16]float64{
		1, 0, 0, -3,
		0, 1, 0, 4,
		0, 0, 1, 9,
		0, 0, 0, 1,
	}
	nodePatch := patchJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document/nodes/node_"+uploadResponse.Model.ID+"/transform", map[string]any{
		"transform": map[string]any{
			"matrix": nodeTransformMatrix,
		},
	}, sessionCookie)
	if nodePatch.Code != http.StatusOK {
		t.Fatalf("node patch status = %d, body = %s", nodePatch.Code, nodePatch.Body.String())
	}
	var nodePatchResponse struct {
		Document struct {
			Revision int `json:"revision"`
			Nodes    []struct {
				Transform struct {
					Matrix [16]float64 `json:"matrix"`
				} `json:"transform"`
			} `json:"nodes"`
			Operations []struct {
				Type   string `json:"type"`
				NodeID string `json:"node_id"`
			} `json:"operations"`
		} `json:"document"`
	}
	if err := json.Unmarshal(nodePatch.Body.Bytes(), &nodePatchResponse); err != nil {
		t.Fatalf("decode node patch response: %v", err)
	}
	if nodePatchResponse.Document.Revision != 3 || len(nodePatchResponse.Document.Operations) != 2 {
		t.Fatalf("node patch document = %+v, want revision 3 with two operations", nodePatchResponse.Document)
	}
	if nodePatchResponse.Document.Operations[1].NodeID != "node_"+uploadResponse.Model.ID {
		t.Fatalf("node patch operations = %+v, want node-scoped operation", nodePatchResponse.Document.Operations)
	}
	if len(nodePatchResponse.Document.Nodes) != 1 || nodePatchResponse.Document.Nodes[0].Transform.Matrix != nodeTransformMatrix {
		t.Fatalf("node patch document nodes = %+v, want updated node transform", nodePatchResponse.Document.Nodes)
	}

	reloaded := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document", sessionCookie)
	if reloaded.Code != http.StatusOK {
		t.Fatalf("reloaded document status = %d, body = %s", reloaded.Code, reloaded.Body.String())
	}
	var reloadedResponse struct {
		Document struct {
			Revision int `json:"revision"`
			Nodes    []struct {
				Transform struct {
					Matrix [16]float64 `json:"matrix"`
				} `json:"transform"`
			} `json:"nodes"`
		} `json:"document"`
	}
	if err := json.Unmarshal(reloaded.Body.Bytes(), &reloadedResponse); err != nil {
		t.Fatalf("decode reloaded document response: %v", err)
	}
	if reloadedResponse.Document.Revision != 3 || len(reloadedResponse.Document.Nodes) != 1 || reloadedResponse.Document.Nodes[0].Transform.Matrix != nodeTransformMatrix {
		t.Fatalf("reloaded document = %+v, want persisted transform", reloadedResponse.Document)
	}
}

func TestProjectCADDocumentRoutesPersistBoxUnionFeature(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Ada Lovelace",
		"email":    "cad-box-union@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Feature case",
	}, sessionCookie)
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
		"feature.step",
		[]byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;"),
		sessionCookie,
	)
	var uploadResponse struct {
		Model struct {
			ID string `json:"id"`
		} `json:"model"`
	}
	if err := json.Unmarshal(upload.Body.Bytes(), &uploadResponse); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}

	patch := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document/models/"+uploadResponse.Model.ID+"/box-union", map[string]any{
		"box": map[string]any{
			"origin": [3]float64{2, -1, 4},
			"size":   [3]float64{8, 6, 3},
		},
	}, sessionCookie)
	if patch.Code != http.StatusOK {
		t.Fatalf("box-union status = %d, body = %s", patch.Code, patch.Body.String())
	}
	var patchResponse struct {
		Document struct {
			Revision   int `json:"revision"`
			Operations []struct {
				Type    string `json:"type"`
				ModelID string `json:"model_id"`
				Box     *struct {
					Origin [3]float64 `json:"origin"`
					Size   [3]float64 `json:"size"`
				} `json:"box"`
			} `json:"operations"`
		} `json:"document"`
	}
	if err := json.Unmarshal(patch.Body.Bytes(), &patchResponse); err != nil {
		t.Fatalf("decode box-union response: %v", err)
	}
	if patchResponse.Document.Revision != 2 || len(patchResponse.Document.Operations) != 1 {
		t.Fatalf("document = %+v, want revision 2 with one operation", patchResponse.Document)
	}
	operation := patchResponse.Document.Operations[0]
	if operation.Type != "box-union" || operation.ModelID != uploadResponse.Model.ID || operation.Box == nil {
		t.Fatalf("operation = %+v, want persisted box-union", operation)
	}
	if operation.Box.Origin != [3]float64{2, -1, 4} || operation.Box.Size != [3]float64{8, 6, 3} {
		t.Fatalf("operation box = %+v", operation.Box)
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
