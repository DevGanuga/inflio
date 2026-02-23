import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { CloudVideoService } from '@/lib/cloud-video-service'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId, videoUrl, style = {} } = await req.json()

    if (!projectId || !videoUrl) {
      return NextResponse.json(
        { error: 'Project ID and video URL are required' },
        { status: 400 }
      )
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('transcription, title, user_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    let segments = project.transcription?.segments
    if (!segments || segments.length === 0) {
      if (typeof project.transcription === 'string') {
        return NextResponse.json(
          { error: 'Transcription exists but has no timed segments for subtitles' },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { error: 'No transcription available for this video' },
        { status: 400 }
      )
    }

    segments = segments.map((seg: any) => ({
      text: seg.text,
      start: seg.start,
      end: seg.end,
    }))

    // Fetch user logo for watermark
    let logoUrl: string | undefined
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('logo_url, brand_identity')
      .eq('clerk_user_id', userId)
      .single()

    if (profile?.logo_url) {
      logoUrl = profile.logo_url
    } else if (profile?.brand_identity?.logo?.url) {
      logoUrl = profile.brand_identity.logo.url
    }

    const settings = {
      fontFamily: style.fontFamily || 'Arial',
      fontSize: parseInt(style.fontSize) || 24,
      fontColor: style.fontColor || '#ffffff',
      backgroundColor: style.backgroundColor || '#000000',
      backgroundOpacity: 0.7,
      position: (style.position as 'bottom' | 'top' | 'center') || 'bottom',
      alignment: 'center' as const,
    }

    const videoService = new CloudVideoService()
    const result = await videoService.applySubtitles(videoUrl, segments, projectId, settings, logoUrl)

    if (result.status === 'completed' && result.videoUrl) {
      await supabaseAdmin
        .from('projects')
        .update({
          processed_video_url: result.videoUrl,
          has_burned_subtitles: true,
          processed_at: new Date().toISOString(),
        })
        .eq('id', projectId)
    }

    return NextResponse.json({
      success: true,
      processedVideoUrl: result.videoUrl || result.vttUrl,
      downloadUrl: result.downloadUrl,
      provider: result.provider,
      message: 'Subtitles burned successfully',
    })
  } catch (error) {
    console.error('Burn subtitles error:', error)
    return NextResponse.json(
      {
        error: 'Failed to burn subtitles',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
