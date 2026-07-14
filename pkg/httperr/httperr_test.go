package httperr

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"
)

func TestConstructors(t *testing.T) {
	cases := []struct {
		name string
		err  *StatusError
		code int
		msg  string
	}{
		{name: "bad request", err: NewBadRequest("missing field"), code: http.StatusBadRequest, msg: "missing field"},
		{name: "not found", err: NewNotFound("example not found"), code: http.StatusNotFound, msg: "example not found"},
		{name: "internal", err: NewInternalServerError("service unavailable"), code: http.StatusInternalServerError, msg: "service unavailable"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.err.StatusCode() != tc.code {
				t.Fatalf("StatusCode = %d, want %d", tc.err.StatusCode(), tc.code)
			}
			if tc.err.Error() != tc.msg {
				t.Fatalf("Error = %q, want %q", tc.err.Error(), tc.msg)
			}
		})
	}
}

func TestStatusErrorImplementsError(t *testing.T) {
	var target *StatusError
	if !errors.As(NewBadRequest("x"), &target) {
		t.Fatal("errors.As should resolve StatusError")
	}
	if target == nil || target.Code != http.StatusBadRequest {
		t.Fatalf("unexpected target: %+v", target)
	}
}

func TestStatusErrorMarshalsStructuredMessage(t *testing.T) {
	data, err := json.Marshal(NewBadGateway("upstream failed"))
	if err != nil {
		t.Fatalf("Marshal returned error: %v", err)
	}
	var body struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(data, &body); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}
	if body.Code != http.StatusBadGateway || body.Message != "upstream failed" {
		t.Fatalf("body = %+v", body)
	}
}
