package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeConfig(t *testing.T, body string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return path
}

func TestLoadDefaultsDriver(t *testing.T) {
	path := writeConfig(t, `addr: "127.0.0.1:46280"
dsn: "host=localhost port=5432 user=postgres password=postgres dbname=app sslmode=disable"
`)

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.Driver != "postgres" {
		t.Fatalf("Driver = %q, want postgres", cfg.Driver)
	}
}

func TestLoadSupportsMySQL(t *testing.T) {
	path := writeConfig(t, `addr: "127.0.0.1:46280"
driver: mysql
dsn: "root:password@tcp(localhost:3306)/app?charset=utf8mb4&parseTime=True&loc=Local"
`)

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.Driver != "mysql" {
		t.Fatalf("Driver = %q, want mysql", cfg.Driver)
	}
}

func TestLoadRejectsUnsupportedDriver(t *testing.T) {
	path := writeConfig(t, `addr: "127.0.0.1:46280"
driver: sqlite
dsn: "app.db"
`)

	if _, err := Load(path); err == nil {
		t.Fatal("Load should reject unsupported driver")
	}
}

func TestLoadExpandsEnvironmentWithFallback(t *testing.T) {
	t.Setenv("LITECAD_TEST_DSN", "host=db user=app password=secret dbname=app sslmode=disable")
	path := writeConfig(t, `addr: "${LITECAD_TEST_ADDR:-127.0.0.1:46280}"
dsn: "${LITECAD_TEST_DSN:-fallback}"
`)

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.Addr != "127.0.0.1:46280" {
		t.Fatalf("Addr = %q, want fallback", cfg.Addr)
	}
	if cfg.DSN != "host=db user=app password=secret dbname=app sslmode=disable" {
		t.Fatalf("DSN = %q, want environment value", cfg.DSN)
	}
}

func TestLoadAIConfig(t *testing.T) {
	t.Setenv("LITECAD_TEST_AI_KEY", "sk-test")
	path := writeConfig(t, `addr: "127.0.0.1:46280"
dsn: "host=localhost port=5432 user=postgres password=postgres dbname=app sslmode=disable"
ai:
  provider: openai_compatible
  base_url: "${LITECAD_TEST_AI_BASE_URL:-https://example.test/v1/}"
  api_key: "${LITECAD_TEST_AI_KEY:-}"
  model: "cad-model"
`)

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.AI.Provider != "openai_compatible" {
		t.Fatalf("AI.Provider = %q, want openai_compatible", cfg.AI.Provider)
	}
	if cfg.AI.BaseURL != "https://example.test/v1" {
		t.Fatalf("AI.BaseURL = %q", cfg.AI.BaseURL)
	}
	if cfg.AI.APIKey != "sk-test" || cfg.AI.Model != "cad-model" {
		t.Fatalf("AI config = %+v", cfg.AI)
	}
	if cfg.AI.TimeoutSeconds != 30 {
		t.Fatalf("AI.TimeoutSeconds = %d, want default 30", cfg.AI.TimeoutSeconds)
	}
}

func TestLoadRejectsUnsupportedAIProvider(t *testing.T) {
	path := writeConfig(t, `addr: "127.0.0.1:46280"
dsn: "host=localhost port=5432 user=postgres password=postgres dbname=app sslmode=disable"
ai:
  provider: custom
  api_key: "sk-test"
  model: "cad-model"
`)

	if _, err := Load(path); err == nil {
		t.Fatal("Load should reject unsupported ai.provider")
	}
}

func TestLoadRequiresAddrAndDSN(t *testing.T) {
	for _, tc := range []struct {
		name string
		body string
	}{
		{name: "missing addr", body: `dsn: "postgres://example"`},
		{name: "missing dsn", body: `addr: "127.0.0.1:46280"`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := Load(writeConfig(t, tc.body)); err == nil {
				t.Fatal("Load should reject incomplete config")
			}
		})
	}
}
