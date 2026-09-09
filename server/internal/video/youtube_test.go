package video

import "testing"

func TestOnlyCanonicalYouTubeURLs(t *testing.T) {
	for _, raw := range []string{"https://youtu.be/Abc_123-xyz", "https://www.youtube.com/shorts/Abc_123-xyz?feature=share", "https://m.youtube.com/watch?v=Abc_123-xyz"} {
		if id, err := ID(raw); err != nil || id != "Abc_123-xyz" {
			t.Fatalf("%s: %s %v", raw, id, err)
		}
	}
	for _, raw := range []string{"http://youtu.be/Abc_123-xyz", "https://youtube.com.evil.test/watch?v=Abc_123-xyz", "https://youtube.com@127.0.0.1/watch?v=Abc_123-xyz", "https://youtube.com:443/watch?v=Abc_123-xyz", "https://127.0.0.1/watch?v=Abc_123-xyz", "https://youtu.be/short", "https://youtu.be/Abc_123-xyz/other", "javascript:alert(1)", "https://youtube.com/playlist?list=Abc_123-xyz"} {
		if _, err := ID(raw); err == nil {
			t.Fatalf("принят посторонний URL: %s", raw)
		}
	}
}
