// personalpool imports 1–20 reviewed lessons into the shared collection.
// Without -activate the batch is stored as drafts and is not shown to users.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/store"
)

func main() {
	file := flag.String("file", "", "JSON array of 1–20 shared lesson cards")
	env := flag.String("env", "/opt/citavuk/.env", "server environment file")
	activate := flag.Bool("activate", false, "make reviewed cards available to readers")
	flag.Parse()
	if err := run(*file, *env, *activate); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(file, env string, activate bool) error {
	if file == "" {
		return errors.New("укажи -file с пакетом уроков")
	}
	info, err := os.Stat(file)
	if err != nil {
		return err
	}
	if info.Size() > 2<<20 {
		return errors.New("пакет больше 2 МиБ")
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	var entries []store.SharedPersonalImport
	if err = json.Unmarshal(raw, &entries); err != nil {
		return fmt.Errorf("чтение JSON: %w", err)
	}
	cfg, err := config.Load(env)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()
	changed, err := st.ImportSharedPersonalBatch(ctx, entries, activate)
	if err != nil {
		return err
	}
	state := "черновики"
	if activate {
		state = "доступны читателям"
	}
	fmt.Printf("Сохранено %d карт: %s\n", changed, state)
	return nil
}
