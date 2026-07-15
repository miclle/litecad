package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func TestProjectInspectionRecordRoutesCreateListAndDelete(t *testing.T) {
	router := newTestRouter(t)
	cookie, projectID := createProjectForInspectionRecordRoutes(t, router, "inspection-route-owner@example.com")

	create := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/inspection-records", map[string]any{
		"kind":                  "measurement",
		"name":                  "Visible bounds",
		"cad_document_revision": 3,
		"unit":                  "millimetre",
		"visible_model_ids":     []string{"mdl_a"},
		"measurement": map[string]any{
			"derivation":  "preview-visible-aabb",
			"model_count": 1,
			"center":      map[string]float64{"x": 1, "y": 2, "z": 3},
			"size":        map[string]float64{"x": 10, "y": 20, "z": 30},
			"diagonal":    37.416573867739416,
		},
	}, cookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
	var createResponse struct {
		Record struct {
			ID          string `json:"id"`
			Kind        string `json:"kind"`
			Measurement struct {
				Size struct {
					Z float64 `json:"z"`
				} `json:"size"`
			} `json:"measurement"`
		} `json:"record"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if createResponse.Record.ID == "" || createResponse.Record.Kind != "measurement" || createResponse.Record.Measurement.Size.Z != 30 {
		t.Fatalf("created record = %+v", createResponse.Record)
	}

	list := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/inspection-records", cookie)
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", list.Code, list.Body.String())
	}
	var listResponse struct {
		Records []struct {
			ID   string `json:"id"`
			Kind string `json:"kind"`
		} `json:"records"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listResponse.Records) != 1 || listResponse.Records[0].ID != createResponse.Record.ID {
		t.Fatalf("list records = %+v", listResponse.Records)
	}

	deleteRecord := deleteJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/inspection-records/"+createResponse.Record.ID, nil, cookie)
	if deleteRecord.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, body = %s", deleteRecord.Code, deleteRecord.Body.String())
	}
	list = getWithCookie(t, router, "/api/v1/projects/"+projectID+"/inspection-records", cookie)
	if list.Code != http.StatusOK {
		t.Fatalf("list after delete status = %d, body = %s", list.Code, list.Body.String())
	}
	listResponse.Records = nil
	if err := json.Unmarshal(list.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("decode list after delete response: %v", err)
	}
	if len(listResponse.Records) != 0 {
		t.Fatalf("records after delete = %+v", listResponse.Records)
	}
}

func TestProjectInspectionRecordRoutesRejectInvalidAndForeignAccess(t *testing.T) {
	router := newTestRouter(t)
	ownerCookie, projectID := createProjectForInspectionRecordRoutes(t, router, "inspection-route-validation-owner@example.com")
	otherCookie, _ := createProjectForInspectionRecordRoutes(t, router, "inspection-route-validation-other@example.com")

	signedOut := postJSON(t, router, "/api/v1/projects/"+projectID+"/inspection-records", map[string]any{
		"kind": "section",
		"name": "Center section",
		"section": map[string]any{
			"mode":           "center-plane",
			"plane_normal":   map[string]float64{"x": -1, "y": 0, "z": 0},
			"plane_constant": 0,
		},
	})
	if signedOut.Code != http.StatusUnauthorized {
		t.Fatalf("signed out status = %d, want %d", signedOut.Code, http.StatusUnauthorized)
	}

	invalid := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/inspection-records", map[string]any{
		"kind": "measurement",
		"name": "Invalid bounds",
	}, ownerCookie)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid status = %d, want %d, body = %s", invalid.Code, http.StatusBadRequest, invalid.Body.String())
	}

	create := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/inspection-records", map[string]any{
		"kind": "section",
		"name": "Owned section",
		"section": map[string]any{
			"mode":           "center-plane",
			"plane_normal":   map[string]float64{"x": -1, "y": 0, "z": 0},
			"plane_constant": 0,
		},
	}, ownerCookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
	var createResponse struct {
		Record struct {
			ID string `json:"id"`
		} `json:"record"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}

	foreignList := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/inspection-records", otherCookie)
	if foreignList.Code != http.StatusNotFound {
		t.Fatalf("foreign list status = %d, want %d", foreignList.Code, http.StatusNotFound)
	}
	foreignDelete := deleteJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/inspection-records/"+createResponse.Record.ID, nil, otherCookie)
	if foreignDelete.Code != http.StatusNotFound {
		t.Fatalf("foreign delete status = %d, want %d", foreignDelete.Code, http.StatusNotFound)
	}
}

func TestProjectInspectionRecordRoutesPersistExactTopologyMeasurement(t *testing.T) {
	router := newTestRouter(t)
	cookie, projectID := createProjectForInspectionRecordRoutes(t, router, "inspection-route-topology@example.com")
	properties := map[string]any{
		"volume": 6000, "surface_area": 2200, "edge_length": 240,
		"center_of_mass": map[string]float64{"x": 5, "y": 10, "z": 15},
		"solid_count":    1, "face_count": 6, "edge_count": 12,
	}
	references := make([]any, 0, 18)
	operationsSignature := "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
	referencePrefix := "topology:occ_box:pmr_box_1:sha256%3A4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
	for index, area := range []float64{200, 200, 600, 600, 300, 300} {
		references = append(references, map[string]any{"id": fmt.Sprintf("%s:face:%d", referencePrefix, index+1), "kind": "face", "index": index + 1, "measure": area})
	}
	for index, length := range []float64{10, 10, 10, 10, 20, 20, 20, 20, 30, 30, 30, 30} {
		references = append(references, map[string]any{"id": fmt.Sprintf("%s:edge:%d", referencePrefix, index+1), "kind": "edge", "index": index + 1, "measure": length})
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/inspection-records", map[string]any{
		"kind": "measurement", "name": "Exact B-rep properties", "cad_document_revision": 4,
		"unit": "millimetre", "visible_model_ids": []string{"occ_box"},
		"measurement": map[string]any{
			"derivation": "occt-brep-properties",
			"topology": map[string]any{
				"target_count": 1, "totals": properties,
				"targets": []any{map[string]any{
					"reference_scope": map[string]string{"occurrence_id": "occ_box", "model_revision_id": "pmr_box_1", "operations_signature": operationsSignature},
					"volume":          6000, "surface_area": 2200, "edge_length": 240,
					"center_of_mass": map[string]float64{"x": 5, "y": 10, "z": 15},
					"solid_count":    1, "face_count": 6, "edge_count": 12,
					"references": references,
				}},
			},
		},
	}, cookie)
	if create.Code != http.StatusCreated {
		t.Fatalf("create topology status = %d, body = %s", create.Code, create.Body.String())
	}
	var response struct {
		Record struct {
			Measurement struct {
				Derivation string `json:"derivation"`
				Topology   struct {
					Totals struct {
						Volume float64 `json:"volume"`
					} `json:"totals"`
				} `json:"topology"`
			} `json:"measurement"`
		} `json:"record"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode topology response: %v", err)
	}
	if response.Record.Measurement.Derivation != "occt-brep-properties" || response.Record.Measurement.Topology.Totals.Volume != 6000 {
		t.Fatalf("topology response = %+v", response.Record.Measurement)
	}
}

func createProjectForInspectionRecordRoutes(t *testing.T, router http.Handler, email string) (*http.Cookie, string) {
	t.Helper()
	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name":     "Inspection Route Owner",
		"email":    email,
		"password": "correct-horse-battery",
	})
	cookie := findCookie(register.Result(), SessionCookieName)
	if cookie == nil {
		t.Fatal("register should set a session cookie")
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{"name": "Inspection route records"}, cookie)
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
