package handler

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestProjectCADAssemblyGroupAndConstraintRoutes(t *testing.T) {
	router := newTestRouter(t)
	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name": "Nested Assembly Owner", "email": "nested-assembly@example.com", "password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{"name": "Drive train"}, sessionCookie)
	var createResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	projectID := createResponse.Project.ID
	for _, filename := range []string{"motor.step", "gearbox.step"} {
		upload := postMultipartFileWithCookie(t, router, "/api/v1/projects/"+projectID+"/models", "model", filename,
			[]byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;"), sessionCookie)
		if upload.Code != http.StatusCreated {
			t.Fatalf("upload %s status = %d, body = %s", filename, upload.Code, upload.Body.String())
		}
	}

	type assemblyResponse struct {
		Document struct {
			SchemaVersion int `json:"schema_version"`
			Revision      int `json:"revision"`
			Assembly      struct {
				Groups []struct {
					ID            string `json:"id"`
					ParentGroupID string `json:"parent_group_id"`
					Suppressed    bool   `json:"suppressed"`
				} `json:"groups"`
				Occurrences []struct {
					ID            string `json:"id"`
					ParentGroupID string `json:"parent_group_id"`
					Transform     struct {
						Matrix [16]float64 `json:"matrix"`
					} `json:"transform"`
				} `json:"occurrences"`
				Constraints []struct {
					ID                 string  `json:"id"`
					Kind               string  `json:"kind"`
					FirstOccurrenceID  string  `json:"first_occurrence_id"`
					SecondOccurrenceID string  `json:"second_occurrence_id"`
					Status             string  `json:"status"`
					Solver             string  `json:"solver"`
					Residual           float64 `json:"residual"`
				} `json:"constraints"`
			} `json:"assembly"`
		} `json:"document"`
	}
	decode := func(body []byte) assemblyResponse {
		t.Helper()
		var response assemblyResponse
		if err := json.Unmarshal(body, &response); err != nil {
			t.Fatalf("decode assembly response %q: %v", string(body), err)
		}
		return response
	}

	initialRecorder := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/cad-document", sessionCookie)
	if initialRecorder.Code != http.StatusOK {
		t.Fatalf("get CAD document status = %d, body = %s", initialRecorder.Code, initialRecorder.Body.String())
	}
	initial := decode(initialRecorder.Body.Bytes())
	if initial.Document.SchemaVersion != 4 || len(initial.Document.Assembly.Occurrences) != 2 {
		t.Fatalf("initial document = %+v", initial.Document)
	}
	groupsURL := "/api/v1/projects/" + projectID + "/cad-document/groups"
	rootRecorder := postJSONWithCookie(t, router, groupsURL, map[string]any{
		"name": "Power unit", "expected_revision": initial.Document.Revision,
	}, sessionCookie)
	if rootRecorder.Code != http.StatusOK {
		t.Fatalf("create root group status = %d, body = %s", rootRecorder.Code, rootRecorder.Body.String())
	}
	root := decode(rootRecorder.Body.Bytes())
	rootID := root.Document.Assembly.Groups[0].ID

	stale := postJSONWithCookie(t, router, groupsURL, map[string]any{
		"name": "Stale", "expected_revision": initial.Document.Revision,
	}, sessionCookie)
	if stale.Code != http.StatusConflict {
		t.Fatalf("stale group status = %d, body = %s", stale.Code, stale.Body.String())
	}

	childRecorder := postJSONWithCookie(t, router, groupsURL, map[string]any{
		"name": "Reduction stage", "parent_group_id": rootID, "expected_revision": root.Document.Revision,
	}, sessionCookie)
	if childRecorder.Code != http.StatusOK {
		t.Fatalf("create child group status = %d, body = %s", childRecorder.Code, childRecorder.Body.String())
	}
	child := decode(childRecorder.Body.Bytes())
	childID := child.Document.Assembly.Groups[1].ID
	occurrenceID := child.Document.Assembly.Occurrences[0].ID
	groupOccurrence := patchJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/cad-document/occurrences/"+occurrenceID, map[string]any{
		"parent_group_id": childID, "expected_revision": child.Document.Revision,
	}, sessionCookie)
	if groupOccurrence.Code != http.StatusOK {
		t.Fatalf("group occurrence status = %d, body = %s", groupOccurrence.Code, groupOccurrence.Body.String())
	}
	grouped := decode(groupOccurrence.Body.Bytes())
	if grouped.Document.Assembly.Occurrences[0].ParentGroupID != childID {
		t.Fatalf("grouped occurrence = %+v", grouped.Document.Assembly.Occurrences[0])
	}

	suppressRoot := patchJSONWithCookie(t, router, groupsURL+"/"+rootID, map[string]any{
		"suppressed": true, "expected_revision": grouped.Document.Revision,
	}, sessionCookie)
	if suppressRoot.Code != http.StatusOK {
		t.Fatalf("suppress root status = %d, body = %s", suppressRoot.Code, suppressRoot.Body.String())
	}
	suppressed := decode(suppressRoot.Body.Bytes())
	if !suppressed.Document.Assembly.Groups[0].Suppressed {
		t.Fatalf("suppressed groups = %+v", suppressed.Document.Assembly.Groups)
	}

	constraintRecorder := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/cad-document/constraints", map[string]any{
		"name": "Motor to gearbox", "kind": "mate",
		"first_occurrence_id":  suppressed.Document.Assembly.Occurrences[0].ID,
		"second_occurrence_id": suppressed.Document.Assembly.Occurrences[1].ID,
		"first_anchor":         []float64{0, 0, 0},
		"second_anchor":        []float64{0, 0, 0},
		"offset":               []float64{10, 0, 0},
		"expected_revision":    suppressed.Document.Revision,
	}, sessionCookie)
	if constraintRecorder.Code != http.StatusOK {
		t.Fatalf("create constraint status = %d, body = %s", constraintRecorder.Code, constraintRecorder.Body.String())
	}
	constrained := decode(constraintRecorder.Body.Bytes())
	if len(constrained.Document.Assembly.Constraints) != 1 || constrained.Document.Assembly.Constraints[0].Kind != "mate" ||
		constrained.Document.Assembly.Constraints[0].Status != "solved" || constrained.Document.Assembly.Constraints[0].Solver != "point-coincident-v1" ||
		constrained.Document.Assembly.Constraints[0].Residual != 0 || constrained.Document.Assembly.Occurrences[1].Transform.Matrix[3] != 10 {
		t.Fatalf("constraints = %+v", constrained.Document.Assembly.Constraints)
	}

	cycle := patchJSONWithCookie(t, router, groupsURL+"/"+rootID, map[string]any{
		"parent_group_id": childID, "expected_revision": constrained.Document.Revision,
	}, sessionCookie)
	if cycle.Code != http.StatusBadRequest {
		t.Fatalf("cycle status = %d, body = %s", cycle.Code, cycle.Body.String())
	}

	constraintID := constrained.Document.Assembly.Constraints[0].ID
	deletedConstraint := deleteJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/cad-document/constraints/"+constraintID, map[string]any{
		"expected_revision": constrained.Document.Revision,
	}, sessionCookie)
	if deletedConstraint.Code != http.StatusOK || len(decode(deletedConstraint.Body.Bytes()).Document.Assembly.Constraints) != 0 {
		t.Fatalf("delete constraint status = %d, body = %s", deletedConstraint.Code, deletedConstraint.Body.String())
	}
}
