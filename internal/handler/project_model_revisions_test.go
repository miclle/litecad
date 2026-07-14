package handler

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestProjectModelRevisionRoutesListRestoreAndRejectStaleRevision(t *testing.T) {
	router := newTestRouter(t)
	register := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name": "Revision Owner", "email": "revision-routes@example.com", "password": "correct-horse-battery",
	})
	cookie := findCookie(register.Result(), SessionCookieName)
	create := postJSONWithCookie(t, router, "/api/v1/projects", map[string]string{"name": "Versioned model"}, cookie)
	var projectResponse struct {
		Project struct {
			ID string `json:"id"`
		} `json:"project"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &projectResponse); err != nil {
		t.Fatalf("decode project: %v", err)
	}
	projectID := projectResponse.Project.ID
	source := []byte(`{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":10}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",10,10]}]}`)
	upload := postMultipartFileWithCookie(t, router, "/api/v1/projects/"+projectID+"/models", "model", "versioned.lcad.json", source, cookie)
	if upload.Code != http.StatusCreated {
		t.Fatalf("upload status = %d, body = %s", upload.Code, upload.Body.String())
	}
	var uploadResponse struct {
		Model struct {
			ID                string `json:"id"`
			CurrentRevisionID string `json:"current_revision_id"`
		} `json:"model"`
	}
	if err := json.Unmarshal(upload.Body.Bytes(), &uploadResponse); err != nil {
		t.Fatalf("decode upload: %v", err)
	}

	update := patchJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/models/"+uploadResponse.Model.ID+"/parametric-parameters", map[string]any{
		"expected_revision": 1,
		"parameter_values":  map[string]any{"width": 24},
	}, cookie)
	if update.Code != http.StatusOK {
		t.Fatalf("update status = %d, body = %s", update.Code, update.Body.String())
	}

	list := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/models/"+uploadResponse.Model.ID+"/revisions", cookie)
	if list.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", list.Code, list.Body.String())
	}
	var listResponse struct {
		Revisions []struct {
			ID        string `json:"id"`
			Sequence  int    `json:"sequence"`
			IsCurrent bool   `json:"is_current"`
		} `json:"revisions"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &listResponse); err != nil {
		t.Fatalf("decode revisions: %v", err)
	}
	if len(listResponse.Revisions) != 2 || listResponse.Revisions[0].Sequence != 2 || !listResponse.Revisions[0].IsCurrent || listResponse.Revisions[1].Sequence != 1 {
		t.Fatalf("revisions = %+v", listResponse.Revisions)
	}
	detail := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/models/"+uploadResponse.Model.ID+"/revisions/"+listResponse.Revisions[1].ID, cookie)
	if detail.Code != http.StatusOK {
		t.Fatalf("detail status = %d, body = %s", detail.Code, detail.Body.String())
	}
	revisionSource := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/models/"+uploadResponse.Model.ID+"/revisions/"+listResponse.Revisions[1].ID+"/source", cookie)
	if revisionSource.Code != http.StatusOK || revisionSource.Body.String() != string(source) {
		t.Fatalf("revision source status/body = %d/%q, want initial source", revisionSource.Code, revisionSource.Body.String())
	}

	restoreURL := "/api/v1/projects/" + projectID + "/models/" + uploadResponse.Model.ID + "/revisions/" + listResponse.Revisions[1].ID + "/restore"
	restore := postJSONWithCookie(t, router, restoreURL, map[string]any{"expected_revision": 2}, cookie)
	if restore.Code != http.StatusOK {
		t.Fatalf("restore status = %d, body = %s", restore.Code, restore.Body.String())
	}
	stale := postJSONWithCookie(t, router, "/api/v1/projects/"+projectID+"/models/"+uploadResponse.Model.ID+"/revisions/"+listResponse.Revisions[0].ID+"/restore", map[string]any{"expected_revision": 2}, cookie)
	if stale.Code != http.StatusConflict {
		t.Fatalf("stale restore status = %d, body = %s", stale.Code, stale.Body.String())
	}

	otherRegister := postJSON(t, router, "/api/v1/auth/register", map[string]string{
		"name": "Other Owner", "email": "revision-routes-other@example.com", "password": "correct-horse-battery",
	})
	otherCookie := findCookie(otherRegister.Result(), SessionCookieName)
	foreignList := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/models/"+uploadResponse.Model.ID+"/revisions", otherCookie)
	if foreignList.Code != http.StatusNotFound {
		t.Fatalf("foreign list status = %d, body = %s", foreignList.Code, foreignList.Body.String())
	}
	foreignSource := getWithCookie(t, router, "/api/v1/projects/"+projectID+"/models/"+uploadResponse.Model.ID+"/revisions/"+listResponse.Revisions[1].ID+"/source", otherCookie)
	if foreignSource.Code != http.StatusNotFound {
		t.Fatalf("foreign source status = %d, body = %s", foreignSource.Code, foreignSource.Body.String())
	}
}
