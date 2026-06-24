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
import { Image, Download, RefreshCw, Loader2, Sparkles, Layers, Package, Wand2, Upload as UploadIcon } from 'lucide-react';
import { API } from '../../helpers/api';
import { getUserIdFromLocalStorage } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import { UserContext } from '../../context/User';
import { API_ENDPOINTS } from '../../constants/playground.constants';

const ImagePlayground = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [userState] = useContext(UserContext);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('agnes-image-2.1-flash');
  const [clarity, setClarity] = useState('1K');
  const [aspectRatio, setAspectRatio] = useState('auto');
  const [models, setModels] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [generatedImages, setGeneratedImages] = useState([]);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [referenceImages, setReferenceImages] = useState([]);
  const [isTextToImage, setIsTextToImage] = useState(true);
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

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      Toast.warning(t('请输入提示词'));
      return;
    }

    try {
      setGenerating(true);
      const response = await fetch('/pg/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'New-Api-User': getUserIdFromLocalStorage(),
        },
        body: JSON.stringify({
          model: model || 'agnes-image-2.1-flash',
          group: selectedGroup || 'default',
          prompt,
          n: 1,
          referenceImages: referenceImages,
        }),
      });

      const data = await response.json();
      if (data.data && data.data.length > 0) {
        // Convert b64_json to data URL for display
        const images = data.data.map((item, index) => ({
          url: item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url,
          revisedPrompt: item.revised_prompt,
        }));
        setGeneratedImages(images);
        setGeneratedAt(new Date());
        Toast.success(t('生成成功'));
      } else if (data.error) {
        const errorMsg = data.error.message || data.error.error || t('生成失败');
        Toast.error(errorMsg);
      } else {
        Toast.error(t('生成失败'));
      }
    } catch (error) {
      console.error('Generate error:', error);
      Toast.error(t('生成失败，请重试'));
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = useCallback((imageUrl, index) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `generated-image-${index + 1}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleUploadRefImage = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (referenceImages.length >= 4) {
      Toast.warning(t('最多上传4张参考图'));
      return;
    }

    const newImages = [...referenceImages];
    Array.from(files).forEach((file) => {
      if (newImages.length < 4) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          newImages.push(ev.target.result);
          setReferenceImages([...newImages]);
          setIsTextToImage(false);
        };
        reader.readAsDataURL(file);
      }
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveRefImage = (index) => {
    const newImages = referenceImages.filter((_, i) => i !== index);
    setReferenceImages(newImages);
    if (newImages.length === 0) {
      setIsTextToImage(true);
    }
  };

  const clearRefImages = () => {
    setReferenceImages([]);
    setIsTextToImage(true);
  };

  const aspectRatioOptions = [
    { value: 'auto', label: t('自动') },
    { value: '1:1', label: '1:1' },
    { value: '4:3', label: '4:3' },
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
    { value: '3:2', label: '3:2' },
    { value: '2:3', label: '2:3' },
  ];

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
              <Sparkles size={20} className='text-purple-500' />
              <span>{t('图片生成')}</span>
            </div>

            <div>
              <label className='flex items-center gap-1.5 text-sm font-medium mb-2'>
                <Layers size={14} />
                {t('分组')}
              </label>
              <Select
                className='w-full'
                placeholder={t('选择分组')}
                value={selectedGroup}
                onChange={(value) => setSelectedGroup(value)}
                disabled={loading || groups.length === 0}
                optionList={groups.map((g) => ({ value: g.value, label: g.label }))}
              />
            </div>

            <div>
              <label className='flex items-center gap-1.5 text-sm font-medium mb-2'>
                <Package size={14} />
                {t('模型')}
              </label>
              <Select
                className='w-full'
                placeholder={t('选择模型')}
                value={model}
                onChange={(value) => setModel(value)}
                disabled={loading || filteredModels.length === 0}
                optionList={filteredModels.map((m) => ({ value: m.value, label: m.label }))}
              />
              <p className='text-xs text-gray-500 mt-1'>{t('可用模型')} {filteredModels.length} {t('个')}</p>
            </div>

            <div className='pt-2 border-t border-gray-100'>
              <div className='flex items-center gap-1.5 text-sm font-medium mb-3'>
                <Wand2 size={14} />
                {t('图片设置')}
              </div>

              <div className='space-y-3'>
                <div>
                  <label className='block text-xs text-gray-600 mb-1.5'>{t('目标清晰度')}</label>
                  <Select
                    className='w-full'
                    value={clarity}
                    onChange={(value) => setClarity(value)}
                    optionList={[
                      { value: '1K', label: '1K' },
                      { value: '2K', label: '2K' },
                      { value: '4K', label: '4K' },
                    ]}
                  />
                </div>

                <div>
                  <label className='block text-xs text-gray-600 mb-1.5'>{t('目标比例')}</label>
                  <Select
                    className='w-full'
                    value={aspectRatio}
                    onChange={(value) => setAspectRatio(value)}
                    optionList={aspectRatioOptions}
                  />
                  <p className='text-xs text-gray-400 mt-1'>{t('自动表示由模型决定分辨率，不发送尺寸参数')}</p>
                  <p className='text-xs text-gray-400'>{t('请求尺寸是发送给模型的目标值，实际输出以模型或渠道返回为准')}</p>
                </div>
              </div>
            </div>

            <div className='pt-2 border-t border-gray-100'>
              <label className='block text-sm font-medium mb-2'>{t('提示词')}</label>
              <TextArea
                className='w-full'
                placeholder={t('描述你要生成的画面，例如：赛博朋克城市夜景，霓虹灯，电影感，超清细节')}
                value={prompt}
                onChange={(value) => setPrompt(value)}
                autosize={{ minRows: 4, maxRows: 12 }}
              />
            </div>

            <div className='pt-2 border-t border-gray-100'>
              <div className='flex items-center justify-between mb-2'>
                <label className='text-sm font-medium'>{t('参考图')} ({t('可选')}，{t('最多')} 4 {t('张')})</label>
                <Button
                  size='small'
                  theme='solid'
                  type={isTextToImage ? 'primary' : 'tertiary'}
                  onClick={() => setIsTextToImage(true)}
                >
                  {t('文生图')}
                </Button>
              </div>

              <div className='flex gap-2 mb-3'>
                <input
                  type='file'
                  ref={fileInputRef}
                  accept='image/*'
                  multiple
                  onChange={handleUploadRefImage}
                  style={{ display: 'none' }}
                />
                <Button
                  size='small'
                  type='secondary'
                  icon={<UploadIcon size={14} />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={referenceImages.length >= 4}
                >
                  {t('上传参考图')}
                </Button>
                <Button size='small' type='tertiary' onClick={clearRefImages} disabled={referenceImages.length === 0}>
                  {t('清空参考图')}
                </Button>
              </div>

              <div className='grid grid-cols-2 gap-2'>
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className={`
                      relative aspect-square border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-gray-400
                      ${referenceImages[index] ? 'border-gray-300' : 'border-gray-200'}
                    `}
                  >
                    {referenceImages[index] ? (
                      <div className='relative w-full h-full'>
                        <img
                          src={referenceImages[index]}
                          alt={`Reference ${index + 1}`}
                          className='w-full h-full object-cover rounded-lg'
                        />
                        <button
                          className='absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70'
                          onClick={() => handleRemoveRefImage(index)}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <span>{t('空位')} {index + 1}</span>
                    )}
                  </div>
                ))}
              </div>

              <p className='text-xs text-gray-400 mt-2'>{t('未上传参考图时，默认调用文生图接口')}</p>
            </div>

            <Button
              className='w-full mt-4'
              theme='solid'
              type='primary'
              icon={generating ? <Loader2 size={16} className='animate-spin' /> : <Sparkles size={16} />}
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              block
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
              {generatedImages.length > 0 && (
                <Button size='small' type='secondary' onClick={handleGenerate} disabled={generating}>
                  {t('重新生成')}
                </Button>
              )}
            </div>

            <div className='flex-1 bg-gray-50 rounded-lg overflow-auto'>
              {generatedImages.length > 0 ? (
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4 p-4'>
                  {generatedImages.map((img, index) => (
                    <div
                      key={index}
                      className='relative bg-white rounded-lg overflow-hidden shadow-sm'
                    >
                      <img
                        src={img.url || img}
                        alt={`Generated ${index + 1}`}
                        className='w-full h-auto'
                      />
                      <div className='absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/50 to-transparent opacity-0 hover:opacity-100 transition-opacity'>
                        <Button size='small' theme='solid' type='primary' onClick={() => handleDownload(img.url || img, index)} block>
                          <Download size={14} />
                          {t('下载')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='h-full flex items-center justify-center text-gray-400'>
                  <div className='text-center'>
                    <Image size={48} className='mx-auto mb-2 opacity-50' />
                    <p>{t('生成的图片将在这里显示')}</p>
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

export default ImagePlayground;