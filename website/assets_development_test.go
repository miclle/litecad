//go:build development

package website

import "testing"

func TestDevServerURLFromEnvironment(t *testing.T) {
	t.Setenv("LITECAD_VITE_DEV_SERVER_URL", "http://127.0.0.1:47281")
	t.Setenv("LITECAD_VITE_PORT", "47282")

	got := devServerURLFromEnvironment()

	if got != "http://127.0.0.1:47281" {
		t.Fatalf("dev server URL = %q, want explicit URL", got)
	}
}

func TestDevServerURLFallsBackToConfiguredPort(t *testing.T) {
	t.Setenv("LITECAD_VITE_PORT", "47282")

	got := devServerURLFromEnvironment()

	if got != "http://localhost:47282" {
		t.Fatalf("dev server URL = %q, want URL from configured port", got)
	}
}

func TestDevServerURLDefaultsToVitePort(t *testing.T) {
	got := devServerURLFromEnvironment()

	if got != "http://localhost:46281" {
		t.Fatalf("dev server URL = %q, want default Vite URL", got)
	}
}
