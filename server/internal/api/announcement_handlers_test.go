package api

import "testing"

func TestValidateShareProofAcceptsSupportedHosts(t *testing.T) {
	tests := []struct{ network, url string }{
		{"instagram", "https://www.instagram.com/p/example/"},
		{"threads", "https://www.threads.net/@user/post/example"},
		{"facebook", "https://facebook.com/user/posts/example"},
		{"twitter", "https://x.com/user/status/123"},
		{"vk", "https://vk.com/wall1_2"},
		{"telegram", "https://t.me/channel/123"},
	}
	for _, test := range tests {
		if _, _, err := validateShareProof(test.network, test.url); err != nil {
			t.Errorf("%s: %v", test.network, err)
		}
	}
}

func TestValidateShareProofRejectsWrongOrDeceptiveHost(t *testing.T) {
	for _, raw := range []string{
		"http://vk.com/wall1_2",
		"https://vk.com.evil.example/wall1_2",
		"https://example.com/?next=https://t.me/channel/1",
	} {
		if _, _, err := validateShareProof("vk", raw); err == nil {
			t.Errorf("опасная ссылка принята: %s", raw)
		}
	}
}
