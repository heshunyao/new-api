package dto

type PlayGroundRequest struct {
	Model string `json:"model,omitempty"`
	Group string `json:"group,omitempty"`
}

type PlayGroundImageRequest struct {
	Model           string   `json:"model,omitempty"`
	Group           string   `json:"group,omitempty"`
	Prompt          string   `json:"prompt,omitempty"`
	N               *uint    `json:"n,omitempty"`
	ReferenceImages []string `json:"referenceImages,omitempty"`
}

type PlayGroundImageResponse struct {
	Created       int64              `json:"created"`
	Data          []PlayGroundImageData `json:"data"`
	Background    string             `json:"background,omitempty"`
	OutputFormat  string             `json:"output_format,omitempty"`
	Quality       string             `json:"quality,omitempty"`
	Size          string             `json:"size,omitempty"`
	Model         string             `json:"model,omitempty"`
	Usage         *PlayGroundImageUsage `json:"usage,omitempty"`
}

type PlayGroundImageData struct {
	B64Json       string `json:"b64_json"`
	RevisedPrompt string `json:"revised_prompt"`
}

type PlayGroundImageUsage struct {
	InputTokens         int                      `json:"input_tokens"`
	InputTokensDetails  PlayGroundTokenDetails   `json:"input_tokens_details"`
	OutputTokens        int                      `json:"output_tokens"`
	OutputTokensDetails PlayGroundTokenDetails   `json:"output_tokens_details"`
	TotalTokens         int                      `json:"total_tokens"`
}

type PlayGroundTokenDetails struct {
	ImageTokens int `json:"image_tokens"`
	TextTokens  int `json:"text_tokens"`
}