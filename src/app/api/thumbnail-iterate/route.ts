import { NextRequest, NextResponse } from 'next/server'
import { auth } from "@clerk/nextjs/server"
import { supabaseAdmin } from '@/lib/supabase/admin'
import { OpenAIImageService } from '@/lib/services/openai-image-service'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const {
      projectId,
      currentImageUrl,
      iterationPrompt,
      quality = 'high',
      inputFidelity = 'high'
    } = body

    if (!currentImageUrl || !iterationPrompt) {
      return NextResponse.json({ error: 'currentImageUrl and iterationPrompt are required' }, { status: 400 })
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Use edit() — passes the current thumbnail as input so GPT actually
    // modifies the existing image instead of generating from scratch
    const result = await OpenAIImageService.iterateThumbnail({
      currentImageUrl,
      feedback: iterationPrompt,
      projectId,
      fidelity: inputFidelity as 'high' | 'low',
    })

    if (!result) {
      throw new Error('Image iteration failed')
    }

    await supabaseAdmin
      .from('projects')
      .update({
        thumbnail_url: result.url,
        metadata: {
          ...project.metadata,
          thumbnailIterations: (project.metadata?.thumbnailIterations || 0) + 1,
          lastIterationPrompt: iterationPrompt,
          iteratedAt: new Date().toISOString()
        }
      })
      .eq('id', projectId)

    return NextResponse.json({
      success: true,
      url: result.url,
      iterationCount: (project.metadata?.thumbnailIterations || 0) + 1
    })

  } catch (error) {
    console.error('Thumbnail iteration error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to iterate thumbnail' },
      { status: 500 }
    )
  }
} 