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
export interface VideoConfig {
  model: string
  group: string
  resolution: string
  duration: string
  fps: string
}

export interface ParameterEnabled {
  duration: boolean
  fps: boolean
}

export interface ModelOption {
  label: string
  value: string
}

export interface GroupOption {
  label: string
  value: string
  ratio: number
  desc?: string
}

export interface GeneratedVideo {
  url?: string
  cover_url?: string
  revised_prompt?: string
}

export interface VideoTaskResponse {
  success: boolean
  task_id?: string
  status?: 'queued' | 'processing' | 'completed' | 'failed'
  data?: GeneratedVideo[]
  message?: string
}
