package service

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"strings"
)

// StepMetadata is the lightweight, non-geometric summary extracted from CAD source files.
type StepMetadata struct {
	AssetType           string   `json:"asset_type"`
	Version             string   `json:"version"`
	Schema              string   `json:"schema"`
	ProductNames        []string `json:"product_names"`
	LengthUnit          string   `json:"length_unit"`
	EntityCount         int      `json:"entity_count"`
	RepresentationCount int      `json:"representation_count"`
	TriangleCount       int      `json:"triangle_count"`
}

var (
	errInvalidStepSource      = errors.New("invalid STEP source")
	errInvalidGLBSource       = errors.New("invalid GLB source")
	errInvalidGLTFSource      = errors.New("invalid GLTF source")
	errInvalidSTLSource       = errors.New("invalid STL source")
	stepSchemaPattern         = regexp.MustCompile(`(?is)FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'`)
	stepProductPattern        = regexp.MustCompile(`(?is)\bPRODUCT\s*\(\s*'((?:''|[^'])*)'`)
	stepEntityPattern         = regexp.MustCompile(`(?m)#\d+\s*=`)
	stepRepresentationPattern = regexp.MustCompile(`(?is)\bSHAPE_REPRESENTATION\s*\(`)
)

// ExtractStepMetadata reads STEP header and entity summary data without parsing geometry.
func ExtractStepMetadata(data []byte) (StepMetadata, error) {
	normalized := string(bytes.ToUpper(data))
	if !strings.Contains(normalized, "ISO-10303-21") {
		return StepMetadata{}, errInvalidStepSource
	}

	source := string(data)
	metadata := StepMetadata{
		AssetType:           "step",
		Schema:              extractStepSchema(source),
		ProductNames:        extractStepProductNames(source),
		LengthUnit:          extractStepLengthUnit(normalized),
		EntityCount:         len(stepEntityPattern.FindAllStringIndex(source, -1)),
		RepresentationCount: len(stepRepresentationPattern.FindAllStringIndex(source, -1)),
	}
	if metadata.Schema == "" {
		metadata.Schema = "ISO-10303-21"
	}
	return metadata, nil
}

// ExtractGLBMetadata reads a binary glTF header.
func ExtractGLBMetadata(data []byte) (StepMetadata, error) {
	if len(data) < 20 || string(data[:4]) != "glTF" {
		return StepMetadata{}, errInvalidGLBSource
	}
	version := binary.LittleEndian.Uint32(data[4:8])
	length := binary.LittleEndian.Uint32(data[8:12])
	if int(length) != len(data) {
		return StepMetadata{}, errInvalidGLBSource
	}
	return StepMetadata{
		AssetType: "glb",
		Version:   strconv.FormatUint(uint64(version), 10),
	}, nil
}

// ExtractGLTFMetadata reads a JSON glTF header.
func ExtractGLTFMetadata(data []byte) (StepMetadata, error) {
	var payload struct {
		Asset struct {
			Version string `json:"version"`
		} `json:"asset"`
		Meshes  []unknownGLTFMesh     `json:"meshes"`
		Buffers []unknownGLTFResource `json:"buffers"`
		Images  []unknownGLTFResource `json:"images"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return StepMetadata{}, errInvalidGLTFSource
	}
	if payload.Asset.Version == "" {
		return StepMetadata{}, errInvalidGLTFSource
	}
	if hasExternalGLTFResource(payload.Buffers) || hasExternalGLTFResource(payload.Images) {
		return StepMetadata{}, errInvalidGLTFSource
	}
	return StepMetadata{
		AssetType:           "gltf",
		Version:             payload.Asset.Version,
		RepresentationCount: len(payload.Meshes),
	}, nil
}

type unknownGLTFMesh struct{}

type unknownGLTFResource struct {
	URI string `json:"uri"`
}

func hasExternalGLTFResource(resources []unknownGLTFResource) bool {
	for _, resource := range resources {
		uri := strings.TrimSpace(resource.URI)
		if uri != "" && !strings.HasPrefix(strings.ToLower(uri), "data:") {
			return true
		}
	}
	return false
}

// ExtractSTLMetadata reads ASCII or binary STL triangle counts.
func ExtractSTLMetadata(data []byte) (StepMetadata, error) {
	trimmed := strings.TrimSpace(string(data))
	if strings.HasPrefix(strings.ToLower(trimmed), "solid ") && strings.Contains(strings.ToLower(trimmed), "facet normal") {
		return StepMetadata{
			AssetType:     "stl",
			TriangleCount: strings.Count(strings.ToLower(trimmed), "facet normal"),
		}, nil
	}
	if len(data) >= 84 {
		triangleCount := binary.LittleEndian.Uint32(data[80:84])
		expectedSize := 84 + int(triangleCount)*50
		if triangleCount > 0 && expectedSize <= len(data) {
			return StepMetadata{
				AssetType:     "stl",
				TriangleCount: int(triangleCount),
			}, nil
		}
	}
	return StepMetadata{}, errInvalidSTLSource
}

func extractStepSchema(source string) string {
	match := stepSchemaPattern.FindStringSubmatch(source)
	if len(match) < 2 {
		return ""
	}
	schema := strings.TrimSpace(match[1])
	if cut := strings.IndexAny(schema, " {"); cut >= 0 {
		schema = schema[:cut]
	}
	return strings.ToUpper(schema)
}

func extractStepProductNames(source string) []string {
	matches := stepProductPattern.FindAllStringSubmatch(source, -1)
	names := make([]string, 0, len(matches))
	seen := map[string]bool{}
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		name := strings.TrimSpace(strings.ReplaceAll(match[1], "''", "'"))
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	return names
}

func extractStepLengthUnit(upperSource string) string {
	switch {
	case strings.Contains(upperSource, ".MILLI.,.METRE."):
		return "millimetre"
	case strings.Contains(upperSource, ".CENTI.,.METRE."):
		return "centimetre"
	case strings.Contains(upperSource, "SI_UNIT($,.METRE.)"):
		return "metre"
	case strings.Contains(upperSource, "'INCH'"):
		return "inch"
	default:
		return ""
	}
}
