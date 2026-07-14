package service

import "strings"

// LiteCADFeatureDSLCapabilityRegistry describes the backend-owned generated-source contract.
type LiteCADFeatureDSLCapabilityRegistry struct {
	Features          []string
	BooleanOperations []string
	SketchPlanes      []string
}

var liteCADFeatureDSLCapabilityRegistry = LiteCADFeatureDSLCapabilityRegistry{
	Features: []string{
		"sketch", "box", "box_cut", "extrude", "extrude_cut", "cylinder", "cylinder_cut", "sphere",
		"ellipsoid", "ellipse_extrude", "tapered_extrude", "revolve", "sweep", "loft", "fillet", "chamfer", "boolean",
	},
	BooleanOperations: []string{"union", "subtract", "intersect"},
	SketchPlanes:      []string{"XY", "XZ", "YZ"},
}

// LiteCADFeatureDSLCapabilities returns an immutable snapshot of generated-source capabilities.
func LiteCADFeatureDSLCapabilities() LiteCADFeatureDSLCapabilityRegistry {
	return LiteCADFeatureDSLCapabilityRegistry{
		Features:          append([]string(nil), liteCADFeatureDSLCapabilityRegistry.Features...),
		BooleanOperations: append([]string(nil), liteCADFeatureDSLCapabilityRegistry.BooleanOperations...),
		SketchPlanes:      append([]string(nil), liteCADFeatureDSLCapabilityRegistry.SketchPlanes...),
	}
}

func isLiteCADFeatureDSLFeatureType(featureType string) bool {
	for _, supportedType := range liteCADFeatureDSLCapabilityRegistry.Features {
		if featureType == supportedType {
			return true
		}
	}
	return false
}

func replaceCapabilityList(source, prefix, suffix string) string {
	start := strings.Index(source, prefix)
	if start < 0 {
		return source
	}
	listStart := start + len(prefix)
	endOffset := strings.Index(source[listStart:], suffix)
	if endOffset < 0 {
		return source
	}
	return source[:listStart] + strings.Join(liteCADFeatureDSLCapabilityRegistry.Features, ", ") + source[listStart+endOffset:]
}
