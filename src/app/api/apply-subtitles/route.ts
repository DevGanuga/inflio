import { NextRequest, NextResponse } from 'next/server'
import { CloudVideoService } from '@/lib/cloud-video-service'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { auth } from '@clerk/nextjs/server'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, videoUrl, segments, settings, logoUrl } = body

    if (!videoUrl || !segments || !Array.isArray(segments)) {
      return NextResponse.json(
        { error: 'Missing required fields: videoUrl and segments' },
        { status: 400 }
      )
    }

    const videoService = new CloudVideoService()

    const result = await videoService.applySubtitles(videoUrl, segments, projectId, settings, logoUrl)

    if (result.status === 'completed' && result.videoUrl && projectId) {
      await supabaseAdmin
        .from('projects')
        .update({
          processed_video_url: result.videoUrl,
          has_burned_subtitles: true,
          processed_at: new Date().toISOString(),
        })
        .eq('id', projectId)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Apply subtitles error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process video' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')

    if (!taskId) {
      return NextResponse.json({ error: 'Missing taskId parameter' }, { status: 400 })
    }

    const task = CloudVideoService.getTaskStatus(taskId)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json(task)
  } catch (error) {
    console.error('Get task status error:', error)
    return NextResponse.json(
      { error: 'Failed to get task status' },
      { status: 500 }
    )
  }
}
