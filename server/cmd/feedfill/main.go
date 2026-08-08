// Command feedfill fills the production micro-feed from its approved source
// registry. It is deliberately an explicit operator command: running the API
// server never starts paid generation on its own.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/feed"
	"github.com/citavuk/server/internal/store"
)

type options struct {
	target                int
	add                   int
	workers               int
	retries               int
	fetchLimit            int
	maxCEFR               string
	publishExistingDrafts bool
	budget                *callBudget
}

type callBudget struct {
	limit int64
	used  atomic.Int64
}

func (b *callBudget) take() bool {
	if b == nil || b.limit <= 0 {
		return true
	}
	used := b.used.Add(1)
	if used <= b.limit {
		return true
	}
	b.used.Add(-1)
	return false
}

type counts struct {
	Published int
	Draft     int
	Queued    int
	Processed int
	Rejected  int
	// Diagnostics below answer two operational questions that the plain
	// counters cannot: whether new cards actually carry illustrations, and
	// whether the recommender has anything to recommend with. Both fail
	// silently — an empty feed looks exactly like a working one.
	WithImage    int
	QueuedImage  int
	WithEmbed    int
	Profiles     int
	WarmProfiles int
	Reactions    int
}

func main() {
	var (
		envPath       = flag.String("env", ".env", "path to the server environment file")
		target        = flag.Int("target", 1000, "minimum number of published cards")
		add           = flag.Int("add", 0, "publish exactly this many new cards from the selected sources")
		workers       = flag.Int("workers", 8, "parallel generation requests")
		retries       = flag.Int("retries", 4, "generation attempts per source item")
		model         = flag.String("model", "", "override the configured feed generation model")
		sourceCSV     = flag.String("sources", "", "comma-separated source slugs; empty selects every enabled source")
		maxCEFR       = flag.String("max-cefr", "", "reject generated cards above this CEFR level")
		maxCalls      = flag.Int64("max-calls", 0, "hard limit for paid generation calls; zero disables the limit")
		fetchLimit    = flag.Int("fetch-limit", 40, "maximum imported items per selected source")
		publishDrafts = flag.Bool("publish-existing-drafts", true, "publish valid existing drafts before generation")
		admin         = flag.String("admin", "deniskornilov12@gmail.com", "existing admin account recorded as creator")
		status        = flag.Bool("status", false, "print database counters and exit")
		backfill      = flag.Bool("backfill-embeddings", false,
			"compute missing embeddings for published cards and exit")
		resync = flag.Bool("resync", false,
			"collect a fresh pass from every source before generating")
	)
	flag.Parse()

	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, nil)))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load(*envPath)
	if err != nil {
		fatal(err)
	}
	openCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	st, err := store.Open(openCtx, cfg.DatabaseURL)
	cancel()
	if err != nil {
		fatal(err)
	}
	defer st.Close()

	if *status {
		current, err := readCounts(ctx, st)
		if err != nil {
			fatal(err)
		}
		printCounts(current)
		return
	}
	if *backfill {
		generator := feed.NewGenerator(
			cfg.FeedAIKey, cfg.FeedAIModel, cfg.FeedAIURL,
			cfg.FeedEmbeddingKey, cfg.FeedEmbeddingModel, cfg.FeedEmbeddingURL,
		)
		if !generator.EmbeddingsEnabled() {
			fatal(errors.New("embedding model is not configured"))
		}
		if err := backfillEmbeddings(ctx, st, generator); err != nil {
			fatal(err)
		}
		return
	}
	if *target < 1 || *add < 0 || *workers < 1 || *workers > 24 || *retries < 1 || *retries > 8 ||
		*fetchLimit < 1 || *fetchLimit > 200 || *maxCalls < 0 {
		fatal(errors.New("invalid target, add, workers, retries, fetch limit, or call budget"))
	}
	if *maxCEFR != "" && !slices.Contains([]string{"A1", "A2", "B1", "B2", "C1"}, strings.ToUpper(*maxCEFR)) {
		fatal(errors.New("max-cefr must be A1, A2, B1, B2, or C1"))
	}
	user, err := st.UserByEmail(ctx, *admin)
	if err != nil {
		fatal(fmt.Errorf("load admin: %w", err))
	}
	if !user.IsAdmin {
		fatal(fmt.Errorf("%s is not an administrator", user.Email))
	}

	selectedModel := cfg.FeedAIModel
	if strings.TrimSpace(*model) != "" {
		selectedModel = strings.TrimSpace(*model)
	}
	generator := feed.NewGenerator(
		cfg.FeedAIKey, selectedModel, cfg.FeedAIURL,
		cfg.FeedEmbeddingKey, cfg.FeedEmbeddingModel, cfg.FeedEmbeddingURL,
	)
	if !generator.Enabled() {
		fatal(feed.ErrNotConfigured)
	}
	sources, err := st.ListMicroFeedSources(ctx)
	if err != nil {
		fatal(err)
	}
	sourceBySlug := make(map[string]*store.MicroFeedSource, len(sources))
	for i := range sources {
		source := &sources[i]
		sourceBySlug[source.Slug] = source
	}
	selectedSlugs := splitCSV(*sourceCSV)
	if len(selectedSlugs) > 0 {
		selected := make(map[string]*store.MicroFeedSource, len(selectedSlugs))
		for _, slug := range selectedSlugs {
			source := sourceBySlug[slug]
			if source == nil {
				fatal(fmt.Errorf("source %q is not registered", slug))
			}
			if !source.Enabled {
				fatal(fmt.Errorf("source %q is disabled", slug))
			}
			selected[slug] = source
		}
		sourceBySlug = selected
	}
	slog.Info("generation configured", "model", selectedModel, "sources", len(sourceBySlug),
		"max_cefr", strings.ToUpper(*maxCEFR), "max_calls", *maxCalls)

	// Принудительный сбор из источников.
	//
	// Обычный ensureQueue молчит, пока очередь заполнена, и это верно для
	// пропускной способности. Но заготовки, собранные до появления разбора
	// картинок, адреса картинок не имеют, а лежать в очереди могут сотнями:
	// пока они не кончатся, ни одна новая карточка иллюстрации не получит.
	// Свежий проход обновляет адрес у ещё не обработанных заготовок и добавляет
	// новые — они и уходят в работу первыми, очередь разбирается с новых.
	if *resync {
		if err := resyncSources(ctx, st, feed.NewSourceFetcher(), sourceBySlug, *fetchLimit); err != nil {
			fatal(err)
		}
	}

	opts := options{
		target: *target, add: *add, workers: *workers, retries: *retries,
		fetchLimit: *fetchLimit, maxCEFR: strings.ToUpper(*maxCEFR),
		publishExistingDrafts: *publishDrafts,
		budget:                &callBudget{limit: *maxCalls},
	}
	if err := fill(ctx, st, feed.NewSourceFetcher(), generator, sourceBySlug, user, opts); err != nil {
		fatal(err)
	}
}

func fill(
	ctx context.Context,
	st *store.Store,
	fetcher *feed.SourceFetcher,
	generator *feed.Generator,
	sources map[string]*store.MicroFeedSource,
	admin *store.User,
	opts options,
) error {
	current, err := readCounts(ctx, st)
	if err != nil {
		return err
	}
	printCounts(current)
	if opts.add > 0 {
		opts.target = current.Published + opts.add
		slog.Info("additive target fixed", "baseline", current.Published, "add", opts.add, "target", opts.target)
	}
	for current.Published < opts.target {
		if opts.publishExistingDrafts {
			if err := publishDrafts(ctx, st, opts.target-current.Published); err != nil {
				return err
			}
		}
		current, err = readCounts(ctx, st)
		if err != nil {
			return err
		}
		if current.Published >= opts.target {
			break
		}

		needed := opts.target - current.Published
		queueTarget := min(needed+max(40, opts.workers*4), 200)
		if err := ensureQueue(ctx, st, fetcher, sources, queueTarget, opts.fetchLimit); err != nil {
			return err
		}
		imports, err := st.ListMicroFeedImportsBySources(ctx, "queued", sourceSlugs(sources), min(200, needed))
		if err != nil {
			return err
		}
		if len(imports) == 0 {
			return errors.New("approved sources did not yield any queued material")
		}
		result, generationErr := generateBatch(ctx, st, generator, sources, admin, imports, opts)
		slog.Info("batch completed", "published", result.published, "rejected", result.rejected)
		if generationErr != nil {
			return generationErr
		}
		current, err = readCounts(ctx, st)
		if err != nil {
			return err
		}
		printCounts(current)
	}
	slog.Info("feed target reached", "published", current.Published, "target", opts.target)
	return nil
}

// resyncSources проходит по всем источникам один раз, не глядя на глубину
// очереди.
func resyncSources(
	ctx context.Context,
	st *store.Store,
	fetcher *feed.SourceFetcher,
	sources map[string]*store.MicroFeedSource,
	limit int,
) error {
	saved := 0
	for _, source := range sources {
		if !source.Enabled || (source.SourceKind != "rss" && source.SourceKind != "mediawiki") {
			continue
		}
		fetchCtx, cancel := context.WithTimeout(ctx, 35*time.Second)
		items, err := fetcher.Fetch(fetchCtx, source, limit)
		cancel()
		if err != nil {
			slog.Warn("source sync failed", "source", source.Slug, "err", err)
			continue
		}
		withImage := 0
		for _, item := range items {
			if item.ImageURL != "" {
				withImage++
			}
		}
		count, err := st.SaveMicroFeedImports(ctx, source.Slug, items)
		if err != nil {
			return fmt.Errorf("save imports from %s: %w", source.Slug, err)
		}
		saved += count
		slog.Info("source synced",
			"source", source.Slug, "fetched", len(items),
			"saved", count, "with_image", withImage)
		time.Sleep(150 * time.Millisecond)
	}
	slog.Info("resync finished", "saved", saved)
	return nil
}

func ensureQueue(
	ctx context.Context,
	st *store.Store,
	fetcher *feed.SourceFetcher,
	sources map[string]*store.MicroFeedSource,
	target int,
	fetchLimit int,
) error {
	stalled := 0
	for round := 1; ; round++ {
		queued, err := queuedForSources(ctx, st, sourceSlugs(sources))
		if err != nil {
			return err
		}
		if queued >= target {
			return nil
		}
		before := queued
		for _, source := range sources {
			if !source.Enabled || (source.SourceKind != "rss" && source.SourceKind != "mediawiki") {
				continue
			}
			fetchCtx, cancel := context.WithTimeout(ctx, 35*time.Second)
			items, fetchErr := fetcher.Fetch(fetchCtx, source, fetchLimit)
			cancel()
			if fetchErr != nil {
				slog.Warn("source sync failed", "source", source.Slug, "err", fetchErr)
				continue
			}
			if _, saveErr := st.SaveMicroFeedImports(ctx, source.Slug, items); saveErr != nil {
				return fmt.Errorf("save imports from %s: %w", source.Slug, saveErr)
			}
			time.Sleep(150 * time.Millisecond)
		}
		after, err := queuedForSources(ctx, st, sourceSlugs(sources))
		if err != nil {
			return err
		}
		slog.Info("source round completed", "round", round, "queued", after, "target", target)
		if after <= before {
			stalled++
		} else {
			stalled = 0
		}
		if stalled >= 8 {
			return fmt.Errorf("source queue stopped growing at %d items", after)
		}
	}
}

type batchResult struct {
	published int64
	rejected  int64
}

func generateBatch(
	ctx context.Context,
	st *store.Store,
	generator *feed.Generator,
	sources map[string]*store.MicroFeedSource,
	admin *store.User,
	imports []store.MicroFeedImport,
	opts options,
) (batchResult, error) {
	jobs := make(chan store.MicroFeedImport)
	var published atomic.Int64
	var rejected atomic.Int64
	var budgetExhausted atomic.Bool
	var wg sync.WaitGroup
	for worker := 1; worker <= opts.workers; worker++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for input := range jobs {
				if budgetExhausted.Load() {
					continue
				}
				source := sources[input.SourceSlug]
				if source == nil {
					reject(ctx, st, input, errors.New("source is missing"), &rejected)
					continue
				}
				var item *store.MicroFeedItem
				var err error
				retryHint := ""
				for attempt := 1; attempt <= opts.retries; attempt++ {
					if !opts.budget.take() {
						budgetExhausted.Store(true)
						break
					}
					item, err = generator.GenerateAtLevelWithHint(ctx, &input, source, opts.maxCEFR, retryHint)
					if err == nil {
						break
					}
					retryHint = err.Error()
					slog.Warn("generation attempt failed", "worker", worker, "source", input.SourceSlug,
						"import", input.ID, "attempt", attempt, "err", err)
					if attempt < opts.retries {
						time.Sleep(time.Duration(attempt*attempt) * time.Second)
					}
				}
				if budgetExhausted.Load() {
					continue
				}
				if err != nil {
					reject(ctx, st, input, err, &rejected)
					continue
				}
				// Профиль карточки считается здесь же. Без него рекомендатель
				// подбирает похожее вслепую: карточка без embedding попадает
				// только в «случайную» часть ленты. Пока наполнитель сохранял
				// nil, такими были почти все карточки — раздел выглядел
				// работающим, а подбор молча не работал.
				//
				// Неудача не отменяет карточку: доступность ленты важнее
				// качества подбора, а профиль можно дозаполнить позже
				// (-backfill-embeddings).
				var embedding []float32
				if generator.EmbeddingsEnabled() {
					vector, embedErr := generator.Embed(ctx, item)
					if embedErr != nil {
						slog.Warn("card has no embedding", "import", input.ID, "err", embedErr)
					} else {
						embedding = vector
					}
				}
				created, err := st.CreateMicroFeedItem(ctx, item, admin.ID, embedding)
				if err == nil {
					_, err = st.PublishMicroFeedItem(ctx, created.ID)
				}
				if err != nil {
					slog.Error("save or publish failed", "worker", worker, "import", input.ID, "err", err)
					continue
				}
				count := published.Add(1)
				if count%10 == 0 {
					slog.Info("generation progress", "batch_published", count, "batch_size", len(imports))
				}
			}
		}(worker)
	}
	for _, input := range imports {
		select {
		case jobs <- input:
		case <-ctx.Done():
			break
		}
	}
	close(jobs)
	wg.Wait()
	result := batchResult{published: published.Load(), rejected: rejected.Load()}
	if budgetExhausted.Load() {
		return result, fmt.Errorf("paid generation call budget exhausted after %d calls", opts.budget.used.Load())
	}
	return result, nil
}

func splitCSV(value string) []string {
	seen := make(map[string]bool)
	result := make([]string, 0)
	for _, part := range strings.Split(value, ",") {
		part = strings.TrimSpace(part)
		if part == "" || seen[part] {
			continue
		}
		seen[part] = true
		result = append(result, part)
	}
	return result
}

func sourceSlugs(sources map[string]*store.MicroFeedSource) []string {
	result := make([]string, 0, len(sources))
	for slug := range sources {
		result = append(result, slug)
	}
	slices.Sort(result)
	return result
}

func queuedForSources(ctx context.Context, st *store.Store, slugs []string) (int, error) {
	var count int
	err := st.Pool.QueryRow(ctx, `
		SELECT count(*) FROM micro_feed_imports
		WHERE status = 'queued'
		  AND (cardinality($1::text[]) = 0 OR source_slug = ANY($1::text[]))`, slugs).Scan(&count)
	return count, err
}

func reject(ctx context.Context, st *store.Store, input store.MicroFeedImport, cause error, counter *atomic.Int64) {
	reason := "automatic generation failed: " + cause.Error()
	if len(reason) > 480 {
		reason = reason[:480]
	}
	if err := st.RejectMicroFeedImport(ctx, input.ID, reason); err != nil {
		slog.Error("reject failed import", "import", input.ID, "err", err)
		return
	}
	counter.Add(1)
}

func publishDrafts(ctx context.Context, st *store.Store, limit int) error {
	for limit > 0 {
		drafts, err := st.ListAdminMicroFeedItems(ctx, "draft", min(200, limit))
		if err != nil {
			return err
		}
		if len(drafts) == 0 {
			return nil
		}
		for _, item := range drafts {
			if err := feed.ValidateItem(&item); err != nil {
				slog.Warn("invalid draft left unpublished", "item", item.ID, "err", err)
				continue
			}
			if _, err := st.PublishMicroFeedItem(ctx, item.ID); err != nil {
				return err
			}
			limit--
		}
	}
	return nil
}

// backfillEmbeddings досчитывает профили уже опубликованным карточкам.
//
// Идёт по одной и последовательно: это разовая операция, спешить некуда, а
// параллельные запросы к чужому API ради неё — лишний риск упереться в предел
// частоты и получить половину дозаполненной ленты.
func backfillEmbeddings(ctx context.Context, st *store.Store, generator *feed.Generator) error {
	done, failed := 0, 0
	for {
		items, err := st.MicroFeedItemsWithoutEmbedding(ctx, 100)
		if err != nil {
			return err
		}
		if len(items) == 0 {
			slog.Info("backfill finished", "embedded", done, "failed", failed)
			return nil
		}
		before := done
		for i := range items {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			vector, err := generator.Embed(ctx, &items[i])
			if err != nil {
				slog.Warn("embedding failed", "item", items[i].ID, "err", err)
				failed++
				continue
			}
			if err := st.SetMicroFeedEmbedding(ctx, items[i].ID, vector); err != nil {
				return err
			}
			done++
			if done%25 == 0 {
				slog.Info("backfill progress", "embedded", done, "failed", failed)
			}
		}
		// Ни одна карточка из порции не поддалась — следующая выборка вернёт
		// ту же сотню, и цикл не кончится никогда.
		if done == before {
			return fmt.Errorf("не удалось посчитать ни одного профиля из %d", len(items))
		}
	}
}

func readCounts(ctx context.Context, st *store.Store) (counts, error) {
	var result counts
	queries := []struct {
		query string
		value *int
	}{
		{`SELECT count(*) FROM micro_feed_content_items WHERE status='published'`, &result.Published},
		{`SELECT count(*) FROM micro_feed_content_items WHERE status='draft'`, &result.Draft},
		{`SELECT count(*) FROM micro_feed_imports WHERE status='queued'`, &result.Queued},
		{`SELECT count(*) FROM micro_feed_imports WHERE status='processed'`, &result.Processed},
		{`SELECT count(*) FROM micro_feed_imports WHERE status='rejected'`, &result.Rejected},
		{`SELECT count(*) FROM micro_feed_content_items
		   WHERE status='published' AND coalesce(image_url,'') <> ''`, &result.WithImage},
		{`SELECT count(*) FROM micro_feed_imports
		   WHERE status='queued' AND coalesce(image_url,'') <> ''`, &result.QueuedImage},
		{`SELECT count(*) FROM micro_feed_content_items
		   WHERE status='published' AND embedding IS NOT NULL`, &result.WithEmbed},
		{`SELECT count(*) FROM micro_feed_profiles_embeddings`, &result.Profiles},
		{`SELECT count(*) FROM (
		     SELECT actor_key FROM micro_feed_reactions WHERE reaction=1
		      GROUP BY actor_key HAVING count(*) >= 3
		   ) warm`, &result.WarmProfiles},
		{`SELECT count(*) FROM micro_feed_reactions`, &result.Reactions},
	}
	for _, query := range queries {
		if err := st.Pool.QueryRow(ctx, query.query).Scan(query.value); err != nil {
			return counts{}, err
		}
	}
	return result, nil
}

func printCounts(value counts) {
	slog.Info("feed status",
		"published", value.Published,
		"draft", value.Draft,
		"queued", value.Queued,
		"processed", value.Processed,
		"rejected", value.Rejected,
		"with_image", value.WithImage,
		"queued_with_image", value.QueuedImage,
		"with_embedding", value.WithEmbed,
		"profiles", value.Profiles,
		"warm_profiles", value.WarmProfiles,
		"reactions", value.Reactions,
	)
}

func fatal(err error) {
	slog.Error("feedfill failed", "err", err)
	os.Exit(1)
}
