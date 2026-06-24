package controller

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func Playground(c *gin.Context) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToOpenAIError(),
			})
		}
	}()

	useAccessToken := c.GetBool("use_access_token")
	if useAccessToken {
		newAPIError = types.NewError(errors.New("暂不支持使用 access token"), types.ErrorCodeAccessDenied, types.ErrOptionWithSkipRetry())
		return
	}

	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAI, nil, nil)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	userId := c.GetInt("id")

	userCache, err := model.GetUserCache(userId)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		return
	}
	userCache.WriteContext(c)

	tempToken := &model.Token{
		UserId: userId,
		Name:   fmt.Sprintf("playground-%s", relayInfo.UsingGroup),
		Group:  relayInfo.UsingGroup,
	}
	_ = middleware.SetupContextForToken(c, tempToken)

	Relay(c, types.RelayFormatOpenAI)
}

func PlaygroundImage(c *gin.Context) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToOpenAIError(),
			})
		}
	}()

	useAccessToken := c.GetBool("use_access_token")
	if useAccessToken {
		newAPIError = types.NewError(errors.New("暂不支持使用 access token"), types.ErrorCodeAccessDenied, types.ErrOptionWithSkipRetry())
		return
	}

	userId := c.GetInt("id")

	userCache, err := model.GetUserCache(userId)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		return
	}
	userCache.WriteContext(c)

	var req struct {
		Model string `json:"model"`
		Group string `json:"group"`
	}
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	if req.Model == "" {
		newAPIError = types.NewError(errors.New("model is required"), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	var modelMeta model.Model
	if err := model.DB.Where("model_name = ?", req.Model).First(&modelMeta).Error; err != nil {
		newAPIError = types.NewError(fmt.Errorf("model not found: %w", err), types.ErrorCodeModelNotFound, types.ErrOptionWithSkipRetry())
		return
	}

	var channel model.Channel
	if err := model.DB.Where("models LIKE ? AND status = 1", "%"+modelMeta.ModelName+"%").First(&channel).Error; err != nil {
		newAPIError = types.NewError(fmt.Errorf("no available channel for model %s: %w", modelMeta.ModelName, err), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
		return
	}

	c.Set("relay_mode", relayconstant.RelayModeImagesGenerations)

	common.SetContextKey(c, constant.ContextKeyOriginalModel, modelMeta.ModelName)
	common.SetContextKey(c, constant.ContextKeyUsingGroup, req.Group)
	if modelMeta.Endpoints != "" {
		common.SetContextKey(c, constant.ContextKeyModelEndpoints, modelMeta.Endpoints)
	}

	if setupErr := middleware.SetupContextForSelectedChannel(c, &channel, modelMeta.ModelName); setupErr != nil {
		newAPIError = setupErr
		return
	}

	tempToken := &model.Token{
		UserId: userId,
		Name:   fmt.Sprintf("playground-image"),
		Group:  req.Group,
	}
	_ = middleware.SetupContextForToken(c, tempToken)

	Relay(c, types.RelayFormatOpenAIImage)
}

func PlaygroundVideo(c *gin.Context) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToOpenAIError(),
			})
		}
	}()

	useAccessToken := c.GetBool("use_access_token")
	if useAccessToken {
		newAPIError = types.NewError(errors.New("暂不支持使用 access token"), types.ErrorCodeAccessDenied, types.ErrOptionWithSkipRetry())
		return
	}

	userId := c.GetInt("id")

	userCache, err := model.GetUserCache(userId)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		return
	}
	userCache.WriteContext(c)

	var req struct {
		Model      string `json:"model"`
		Group      string `json:"group"`
		Prompt     string `json:"prompt"`
		Duration   int    `json:"duration"`
		FPS        int    `json:"fps"`
		Resolution string `json:"resolution"`
	}
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	// 转换分辨率格式：前端 "1280 x 720" -> Agnes API "720p"
	resolutionChanged := false
	switch req.Resolution {
	case "1280 x 720", "1920 x 1080", "3840 x 2160":
		parts := strings.Split(req.Resolution, " x ")
		if len(parts) == 2 {
			height := parts[1]
			switch height {
			case "720":
				req.Resolution = "720p"
				resolutionChanged = true
			case "1080":
				req.Resolution = "1080p"
				resolutionChanged = true
			case "2160":
				req.Resolution = "1080p"
				resolutionChanged = true
			}
		}
	}

	// 如果分辨率被修改，写回请求体
	if resolutionChanged {
		bodyStorage, err := common.GetBodyStorage(c)
		if err == nil {
			origBody, err := bodyStorage.Bytes()
			if err == nil {
				var bodyMap map[string]any
				if err := common.Unmarshal(origBody, &bodyMap); err == nil {
					bodyMap["resolution"] = req.Resolution
					newBody, err := common.Marshal(bodyMap)
					if err == nil {
						newStorage, err := common.CreateBodyStorage(newBody)
						if err == nil {
							c.Set(common.KeyBodyStorage, newStorage)
						}
					}
				}
			}
		}
	}

	if req.Model == "" {
		newAPIError = types.NewError(errors.New("model is required"), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	if req.Prompt == "" {
		newAPIError = types.NewError(errors.New("prompt is required"), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	var modelMeta model.Model
	if err := model.DB.Where("model_name = ?", req.Model).First(&modelMeta).Error; err != nil {
		newAPIError = types.NewError(fmt.Errorf("model not found: %w", err), types.ErrorCodeModelNotFound, types.ErrOptionWithSkipRetry())
		return
	}

	var channel model.Channel
	if err := model.DB.Where("models LIKE ? AND status = 1", "%"+modelMeta.ModelName+"%").First(&channel).Error; err != nil {
		newAPIError = types.NewError(fmt.Errorf("no available channel for model %s: %w", modelMeta.ModelName, err), types.ErrorCodeGetChannelFailed, types.ErrOptionWithSkipRetry())
		return
	}

	// 设置 relay_mode 为视频提交模式
	c.Set("relay_mode", relayconstant.RelayModeVideoSubmit)

	common.SetContextKey(c, constant.ContextKeyOriginalModel, modelMeta.ModelName)
	common.SetContextKey(c, constant.ContextKeyUsingGroup, req.Group)
	if modelMeta.Endpoints != "" {
		common.SetContextKey(c, constant.ContextKeyModelEndpoints, modelMeta.Endpoints)
	}

	if setupErr := middleware.SetupContextForSelectedChannel(c, &channel, modelMeta.ModelName); setupErr != nil {
		newAPIError = setupErr
		return
	}

	tempToken := &model.Token{
		UserId: userId,
		Name:   fmt.Sprintf("playground-video"),
		Group:  req.Group,
	}
	_ = middleware.SetupContextForToken(c, tempToken)

	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatTask, nil, nil)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	origWriter := c.Writer
	buf := &bytes.Buffer{}
	c.Writer = &silentResponseWriter{
		ResponseWriter: origWriter,
		buf:            buf,
	}

	result, taskErr := relay.RelayTaskSubmit(c, relayInfo)

	c.Writer = origWriter

	if taskErr != nil {
		c.JSON(taskErr.StatusCode, gin.H{
			"success": false,
			"message": taskErr.Message,
		})
		return
	}

	if settleErr := service.SettleBilling(c, relayInfo, result.Quota); settleErr != nil {
		common.SysError("settle task billing error: " + settleErr.Error())
	}
	service.LogTaskConsumption(c, relayInfo)

	task := model.InitTask(result.Platform, relayInfo)
	task.PrivateData.UpstreamTaskID = result.UpstreamTaskID
	task.PrivateData.BillingSource = relayInfo.BillingSource
	task.PrivateData.SubscriptionId = relayInfo.SubscriptionId
	task.PrivateData.TokenId = relayInfo.TokenId
	task.PrivateData.BillingContext = &model.TaskBillingContext{
		ModelPrice:      relayInfo.PriceData.ModelPrice,
		GroupRatio:      relayInfo.PriceData.GroupRatioInfo.GroupRatio,
		ModelRatio:      relayInfo.PriceData.ModelRatio,
		OtherRatios:     relayInfo.PriceData.OtherRatios,
		OriginModelName: relayInfo.OriginModelName,
		PerCallBilling:  common.StringsContains(constant.TaskPricePatches, relayInfo.OriginModelName) || relayInfo.PriceData.UsePrice,
	}
	task.Quota = result.Quota
	task.Data = result.TaskData
	task.Action = relayInfo.Action
	if insertErr := task.Insert(); insertErr != nil {
		common.SysError("insert task error: " + insertErr.Error())
	}

	adaptor := relay.GetTaskAdaptor(result.Platform)
	baseURL := constant.ChannelBaseURLs[channel.Type]
	if channel.GetBaseURL() != "" {
		baseURL = channel.GetBaseURL()
	}
	proxy := channel.GetSetting().Proxy
	apiKey := channel.Key

	maxWaitTime := 10 * time.Minute
	pollInterval := 15 * time.Second
	startTime := time.Now()

	var finalVideoURL string
	for time.Since(startTime) < maxWaitTime {
		resp, err := adaptor.FetchTask(baseURL, apiKey, map[string]any{
			"task_id": result.UpstreamTaskID,
			"action":  relayInfo.Action,
		}, proxy)
		if err != nil {
			time.Sleep(pollInterval)
			continue
		}
		responseBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			time.Sleep(pollInterval)
			continue
		}

		taskResult, parseErr := adaptor.ParseTaskResult(responseBody)
		if parseErr != nil {
			time.Sleep(pollInterval)
			continue
		}

		task.Data = responseBody
		switch taskResult.Status {
		case string(model.TaskStatusQueued), string(model.TaskStatusSubmitted), string(model.TaskStatusInProgress):
			task.Status = model.TaskStatus(taskResult.Status)
			if taskResult.Progress != "" {
				task.Progress = taskResult.Progress
			}
			if task.StartTime == 0 && taskResult.Status == string(model.TaskStatusInProgress) {
				task.StartTime = time.Now().Unix()
			}
			_ = task.Update()
		case string(model.TaskStatusSuccess):
			task.Status = model.TaskStatusSuccess
			task.Progress = "100%"
			task.FinishTime = time.Now().Unix()
			if taskResult.Url != "" {
				task.PrivateData.ResultURL = taskResult.Url
			} else {
				task.PrivateData.ResultURL = fmt.Sprintf("/v1/videos/%s/content", task.TaskID)
			}
			_ = task.Update()
			finalVideoURL = task.PrivateData.ResultURL
			goto taskDone
		case string(model.TaskStatusFailure):
			task.Status = model.TaskStatusFailure
			task.Progress = "100%"
			task.FinishTime = time.Now().Unix()
			task.FailReason = taskResult.Reason
			_ = task.Update()
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": taskResult.Reason,
			})
			return
		default:
		}

		time.Sleep(pollInterval)
	}

taskDone:
	if finalVideoURL == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "视频生成超时",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": []gin.H{
			{
				"url": finalVideoURL,
			},
		},
	})
}

type silentResponseWriter struct {
	gin.ResponseWriter
	buf    *bytes.Buffer
	status int
}

func (w *silentResponseWriter) Write(data []byte) (int, error) {
	return w.buf.Write(data)
}

func (w *silentResponseWriter) WriteHeader(statusCode int) {
	w.status = statusCode
}

func (w *silentResponseWriter) WriteHeaderNow() {
}

func (w *silentResponseWriter) Status() int {
	return w.status
}

func (w *silentResponseWriter) Size() int {
	return w.buf.Len()
}

func (w *silentResponseWriter) Written() bool {
	return w.buf.Len() > 0 || w.status > 0
}
