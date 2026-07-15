package handler

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestProjectCADSubassemblyRoutes(t *testing.T) {
	router := newTestRouter(t)
	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name": "Subassembly Owner", "email": "subassembly@example.com", "password": "correct-horse-battery",
	})
	sessionCookie := findCookie(register.Result(), SessionCookieName)
	if sessionCookie == nil {
		t.Fatal("register should set a session cookie")
	}
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{"name": "Reusable modules"}, sessionCookie)
	var createResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &createResponse); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	projectID := createResponse.Project.ID
	for _, filename := range []string{"left.step", "right.step"} {
		upload := postMultipartFileWithCookie(t, router, "/api/v1/projects/"+projectID+"/models", "model", filename,
			[]byte("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;"), sessionCookie)
		if upload.Code != http.StatusCreated {
			t.Fatalf("upload %s status = %d, body = %s", filename, upload.Code, upload.Body.String())
		}
	}

	type response struct {
		Document struct {
			Revision int `json:"revision"`
			Assembly struct {
				Groups []struct {
					ID                            string `json:"id"`
					SubassemblyDefinitionID       string `json:"subassembly_definition_id"`
					SubassemblyDefinitionRevision int    `json:"subassembly_definition_revision"`
				} `json:"groups"`
				Occurrences []struct {
					ID                  string `json:"id"`
					ParentGroupID       string `json:"parent_group_id"`
					SubassemblyMemberID string `json:"subassembly_member_id"`
					Transform           struct {
						Matrix [16]float64 `json:"matrix"`
					} `json:"transform"`
				} `json:"occurrences"`
				Subassemblies []struct {
					ID       string `json:"id"`
					Revision int    `json:"revision"`
					Members  []struct {
						ID string `json:"id"`
					} `json:"members"`
				} `json:"subassemblies"`
			} `json:"assembly"`
		} `json:"document"`
	}
	decode := func(body []byte) response {
		t.Helper()
		var result response
		if err := json.Unmarshal(body, &result); err != nil {
			t.Fatalf("decode subassembly response %q: %v", string(body), err)
		}
		return result
	}

	initialRecorder := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/cad-document", sessionCookie)
	initial := decode(initialRecorder.Body.Bytes())
	groupsURL := "/api/v1/projects/" + projectID + "/cad-document/groups"
	groupRecorder := postJSONWithCookie(t, router, groupsURL, map[string]any{
		"name": "Source pair", "expected_revision": initial.Document.Revision,
	}, sessionCookie)
	if groupRecorder.Code != http.StatusOK {
		t.Fatalf("create group status = %d, body = %s", groupRecorder.Code, groupRecorder.Body.String())
	}
	grouped := decode(groupRecorder.Body.Bytes())
	groupID := grouped.Document.Assembly.Groups[0].ID
	for _, occurrence := range grouped.Document.Assembly.Occurrences {
		patched := patchJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/cad-document/occurrences/"+occurrence.ID, map[string]any{
			"parent_group_id": groupID, "expected_revision": grouped.Document.Revision,
		}, sessionCookie)
		if patched.Code != http.StatusOK {
			t.Fatalf("group occurrence status = %d, body = %s", patched.Code, patched.Body.String())
		}
		grouped = decode(patched.Body.Bytes())
	}

	captureURL := "/api/v1/projects/" + projectID + "/cad-document/subassemblies"
	captureRecorder := postJSONWithCookie(t, router, captureURL, map[string]any{
		"group_id": groupID, "name": "Reusable pair", "expected_revision": grouped.Document.Revision,
	}, sessionCookie)
	if captureRecorder.Code != http.StatusOK {
		t.Fatalf("capture status = %d, body = %s", captureRecorder.Code, captureRecorder.Body.String())
	}
	captured := decode(captureRecorder.Body.Bytes())
	if len(captured.Document.Assembly.Subassemblies) != 1 || captured.Document.Assembly.Subassemblies[0].Revision != 1 || len(captured.Document.Assembly.Subassemblies[0].Members) != 2 {
		t.Fatalf("captured subassembly = %+v", captured.Document.Assembly.Subassemblies)
	}
	definitionID := captured.Document.Assembly.Subassemblies[0].ID
	instanceRecorder := postJSONWithCookie(t, router, captureURL+"/"+definitionID+"/instances", map[string]any{
		"name": "Reusable pair A", "translation": []float64{40, 5, 0}, "expected_revision": captured.Document.Revision,
	}, sessionCookie)
	if instanceRecorder.Code != http.StatusOK {
		t.Fatalf("instantiate status = %d, body = %s", instanceRecorder.Code, instanceRecorder.Body.String())
	}
	instantiated := decode(instanceRecorder.Body.Bytes())
	instanceGroup := instantiated.Document.Assembly.Groups[len(instantiated.Document.Assembly.Groups)-1]
	if instanceGroup.SubassemblyDefinitionID != definitionID || instanceGroup.SubassemblyDefinitionRevision != 1 {
		t.Fatalf("instance group = %+v", instanceGroup)
	}
	instanceOccurrences := instantiated.Document.Assembly.Occurrences[len(instantiated.Document.Assembly.Occurrences)-2:]
	if instanceOccurrences[0].ParentGroupID != instanceGroup.ID || instanceOccurrences[0].SubassemblyMemberID == "" || instanceOccurrences[0].Transform.Matrix[3] != 40 || instanceOccurrences[0].Transform.Matrix[7] != 5 {
		t.Fatalf("instance occurrence = %+v", instanceOccurrences[0])
	}

	stale := postJSONWithCookie(t, router, captureURL+"/"+definitionID+"/instances", map[string]any{
		"name": "Stale", "translation": []float64{0, 0, 0}, "expected_revision": captured.Document.Revision,
	}, sessionCookie)
	if stale.Code != http.StatusConflict {
		t.Fatalf("stale instantiate status = %d, body = %s", stale.Code, stale.Body.String())
	}
}
