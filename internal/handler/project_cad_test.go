package handler

import (
	"encoding/json"
	"net/http"
	"testing"
)

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
		"expected_revision": 1,
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
		"expected_revision": 2,
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

func TestProjectCADDocumentRouteDeletesComponentNode(t *testing.T) {
	router := newTestRouter(t)

	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "CAD Document Delete",
		"email":    "cad-document-delete@example.com",
		"password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{
		"name": "Editable component delete",
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
		"components.step",
		[]byte(`ISO-10303-21;
HEADER;
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
#1 = PRODUCT('Assembly','Assembly','',(#10));
#2 = PRODUCT('Left Part','Left Part','',(#10));
#3 = PRODUCT('Middle Part','Middle Part','',(#10));
#4 = PRODUCT('Right Part','Right Part','',(#10));
ENDSEC;
END-ISO-10303-21;`),
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

	nodeID := "node_" + uploadResponse.Model.ID + "_component_2"
	deleted := deleteJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document/nodes/"+nodeID, map[string]any{
		"expected_revision": 1,
	}, sessionCookie)
	if deleted.Code != http.StatusOK {
		t.Fatalf("delete status = %d, body = %s", deleted.Code, deleted.Body.String())
	}
	var deleteResponse struct {
		Document struct {
			Revision int `json:"revision"`
			Nodes    []struct {
				ID string `json:"id"`
			} `json:"nodes"`
			Operations []struct {
				Type   string `json:"type"`
				NodeID string `json:"node_id"`
			} `json:"operations"`
		} `json:"document"`
	}
	if err := json.Unmarshal(deleted.Body.Bytes(), &deleteResponse); err != nil {
		t.Fatalf("decode delete response: %v", err)
	}
	if deleteResponse.Document.Revision != 2 || len(deleteResponse.Document.Operations) != 1 {
		t.Fatalf("delete document = %+v, want revision 2 with one operation", deleteResponse.Document)
	}
	if deleteResponse.Document.Operations[0].Type != "delete-node" || deleteResponse.Document.Operations[0].NodeID != nodeID {
		t.Fatalf("delete operations = %+v, want delete-node for %s", deleteResponse.Document.Operations, nodeID)
	}
	for _, node := range deleteResponse.Document.Nodes {
		if node.ID == nodeID {
			t.Fatalf("deleted node %q still present in response: %+v", nodeID, deleteResponse.Document.Nodes)
		}
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
		"expected_revision": 1,
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

func TestProjectCADHistoryRoutesPersistUndoRedoAndRejectStaleEdits(t *testing.T) {
	router := newTestRouter(t)
	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name": "History Owner", "email": "cad-history@example.com", "password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{"name": "History case"}, sessionCookie)
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
		"history.step",
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

	transformMatrix := [16]float64{1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 6, 0, 0, 0, 1}
	edit := patchJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document/models/"+uploadResponse.Model.ID+"/transform", map[string]any{
		"expected_revision": 1,
		"transform":         map[string]any{"matrix": transformMatrix},
	}, sessionCookie)
	if edit.Code != http.StatusOK {
		t.Fatalf("edit status = %d, body = %s", edit.Code, edit.Body.String())
	}

	stale := patchJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document/models/"+uploadResponse.Model.ID+"/transform", map[string]any{
		"expected_revision": 1,
		"transform":         map[string]any{"matrix": [16]float64{1, 0, 0, 99, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1}},
	}, sessionCookie)
	if stale.Code != http.StatusConflict {
		t.Fatalf("stale edit status = %d, body = %s", stale.Code, stale.Body.String())
	}

	undo := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document/history/undo", map[string]any{
		"expected_revision": 2,
	}, sessionCookie)
	if undo.Code != http.StatusOK {
		t.Fatalf("undo status = %d, body = %s", undo.Code, undo.Body.String())
	}
	var undoResponse struct {
		Document struct {
			Revision int `json:"revision"`
			History  struct {
				CanUndo bool `json:"can_undo"`
				CanRedo bool `json:"can_redo"`
			} `json:"history"`
			Nodes []struct {
				Transform struct {
					Matrix [16]float64 `json:"matrix"`
				} `json:"transform"`
			} `json:"nodes"`
		} `json:"document"`
	}
	if err := json.Unmarshal(undo.Body.Bytes(), &undoResponse); err != nil {
		t.Fatalf("decode undo response: %v", err)
	}
	if undoResponse.Document.Revision != 3 || undoResponse.Document.History.CanUndo || !undoResponse.Document.History.CanRedo || undoResponse.Document.Nodes[0].Transform.Matrix[3] != 0 {
		t.Fatalf("undo document = %+v", undoResponse.Document)
	}

	history := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document/history", sessionCookie)
	if history.Code != http.StatusOK {
		t.Fatalf("history status = %d, body = %s", history.Code, history.Body.String())
	}
	var historyResponse struct {
		Entries []struct {
			Sequence    int64  `json:"sequence"`
			Status      string `json:"status"`
			CommandType string `json:"command_type"`
		} `json:"entries"`
	}
	if err := json.Unmarshal(history.Body.Bytes(), &historyResponse); err != nil {
		t.Fatalf("decode history response: %v", err)
	}
	if len(historyResponse.Entries) != 1 || historyResponse.Entries[0].Status != "undone" || historyResponse.Entries[0].CommandType != "transform" {
		t.Fatalf("history entries = %+v", historyResponse.Entries)
	}

	redo := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document/history/redo", map[string]any{
		"expected_revision": 3,
	}, sessionCookie)
	if redo.Code != http.StatusOK {
		t.Fatalf("redo status = %d, body = %s", redo.Code, redo.Body.String())
	}
}

func TestProjectCADOccurrenceRoutesAuthorAndRestoreInstances(t *testing.T) {
	router := newTestRouter(t)
	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name": "Assembly Owner", "email": "assembly-occurrences@example.com", "password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{"name": "Fixture assembly"}, sessionCookie)
	var createResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	upload := postMultipartFileWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/models", "model", "fixture.step",
		[]byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;"), sessionCookie)
	if upload.Code != http.StatusCreated {
		t.Fatalf("upload status = %d, body = %s", upload.Code, upload.Body.String())
	}

	document := getWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document", sessionCookie)
	type occurrenceResponse struct {
		Document struct {
			Revision int `json:"revision"`
			Assembly struct {
				Occurrences []struct {
					ID         string `json:"id"`
					Name       string `json:"name"`
					Suppressed bool   `json:"suppressed"`
					Transform  struct {
						Matrix [16]float64 `json:"matrix"`
					} `json:"transform"`
				} `json:"occurrences"`
			} `json:"assembly"`
		} `json:"document"`
	}
	decode := func(body []byte) occurrenceResponse {
		t.Helper()
		var response occurrenceResponse
		if err := json.Unmarshal(body, &response); err != nil {
			t.Fatalf("decode occurrence response: %v", err)
		}
		return response
	}
	initial := decode(document.Body.Bytes())
	occurrenceID := initial.Document.Assembly.Occurrences[0].ID
	baseURL := "/api/v1/projects/" + createResponse.Project.ID + "/cad-document/occurrences/"

	duplicate := postJSONWithCookie(t, router, baseURL+occurrenceID+"/duplicate", map[string]any{
		"expected_revision": initial.Document.Revision,
	}, sessionCookie)
	if duplicate.Code != http.StatusOK {
		t.Fatalf("duplicate status = %d, body = %s", duplicate.Code, duplicate.Body.String())
	}
	duplicated := decode(duplicate.Body.Bytes())
	if len(duplicated.Document.Assembly.Occurrences) != 2 {
		t.Fatalf("duplicate occurrences = %+v", duplicated.Document.Assembly.Occurrences)
	}
	duplicateID := duplicated.Document.Assembly.Occurrences[1].ID

	stale := postJSONWithCookie(t, router, baseURL+duplicateID+"/duplicate", map[string]any{
		"expected_revision": initial.Document.Revision,
	}, sessionCookie)
	if stale.Code != http.StatusConflict {
		t.Fatalf("stale duplicate status = %d, body = %s", stale.Code, stale.Body.String())
	}

	transform := [16]float64{1, 0, 0, 25, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1}
	update := patchJSONWithCookie(t, router, baseURL+duplicateID, map[string]any{
		"expected_revision": duplicated.Document.Revision,
		"name":              "Fixture right", "suppressed": true, "transform": map[string]any{"matrix": transform},
	}, sessionCookie)
	if update.Code != http.StatusOK {
		t.Fatalf("update status = %d, body = %s", update.Code, update.Body.String())
	}
	updated := decode(update.Body.Bytes())
	if got := updated.Document.Assembly.Occurrences[1]; got.Name != "Fixture right" || !got.Suppressed || got.Transform.Matrix != transform {
		t.Fatalf("updated occurrence = %+v", got)
	}

	move := postJSONWithCookie(t, router, baseURL+duplicateID+"/move", map[string]any{
		"expected_revision": updated.Document.Revision, "target_index": 0,
	}, sessionCookie)
	if move.Code != http.StatusOK {
		t.Fatalf("move status = %d, body = %s", move.Code, move.Body.String())
	}
	moved := decode(move.Body.Bytes())
	if moved.Document.Assembly.Occurrences[0].ID != duplicateID {
		t.Fatalf("moved occurrences = %+v", moved.Document.Assembly.Occurrences)
	}

	deleted := deleteJSONWithCookie(t, router, baseURL+duplicateID, map[string]any{
		"expected_revision": moved.Document.Revision,
	}, sessionCookie)
	if deleted.Code != http.StatusOK {
		t.Fatalf("delete status = %d, body = %s", deleted.Code, deleted.Body.String())
	}
	deletedResponse := decode(deleted.Body.Bytes())
	if len(deletedResponse.Document.Assembly.Occurrences) != 1 {
		t.Fatalf("deleted occurrences = %+v", deletedResponse.Document.Assembly.Occurrences)
	}

	undo := postJSONWithCookie(t, router, "/api/v1/projects/"+createResponse.Project.ID+"/cad-document/history/undo", map[string]any{
		"expected_revision": deletedResponse.Document.Revision,
	}, sessionCookie)
	if undo.Code != http.StatusOK {
		t.Fatalf("undo delete status = %d, body = %s", undo.Code, undo.Body.String())
	}
	if got := decode(undo.Body.Bytes()).Document.Assembly.Occurrences; len(got) != 2 || got[0].ID != duplicateID {
		t.Fatalf("restored occurrences = %+v", got)
	}
}
