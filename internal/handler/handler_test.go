package handler

import "testing"

func TestStudioStatusUsesOfficialBrandCasing(t *testing.T) {
	status, ok := (&Ctrl{}).StudioStatus(nil).(map[string]any)
	if !ok {
		t.Fatalf("StudioStatus() type = %T, want map[string]any", status)
	}
	if got := status["name"]; got != "LiteCAD" {
		t.Fatalf("StudioStatus() name = %v, want LiteCAD", got)
	}
}
