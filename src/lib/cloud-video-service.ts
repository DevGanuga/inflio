import { TranscriptionService } from './transcription-service'
import { supabaseAdmin } from './supabase/admin'
import { v4 as uuidv4 } from 'uuid'
import { v2 as cloudinary } from 'cloudinary'

export interface SubtitleSettings {
  fontFamily: string
  fontSize: number
  fontColor: string
  backgroundColor: string
  backgroundOpacity?: number
  position: 'top' | 'center' | 'bottom'
  alignment: 'left' | 'center' | 'right'
  opacity?: number
  lineHeight?: number
  padding?: number
  strokeWidth?: number
  strokeColor?: string
  shadow?: boolean
  shadowColor?: string
  shadowBlur?: number
  animation?: 'none' | 'fade' | 'slide'
  animationDuration?: number
  maxWidth?: number
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface ApplySubtitlesResult {
  taskId: string
  status: 'processing' | 'completed' | 'failed'
  progress: number
  videoUrl?: string
  vttUrl?: string
  downloadUrl?: string
  provider: string
  error?: string
}

export interface VideoProcessingTask {
  id: string
  projectId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  inputVideoUrl: string
  outputVideoUrl?: string
  vttUrl?: string
  startedAt: string
  completedAt?: string
  error?: string
  provider: string
}

// Store active processing tasks in memory
const activeTasks = new Map<string, VideoProcessingTask>()

export class CloudVideoService {
  constructor() {
    if (!process.env.CLOUDINARY_URL) {
      console.warn('[CloudVideoService] CLOUDINARY_URL is not set — video processing will fail')
    }

    if (process.env.CLOUDINARY_URL) {
      const urlParts = process.env.CLOUDINARY_URL.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/)
      if (urlParts) {
        cloudinary.config({
          cloud_name: urlParts[3],
          api_key: urlParts[1],
          api_secret: urlParts[2],
          secure: true
        })
      }
    }
  }
  
  async applySubtitles(videoUrl: string, segments: TranscriptSegment[], projectId?: string, settings?: SubtitleSettings, logoUrl?: string): Promise<ApplySubtitlesResult> {
    const taskId = uuidv4()

    if (projectId) {
      const task: VideoProcessingTask = {
        id: taskId,
        projectId,
        status: 'processing',
        progress: 0,
        inputVideoUrl: videoUrl,
        startedAt: new Date().toISOString(),
        provider: 'cloudinary'
      }
      activeTasks.set(taskId, task)
    }

    try {
      return await this.applySubtitlesCloudinary(videoUrl, segments, taskId, settings, logoUrl)
    } catch (error) {
      console.error('Error applying subtitles:', error)
      const task = activeTasks.get(taskId)
      if (task) {
        task.status = 'failed'
        task.error = error instanceof Error ? error.message : 'Unknown error'
      }
      throw error
    }
  }
  
  private async applySubtitlesCloudinary(videoUrl: string, segments: TranscriptSegment[], taskId: string, settings?: SubtitleSettings, logoUrl?: string): Promise<ApplySubtitlesResult> {
    try {
      console.log('[Cloudinary] Starting subtitle burning...')

      const uploadResult = await cloudinary.uploader.upload(videoUrl, {
        resource_type: 'video',
        public_id: `video_${taskId}`,
        folder: 'inflio/subtitled',
      })

      console.log('[Cloudinary] Video uploaded:', uploadResult.public_id)

      const srtContent = this.generateSRT(segments)

      const srtUpload = await cloudinary.uploader.upload(
        `data:text/plain;base64,${Buffer.from(srtContent).toString('base64')}`,
        {
          resource_type: 'raw',
          public_id: `srt_${taskId}`,
          folder: 'inflio/subtitles',
          format: 'srt'
        }
      )

      console.log('[Cloudinary] SRT uploaded:', srtUpload.public_id)

      // Upload logo to Cloudinary if provided
      let logoPublicId: string | null = null
      if (logoUrl) {
        try {
          const logoUpload = await cloudinary.uploader.upload(logoUrl, {
            resource_type: 'image',
            public_id: `logo_${taskId}`,
            folder: 'inflio/logos',
          })
          logoPublicId = logoUpload.public_id
          console.log('[Cloudinary] Logo uploaded:', logoPublicId)
        } catch (logoErr) {
          console.error('[Cloudinary] Logo upload failed (continuing without logo):', logoErr)
        }
      }

      const fontFamily = settings?.fontFamily?.replace(' ', '_') || 'Arial'
      const fontSize = Math.round((settings?.fontSize || 24) * 2)
      const textColor = settings?.fontColor?.replace('#', '') || 'ffffff'
      const bgColor = settings?.backgroundColor?.replace('#', '') || '000000'
      const bgOpacity = Math.round((settings?.backgroundOpacity || 0.75) * 100)

      const gravityMap: Record<string, string> = {
        'top': 'north',
        'center': 'center',
        'bottom': 'south'
      }
      const gravity = gravityMap[settings?.position || 'bottom']

      const transformation: any[] = [
        {
          overlay: {
            resource_type: 'subtitles',
            public_id: srtUpload.public_id.replace('.srt', '')
          },
          font_family: fontFamily,
          font_size: fontSize,
          color: textColor,
          background: `#${bgColor}${bgOpacity.toString(16).padStart(2, '0')}`,
          gravity: gravity,
          y: settings?.position === 'bottom' ? 50 : 0,
          font_weight: 'bold',
          letter_spacing: 1,
          line_spacing: settings?.lineHeight ? Math.round(settings.lineHeight * 10) : 15
        },
        { flags: 'layer_apply' },
      ]

      if (logoPublicId) {
        transformation.push(
          {
            overlay: logoPublicId.replace(/\//g, ':'),
            gravity: 'south_east',
            width: 80,
            opacity: 70,
            x: 20,
            y: 20,
          },
          { flags: 'layer_apply' }
        )
      }

      transformation.push({ quality: 'auto:good', format: 'mp4' })

      const processedUrl = cloudinary.url(uploadResult.public_id, {
        resource_type: 'video',
        transformation,
      })

      console.log('[Cloudinary] Processed URL:', processedUrl)

      const downloadUrl = processedUrl + '?attachment=true'

      const task = activeTasks.get(taskId)
      if (task) {
        task.status = 'completed'
        task.progress = 100
        task.outputVideoUrl = processedUrl
        task.completedAt = new Date().toISOString()
      }

      return {
        taskId,
        status: 'completed',
        progress: 100,
        videoUrl: processedUrl,
        provider: 'cloudinary',
        downloadUrl
      }
    } catch (error) {
      console.error('[Cloudinary] Processing error:', error)
      throw error
    }
  }
  
  
  private generateSRT(segments: TranscriptSegment[]): string {
    return segments.map((segment, index) => {
      const startTime = this.formatSRTTime(segment.start)
      const endTime = this.formatSRTTime(segment.end)
      return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n`
    }).join('\n')
  }
  
  private generateVTT(segments: TranscriptSegment[]): string {
    const vttSegments = segments.map(segment => {
      const startTime = this.formatVTTTime(segment.start)
      const endTime = this.formatVTTTime(segment.end)
      return `${startTime} --> ${endTime}\n${segment.text}`
    }).join('\n\n')
    
    return `WEBVTT\n\n${vttSegments}`
  }
  
  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const millis = Math.floor((seconds % 1) * 1000)
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`
  }
  
  private formatVTTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const millis = Math.floor((seconds % 1) * 1000)
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`
  }
  
  static getTaskStatus(taskId: string): VideoProcessingTask | undefined {
    return activeTasks.get(taskId)
  }
  
  static getActiveProvider(): string {
    return 'cloudinary'
  }
} 