package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrAnnouncementNotFound = errors.New("announcement not found")

type Announcement struct {
	ID             uuid.UUID  `json:"id"`
	Status         string     `json:"status"`
	Kind           string     `json:"kind"`
	Title          string     `json:"title"`
	Body           string     `json:"body"`
	BannerText     string     `json:"bannerText"`
	ImageURL       string     `json:"imageUrl"`
	ActionLabel    string     `json:"actionLabel"`
	ActionURL      string     `json:"actionUrl"`
	StartsAt       *time.Time `json:"startsAt"`
	EndsAt         *time.Time `json:"endsAt"`
	BannerEnabled  bool       `json:"bannerEnabled"`
	NotifyUsers    bool       `json:"notifyUsers"`
	ShareRequired  bool       `json:"shareRequired"`
	ShareText      string     `json:"shareText"`
	RewardKey      string     `json:"rewardKey"`
	RewardAssetURL string     `json:"rewardAssetUrl"`
	PublishedAt    *time.Time `json:"publishedAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
	ReadAt         *time.Time `json:"readAt,omitempty"`
	DismissedAt    *time.Time `json:"dismissedAt,omitempty"`
	ClaimedAt      *time.Time `json:"claimedAt,omitempty"`
	SocialNetwork  string     `json:"socialNetwork,omitempty"`
	ProofURL       string     `json:"proofUrl,omitempty"`
	ClaimCount     int        `json:"claimCount,omitempty"`
}

type AnnouncementInput struct {
	Kind           string
	Title          string
	Body           string
	BannerText     string
	ImageURL       string
	ActionLabel    string
	ActionURL      string
	StartsAt       *time.Time
	EndsAt         *time.Time
	BannerEnabled  bool
	NotifyUsers    bool
	ShareRequired  bool
	ShareText      string
	RewardKey      string
	RewardAssetURL string
}

type UserNotification struct {
	ID        uuid.UUID  `json:"id"`
	Kind      string     `json:"kind"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	TargetURL string     `json:"targetUrl"`
	ReadAt    *time.Time `json:"readAt"`
	CreatedAt time.Time  `json:"createdAt"`
}

const announcementColumns = `
    a.id,a.status,a.kind,a.title,a.body,a.banner_text,a.image_url,
    a.action_label,a.action_url,a.starts_at,a.ends_at,a.banner_enabled,
    a.notify_users,a.share_required,a.share_text,a.reward_key,
    a.reward_asset_url,a.published_at,a.created_at,a.updated_at`

func scanAnnouncement(row pgx.Row, a *Announcement) error {
	return row.Scan(
		&a.ID, &a.Status, &a.Kind, &a.Title, &a.Body, &a.BannerText, &a.ImageURL,
		&a.ActionLabel, &a.ActionURL, &a.StartsAt, &a.EndsAt, &a.BannerEnabled,
		&a.NotifyUsers, &a.ShareRequired, &a.ShareText, &a.RewardKey,
		&a.RewardAssetURL, &a.PublishedAt, &a.CreatedAt, &a.UpdatedAt,
	)
}

func (s *Store) ListAdminAnnouncements(ctx context.Context) ([]Announcement, error) {
	rows, err := s.Pool.Query(ctx, `SELECT `+announcementColumns+`,
        (SELECT count(*) FROM user_announcement_states st
         WHERE st.announcement_id=a.id AND st.claimed_at IS NOT NULL)
        FROM announcements a ORDER BY a.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Announcement, 0)
	for rows.Next() {
		var a Announcement
		if err := rows.Scan(
			&a.ID, &a.Status, &a.Kind, &a.Title, &a.Body, &a.BannerText, &a.ImageURL,
			&a.ActionLabel, &a.ActionURL, &a.StartsAt, &a.EndsAt, &a.BannerEnabled,
			&a.NotifyUsers, &a.ShareRequired, &a.ShareText, &a.RewardKey,
			&a.RewardAssetURL, &a.PublishedAt, &a.CreatedAt, &a.UpdatedAt,
			&a.ClaimCount,
		); err != nil {
			return nil, err
		}
		items = append(items, a)
	}
	return items, rows.Err()
}

func (s *Store) CreateAnnouncement(ctx context.Context, adminID uuid.UUID, in AnnouncementInput) (*Announcement, error) {
	var a Announcement
	err := scanAnnouncement(s.Pool.QueryRow(ctx, `INSERT INTO announcements AS a (
        id,created_by,kind,title,body,banner_text,image_url,action_label,action_url,
        starts_at,ends_at,banner_enabled,notify_users,share_required,share_text,
        reward_key,reward_asset_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING `+announcementColumns,
		uuid.New(), adminID, in.Kind, in.Title, in.Body, in.BannerText, in.ImageURL,
		in.ActionLabel, in.ActionURL, in.StartsAt, in.EndsAt, in.BannerEnabled,
		in.NotifyUsers, in.ShareRequired, in.ShareText, in.RewardKey, in.RewardAssetURL,
	), &a)
	return &a, err
}

func (s *Store) UpdateAnnouncement(ctx context.Context, id uuid.UUID, in AnnouncementInput) (*Announcement, error) {
	var a Announcement
	err := scanAnnouncement(s.Pool.QueryRow(ctx, `UPDATE announcements a SET
        kind=$2,title=$3,body=$4,banner_text=$5,image_url=$6,action_label=$7,
        action_url=$8,starts_at=$9,ends_at=$10,banner_enabled=$11,notify_users=$12,
        share_required=$13,share_text=$14,reward_key=$15,reward_asset_url=$16,
        updated_at=now()
        WHERE a.id=$1 AND a.status='draft'
        RETURNING `+announcementColumns,
		id, in.Kind, in.Title, in.Body, in.BannerText, in.ImageURL, in.ActionLabel,
		in.ActionURL, in.StartsAt, in.EndsAt, in.BannerEnabled, in.NotifyUsers,
		in.ShareRequired, in.ShareText, in.RewardKey, in.RewardAssetURL,
	), &a)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAnnouncementNotFound
	}
	return &a, err
}

func (s *Store) PublishAnnouncement(ctx context.Context, id uuid.UUID) (*Announcement, error) {
	var published Announcement
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		err := scanAnnouncement(tx.QueryRow(ctx, `UPDATE announcements a SET
            status='published',published_at=now(),updated_at=now()
            WHERE a.id=$1 AND a.status='draft'
            RETURNING `+announcementColumns, id), &published)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrAnnouncementNotFound
		}
		if err != nil || !published.NotifyUsers {
			return err
		}

		rows, err := tx.Query(ctx, `SELECT id FROM users`)
		if err != nil {
			return err
		}
		var users []uuid.UUID
		for rows.Next() {
			var userID uuid.UUID
			if err := rows.Scan(&userID); err != nil {
				rows.Close()
				return err
			}
			users = append(users, userID)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		for _, userID := range users {
			if _, err := tx.Exec(ctx, `INSERT INTO user_notifications
                (id,user_id,kind,title,body,target_url)
                VALUES ($1,$2,'announcement',$3,$4,$5)`,
				uuid.New(), userID, published.Title, published.BannerText, published.ActionURL,
			); err != nil {
				return err
			}
		}
		return nil
	})
	return &published, err
}

func (s *Store) ArchiveAnnouncement(ctx context.Context, id uuid.UUID) error {
	result, err := s.Pool.Exec(ctx, `UPDATE announcements
        SET status='archived',updated_at=now() WHERE id=$1 AND status<>'archived'`, id)
	if err == nil && result.RowsAffected() == 0 {
		return ErrAnnouncementNotFound
	}
	return err
}

func (s *Store) ListActiveAnnouncements(ctx context.Context, userID uuid.UUID) ([]Announcement, error) {
	rows, err := s.Pool.Query(ctx, `SELECT `+announcementColumns+`,
        st.read_at,st.dismissed_at,st.claimed_at,
        coalesce(st.social_network,''),coalesce(st.proof_url,'')
        FROM announcements a
        LEFT JOIN user_announcement_states st
          ON st.announcement_id=a.id AND st.user_id=$1
        WHERE a.status='published'
          AND (a.starts_at IS NULL OR a.starts_at<=now())
          AND (a.ends_at IS NULL OR a.ends_at>now())
        ORDER BY a.published_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Announcement, 0)
	for rows.Next() {
		var a Announcement
		if err := rows.Scan(
			&a.ID, &a.Status, &a.Kind, &a.Title, &a.Body, &a.BannerText, &a.ImageURL,
			&a.ActionLabel, &a.ActionURL, &a.StartsAt, &a.EndsAt, &a.BannerEnabled,
			&a.NotifyUsers, &a.ShareRequired, &a.ShareText, &a.RewardKey,
			&a.RewardAssetURL, &a.PublishedAt, &a.CreatedAt, &a.UpdatedAt,
			&a.ReadAt, &a.DismissedAt, &a.ClaimedAt, &a.SocialNetwork, &a.ProofURL,
		); err != nil {
			return nil, err
		}
		items = append(items, a)
	}
	return items, rows.Err()
}

func (s *Store) SetAnnouncementState(ctx context.Context, announcementID, userID uuid.UUID, dismiss bool) error {
	_, err := s.Pool.Exec(ctx, `INSERT INTO user_announcement_states
        (announcement_id,user_id,read_at,dismissed_at)
        SELECT id,$2,now(),CASE WHEN $3 THEN now() ELSE NULL END
        FROM announcements WHERE id=$1 AND status='published'
        ON CONFLICT (announcement_id,user_id) DO UPDATE SET
          read_at=coalesce(user_announcement_states.read_at,now()),
          dismissed_at=CASE WHEN $3 THEN now() ELSE user_announcement_states.dismissed_at END`,
		announcementID, userID, dismiss)
	return err
}

func (s *Store) ClaimAnnouncement(ctx context.Context, announcementID, userID uuid.UUID, network, proofURL string) (string, string, error) {
	var rewardKey, rewardAssetURL string
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `SELECT reward_key,reward_asset_url
            FROM announcements WHERE id=$1 AND status='published' AND share_required
              AND reward_key<>''
              AND (starts_at IS NULL OR starts_at<=now())
              AND (ends_at IS NULL OR ends_at>now())`, announcementID).
			Scan(&rewardKey, &rewardAssetURL); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrAnnouncementNotFound
			}
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO user_announcement_states
            (announcement_id,user_id,read_at,claimed_at,social_network,proof_url)
            VALUES ($1,$2,now(),now(),$3,$4)
            ON CONFLICT (announcement_id,user_id) DO UPDATE SET
              read_at=coalesce(user_announcement_states.read_at,now()),
              claimed_at=coalesce(user_announcement_states.claimed_at,now()),
              social_network=EXCLUDED.social_network,
              proof_url=EXCLUDED.proof_url`, announcementID, userID, network, proofURL)
		return err
	})
	return rewardKey, rewardAssetURL, err
}

func (s *Store) ListUserNotifications(ctx context.Context, userID uuid.UUID, limit int) ([]UserNotification, int, error) {
	if limit < 1 || limit > 100 {
		limit = 40
	}
	rows, err := s.Pool.Query(ctx, `SELECT id,kind,title,body,target_url,read_at,created_at
        FROM user_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]UserNotification, 0)
	for rows.Next() {
		var item UserNotification
		if err := rows.Scan(&item.ID, &item.Kind, &item.Title, &item.Body, &item.TargetURL, &item.ReadAt, &item.CreatedAt); err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var unread int
	if err := s.Pool.QueryRow(ctx, `SELECT count(*) FROM user_notifications
        WHERE user_id=$1 AND read_at IS NULL`, userID).Scan(&unread); err != nil {
		return nil, 0, err
	}
	return items, unread, nil
}

func (s *Store) ReadNotification(ctx context.Context, id, userID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `UPDATE user_notifications SET read_at=coalesce(read_at,now())
        WHERE id=$1 AND user_id=$2`, id, userID)
	return err
}

func (s *Store) ReadAllNotifications(ctx context.Context, userID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `UPDATE user_notifications SET read_at=now()
        WHERE user_id=$1 AND read_at IS NULL`, userID)
	return err
}
