// Package media creates narrowly scoped S3 upload policies for lesson images.
package media

import (
	"context"
	"errors"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Config struct {
	Endpoint, Region, Bucket, AccessKey, SecretKey, PublicBaseURL string
}

type Service struct {
	client     *minio.Client
	bucket     string
	publicBase string
}

type UploadPolicy struct {
	URL       string            `json:"url"`
	Fields    map[string]string `json:"fields"`
	PublicURL string            `json:"publicUrl"`
	ExpiresAt time.Time         `json:"expiresAt"`
}

func New(cfg Config) (*Service, error) {
	values := []string{cfg.Endpoint, cfg.Bucket, cfg.AccessKey, cfg.SecretKey, cfg.PublicBaseURL}
	configured := false
	for _, value := range values {
		configured = configured || strings.TrimSpace(value) != ""
	}
	if !configured {
		return nil, nil
	}
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			return nil, errors.New("S3 настроен не полностью")
		}
	}
	u, err := url.Parse(cfg.Endpoint)
	if err != nil || u.Host == "" {
		return nil, errors.New("неверный S3_ENDPOINT")
	}
	client, err := minio.New(u.Host, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: u.Scheme == "https", Region: cfg.Region,
	})
	if err != nil {
		return nil, err
	}
	return &Service{client: client, bucket: cfg.Bucket, publicBase: strings.TrimRight(cfg.PublicBaseURL, "/")}, nil
}

func (s *Service) CreateUploadPolicy(ctx context.Context, owner uuid.UUID, mimeType string, size int64) (*UploadPolicy, error) {
	ext := map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}[mimeType]
	if ext == "" {
		return nil, errors.New("поддерживаются JPEG, PNG, WebP и GIF")
	}
	if size < 1 || size > 10<<20 {
		return nil, errors.New("изображение должно быть не больше 10 МБ")
	}
	key := path.Join("lessons", owner.String(), time.Now().UTC().Format("2006/01"), uuid.NewString()+"."+ext)
	expires := time.Now().UTC().Add(10 * time.Minute)
	policy := minio.NewPostPolicy()
	if err := policy.SetBucket(s.bucket); err != nil {
		return nil, err
	}
	if err := policy.SetKey(key); err != nil {
		return nil, err
	}
	if err := policy.SetExpires(expires); err != nil {
		return nil, err
	}
	if err := policy.SetContentType(mimeType); err != nil {
		return nil, err
	}
	if err := policy.SetContentLengthRange(size, size); err != nil {
		return nil, err
	}
	u, fields, err := s.client.PresignedPostPolicy(ctx, policy)
	if err != nil {
		return nil, err
	}
	return &UploadPolicy{URL: u.String(), Fields: fields, PublicURL: s.publicBase + "/" + key, ExpiresAt: expires}, nil
}
