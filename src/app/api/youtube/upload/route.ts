import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { YouTubeUploadService } from '@/lib/youtube-upload-service'
import { ChapterGenerator } from '@/lib/chapter-generator'

export const maxDuration = 300

/**
 * POST /api/youtube/upload
 *
 * Uploads the user's video to THEIR YouTube channel using their connected account.
 * Falls back to server credentials only if no user account is connected.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId, privacy } = await req.json()

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('title, description, video_url, processed_video_url, chapters, user_id')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== userId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const videoUrl = project.processed_video_url || project.video_url
    if (!videoUrl) {
      return NextResponse.json({ error: 'No video URL available' }, { status: 400 })
    }

    // Build YouTube description with chapters if available
    let description = project.description || ''
    if (project.chapters?.length > 0) {
      description = ChapterGenerator.generateYouTubeDescription(
        project.chapters,
        project.description
      )
    }

    // Get the user's connected YouTube access token
    let accessToken: string | undefined

    const { data: integration } = await supabaseAdmin
      .from('social_integrations')
      .select('token, refresh_token, token_expiration')
      .eq('user_id', userId)
      .eq('platform', 'youtube')
      .eq('disabled', false)
      .single()

    if (integration) {
      const isExpired = integration.token_expiration
        ? new Date(integration.token_expiration) < new Date()
        : false

      if (isExpired && integration.refresh_token) {
        try {
          accessToken = await YouTubeUploadService.refreshUserToken(integration.refresh_token)

          await supabaseAdmin
            .from('social_integrations')
            .update({
              token: accessToken,
              token_expiration: new Date(Date.now() + 3600 * 1000).toISOString(),
              refresh_needed: false,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('platform', 'youtube')
        } catch (refreshErr) {
          console.error('[youtube/upload] Token refresh failed:', refreshErr)
          await supabaseAdmin
            .from('social_integrations')
            .update({ refresh_needed: true })
            .eq('user_id', userId)
            .eq('platform', 'youtube')
        }
      } else {
        accessToken = integration.token
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'YouTube account not connected. Go to Social Media > Accounts to connect your YouTube channel.' },
        { status: 400 }
      )
    }

    const result = await YouTubeUploadService.uploadVideo({
      videoUrl,
      title: project.title || 'Untitled Video',
      description,
      privacy: privacy || 'unlisted',
      accessToken,
    })

    await supabaseAdmin
      .from('projects')
      .update({
        youtube_video_id: result.videoId,
        youtube_url: result.videoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    return NextResponse.json({
      success: true,
      videoId: result.videoId,
      videoUrl: result.videoUrl,
      uploadStatus: result.uploadStatus,
    })
  } catch (error) {
    console.error('[youtube/upload] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload to YouTube' },
      { status: 500 }
    )
  }
}
