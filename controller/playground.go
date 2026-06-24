package controller

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
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
		ModelID int    `json:"model_id"`
		Group   string `json:"group"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	if req.ModelID == 0 {
		newAPIError = types.NewError(errors.New("model_id is required"), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	var modelMeta model.Model
	if err := model.DB.Where("id = ?", req.ModelID).First(&modelMeta).Error; err != nil {
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
	common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, channel.GetBaseURL())
	common.SetContextKey(c, constant.ContextKeyChannelKey, channel.Key)
	if modelMeta.Endpoints != "" {
		common.SetContextKey(c, constant.ContextKeyModelEndpoints, modelMeta.Endpoints)
	}

	tempToken := &model.Token{
		UserId: userId,
		Name:   fmt.Sprintf("playground-image"),
		Group:  req.Group,
	}
	_ = middleware.SetupContextForToken(c, tempToken)

	Relay(c, types.RelayFormatOpenAIImage)
}
