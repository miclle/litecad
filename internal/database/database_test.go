package database

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/miclle/litecad/internal/entity"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestOpenRejectsMissingDSN(t *testing.T) {
	if _, err := Open(context.Background(), "postgres", ""); err == nil {
		t.Fatal("Open should reject an empty DSN")
	}
}

func TestOpenRejectsUnsupportedDriver(t *testing.T) {
	if _, err := Open(context.Background(), "sqlite", "file:test.db"); err == nil {
		t.Fatal("Open should reject unsupported driver")
	}
}

func TestMigrateRejectsNilDB(t *testing.T) {
	if err := Migrate(context.Background(), nil); err == nil {
		t.Fatal("Migrate should reject nil db")
	}
}

func TestMigrateCreatesUserTable(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.NewReplacer("/", "_", " ", "_").Replace(t.Name()))), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}

	if err := Migrate(context.Background(), db); err != nil {
		t.Fatalf("Migrate returned error: %v", err)
	}
	if !db.Migrator().HasTable(&entity.User{}) {
		t.Fatal("Migrate should create users table")
	}
	if !db.Migrator().HasTable(&entity.Project{}) {
		t.Fatal("Migrate should create projects table")
	}
}
