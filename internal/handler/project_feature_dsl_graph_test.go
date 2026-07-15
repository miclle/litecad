package handler

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestProjectFeatureDSLGraphRoutesUpdateHistoryAndRejectInvalidAccess(t *testing.T) {
	router := newTestRouter(t)
	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name": "Graph Owner", "email": "feature-graph-route@example.com", "password": "correct-horse-battery",
	})
	cookie := findCookie(register.Result(), SessionCookieName)
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{"name": "Feature graph route"}, cookie)
	var projectResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &projectResponse); err != nil {
		t.Fatalf("decode project: %v", err)
	}
	projectID := projectResponse.Project.ID
	initialSource := []byte(`{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":40}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",20,6]}]}`)
	updatedSource := `{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":40}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",24,6]},{"id":"slot","type":"box_cut","origin":[10,4,0],"size":[8,12,6]}]}`
	upload := postMultipartFileWithCookie(t, router, "/api/v1/projects/"+projectID+"/models", "model", "graph.lcad.json", initialSource, cookie)
	if upload.Code != http.StatusCreated {
		t.Fatalf("upload status = %d, body = %s", upload.Code, upload.Body.String())
	}
	var uploadResponse struct {
		Model struct {
			ID string `json:"id"`
		} `json:"model"`
	}
	if err := json.Unmarshal(upload.Body.Bytes(), &uploadResponse); err != nil {
		t.Fatalf("decode upload: %v", err)
	}
	graphURL := "/api/v1/projects/" + projectID + "/models/" + uploadResponse.Model.ID + "/feature-dsl-graph"
	payload := map[string]any{"source_code": updatedSource, "expected_revision": 1}

	update := patchJSONWithCookie(t, router, graphURL, payload, cookie)
	if update.Code != http.StatusOK {
		t.Fatalf("update graph status = %d, body = %s", update.Code, update.Body.String())
	}
	var updateResponse struct {
		Model struct {
			ID               string `json:"id"`
			RevisionSequence int    `json:"revision_sequence"`
			Metadata         struct {
				RepresentationCount int `json:"representation_count"`
			} `json:"metadata"`
		} `json:"model"`
	}
	if err := json.Unmarshal(update.Body.Bytes(), &updateResponse); err != nil {
		t.Fatalf("decode update graph: %v", err)
	}
	if updateResponse.Model.ID != uploadResponse.Model.ID || updateResponse.Model.RevisionSequence != 2 || updateResponse.Model.Metadata.RepresentationCount != 2 {
		t.Fatalf("update graph response = %+v", updateResponse.Model)
	}
	source := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/models/"+uploadResponse.Model.ID+"/source", cookie)
	if source.Code != http.StatusOK || source.Body.String() != updatedSource {
		t.Fatalf("updated source status/body = %d/%q", source.Code, source.Body.String())
	}
	history := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/cad-document/history", cookie)
	if history.Code != http.StatusOK {
		t.Fatalf("history status = %d, body = %s", history.Code, history.Body.String())
	}
	var historyResponse struct {
		Entries []struct {
			CommandType             string `json:"command_type"`
			FeatureGraphVersion     int    `json:"feature_graph_version"`
			FeatureGraphTransitions []struct {
				NodeID      string `json:"node_id"`
				Change      string `json:"change"`
				BeforePath  string `json:"before_path"`
				AfterPath   string `json:"after_path"`
				BeforeIndex *int   `json:"before_index"`
				AfterIndex  *int   `json:"after_index"`
			} `json:"feature_graph_transitions"`
		} `json:"entries"`
	}
	if err := json.Unmarshal(history.Body.Bytes(), &historyResponse); err != nil {
		t.Fatalf("decode history: %v", err)
	}
	if len(historyResponse.Entries) != 1 || historyResponse.Entries[0].CommandType != "feature-graph-change" || historyResponse.Entries[0].FeatureGraphVersion != 1 || len(historyResponse.Entries[0].FeatureGraphTransitions) != 2 {
		t.Fatalf("history response = %+v", historyResponse.Entries)
	}
	firstTransition := historyResponse.Entries[0].FeatureGraphTransitions[0]
	if firstTransition.NodeID != "base" || firstTransition.Change != "updated" || firstTransition.BeforePath != "features/base" || firstTransition.AfterPath != "features/base" || firstTransition.BeforeIndex == nil || firstTransition.AfterIndex == nil || *firstTransition.BeforeIndex != 0 || *firstTransition.AfterIndex != 0 {
		t.Fatalf("first graph transition = %+v", historyResponse.Entries[0].FeatureGraphTransitions[0])
	}

	invalid := patchJSONWithCookie(t, router, graphURL, map[string]any{
		"source_code": `{"version":1,"unit":"millimetre","features":[]}`, "expected_revision": 2,
	}, cookie)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid graph status = %d, body = %s", invalid.Code, invalid.Body.String())
	}
	stale := patchJSONWithCookie(t, router, graphURL, payload, cookie)
	if stale.Code != http.StatusConflict {
		t.Fatalf("stale graph status = %d, body = %s", stale.Code, stale.Body.String())
	}
	signedOut := patchJSONWithCookie(t, router, graphURL, map[string]any{"source_code": updatedSource, "expected_revision": 2}, nil)
	if signedOut.Code != http.StatusUnauthorized {
		t.Fatalf("signed-out graph status = %d, body = %s", signedOut.Code, signedOut.Body.String())
	}

	otherRegister := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name": "Other Owner", "email": "feature-graph-route-other@example.com", "password": "correct-horse-battery",
	})
	otherCookie := findCookie(otherRegister.Result(), SessionCookieName)
	foreign := patchJSONWithCookie(t, router, graphURL, map[string]any{"source_code": updatedSource, "expected_revision": 2}, otherCookie)
	if foreign.Code != http.StatusNotFound {
		t.Fatalf("foreign graph status = %d, body = %s", foreign.Code, foreign.Body.String())
	}
}
