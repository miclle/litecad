package service

import (
	"reflect"
	"strings"
	"testing"
)

func TestLiteCADFeatureDSLCapabilities(t *testing.T) {
	wantFeatures := []string{
		"sketch", "box", "box_cut", "extrude", "extrude_cut", "cylinder", "cylinder_cut", "sphere",
		"ellipsoid", "ellipse_extrude", "revolve", "sweep", "loft", "fillet", "chamfer", "boolean",
	}
	registry := LiteCADFeatureDSLCapabilities()
	if !reflect.DeepEqual(registry.Features, wantFeatures) {
		t.Fatalf("features = %#v, want %#v", registry.Features, wantFeatures)
	}
	if !reflect.DeepEqual(registry.BooleanOperations, []string{"union", "subtract", "intersect"}) {
		t.Fatalf("boolean operations = %#v", registry.BooleanOperations)
	}
	if !reflect.DeepEqual(registry.SketchPlanes, []string{"XY", "XZ", "YZ"}) {
		t.Fatalf("sketch planes = %#v", registry.SketchPlanes)
	}

	registry.Features[0] = "mutated"
	if LiteCADFeatureDSLCapabilities().Features[0] != "sketch" {
		t.Fatal("capability registry returned mutable shared state")
	}
}

func TestAIParametricPromptUsesCapabilityRegistry(t *testing.T) {
	featureList := strings.Join(LiteCADFeatureDSLCapabilities().Features, ", ")
	if prompt := buildAIParametricSystemPrompt(); !strings.Contains(prompt, featureList) {
		t.Fatalf("system prompt does not contain registry feature list %q", featureList)
	}
	codeSchema := buildParametricModelAITool().Parameters["properties"].(map[string]any)["code"].(map[string]any)
	description := codeSchema["description"].(string)
	if !strings.Contains(description, featureList) {
		t.Fatalf("tool description does not contain registry feature list %q", featureList)
	}
}
