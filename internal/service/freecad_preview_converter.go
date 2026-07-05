package service

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

const defaultFreeCADCmd = "/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd"

// FreeCADPreviewConverter converts STEP sources through FreeCAD's OpenCascade import and mesh export.
type FreeCADPreviewConverter struct {
	Command string
	Script  string
}

// NewFreeCADPreviewConverter returns the default FreeCAD-backed preview converter.
func NewFreeCADPreviewConverter() FreeCADPreviewConverter {
	command := os.Getenv("LITECAD_FREECAD_CMD")
	if command == "" {
		command = defaultFreeCADCmd
	}
	return FreeCADPreviewConverter{
		Command: command,
		Script:  filepath.Join("scripts", "freecad_step_to_obj.py"),
	}
}

// ConvertStepToOBJ converts STEP bytes to an OBJ mesh.
func (c FreeCADPreviewConverter) ConvertStepToOBJ(ctx context.Context, data []byte) (ModelPreviewMesh, error) {
	if c.Command == "" {
		return ModelPreviewMesh{}, fmt.Errorf("FreeCAD command is not configured")
	}
	script := c.Script
	if script == "" {
		script = filepath.Join("scripts", "freecad_step_to_obj.py")
	}
	workingDir, err := os.Getwd()
	if err != nil {
		return ModelPreviewMesh{}, err
	}
	if !filepath.IsAbs(script) {
		script = resolveProjectScript(script)
	}

	tempDir, err := os.MkdirTemp("", "litecad-preview-*")
	if err != nil {
		return ModelPreviewMesh{}, err
	}
	defer func() {
		_ = os.RemoveAll(tempDir)
	}()

	inputPath := filepath.Join(tempDir, "source.step")
	outputPath := filepath.Join(tempDir, "preview.obj")
	if err := os.WriteFile(inputPath, data, 0o600); err != nil {
		return ModelPreviewMesh{}, err
	}

	cmd := exec.CommandContext(ctx, c.Command, script, inputPath, outputPath)
	cmd.Dir = workingDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return ModelPreviewMesh{}, fmt.Errorf("run FreeCAD converter: %w: %s", err, string(output))
	}
	previewData, err := os.ReadFile(outputPath)
	if err != nil {
		return ModelPreviewMesh{}, err
	}
	vertices, facets := countOBJMesh(previewData)
	return ModelPreviewMesh{
		Format:      "obj",
		ContentType: "model/obj",
		Data:        previewData,
		VertexCount: vertices,
		FacetCount:  facets,
	}, nil
}

func resolveProjectScript(script string) string {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		return script
	}
	dir := filepath.Dir(currentFile)
	for {
		candidate := filepath.Join(dir, script)
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return script
}
