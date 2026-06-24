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
import type { VideoConfig, ParameterEnabled } from './types'

export const API_ENDPOINTS = {
  USER_MODELS: '/api/user/models',
  USER_GROUPS: '/api/user/self/groups',
  VIDEO_GENERATION: '/pg/videos/generations',
} as const

export const DEFAULT_GROUP = 'default' as const

export const DEFAULT_CONFIG: VideoConfig = {
  model: 'kling-v1',
  group: DEFAULT_GROUP,
  resolution: '1080p',
  duration: '5',
  fps: '30',
}

export const DEFAULT_PARAMETER_ENABLED: ParameterEnabled = {
  duration: true,
  fps: true,
}

export const STORAGE_KEYS = {
  CONFIG: 'playground_video_config',
  PARAMETER_ENABLED: 'playground_video_parameter_enabled',
} as const

export const RESOLUTION_OPTIONS = [
  { label: '1080p', value: '1080p' },
  { label: '720p', value: '720p' },
  { label: '480p', value: '480p' },
] as const

export const DURATION_OPTIONS = [
  { label: '5s', value: '5' },
  { label: '10s', value: '10' },
  { label: '15s', value: '15' },
] as const

export const FPS_OPTIONS = [
  { label: '24fps', value: '24' },
  { label: '30fps', value: '30' },
  { label: '60fps', value: '60' },
] as const

export const ERROR_MESSAGES = {
  API_REQUEST_ERROR: 'Request error occurred',
  NETWORK_ERROR: 'Network connection failed or server not responding',
} as const
