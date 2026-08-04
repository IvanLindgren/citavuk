package media

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestUploadPolicyUsesAuthenticatedAPIRelay(t *testing.T) {
	service, err := New(Config{
		Endpoint:      "https://project.storage.supabase.co/storage/v1/s3",
		Region:        "eu-central-1",
		Bucket:        "citavuk",
		AccessKey:     "access",
		SecretKey:     "secret",
		PublicBaseURL: "https://project.supabase.co/storage/v1/object/public/citavuk",
	})
	if err != nil {
		t.Fatal(err)
	}

	policy, err := service.CreateUploadPolicy(
		context.Background(), uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		strings.Repeat("a", 64), "image/png", 128,
	)
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(policy.URL)
	if err != nil {
		t.Fatal(err)
	}
	if u.Path != "/v1/media/upload" {
		t.Fatalf("ожидался API relay, получен путь %q", u.Path)
	}
	if policy.Method != http.MethodPut {
		t.Fatalf("method = %q", policy.Method)
	}
	if policy.Headers["Content-Type"] != "image/png" {
		t.Fatalf("неверные подписанные заголовки: %#v", policy.Headers)
	}
	if u.Query().Get("signature") == "" || u.Query().Get("key") == "" {
		t.Fatal("в URL нет подписанного билета")
	}
}

func TestUploadRelaysVerifiedBytesToFullSupabasePath(t *testing.T) {
	var putPath, putHash string
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			putPath = r.URL.Path
			putHash = r.Header.Get("X-Amz-Content-Sha256")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.NotFound(w, r)
	}))
	defer storage.Close()

	service, err := New(Config{
		Endpoint: storage.URL + "/storage/v1/s3", Region: "local", Bucket: "citavuk",
		AccessKey: "access", SecretKey: "secret", PublicBaseURL: storage.URL + "/public/citavuk",
	})
	if err != nil {
		t.Fatal(err)
	}
	owner := uuid.MustParse("00000000-0000-0000-0000-000000000003")
	data := []byte("valid image bytes")
	digest := sha256.Sum256(data)
	hash := hex.EncodeToString(digest[:])
	policy, err := service.CreateUploadPolicy(context.Background(), owner, hash, "image/png", int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(policy.URL)
	expiresUnix, err := strconv.ParseInt(u.Query().Get("expires"), 10, 64)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Upload(
		context.Background(), owner, u.Query().Get("key"), hash, "image/png",
		expiresUnix, u.Query().Get("signature"), data,
	); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(putPath, "/storage/v1/s3/citavuk/lessons/"+owner.String()+"/") {
		t.Fatalf("PUT ушёл не на полный S3 endpoint: %q", putPath)
	}
	if putHash != hash {
		t.Fatalf("S3 получил sha256 %q, ожидался %q", putHash, hash)
	}
}

func TestBookImagePolicyChecksObjectAtFullEndpoint(t *testing.T) {
	var headPath string
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			headPath = r.URL.Path
		}
		http.NotFound(w, r)
	}))
	defer storage.Close()

	service, err := New(Config{
		Endpoint:      storage.URL + "/storage/v1/s3",
		Region:        "local",
		Bucket:        "citavuk",
		AccessKey:     "access",
		SecretKey:     "secret",
		PublicBaseURL: storage.URL + "/public/citavuk",
	})
	if err != nil {
		t.Fatal(err)
	}
	hash := strings.Repeat("b", 64)
	policy, uploaded, err := service.BookImagePolicy(
		context.Background(), uuid.MustParse("00000000-0000-0000-0000-000000000002"),
		hash, "image/webp", 256,
	)
	if err != nil {
		t.Fatal(err)
	}
	if uploaded {
		t.Fatal("несуществующий объект отмечен загруженным")
	}
	if !strings.HasPrefix(headPath, "/storage/v1/s3/citavuk/books/") {
		t.Fatalf("HEAD ушёл не на S3 endpoint: %q", headPath)
	}
	if policy.Method != http.MethodPut {
		t.Fatalf("method = %q", policy.Method)
	}
}
