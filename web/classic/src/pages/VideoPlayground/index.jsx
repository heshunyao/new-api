/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout, Toast, Select, Button, TextArea } from '@douyinfe/semi-ui';
import { Video, Download, RefreshCw, Loader2, Play, Sparkles, Layers, Package } from 'lucide-react';
import { API } from '../../helpers/api';
import { getUserIdFromLocalStorage } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { UserContext } from '../../context/User';
import { API_ENDPOINTS } from '../../constants/playground.constants';

const VideoPlayground = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [userState] = useContext(UserContext);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('agnes-video-v2.0');
  const [duration, setDuration] = useState('4');
  const [fps, setFps] = useState('30');
  const [resolution, setResolution] = useState('1280 x 720');
  const [models, setModels] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [generatedVideos, setGeneratedVideos] = useState([]);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [referenceImages, setReferenceImages] = useState([]);
  const [isTextToVideo, setIsTextToVideo] = useState(true);
  const fileInputRef = useRef(null);

  const loadModels = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get(API_ENDPOINTS.USER_MODELS);
      const { success, data } = res.data;
      if (success && Array.isArray(data)) {
        const modelOptions = data.map((m) => ({
          label: m.model_name || m,
          value: m.model_name || m,
        }));
        setModels(modelOptions);
        if (modelOptions.length > 0) {
          const hasCurrentModel = modelOptions.some((opt) => opt.value === model);
          if (!hasCurrentModel) {
            setModel(modelOptions[0].value);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      setLoading(false);
    }
  }, [model]);

  const loadGroups = useCallback(async () => {
    try {
      const res = await API.get(API_ENDPOINTS.USER_GROUPS);
      const { success, data } = res.data;
      if (success && data) {
        const groupOptions = Object.entries(data).map(([group, info]) => ({
          label: group,
          value: group,
          ratio: info.ratio,
          desc: info.desc,
        }));
        setGroups(groupOptions);
        if (groupOptions.length > 0) {
          const userGroup = userState?.user?.group;
          const defaultGroup = userGroup && groupOptions.some((g) => g.value === userGroup)
            ? userGroup
            : groupOptions[0].value;
          setSelectedGroup(defaultGroup);
        }
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  }, [userState?.user?.group]);

  useEffect(() => {
    if (userState?.user) {
      loadModels();
      loadGroups();
    }
  }, [userState?.user, loadModels, loadGroups]);

  const filteredModels = models;

  const handleUploadRefImage = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (referenceImages.length >= 1) {
      Toast.warning(t('最多上传1张参考图'));
      return;
    }

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      setReferenceImages([ev.target.result]);
      setIsTextToVideo(false);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveRefImage = () => {
    setReferenceImages([]);
    setIsTextToVideo(true);
  };

  const clearRefImages = () => {
    setReferenceImages([]);
    setIsTextToVideo(true);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      Toast.warning(t('请输入提示词'));
      return;
    }

    try {
      setGenerating(true);
      const body = {
        model: model || 'kling-v1',
        group: selectedGroup || 'default',
        prompt,
        duration: parseInt(duration),
        fps: parseInt(fps),
        resolution,
      };

      if (referenceImages.length > 0) {
        body.image_url = referenceImages[0];
      }

      const response = await fetch('/pg/videos/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'New-Api-User': getUserIdFromLocalStorage(),
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.success) {
        setGeneratedVideos(data.data || []);
        setGeneratedAt(new Date());
        Toast.success(t('生成成功'));
      } else {
        Toast.error(data.message || t('生成失败'));
      }
    } catch (error) {
      console.error('Generate error:', error);
      Toast.error(t('生成失败，请重试'));
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = useCallback((videoUrl, index) => {
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `generated-video-${index + 1}.mp4`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handlePlay = useCallback((videoUrl) => {
    setPlayingVideo(videoUrl);
  }, []);

  return (
    <div className='h-full'>
      <Layout className='h-full bg-transparent flex flex-col md:flex-row'>
        <Layout.Sider
          className={`
            bg-transparent border-r-0 flex-shrink-0 overflow-auto mt-[60px]
            ${
              isMobile
                ? 'fixed top-0 left-0 right-0 bottom-0 z-[1000] w-full h-auto bg-white shadow-lg'
                : 'relative z-[1] w-80 h-[calc(100vh-66px)]'
            }
          `}
          width={isMobile ? '100%' : 320}
        >
          <div className='p-4 space-y-4'>
            <div className='flex items-center gap-2 text-lg font-semibold'>
              <Sparkles size={20} className='text-yellow-500' />
              <span>{t('视频生成')}</span>
            </div>

            <div>
              <label className='flex items-center gap-2 text-sm font-medium mb-2'>
                <Layers size={14} className='text-gray-400' />
                {t('分组')}
              </label>
              <Select
                className='w-full'
                value={selectedGroup}
                onChange={(value) => {
                  setSelectedGroup(value);
                  setModel('');
                }}
                placeholder={t('全部分组')}
                style={{ width: '100%' }}
              >
                {groups.map((g) => (
                  <Select.Option key={g.value} value={g.value}>
                    {g.label}
                  </Select.Option>
                ))}
              </Select>
            </div>

            <div>
              <label className='flex items-center gap-2 text-sm font-medium mb-2'>
                <Package size={14} className='text-gray-400' />
                {t('模型')}
              </label>
              <Select
                className='w-full'
                value={model}
                onChange={(value) => setModel(value)}
                placeholder={t('请选择视频模型')}
                disabled={loading}
                style={{ width: '100%' }}
              >
                {filteredModels.map((m) => (
                  <Select.Option key={m.value} value={m.value}>
                    {m.label}
                  </Select.Option>
                ))}
              </Select>
              {filteredModels.length === 0 && (
                <p className='text-xs text-gray-400 mt-1'>{t('当前分组没有可用的视频模型')}</p>
              )}
            </div>

            <div>
              <label className='block text-sm font-medium mb-2'>{t('提示词')}</label>
              <TextArea
                className='w-full'
                placeholder={t('描述你要生成的视频，例如：镜头缓慢推进雨夜街道，一只橘猫回头望向镜头，电影感光影')}
                value={prompt}
                onChange={(value) => setPrompt(value)}
                autosize={{ minRows: 4, maxRows: 12 }}
              />
            </div>

            <div className='grid grid-cols-3 gap-2'>
              <div>
                <label className='block text-xs font-medium mb-1'>{t('分辨率')}</label>
                <Select
                  className='w-full'
                  value={resolution}
                  onChange={(value) => setResolution(value)}
                  style={{ width: '100%' }}
                >
                  <Select.Option value='1080p'>1080p</Select.Option>
                  <Select.Option value='720p'>720p</Select.Option>
                  <Select.Option value='480p'>480p</Select.Option>
                </Select>
              </div>
              <div>
                <label className='block text-xs font-medium mb-1'>{t('帧率')}</label>
                <Select
                  className='w-full'
                  value={fps}
                  onChange={(value) => setFps(value)}
                  style={{ width: '100%' }}
                >
                  <Select.Option value='24'>24 FPS</Select.Option>
                  <Select.Option value='30'>30 FPS</Select.Option>
                  <Select.Option value='60'>60 FPS</Select.Option>
                </Select>
              </div>
              <div>
                <label className='block text-xs font-medium mb-1'>{t('时长')}</label>
                <Select
                  className='w-full'
                  value={duration}
                  onChange={(value) => setDuration(value)}
                  style={{ width: '100%' }}
                >
                  <Select.Option value='4'>4 s</Select.Option>
                  <Select.Option value='5'>5 s</Select.Option>
                  <Select.Option value='10'>10 s</Select.Option>
                </Select>
              </div>
            </div>

            <div className='pt-2 border-t border-gray-100'>
              <div className='flex items-center justify-between mb-2'>
                <label className='text-sm font-medium'>{t('参考图')} ({t('可选')})</label>
                <Button
                  size='small'
                  theme='solid'
                  type={isTextToVideo ? 'primary' : 'tertiary'}
                  onClick={() => setIsTextToVideo(true)}
                >
                  {t('文生视频')}
                </Button>
              </div>
              <div className='flex gap-2 mb-3'>
                <input
                  type='file'
                  ref={fileInputRef}
                  accept='image/*'
                  onChange={handleUploadRefImage}
                  style={{ display: 'none' }}
                />
                <Button
                  size='small'
                  type='secondary'
                  onClick={() => fileInputRef.current?.click()}
                  disabled={referenceImages.length >= 1}
                >
                  {t('上传参考图')}
                </Button>
                <Button size='small' type='tertiary' onClick={clearRefImages} disabled={referenceImages.length === 0}>
                  {t('清空参考图')}
                </Button>
              </div>
              <div className={`
                relative aspect-video border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-gray-400
                ${referenceImages.length > 0 ? 'border-gray-300' : 'border-gray-200'}
              `}>
                {referenceImages.length > 0 ? (
                  <div className='relative w-full h-full'>
                    <img
                      src={referenceImages[0]}
                      alt='Reference'
                      className='w-full h-full object-cover rounded-lg'
                    />
                    <button
                      className='absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70'
                      onClick={handleRemoveRefImage}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <span>{t('上传后将在这里预览参考图')}</span>
                )}
              </div>
              <p className='text-xs text-gray-400 mt-2'>{t('未上传参考图时，默认调用文生视频流程')}</p>
            </div>

            <Button
              block
              theme='solid'
              type='primary'
              size='large'
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              icon={generating ? <Loader2 size={16} className='animate-spin' /> : <Sparkles size={16} />}
            >
              {generating ? t('生成中...') : t('立即生成')}
            </Button>
          </div>
        </Layout.Sider>

        <Layout.Content className='relative flex-1 overflow-hidden mt-[60px]'>
          <div className='h-[calc(100vh-66px)] p-4 flex flex-col'>
            <div className='flex items-center justify-between mb-4'>
              <div className='text-sm text-gray-500'>
                {generatedAt && (
                  <span>
                    {t('生成于')} {generatedAt.toLocaleTimeString()}
                  </span>
                )}
              </div>
              {generatedVideos.length > 0 && (
                <button
                  className='px-3 py-1 text-sm border rounded-md hover:bg-gray-50'
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {t('重新生成')}
                </button>
              )}
            </div>

            <div className='flex-1 bg-gray-100 rounded-lg overflow-auto'>
              {generatedVideos.length > 0 ? (
                <div className='grid grid-cols-1 gap-4 p-4'>
                  {generatedVideos.map((video, index) => (
                    <div
                      key={index}
                      className='relative bg-white rounded-lg overflow-hidden shadow-sm'
                    >
                      <video
                        src={video.url || video}
                        className='w-full h-auto'
                        controls
                        poster={video.thumbnail}
                      />
                      <div className='absolute top-2 right-2 flex gap-2 opacity-0 hover:opacity-100 transition-opacity'>
                        <button
                          className='p-2 bg-black/50 rounded-full text-white hover:bg-black/70'
                          onClick={() => handlePlay(video.url || video)}
                          title={t('播放')}
                        >
                          <Play size={16} />
                        </button>
                        <button
                          className='p-2 bg-black/50 rounded-full text-white hover:bg-black/70'
                          onClick={() => handleDownload(video.url || video, index)}
                          title={t('下载')}
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='h-full flex items-center justify-center text-gray-400'>
                  <div className='text-center'>
                    <Video size={48} className='mx-auto mb-2 opacity-50' />
                    <p>{t('生成的视频将在这里显示')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Layout.Content>
      </Layout>
    </div>
  );
};

export default VideoPlayground;