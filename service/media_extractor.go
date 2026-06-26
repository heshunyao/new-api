package service

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type ExtractorConfig struct {
	Image *ImageExtractorConfig `json:"image,omitempty"`
	Video *VideoExtractorConfig `json:"video,omitempty"`
}

type ImageExtractorConfig struct {
	URLPaths     []string `json:"url_paths"`
	B64JSONPaths []string `json:"b64_json_paths"`
}

type VideoExtractorConfig struct {
	TaskIDPaths   []string `json:"task_id_paths"`
	URLPaths      []string `json:"url_paths"`
	StatusPath    string   `json:"status_path"`
	SuccessValues []string `json:"success_values"`
	FailValues    []string `json:"fail_values"`
	ReasonPath    string   `json:"reason_path,omitempty"`
}

type MediaExtractor struct {
	cfg *ExtractorConfig
}

func GetMediaExtractor(modelName string) (*MediaExtractor, error) {
	var m struct {
		UrlExtractor string
	}
	if err := model.DB.Table("models").
		Select("url_extractor").
		Where("model_name = ?", modelName).
		First(&m).Error; err != nil {
		return nil, fmt.Errorf("model %s not found: %w", modelName, err)
	}
	if m.UrlExtractor == "" {
		return nil, fmt.Errorf("model %s has no url_extractor config", modelName)
	}
	var cfg ExtractorConfig
	if err := common.UnmarshalJsonStr(m.UrlExtractor, &cfg); err != nil {
		return nil, fmt.Errorf("parse url_extractor failed for %s: %w", modelName, err)
	}
	return &MediaExtractor{cfg: &cfg}, nil
}

func (e *MediaExtractor) ExtractImageURL(body []byte) (string, error) {
	if e.cfg.Image == nil || len(e.cfg.Image.URLPaths) == 0 {
		return "", fmt.Errorf("no image url_paths config")
	}
	url, err := e.extractFirstValidURL(body, e.cfg.Image.URLPaths)
	if err != nil {
		return "", err
	}
	if looksLikeBase64Image(url) {
		return "", fmt.Errorf("extracted value looks like base64 image data, not a URL")
	}
	return url, nil
}

func looksLikeBase64Image(s string) bool {
	s = strings.TrimSpace(s)
	if len(s) < 20 {
		return false
	}
	if strings.HasPrefix(s, "data:image") {
		return true
	}
	raw := s
	if idx := strings.Index(raw, "://"); idx != -1 {
		raw = raw[idx+3:]
	}
	if len(raw) < 20 {
		return false
	}
	base64Prefixes := []string{
		"iVBORw0KGgo",
		"/9j/",
		"Qk",
		"UklGR",
	}
	for _, p := range base64Prefixes {
		if strings.HasPrefix(raw, p) {
			return true
		}
	}
	return false
}

func isValidURL(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	return strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://")
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func (e *MediaExtractor) ExtractImageB64JSON(body []byte) (string, error) {
	if e.cfg.Image == nil || len(e.cfg.Image.B64JSONPaths) == 0 {
		return "", fmt.Errorf("no image b64_json_paths config")
	}
	data, err := e.parseBody(body)
	if err != nil {
		return "", err
	}
	for _, path := range e.cfg.Image.B64JSONPaths {
		if b64 := e.extractStringByPath(data, path); b64 != "" {
			return b64, nil
		}
	}
	return "", fmt.Errorf("no b64_json found in response body")
}

func (e *MediaExtractor) ExtractVideoTaskID(body []byte) (string, error) {
	if e.cfg.Video == nil || len(e.cfg.Video.TaskIDPaths) == 0 {
		return "", fmt.Errorf("no video task_id_paths config")
	}
	return e.extractFirstValidURL(body, e.cfg.Video.TaskIDPaths)
}

func (e *MediaExtractor) ExtractVideoURL(body []byte) (string, error) {
	if e.cfg.Video == nil || len(e.cfg.Video.URLPaths) == 0 {
		return "", fmt.Errorf("no video url_paths config")
	}
	return e.extractFirstValidURL(body, e.cfg.Video.URLPaths)
}

func (e *MediaExtractor) GetVideoStatus(body []byte) (string, error) {
	if e.cfg.Video == nil || e.cfg.Video.StatusPath == "" {
		return "", fmt.Errorf("no video status_path config")
	}
	data, err := e.parseBody(body)
	if err != nil {
		return "", err
	}
	result, found := e.getValueByPath(data, e.cfg.Video.StatusPath)
	if !found {
		return "", nil
	}
	return fmt.Sprintf("%v", result), nil
}

func (e *MediaExtractor) IsVideoSuccess(body []byte) (bool, error) {
	status, err := e.GetVideoStatus(body)
	if err != nil {
		return false, err
	}
	if status == "" {
		return false, nil
	}
	for _, v := range e.cfg.Video.SuccessValues {
		if strings.EqualFold(status, v) {
			return true, nil
		}
	}
	return false, nil
}

func (e *MediaExtractor) IsVideoFail(body []byte) (bool, error) {
	status, err := e.GetVideoStatus(body)
	if err != nil {
		return false, err
	}
	if status == "" {
		return false, nil
	}
	for _, v := range e.cfg.Video.FailValues {
		if strings.EqualFold(status, v) {
			return true, nil
		}
	}
	return false, nil
}

func (e *MediaExtractor) ExtractFailReason(body []byte) string {
	if e.cfg.Video == nil || e.cfg.Video.ReasonPath == "" {
		return "task failed"
	}
	data, err := e.parseBody(body)
	if err != nil {
		return "task failed"
	}
	result, found := e.getValueByPath(data, e.cfg.Video.ReasonPath)
	if !found {
		return "task failed"
	}
	if s, ok := result.(string); ok && s != "" {
		return s
	}
	return "task failed"
}

func (e *MediaExtractor) extractFirstValidURL(body []byte, paths []string) (string, error) {
	data, err := e.parseBody(body)
	if err != nil {
		return "", err
	}

	for _, path := range paths {
		if url := e.extractStringByPath(data, path); url != "" {
			return e.normalizeURL(url), nil
		}
	}

	return e.extractURLByRegex(body)
}

func (e *MediaExtractor) extractStringByPath(data any, path string) string {
	result, found := e.getValueByPath(data, path)
	if !found {
		return ""
	}
	if s, ok := result.(string); ok && s != "" {
		return s
	}
	return ""
}

func (e *MediaExtractor) getValueByPath(data any, path string) (any, bool) {
	tokens := parsePath(path)
	return navigate(data, tokens)
}

func navigate(data any, tokens []any) (any, bool) {
	if len(tokens) == 0 {
		return data, true
	}

	tok := tokens[0]
	rest := tokens[1:]

	switch t := tok.(type) {
	case string:
		m, ok := data.(map[string]any)
		if !ok {
			return nil, false
		}
		next, ok := m[t]
		if !ok {
			return nil, false
		}
		return navigate(next, rest)

	case int:
		arr, ok := data.([]any)
		if !ok || t >= len(arr) {
			return nil, false
		}
		return navigate(arr[t], rest)

	case wildcardMarker:
		arr, ok := data.([]any)
		if !ok {
			return nil, false
		}
		if len(rest) == 0 {
			for _, item := range arr {
				if s, ok := item.(string); ok && s != "" {
					return s, true
				}
			}
			return nil, false
		}
		for _, item := range arr {
			if result, found := navigate(item, rest); found {
				if s, ok := result.(string); ok && s != "" {
					return s, true
				}
			}
		}
		return nil, false
	}

	return nil, false
}

type wildcardMarker struct{}

func parsePath(path string) []any {
	var tokens []any
	var sb strings.Builder

	for i := 0; i < len(path); i++ {
		ch := path[i]
		switch {
		case ch == '.':
			if sb.Len() > 0 {
				tokens = append(tokens, sb.String())
				sb.Reset()
			}
		case ch == '[':
			if sb.Len() > 0 {
				tokens = append(tokens, sb.String())
				sb.Reset()
			}
			j := i + 1
			for j < len(path) && path[j] != ']' {
				j++
			}
			inner := path[i+1 : j]
			if inner == "*" {
				tokens = append(tokens, wildcardMarker{})
			} else if idx, err := strconv.Atoi(inner); err == nil {
				tokens = append(tokens, idx)
			} else {
				tokens = append(tokens, inner)
			}
			i = j
		default:
			sb.WriteByte(ch)
		}
	}

	if sb.Len() > 0 {
		tokens = append(tokens, sb.String())
	}

	return tokens
}

var urlRegex = regexp.MustCompile(`https?://[^\s"'\]]+`)

func (e *MediaExtractor) extractURLByRegex(body []byte) (string, error) {
	matches := urlRegex.FindAllString(string(body), -1)
	for _, match := range matches {
		if strings.HasSuffix(match, ".jpg") ||
			strings.HasSuffix(match, ".jpeg") ||
			strings.HasSuffix(match, ".png") ||
			strings.HasSuffix(match, ".gif") ||
			strings.HasSuffix(match, ".webp") ||
			strings.HasSuffix(match, ".mp4") ||
			strings.HasSuffix(match, ".mov") ||
			strings.HasSuffix(match, ".webm") ||
			strings.HasSuffix(match, ".avi") {
			return match, nil
		}
	}
	if len(matches) > 0 {
		return matches[0], nil
	}
	return "", fmt.Errorf("no URL found in response body")
}

func (e *MediaExtractor) normalizeURL(url string) string {
	url = strings.TrimSpace(url)
	if url == "" {
		return ""
	}
	if !strings.HasPrefix(url, "http") {
		url = "https://" + url
	}
	return url
}

func (e *MediaExtractor) parseBody(body []byte) (any, error) {
	var data any
	if err := common.Unmarshal(body, &data); err != nil {
		return nil, fmt.Errorf("unmarshal response body failed: %w", err)
	}
	return data, nil
}
