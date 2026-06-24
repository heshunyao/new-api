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
import type { ImageConfig, ParameterEnabled } from './types'

export const API_ENDPOINTS = {
  USER_MODELS: '/api/user/models',
  USER_GROUPS: '/api/user/self/groups',
  IMAGE_GENERATION: '/pg/images/generations',
} as const

export const DEFAULT_GROUP = 'default' as const

export const DEFAULT_CONFIG: ImageConfig = {
  model: 'agnes-image-2.1-flash',
  group: DEFAULT_GROUP,
  resolution: '1024x1024',
  quality: 'standard',
  style: 'vivid',
  n: 1,
}

export const DEFAULT_PARAMETER_ENABLED: ParameterEnabled = {
  quality: true,
  style: true,
  n: true,
}

export const STORAGE_KEYS = {
  CONFIG: 'playground_image_config',
  PARAMETER_ENABLED: 'playground_image_parameter_enabled',
} as const

export const RESOLUTION_OPTIONS = [
  { label: '1024x1024', value: '1024x1024' },
  { label: '1792x1024', value: '1792x1024' },
  { label: '1024x1792', value: '1024x1792' },
  { label: '512x512', value: '512x512' },
  { label: '256x256', value: '256x256' },
] as const

export const QUALITY_OPTIONS = [
  { label: 'Standard', value: 'standard' },
  { label: 'HD', value: 'hd' },
] as const

export const STYLE_OPTIONS = [
  { label: 'Vivid', value: 'vivid' },
  { label: 'Natural', value: 'natural' },
] as const

export const ERROR_MESSAGES = {
  API_REQUEST_ERROR: 'Request error occurred',
  NETWORK_ERROR: 'Network connection failed or server not responding',
} as const
