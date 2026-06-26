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
	"github.com/QuantumNous/new-api/dto"
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

	origWriter := c.Writer
	buf := &bytes.Buffer{}
	c.Writer = &silentResponseWriter{
		ResponseWriter: origWriter,
		buf:            buf,
	}

	Relay(c, types.RelayFormatOpenAIImage)

	c.Writer = origWriter
	responseBody := buf.Bytes()

	ext, extErr := service.GetMediaExtractor(req.Model)
	if extErr == nil {
		url, urlErr := ext.ExtractImageURL(responseBody)
		if urlErr == nil && url != "" {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": []gin.H{
					{"url": url},
				},
			})
			return
		}
		b64, b64Err := ext.ExtractImageB64JSON(responseBody)
		if b64Err == nil && b64 != "" {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": []gin.H{
					{"b64_json": b64},
				},
			})
			return
		}
	}

	c.Data(http.StatusOK, "application/json", responseBody)
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

	// 调试：检查渠道设置
	channelSetting := channel.GetSetting()
	common.SysLog(fmt.Sprintf("DEBUG: channel %d setting proxy: %s", channel.Id, channelSetting.Proxy))

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

	// 用 silentResponseWriter 拦截 RelayTaskSubmit 内部的 c.JSON 写入，避免双次响应
	originalWriter := c.Writer
	silentWriter := &silentResponseWriter{
		ResponseWriter: originalWriter,
		buf:            bytes.NewBuffer(nil),
		hdrs:           make(http.Header),
	}
	c.Writer = silentWriter

	result, taskErr := relay.RelayTaskSubmit(c, relayInfo)

	// 恢复原始 writer
	c.Writer = originalWriter

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

	// 保存任务到数据库
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

	// 同步等待视频生成完成
	videoURL, taskErr := waitForVideoCompletion(c, &channel, task, result.Platform, req.Model)
	if taskErr != nil {
		c.JSON(taskErr.StatusCode, gin.H{
			"success": false,
			"message": taskErr.Message,
		})
		return
	}

	// 将 url 直接添加到任务数据中返回
	var taskData map[string]interface{}
	if result.TaskData != nil {
		if err := common.Unmarshal(result.TaskData, &taskData); err != nil {
			common.SysError("unmarshal task data error: " + err.Error())
			taskData = make(map[string]interface{})
		}
	} else {
		taskData = make(map[string]interface{})
	}
	taskData["url"] = videoURL

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    taskData,
	})
}

// waitForVideoCompletion 同步等待视频生成完成，使用 MediaExtractor 保证多模型通用性
func waitForVideoCompletion(c *gin.Context, ch *model.Channel, task *model.Task, platform constant.TaskPlatform, modelName string) (string, *dto.TaskError) {
	adaptor := relay.GetTaskAdaptor(platform)
	if adaptor == nil {
		return "", service.TaskErrorWrapperLocal(fmt.Errorf("adaptor not found for platform %s", platform), "adaptor_not_found", http.StatusInternalServerError)
	}

	info := &relaycommon.RelayInfo{}
	info.ChannelMeta = &relaycommon.ChannelMeta{
		ChannelBaseUrl: ch.GetBaseURL(),
		ChannelType:    ch.Type,
		ApiKey:         ch.Key,
	}
	adaptor.Init(info)

	proxy := ch.GetSetting().Proxy
	baseURL := ch.GetBaseURL()

	extractor, extractorErr := service.GetMediaExtractor(modelName)

	timeout := time.After(10 * time.Minute)
	pollInterval := time.NewTicker(15 * time.Second)
	defer pollInterval.Stop()

	for {
		select {
		case <-pollInterval.C:
			resp, err := adaptor.FetchTask(baseURL, ch.Key, map[string]any{
				"task_id": task.GetUpstreamTaskID(),
				"action":  task.Action,
			}, proxy)
			if err != nil {
				common.SysLog(fmt.Sprintf("waitForVideoCompletion FetchTask error: %v", err))
				continue
			}
			defer resp.Body.Close()

			responseBody, err := io.ReadAll(resp.Body)
			if err != nil {
				common.SysLog(fmt.Sprintf("waitForVideoCompletion read body error: %v", err))
				continue
			}

			if extractorErr == nil && extractor != nil {
				isSuccess, _ := extractor.IsVideoSuccess(responseBody)
				isFail, _ := extractor.IsVideoFail(responseBody)

				if isSuccess {
					videoURL, urlErr := extractor.ExtractVideoURL(responseBody)
					if urlErr == nil && videoURL != "" {
						task.Status = model.TaskStatusSuccess
						task.Progress = "100%"
						task.FinishTime = time.Now().Unix()
						task.Data = responseBody
						task.PrivateData.ResultURL = videoURL
						_ = task.Update()
						return videoURL, nil
					}
				}

				if isFail {
					reason := extractor.ExtractFailReason(responseBody)
					task.Status = model.TaskStatusFailure
					task.Progress = "100%"
					task.FinishTime = time.Now().Unix()
					task.FailReason = reason
					task.Data = responseBody
					_ = task.Update()
					return "", service.TaskErrorWrapperLocal(fmt.Errorf("video generation failed: %s", reason), "video_generation_failed", http.StatusInternalServerError)
				}

				status, _ := extractor.GetVideoStatus(responseBody)
				if status != "" {
					task.Status = model.TaskStatus(status)
					_ = task.Update()
				}
			} else {
				taskResult, parseErr := adaptor.ParseTaskResult(responseBody)
				if parseErr != nil {
					common.SysLog(fmt.Sprintf("waitForVideoCompletion ParseTaskResult error: %v", parseErr))
					continue
				}

				task.Status = model.TaskStatus(taskResult.Status)
				if taskResult.Status == model.TaskStatusSuccess {
					task.Progress = "100%"
					task.FinishTime = time.Now().Unix()
					if strings.HasPrefix(taskResult.Url, "http") {
						task.Data = responseBody
						task.PrivateData.ResultURL = taskResult.Url
						_ = task.Update()
						return taskResult.Url, nil
					}
				} else if taskResult.Status == model.TaskStatusFailure {
					task.Progress = "100%"
					task.FinishTime = time.Now().Unix()
					task.FailReason = taskResult.Reason
					task.Data = responseBody
					_ = task.Update()
					return "", service.TaskErrorWrapperLocal(fmt.Errorf("video generation failed: %s", taskResult.Reason), "video_generation_failed", http.StatusInternalServerError)
				}
				_ = task.Update()
			}

		case <-timeout:
			return "", service.TaskErrorWrapperLocal(fmt.Errorf("video generation timeout after 10 minutes"), "timeout", http.StatusRequestTimeout)
		}
	}
}

// PlaygroundVideoStatus 轮询查询视频生成状态
func PlaygroundVideoStatus(c *gin.Context) {
	taskID := c.Param("task_id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "task_id is required",
		})
		return
	}

	// 从数据库查询任务
	var task model.Task
	if err := model.DB.Where("task_id = ?", taskID).First(&task).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "task not found",
		})
		return
	}

	// 如果已完成或失败，直接返回结果
	if task.Status == model.TaskStatusSuccess {
		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"status":   task.Status,
			"progress": task.Progress,
			"data": []gin.H{
				{"url": task.PrivateData.ResultURL},
			},
		})
		return
	}

	if task.Status == model.TaskStatusFailure {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"status":  task.Status,
			"message": task.FailReason,
		})
		return
	}

	// 查询上游 API 获取最新状态
	upstreamTaskID := task.PrivateData.UpstreamTaskID
	if upstreamTaskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "upstream task id not found",
		})
		return
	}

	// 获取任务的 channel 信息
	platform := task.Platform
	adaptor := relay.GetTaskAdaptor(platform)
	if adaptor == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "adaptor not found for platform: " + string(platform),
		})
		return
	}

	// 获取 channel 的 baseURL 和 proxy
	var channel model.Channel
	if err := model.DB.Where("id = ?", task.ChannelId).First(&channel).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "channel not found",
		})
		return
	}

	baseURL := constant.ChannelBaseURLs[channel.Type]
	if channel.GetBaseURL() != "" {
		baseURL = channel.GetBaseURL()
	}
	proxy := channel.GetSetting().Proxy
	apiKey := channel.Key

	// 调用上游 API 查询状态
	resp, err := adaptor.FetchTask(baseURL, apiKey, map[string]any{
		"task_id": upstreamTaskID,
		"action":  task.Action,
	}, proxy)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"status":   task.Status,
			"progress": task.Progress,
			"message":  "查询失败，请稍后重试",
		})
		return
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"status":   task.Status,
			"progress": task.Progress,
			"message":  "读取响应失败，请稍后重试",
		})
		return
	}

	// 更新任务数据
	task.Data = responseBody

	// 获取 MediaExtractor（优先用 BillingContext 中的模型名）
	modelName := ""
	if task.PrivateData.BillingContext != nil {
		modelName = task.PrivateData.BillingContext.OriginModelName
	}
	if modelName == "" {
		modelName = task.Properties.OriginModelName
	}
	ext, _ := service.GetMediaExtractor(modelName)

	if ext != nil {
		isSuccess, _ := ext.IsVideoSuccess(responseBody)
		if isSuccess {
			task.Status = model.TaskStatusSuccess
			task.Progress = "100%"
			task.FinishTime = time.Now().Unix()
			videoURL, _ := ext.ExtractVideoURL(responseBody)
			if videoURL != "" {
				task.PrivateData.ResultURL = videoURL
			}
			_ = task.Update()
			c.JSON(http.StatusOK, gin.H{
				"success":  true,
				"status":   string(task.Status),
				"progress": task.Progress,
				"data": []gin.H{
					{"url": task.PrivateData.ResultURL},
				},
			})
			return
		}

		isFail, _ := ext.IsVideoFail(responseBody)
		if isFail {
			task.Status = model.TaskStatusFailure
			task.Progress = "100%"
			task.FinishTime = time.Now().Unix()
			task.FailReason = ext.ExtractFailReason(responseBody)
			_ = task.Update()
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"status":  string(task.Status),
				"message": task.FailReason,
			})
			return
		}

		status, _ := ext.GetVideoStatus(responseBody)
		if status != "" {
			task.Status = model.TaskStatus(status)
			if task.StartTime == 0 {
				task.StartTime = time.Now().Unix()
			}
			_ = task.Update()
		}
	} else {
		taskResult, parseErr := adaptor.ParseTaskResult(responseBody)
		if parseErr == nil {
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
				}
				_ = task.Update()
				c.JSON(http.StatusOK, gin.H{
					"success":  true,
					"status":   string(task.Status),
					"progress": task.Progress,
					"data": []gin.H{
						{"url": task.PrivateData.ResultURL},
					},
				})
				return
			case string(model.TaskStatusFailure):
				task.Status = model.TaskStatusFailure
				task.Progress = "100%"
				task.FinishTime = time.Now().Unix()
				task.FailReason = taskResult.Reason
				_ = task.Update()
				c.JSON(http.StatusOK, gin.H{
					"success": false,
					"status":  string(task.Status),
					"message": task.FailReason,
				})
				return
			}
		}
	}

	// 返回当前状态
	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"status":   task.Status,
		"progress": task.Progress,
		"message":  "视频生成中，请继续轮询",
	})
}

type silentResponseWriter struct {
	gin.ResponseWriter
	buf      *bytes.Buffer
	status   int
	hdrs     http.Header
	wroteHdr bool
}

func (w *silentResponseWriter) Header() http.Header {
	if w.hdrs == nil {
		w.hdrs = make(http.Header)
	}
	return w.hdrs
}

func (w *silentResponseWriter) Write(data []byte) (int, error) {
	if !w.wroteHdr {
		w.WriteHeader(http.StatusOK)
	}
	return w.buf.Write(data)
}

func (w *silentResponseWriter) WriteHeader(statusCode int) {
	if w.wroteHdr {
		return
	}
	w.status = statusCode
	w.wroteHdr = true
}

func (w *silentResponseWriter) WriteHeaderNow() {
}

func (w *silentResponseWriter) Status() int {
	if w.status == 0 {
		return http.StatusOK
	}
	return w.status
}

func (w *silentResponseWriter) Size() int {
	return w.buf.Len()
}

func (w *silentResponseWriter) Written() bool {
	return w.buf.Len() > 0 || w.wroteHdr
}
