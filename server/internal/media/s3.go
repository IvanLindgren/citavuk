// Package media creates narrowly scoped S3 upload policies for lesson images.
package media

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	awss3 "github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

type Config struct {
	Endpoint, Region, Bucket, AccessKey, SecretKey, PublicBaseURL string
}

type Service struct {
	bucket     string
	secretKey  string
	publicBase string
	s3         *awss3.Client
}

type UploadPolicy struct {
	URL       string            `json:"url"`
	Method    string            `json:"method"`
	Headers   map[string]string `json:"headers"`
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
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, errors.New("S3_ENDPOINT должен начинаться с http:// или https://")
	}
	httpClient := &http.Client{Timeout: 10 * time.Second}
	awsCfg, err := awsconfig.LoadDefaultConfig(
		context.Background(),
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, "")),
		awsconfig.WithHTTPClient(httpClient),
	)
	if err != nil {
		return nil, fmt.Errorf("configure S3 client: %w", err)
	}
	service := &Service{
		bucket:     cfg.Bucket,
		secretKey:  cfg.SecretKey,
		publicBase: strings.TrimRight(cfg.PublicBaseURL, "/"),
	}
	service.s3 = awss3.NewFromConfig(awsCfg, func(options *awss3.Options) {
		options.BaseEndpoint = aws.String(u.String())
		options.UsePathStyle = true
	})
	return service, nil
}

func (s *Service) CreateUploadPolicy(ctx context.Context, owner uuid.UUID, sha256Hex, mimeType string, size int64) (*UploadPolicy, error) {
	ext, err := imageExtension(mimeType, size)
	if err != nil {
		return nil, err
	}
	if !isHex64(sha256Hex) {
		return nil, errors.New("нужен sha256 картинки в шестнадцатеричном виде")
	}
	key := path.Join("lessons", owner.String(), time.Now().UTC().Format("2006/01"), uuid.NewString()+"."+ext)
	return s.policyFor(ctx, key, sha256Hex, mimeType)
}

// BookImagePolicy выдаёт политику загрузки картинки из книги пользователя.
//
// Ключ считается от содержимого, а не случайный. Это важнее, чем кажется:
// адрес книги при синхронизации считается от её абзацев, а адреса картинок
// лежат прямо в них. Со случайным ключом одна и та же книга, добавленная на
// телефоне и на компьютере, получила бы разные адреса картинок, разный адрес
// содержимого — и превратилась бы в две разные книги вместо одной.
//
// Владелец остаётся в пути намеренно. Общий на всех ключ по хешу дал бы
// дедупликацию, но вместе с ней и возможность занять чужой ключ: политика
// закрепляет имя файла, а не его содержимое, и подложить под известный хеш
// другую картинку никто бы не помешал.
func (s *Service) BookImagePolicy(
	ctx context.Context,
	owner uuid.UUID,
	sha256Hex, mimeType string,
	size int64,
) (*UploadPolicy, bool, error) {
	ext, err := imageExtension(mimeType, size)
	if err != nil {
		return nil, false, err
	}
	if !isHex64(sha256Hex) {
		return nil, false, errors.New("нужен sha256 картинки в шестнадцатеричном виде")
	}

	key := path.Join("books", owner.String(), sha256Hex+"."+ext)
	// Повторный импорт той же книги не должен заново заливать её картинки.
	if s.objectExists(ctx, key) {
		return &UploadPolicy{PublicURL: s.publicBase + "/" + key}, true, nil
	}

	policy, err := s.policyFor(ctx, key, sha256Hex, mimeType)
	if err != nil {
		return nil, false, err
	}
	return policy, false, nil
}

func imageExtension(mimeType string, size int64) (string, error) {
	ext := map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}[mimeType]
	if ext == "" {
		return "", errors.New("поддерживаются JPEG, PNG, WebP и GIF")
	}
	if size < 1 || size > 10<<20 {
		return "", errors.New("изображение должно быть не больше 10 МБ")
	}
	return ext, nil
}

func isHex64(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, r := range value {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return false
		}
	}
	return true
}

func (s *Service) policyFor(_ context.Context, key, sha256Hex, mimeType string) (*UploadPolicy, error) {
	expires := time.Now().UTC().Add(10 * time.Minute)
	query := url.Values{
		"key":       {key},
		"sha256":    {sha256Hex},
		"mime":      {mimeType},
		"expires":   {fmt.Sprint(expires.Unix())},
		"signature": {s.uploadSignature(key, sha256Hex, mimeType, expires.Unix())},
	}
	return &UploadPolicy{
		URL:       "/v1/media/upload?" + query.Encode(),
		Method:    http.MethodPut,
		Headers:   map[string]string{"Content-Type": mimeType},
		PublicURL: s.publicBase + "/" + key,
		ExpiresAt: expires,
	}, nil
}

func (s *Service) uploadSignature(key, sha256Hex, mimeType string, expires int64) string {
	mac := hmac.New(sha256.New, []byte(s.secretKey))
	fmt.Fprintf(mac, "%s\n%s\n%s\n%d", key, sha256Hex, mimeType, expires)
	return hex.EncodeToString(mac.Sum(nil))
}

// Upload проверяет короткоживущий билет и содержимое, затем отправляет файл в
// S3 с сервера. Так браузер не зависит от CORS S3-провайдера.
func (s *Service) Upload(
	ctx context.Context,
	owner uuid.UUID,
	key, sha256Hex, mimeType string,
	expires int64,
	signature string,
	data []byte,
) error {
	if time.Now().UTC().Unix() > expires {
		return errors.New("ссылка загрузки истекла")
	}
	wantSignature := s.uploadSignature(key, sha256Hex, mimeType, expires)
	if subtle.ConstantTimeCompare([]byte(signature), []byte(wantSignature)) != 1 {
		return errors.New("неверная подпись загрузки")
	}
	ownerPart := "/" + owner.String() + "/"
	if (!strings.HasPrefix(key, "lessons/") && !strings.HasPrefix(key, "books/")) ||
		!strings.Contains("/"+key, ownerPart) {
		return errors.New("файл не принадлежит пользователю")
	}
	if _, err := imageExtension(mimeType, int64(len(data))); err != nil {
		return err
	}
	digest := sha256.Sum256(data)
	if hex.EncodeToString(digest[:]) != sha256Hex {
		return errors.New("содержимое файла не совпадает с заявленным sha256")
	}

	_, err := s.s3.PutObject(ctx, &awss3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		Body:          bytes.NewReader(data),
		ContentLength: aws.Int64(int64(len(data))),
		ContentType:   aws.String(mimeType),
	})
	if err != nil {
		return fmt.Errorf("S3 upload failed: %w", err)
	}
	return nil
}

func (s *Service) objectExists(ctx context.Context, key string) bool {
	_, err := s.s3.HeadObject(ctx, &awss3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err == nil
}
