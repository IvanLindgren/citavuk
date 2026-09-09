package store

import (
	"context"

	"github.com/google/uuid"
)

// Видео не имеют embeddings, а просмотр не равен одобрению. Подбор читает
// только реакции на видео и реальные досмотры; текстовая история не подменяет
// видеоинтересы. Один ролик даёт один сигнал досмотра, а не вес за каждый повтор.
func (s *Store) listRecommendedVideos(ctx context.Context, actor string, exclude []uuid.UUID, limit int, profile microProfile) ([]MicroFeedItem, string, error) {
	rows, err := s.Pool.Query(ctx, `
		WITH events AS (
			SELECT item_id,
			       bool_or(event='complete') AS completed,
			       bool_or(event='quick_skip') AS skipped
			FROM micro_feed_interactions
			WHERE actor_key=$1 AND created_at > now()-interval '90 days'
			  AND event IN ('complete','quick_skip')
			GROUP BY item_id
		), comments AS (
			SELECT DISTINCT item_id FROM micro_feed_comments
			WHERE user_id=$6 AND deleted_at IS NULL AND created_at > now()-interval '90 days'
		), signals AS (
			SELECT i.id, i.category, i.source_title, i.tags,
			  CASE WHEN r.reaction=-1 THEN -6
			       ELSE COALESCE(r.reaction,0)*6
			         + CASE WHEN e.completed THEN 2 WHEN e.skipped THEN -1 ELSE 0 END
			         + CASE WHEN c.item_id IS NOT NULL THEN 4 ELSE 0 END END AS weight
			FROM micro_feed_content_items i
			LEFT JOIN micro_feed_reactions r ON r.item_id=i.id AND r.actor_key=$1
			LEFT JOIN events e ON e.item_id=i.id
			LEFT JOIN comments c ON c.item_id=i.id
			WHERE i.kind='video' AND (r.reaction IS NOT NULL OR e.item_id IS NOT NULL OR c.item_id IS NOT NULL)
		), candidates AS (
			SELECT i.id,
			 COALESCE((SELECT sum(s.weight * (
			   CASE WHEN s.category=i.category THEN 2 ELSE 0 END
			   + CASE WHEN s.source_title<>'' AND s.source_title=i.source_title THEN 3 ELSE 0 END
			   + CASE WHEN s.tags && i.tags THEN 1 ELSE 0 END)) FROM signals s),0)
			 + CASE WHEN i.category=ANY($5::text[]) THEN 2 ELSE 0 END AS affinity
			FROM micro_feed_content_items i
			WHERE i.status='published' AND i.kind='video' AND i.video_language_confirmed
			 AND array_position(ARRAY['A1','A2','B1','B2','C1'],i.cefr)<=$4
			 AND NOT(i.id=ANY($2::uuid[]))
			 AND NOT EXISTS(SELECT 1 FROM micro_feed_reactions r WHERE r.actor_key=$1 AND r.item_id=i.id AND r.reaction=-1)
			 AND NOT EXISTS(SELECT 1 FROM micro_feed_interactions e WHERE e.actor_key=$1 AND e.item_id=i.id
			   AND e.created_at>now()-interval '14 days' AND e.event IN ('view','quick_skip','complete'))
		)
		SELECT `+microFeedItemColumns+`
		FROM candidates c JOIN micro_feed_content_items i ON i.id=c.id
		LEFT JOIN micro_feed_reactions r ON r.item_id=i.id AND r.actor_key=$1
		ORDER BY c.affinity DESC,
		  (i.cefr=$7) DESC,
		  ln(2+i.likes_count*3+i.comments_count*4)-i.dislikes_count*.5 DESC,
		  md5(i.id::text || $1 || current_date::text)
		LIMIT $3`, actor, exclude, limit*16, maxFeedLevelIndex(profile.CEFR), nonNilStrings(profile.Declared), actorUserID(actor), profile.CEFR)
	if err != nil {
		return nil, "cold", err
	}
	items, err := collectMicroFeedItems(rows)
	rows.Close()
	if err != nil {
		return nil, "cold", err
	}
	strategy := "cold"
	var hasSignals bool
	err = s.Pool.QueryRow(ctx, `SELECT EXISTS(
		SELECT 1 FROM micro_feed_content_items i WHERE i.kind='video' AND (
		 EXISTS(SELECT 1 FROM micro_feed_reactions r WHERE r.item_id=i.id AND r.actor_key=$1)
		 OR EXISTS(SELECT 1 FROM micro_feed_interactions e WHERE e.item_id=i.id AND e.actor_key=$1
		   AND e.event IN ('complete','quick_skip') AND e.created_at>now()-interval '90 days')
		 OR EXISTS(SELECT 1 FROM micro_feed_comments c WHERE c.item_id=i.id AND c.user_id=$2 AND c.deleted_at IS NULL)
		))`, actor, actorUserID(actor)).Scan(&hasSignals)
	if err != nil {
		return nil, strategy, err
	}
	if hasSignals {
		strategy = "personalized"
	} else if len(profile.Declared) > 0 {
		strategy = "declared"
	}
	// Сохраняем самый подходящий ролик первым, дальше разводим авторов в
	// ограниченном пуле. Маленький пул заполнялся одним массово загруженным
	// каналом, и другой автор никогда не доходил до перестановки.
	result := diversifyVideos(items, limit)
	// Одно место остаётся для открытия нового. Дизлайк конкретного ролика
	// исключает его и из исследования, а не только из основной выдачи.
	if len(result) >= 4 {
		omit := append(append([]uuid.UUID{}, exclude...), videoIDs(result)...)
		explore, exploreErr := s.microFeedCandidates(ctx, actor, omit, "explore", profile, 4)
		if exploreErr != nil {
			return nil, strategy, exploreErr
		}
		for _, item := range explore {
			if item.Reaction != -1 {
				result[len(result)-1] = item
				break
			}
		}
	}
	return result, strategy, nil
}

func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func videoIDs(items []MicroFeedItem) []uuid.UUID {
	ids := make([]uuid.UUID, len(items))
	for n, item := range items {
		ids[n] = item.ID
	}
	return ids
}

func diversifyVideos(items []MicroFeedItem, limit int) []MicroFeedItem {
	pool := append([]MicroFeedItem{}, items...)
	result := make([]MicroFeedItem, 0, min(limit, len(pool)))
	for len(pool) > 0 && len(result) < limit {
		pick := 0
		if len(result) > 0 {
			last := result[len(result)-1]
			for n := 0; n < len(pool); n++ {
				if pool[n].SourceTitle != last.SourceTitle {
					pick = n
					break
				}
			}
		}
		result = append(result, pool[pick])
		pool = append(pool[:pick], pool[pick+1:]...)
	}
	return result
}
