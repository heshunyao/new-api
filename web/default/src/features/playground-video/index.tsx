/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  VideoIcon,
  LayersIcon,
  CpuIcon,
  SparklesIcon,
  RefreshCwIcon,
  DownloadIcon,
  ImagePlusIcon,
  XIcon,
  Loader2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { getUserModels, getUserGroups } from './api'
import {
  DEFAULT_CONFIG,
  DEFAULT_PARAMETER_ENABLED,
  RESOLUTION_OPTIONS,
  DURATION_OPTIONS,
  FPS_OPTIONS,
  STORAGE_KEYS,
  API_ENDPOINTS,
} from './constants'
import type {
  VideoConfig,
  ParameterEnabled,
  ModelOption,
  GroupOption,
  GeneratedVideo,
  VideoTaskResponse,
} from './types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

function loadConfig(): Partial<VideoConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveConfig(config: VideoConfig) {
  try {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config))
  } catch {
    // ignore
  }
}

function loadParameterEnabled(): Partial<ParameterEnabled> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PARAMETER_ENABLED)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function VideoPlayground() {
  const { t } = useTranslation()

  const [config, setConfig] = useState<VideoConfig>(() => ({
    ...DEFAULT_CONFIG,
    ...loadConfig(),
  }))
  const [parameterEnabled] = useState<ParameterEnabled>(() => ({
    ...DEFAULT_PARAMETER_ENABLED,
    ...loadParameterEnabled(),
  }))
  const [models, setModels] = useState<ModelOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [prompt, setPrompt] = useState('')
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  const updateConfig = useCallback(
    <K extends keyof VideoConfig>(key: K, value: VideoConfig[K]) => {
      setConfig((prev) => {
        const updated = { ...prev, [key]: value }
        saveConfig(updated)
        return updated
      })
    },
    []
  )

  const { data: modelsData, isLoading: isLoadingModels } = useQuery({
    queryKey: ['playground-video-models'],
    queryFn: async () => {
      try {
        return await getUserModels()
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t('Failed to load models')
        )
        return []
      }
    },
  })

  const { data: groupsData } = useQuery({
    queryKey: ['playground-video-groups'],
    queryFn: async () => {
      try {
        return await getUserGroups()
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t('Failed to load groups')
        )
        return []
      }
    },
  })

  useEffect(() => {
    if (!modelsData) return
    setModels(modelsData)
    const isValid = modelsData.some((m) => m.value === config.model)
    if (modelsData.length > 0 && !isValid) {
      updateConfig('model', modelsData[0].value)
    }
  }, [modelsData, config.model, updateConfig])

  useEffect(() => {
    if (!groupsData) return
    setGroups(groupsData)
    const hasCurrent = groupsData.some((g) => g.value === config.group)
    if (!hasCurrent && groupsData.length > 0) {
      const fallback =
        groupsData.find((g) => g.value === 'default')?.value ??
        groupsData[0].value
      updateConfig('group', fallback)
    }
  }, [groupsData, config.group, updateConfig])

  const POLLING_INTERVAL = 15000 // 15 seconds
  const MAX_POLLING_TIME = 600000 // 10 minutes

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(t('Please enter a prompt'))
      return
    }
    setIsGenerating(true)
    try {
      const res = await api.post<VideoTaskResponse>(
        API_ENDPOINTS.VIDEO_GENERATION,
        {
          model: config.model,
          group: config.group,
          prompt,
          resolution: config.resolution,
          duration: parameterEnabled.duration ? config.duration : undefined,
          fps: parameterEnabled.fps ? config.fps : undefined,
        },
        { skipErrorHandler: true } as Record<string, unknown>
      )
      const taskData = res.data

      if (!taskData?.success) {
        toast.error(taskData?.message || t('Video generation failed'))
        setIsGenerating(false)
        return
      }

      // Check if task is queued - need to poll for status
      if (taskData.status === 'queued' && taskData.task_id) {
        const placeholderVideo: GeneratedVideo = {
          url: '',
          cover_url: undefined,
          revised_prompt: taskData.message,
        }
        setGeneratedVideos([placeholderVideo])

        // Start polling
        const startTime = Date.now()
        const poll = async () => {
          try {
            const statusRes = await api.get<VideoTaskResponse>(
              `${API_ENDPOINTS.VIDEO_STATUS}/${taskData.task_id}`
            )
            const statusData = statusRes.data

            if (statusData?.status === 'completed' && statusData.data?.[0]?.url) {
              setGeneratedVideos(statusData.data)
              setIsGenerating(false)
              return
            }

            if (statusData?.status === 'failed') {
              toast.error(statusData.message || t('Video generation failed'))
              setGeneratedVideos([])
              setIsGenerating(false)
              return
            }

            // Continue polling if not completed/failed and within time limit
            if (Date.now() - startTime < MAX_POLLING_TIME) {
              setTimeout(poll, POLLING_INTERVAL)
            } else {
              toast.error(t('Video generation timeout'))
              setIsGenerating(false)
            }
          } catch (error) {
            console.error('Polling error:', error)
            if (Date.now() - startTime < MAX_POLLING_TIME) {
              setTimeout(poll, POLLING_INTERVAL)
            } else {
              toast.error(t('Video generation timeout'))
              setIsGenerating(false)
            }
          }
        }

        // Start first poll after interval
        setTimeout(poll, POLLING_INTERVAL)
        return
      }

      // Immediate response (no polling needed)
      const videos: GeneratedVideo[] = taskData.data ?? []
      setGeneratedVideos(videos)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Video generation failed')
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownload = (video: GeneratedVideo, index: number) => {
    if (video.url) {
      const a = document.createElement('a')
      a.href = video.url
      a.download = `generated-video-${index + 1}.mp4`
      a.click()
    }
  }

  const handleRegenerate = () => {
    if (prompt.trim()) {
      handleGenerate()
    }
  }

  const handleAddReference = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = () => {
          setReferenceImages((prev) => [...prev, reader.result as string])
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }

  const handleRemoveReference = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className='flex h-full'>
      {/* Left: Configuration Panel */}
      <div className='flex w-[420px] shrink-0 flex-col border-r'>
        <ScrollArea className='flex-1'>
          <div className='space-y-5 p-5'>
            {/* Title */}
            <div className='flex items-center gap-2'>
              <VideoIcon className='size-5' />
              <h2 className='text-lg font-semibold'>
                {t('Video Generation')}
              </h2>
            </div>

            <Separator />

            {/* Group */}
            <div className='space-y-2'>
              <label className='flex items-center gap-2 text-sm font-medium'>
                <LayersIcon className='size-4' />
                {t('Group')}
              </label>
              <select
                className='flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                value={config.group}
                onChange={(e) => updateConfig('group', e.target.value)}
                disabled={groups.length === 0}
              >
                {groups.length === 0 && (
                  <option value=''>{t('Please select a group')}</option>
                )}
                {groups.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Model */}
            <div className='space-y-2'>
              <label className='flex items-center gap-2 text-sm font-medium'>
                <CpuIcon className='size-4' />
                {t('Model')}
              </label>
              <select
                className='flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                value={config.model}
                onChange={(e) => updateConfig('model', e.target.value)}
                disabled={isLoadingModels || models.length === 0}
              >
                {models.length === 0 && (
                  <option value=''>
                    {t('No video models available in current group')}
                  </option>
                )}
                {models.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <Separator />

            {/* Video Settings */}
            <div className='space-y-2'>
              <label className='flex items-center gap-2 text-sm font-medium'>
                <SparklesIcon className='size-4' />
                {t('Video Settings')}
              </label>
            </div>

            {/* Resolution */}
            <div className='space-y-2'>
              <label className='text-sm font-medium'>
                {t('Target Resolution')}
              </label>
              <select
                className='flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                value={config.resolution}
                onChange={(e) => updateConfig('resolution', e.target.value)}
              >
                {RESOLUTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration */}
            {parameterEnabled.duration && (
              <div className='space-y-2'>
                <label className='text-sm font-medium'>
                  {t('Duration')}
                </label>
                <select
                  className='flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                  value={config.duration}
                  onChange={(e) => updateConfig('duration', e.target.value)}
                >
                  {DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* FPS */}
            {parameterEnabled.fps && (
              <div className='space-y-2'>
                <label className='text-sm font-medium'>
                  {t('Frame Rate')}
                </label>
                <select
                  className='flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                  value={config.fps}
                  onChange={(e) => updateConfig('fps', e.target.value)}
                >
                  {FPS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Separator />

            {/* Prompt */}
            <div className='space-y-2'>
              <label className='text-sm font-medium'>
                {t('Prompt')}
              </label>
              <Textarea
                placeholder={t('Describe the video you want to generate, e.g.: a drone flying over a mountain at sunset, cinematic, 4K')}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className='min-h-[100px] resize-none'
              />
            </div>

            {/* Reference Images */}
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <label className='text-sm font-medium'>
                  {t('Reference Images')}
                  <span className='text-xs text-muted-foreground'>
                    {' '}
                    {t('(optional, up to 4)')}
                  </span>
                </label>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={handleAddReference}
                  disabled={referenceImages.length >= 4}
                >
                  <ImagePlusIcon className='mr-1 size-4' />
                  {t('Add Image')}
                </Button>
              </div>
              <div className='grid grid-cols-2 gap-2'>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex aspect-square items-center justify-center rounded-md border-2 border-dashed',
                      referenceImages[i]
                        ? 'border-transparent'
                        : 'border-muted-foreground/30'
                    )}
                  >
                    {referenceImages[i] ? (
                      <div className='group relative size-full'>
                        <img
                          src={referenceImages[i]}
                          alt={`Reference ${i + 1}`}
                          className='size-full rounded-md object-cover'
                        />
                        <button
                          className='absolute right-1 top-1 rounded-full bg-black/50 p-1 opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100'
                          onClick={() => handleRemoveReference(i)}
                        >
                          <XIcon className='size-3 text-white' />
                        </button>
                      </div>
                    ) : (
                      <button
                        className='flex size-full flex-col items-center justify-center text-muted-foreground/50 hover:text-muted-foreground'
                        onClick={handleAddReference}
                        disabled={referenceImages.length >= 4}
                      >
                        <ImagePlusIcon className='mb-1 size-5' />
                        <span className='text-xs'>
                          {t('Slot {{n}}', { n: i + 1 })}
                        </span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Generate Button */}
        <div className='border-t p-4'>
          <Button
            className='w-full'
            size='lg'
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? (
              <>
                <Loader2 className='mr-2 size-4 animate-spin' />
                {t('Generating...')}
              </>
            ) : (
              <>
                <SparklesIcon className='mr-2 size-4' />
                {t('Generate')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Right: Preview Panel */}
      <div className='flex flex-1 flex-col'>
        {/* Toolbar */}
        <div className='flex items-center justify-between border-b px-5 py-3'>
          <h3 className='font-semibold'>{t('Video Preview')}</h3>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={handleRegenerate}
              disabled={isGenerating || generatedVideos.length === 0}
            >
              <RefreshCwIcon
                className={cn('mr-1 size-4', isGenerating && 'animate-spin')}
              />
              {t('Regenerate')}
            </Button>
            {generatedVideos.length > 0 && (
              <Button
                variant='outline'
                size='sm'
                onClick={() => handleDownload(generatedVideos[0], 0)}
              >
                <DownloadIcon className='mr-1 size-4' />
                {t('Download')}
              </Button>
            )}
          </div>
        </div>

        {/* Preview Area */}
        <div className='flex flex-1 items-center justify-center p-6'>
          {generatedVideos.length > 0 ? (
            <div className='grid grid-cols-1 gap-4'>
              {generatedVideos.map((video, index) => (
                <div key={index} className='group relative'>
                  {video.url ? (
                    <video
                      src={video.url}
                      controls
                      className='max-h-[60vh] rounded-lg shadow-lg'
                      poster={video.cover_url}
                    />
                  ) : (
                    <div className='flex h-[300px] w-full items-center justify-center rounded-lg bg-muted'>
                      <div className='flex flex-col items-center gap-2 text-muted-foreground'>
                        <Loader2 className='size-8 animate-spin' />
                        <p className='text-sm'>
                          {t('Video is being generated, please wait...')}
                        </p>
                      </div>
                    </div>
                  )}
                  {video.revised_prompt && (
                    <div className='absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/60 p-3 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100'>
                      {video.revised_prompt}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className='flex flex-col items-center gap-3 text-muted-foreground'>
              <VideoIcon className='size-12 opacity-30' />
              <p className='text-sm'>
                {t('Generated videos will be displayed here')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
