package middleware

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

var defaultImagePath = `C:\Users\15815\Pictures\须达拏太子施象.png`

// ResponseRecorder 自定义响应记录器
type ResponseRecorder struct {
	gin.ResponseWriter
	Body *bytes.Buffer
	Code int
}

func (r *ResponseRecorder) Write(data []byte) (int, error) {
	r.Body.Write(data)
	return r.ResponseWriter.Write(data)
}

func (r *ResponseRecorder) WriteHeader(code int) {
	r.Code = code
	r.ResponseWriter.WriteHeader(code)
}

// PlaygroundImageFallback 中间件，用于处理图片生成接口的错误，返回默认图片
func PlaygroundImageFallback() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 只对 /images/generations 路径生效
		if !strings.Contains(c.Request.URL.Path, "/images/generations") {
			c.Next()
			return
		}

		// 创建响应拦截器
		recorder := &ResponseRecorder{
			Body:           &bytes.Buffer{},
			ResponseWriter: c.Writer,
		}
		c.Writer = recorder

		// 继续处理请求
		c.Next()

		// 检查响应状态码
		if recorder.Code == http.StatusForbidden || recorder.Code == http.StatusServiceUnavailable {
			// 解析响应体，检查是否是额度不足或无可用渠道错误
			bodyStr := recorder.Body.String()
			if bodyStr == "" {
				return
			}

			var resp map[string]interface{}
			if err := json.Unmarshal([]byte(bodyStr), &resp); err != nil {
				return
			}

			// 检查错误消息
			errObj, ok := resp["error"].(map[string]interface{})
			if !ok {
				return
			}
			message, ok := errObj["message"].(string)
			if !ok {
				return
			}

			if strings.Contains(message, "额度不足") || strings.Contains(message, "无可用渠道") {
				// 返回默认图片
				c.Header("Content-Type", "application/json")
				c.Status(http.StatusOK)

				defaultResp := gin.H{
					"created": 1782178956,
					"data": []gin.H{
						{
							"b64_json":      getDefaultImageBase64(),
							"revised_prompt": "默认图片（渠道不可用）",
						},
					},
					"background":    "auto",
					"output_format": "png",
					"quality":       "auto",
					"size":          "auto",
					"model":         "gpt-image-2-codex",
					"usage": gin.H{
						"input_tokens": 29,
						"input_tokens_details": gin.H{
							"image_tokens": 0,
							"text_tokens":  29,
						},
						"output_tokens": 2058,
						"output_tokens_details": gin.H{
							"image_tokens": 2058,
							"text_tokens":  0,
						},
						"total_tokens": 2087,
					},
				}

				c.JSON(http.StatusOK, defaultResp)
			}
		}
	}
}

// getDefaultImageBase64 读取默认图片并转换为 base64
func getDefaultImageBase64() string {
	data, err := os.ReadFile(defaultImagePath)
	if err != nil {
		// 如果文件不存在，返回一个简单的透明 PNG
		return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	}

	// 使用标准库 base64 编码
	return base64.StdEncoding.EncodeToString(data)
}
