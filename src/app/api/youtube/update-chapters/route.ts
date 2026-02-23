import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ChapterGenerator } from '@/lib/chapter-generator'
import { YouTubeUploadService } from '@/lib/youtube-upload-service'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId, youtubeVideoId } = await req.json()

    if (!projectId || !youtubeVideoId) {
      return NextResponse.json(
        { error: 'projectId and youtubeVideoId are required' },
        { status: 400 }
      )
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('chapters, description, user_id')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== userId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.chapters || project.chapters.length === 0) {
      return NextResponse.json(
        { error: 'No chapters found. Generate chapters first.' },
        { status: 400 }
      )
    }

    const validation = ChapterGenerator.validateChapters(project.chapters, 'youtube')
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Chapters do not meet YouTube requirements', details: validation.errors },
        { status: 400 }
      )
    }

    // Get user's YouTube access token, refresh if expired
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
        } catch {
          console.error('[youtube/update-chapters] Token refresh failed')
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

    const description = ChapterGenerator.generateYouTubeDescription(
      project.chapters,
      project.description
    )

    const result = await YouTubeUploadService.updateVideoDescription(
      youtubeVideoId,
      description,
      accessToken
    )

    return NextResponse.json({
      success: true,
      videoId: result.videoId,
      chaptersCount: project.chapters.length,
      description,
    })
  } catch (error) {
    console.error('[youtube/update-chapters] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update YouTube chapters' },
      { status: 500 }
    )
  }
}
