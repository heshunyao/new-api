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
  ImageIcon,
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
  QUALITY_OPTIONS,
  STYLE_OPTIONS,
  STORAGE_KEYS,
  API_ENDPOINTS,
} from './constants'
import type {
  ImageConfig,
  ParameterEnabled,
  ModelOption,
  GroupOption,
  GeneratedImage,
} from './types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

function loadConfig(): Partial<ImageConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveConfig(config: ImageConfig) {
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

export function ImagePlayground() {
  const { t } = useTranslation()

  const [config, setConfig] = useState<ImageConfig>(() => ({
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
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  const updateConfig = useCallback(
    <K extends keyof ImageConfig>(key: K, value: ImageConfig[K]) => {
      setConfig((prev) => {
        const updated = { ...prev, [key]: value }
        saveConfig(updated)
        return updated
      })
    },
    []
  )

  const { data: modelsData, isLoading: isLoadingModels } = useQuery({
    queryKey: ['playground-image-models'],
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
    queryKey: ['playground-image-groups'],
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

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(t('Please enter a prompt'))
      return
    }
    setIsGenerating(true)
    try {
      const res = await api.post(
        API_ENDPOINTS.IMAGE_GENERATION,
        {
          model_id: parseInt(config.model),
          group: config.group,
          prompt,
          n: config.n,
          size: config.resolution,
          quality: parameterEnabled.quality ? config.quality : undefined,
          style: parameterEnabled.style ? config.style : undefined,
        },
        { skipErrorHandler: true } as Record<string, unknown>
      )
      const images: GeneratedImage[] = res.data?.data ?? []
      setGeneratedImages(images)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Image generation failed')
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownload = (image: GeneratedImage, index: number) => {
    if (image.url) {
      const a = document.createElement('a')
      a.href = image.url
      a.download = `generated-${index + 1}.png`
      a.click()
    } else if (image.b64_json) {
      const a = document.createElement('a')
      a.href = `data:image/png;base64,${image.b64_json}`
      a.download = `generated-${index + 1}.png`
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
              <ImageIcon className='size-5' />
              <h2 className='text-lg font-semibold'>
                {t('Image Generation')}
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
                    {t('No image models available in current group')}
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

            {/* Image Settings */}
            <div className='space-y-2'>
              <label className='flex items-center gap-2 text-sm font-medium'>
                <SparklesIcon className='size-4' />
                {t('Image Settings')}
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

            {/* Ratio */}
            <div className='space-y-2'>
              <label className='text-sm font-medium'>
                {t('Target Ratio')}
              </label>
              <select
                className='flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                value={config.resolution}
                onChange={(e) => updateConfig('resolution', e.target.value)}
              >
                <option value='1024x1024'>{t('Auto')}</option>
                <option value='1792x1024'>16:9</option>
                <option value='1024x1792'>9:16</option>
                <option value='1024x1024'>1:1</option>
              </select>
              <p className='text-xs text-muted-foreground'>
                {t('Automatically determine resolution based on model. Do not pass size parameters.')}
              </p>
            </div>

            {/* Quality */}
            {parameterEnabled.quality && (
              <div className='space-y-2'>
                <label className='text-sm font-medium'>
                  {t('Quality')}
                </label>
                <select
                  className='flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                  value={config.quality}
                  onChange={(e) => updateConfig('quality', e.target.value)}
                >
                  {QUALITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Style */}
            {parameterEnabled.style && (
              <div className='space-y-2'>
                <label className='text-sm font-medium'>
                  {t('Style')}
                </label>
                <select
                  className='flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                  value={config.style}
                  onChange={(e) => updateConfig('style', e.target.value)}
                >
                  {STYLE_OPTIONS.map((opt) => (
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
                placeholder={t('Describe the image you want to generate, e.g.: a cyberpunk city at night, neon lights, rain, cinematic')}
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
          <h3 className='font-semibold'>{t('Image Preview')}</h3>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={handleRegenerate}
              disabled={isGenerating || generatedImages.length === 0}
            >
              <RefreshCwIcon
                className={cn('mr-1 size-4', isGenerating && 'animate-spin')}
              />
              {t('Regenerate')}
            </Button>
            {generatedImages.length > 0 && (
              <Button
                variant='outline'
                size='sm'
                onClick={() => handleDownload(generatedImages[0], 0)}
              >
                <DownloadIcon className='mr-1 size-4' />
                {t('Download')}
              </Button>
            )}
          </div>
        </div>

        {/* Preview Area */}
        <div className='flex flex-1 items-center justify-center p-6'>
          {generatedImages.length > 0 ? (
            <div
              className={cn(
                'grid gap-4',
                generatedImages.length === 1
                  ? 'grid-cols-1'
                  : 'grid-cols-2'
              )}
            >
              {generatedImages.map((image, index) => (
                <div key={index} className='group relative'>
                  {image.url ? (
                    <img
                      src={image.url}
                      alt={`Generated ${index + 1}`}
                      className='max-h-[60vh] rounded-lg object-contain shadow-lg'
                    />
                  ) : image.b64_json ? (
                    <img
                      src={`data:image/png;base64,${image.b64_json}`}
                      alt={`Generated ${index + 1}`}
                      className='max-h-[60vh] rounded-lg object-contain shadow-lg'
                    />
                  ) : null}
                  {image.revised_prompt && (
                    <div className='absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/60 p-3 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100'>
                      {image.revised_prompt}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className='flex flex-col items-center gap-3 text-muted-foreground'>
              <ImageIcon className='size-12 opacity-30' />
              <p className='text-sm'>
                {t('Generated images will be displayed here')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
