package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"
)

const maxRemoteDocumentBytes = 32 << 20

var blockedDocumentNetworks = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("127.0.0.0/8"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("224.0.0.0/4"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("100::/64"),
	netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("fc00::/7"),
	netip.MustParsePrefix("fe80::/10"),
	netip.MustParsePrefix("ff00::/8"),
}

func newDocumentHTTPClient() *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{
		ForceAttemptHTTP2: true,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, fmt.Errorf("некорректный адрес документа: %w", err)
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, fmt.Errorf("не удалось найти сервер документа: %w", err)
			}
			var lastErr error
			for _, candidate := range ips {
				if !isPublicDocumentIP(candidate.IP) {
					continue
				}
				conn, dialErr := dialer.DialContext(
					ctx,
					network,
					net.JoinHostPort(candidate.IP.String(), port),
				)
				if dialErr == nil {
					return conn, nil
				}
				lastErr = dialErr
			}
			if lastErr != nil {
				return nil, lastErr
			}
			return nil, errors.New("адрес документа недоступен")
		},
		ResponseHeaderTimeout: 20 * time.Second,
		IdleConnTimeout:       60 * time.Second,
	}
	return &http.Client{
		Transport: transport,
		Timeout:   45 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("слишком много перенаправлений")
			}
			return validateRemoteDocumentURL(req.URL)
		},
	}
}

func (s *Server) handleDocumentFetch(w http.ResponseWriter, r *http.Request) {
	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	parsed, err := url.Parse(rawURL)
	if err != nil || validateRemoteDocumentURL(parsed) != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Укажите публичную ссылку на TXT, Markdown, PDF или DOCX.")
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, parsed.String(), nil)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Некорректная ссылка.")
		return
	}
	req.Header.Set("Accept", strings.Join([]string{
		"application/pdf",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"text/plain",
		"text/markdown",
		"application/octet-stream;q=0.5",
	}, ", "))
	req.Header.Set("User-Agent", "Citavuk/1.0 document importer")

	resp, err := s.documentHTTP.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, codeInternal,
			"Не удалось скачать документ по этой ссылке.")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		writeError(w, http.StatusBadGateway, codeInternal,
			"Сайт с документом ответил кодом "+strconv.Itoa(resp.StatusCode)+".")
		return
	}
	if resp.ContentLength > maxRemoteDocumentBytes {
		writeError(w, http.StatusRequestEntityTooLarge, codeBadRequest,
			"Документ больше 32 МБ.")
		return
	}

	filename := remoteDocumentFilename(resp)
	contentType := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if !supportedRemoteDocument(contentType, filename) {
		writeError(w, http.StatusUnsupportedMediaType, codeBadRequest,
			"По ссылке не найден TXT, Markdown, PDF или DOCX.")
		return
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxRemoteDocumentBytes+1))
	if err != nil {
		writeError(w, http.StatusBadGateway, codeInternal,
			"Не удалось прочитать скачанный документ.")
		return
	}
	if len(body) > maxRemoteDocumentBytes {
		writeError(w, http.StatusRequestEntityTooLarge, codeBadRequest,
			"Документ больше 32 МБ.")
		return
	}

	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType(
		"attachment",
		map[string]string{"filename": filename},
	))
	w.Header().Set("X-Citavuk-Filename", filename)
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func validateRemoteDocumentURL(candidate *url.URL) error {
	if candidate == nil ||
		(candidate.Scheme != "http" && candidate.Scheme != "https") ||
		candidate.Hostname() == "" ||
		candidate.User != nil {
		return errors.New("разрешены только публичные HTTP(S)-ссылки")
	}
	return nil
}

func isPublicDocumentIP(ip net.IP) bool {
	address, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	address = address.Unmap()
	if !address.IsGlobalUnicast() {
		return false
	}
	for _, network := range blockedDocumentNetworks {
		if network.Contains(address) {
			return false
		}
	}
	return true
}

func remoteDocumentFilename(resp *http.Response) string {
	if disposition := resp.Header.Get("Content-Disposition"); disposition != "" {
		if _, params, err := mime.ParseMediaType(disposition); err == nil {
			if filename := cleanRemoteFilename(params["filename"]); filename != "" {
				return filename
			}
		}
	}
	if filename := cleanRemoteFilename(path.Base(resp.Request.URL.Path)); filename != "" {
		return filename
	}
	return "document.txt"
}

func cleanRemoteFilename(value string) string {
	value, _ = url.PathUnescape(value)
	value = path.Base(strings.ReplaceAll(value, "\\", "/"))
	value = strings.Map(func(r rune) rune {
		if r < 32 || r == '"' || r == ';' {
			return -1
		}
		return r
	}, strings.TrimSpace(value))
	if value == "" || value == "." || value == "/" {
		return ""
	}
	if len(value) > 180 {
		value = value[:180]
	}
	return value
}

func supportedRemoteDocument(contentType, filename string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	}
	extension := strings.ToLower(path.Ext(filename))
	switch mediaType {
	case "application/pdf",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"text/plain",
		"text/markdown",
		"text/x-markdown":
		return true
	case "application/octet-stream", "binary/octet-stream", "application/zip":
		return extension == ".pdf" || extension == ".docx" ||
			extension == ".txt" || extension == ".md"
	default:
		return false
	}
}
