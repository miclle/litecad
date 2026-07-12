// Package config provides application configuration loading and structures.
package config

import (
	"bytes"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/viper"
)

// Config represents the application configuration.
type Config struct {
	Addr   string `mapstructure:"addr"`   // listen address, e.g. "0.0.0.0:46280"
	Driver string `mapstructure:"driver"` // database driver: "postgres" (default) or "mysql"
	DSN    string `mapstructure:"dsn"`    // database connection string
	AI     AI     `mapstructure:"ai"`     // optional AI provider configuration
}

// AI represents optional AI provider configuration.
type AI struct {
	Provider        string `mapstructure:"provider"`          // provider name, currently "openai_compatible"
	BaseURL         string `mapstructure:"base_url"`          // OpenAI-compatible API base URL
	APIKey          string `mapstructure:"api_key"`           // bearer token for the provider
	Model           string `mapstructure:"model"`             // chat completion model
	TimeoutSeconds  int    `mapstructure:"timeout_seconds"`   // request timeout in seconds
	MaxOutputTokens int    `mapstructure:"max_output_tokens"` // generated-token cap for provider calls
}

// Load reads configuration from the given file path.
func Load(path string) (*Config, error) {
	cfgFile, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}
	cfgFile = []byte(expandEnv(string(cfgFile)))

	v := viper.New()
	v.SetConfigType("yaml")
	if err := v.ReadConfig(bytes.NewReader(cfgFile)); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}

	if cfg.Addr == "" {
		return nil, fmt.Errorf("addr is required")
	}
	if cfg.DSN == "" {
		return nil, fmt.Errorf("dsn is required")
	}
	if cfg.Driver == "" {
		cfg.Driver = "postgres"
	}
	if cfg.Driver != "postgres" && cfg.Driver != "mysql" {
		return nil, fmt.Errorf("unsupported driver: %s (supported: postgres, mysql)", cfg.Driver)
	}
	cfg.AI = normalizeAIConfig(cfg.AI)
	if cfg.AI.Provider != "" && cfg.AI.Provider != "openai_compatible" {
		return nil, fmt.Errorf("unsupported ai.provider: %s (supported: openai_compatible)", cfg.AI.Provider)
	}

	return &cfg, nil
}

func normalizeAIConfig(ai AI) AI {
	ai.Provider = strings.TrimSpace(ai.Provider)
	ai.BaseURL = strings.TrimRight(strings.TrimSpace(ai.BaseURL), "/")
	ai.APIKey = strings.TrimSpace(ai.APIKey)
	ai.Model = strings.TrimSpace(ai.Model)
	if ai.Provider == "" && (ai.APIKey != "" || ai.Model != "" || ai.BaseURL != "") {
		ai.Provider = "openai_compatible"
	}
	if ai.Provider == "openai_compatible" && ai.BaseURL == "" {
		ai.BaseURL = "https://api.openai.com/v1"
	}
	if ai.TimeoutSeconds == 0 {
		ai.TimeoutSeconds = 90
	}
	if ai.MaxOutputTokens <= 0 {
		ai.MaxOutputTokens = 2048
	}
	return ai
}

func expandEnv(s string) string {
	return os.Expand(s, func(name string) string {
		key, fallback, ok := strings.Cut(name, ":-")
		if !ok {
			return os.Getenv(name)
		}
		if value := os.Getenv(key); value != "" {
			return value
		}
		return fallback
	})
}
