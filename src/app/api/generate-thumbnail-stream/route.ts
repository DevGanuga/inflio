import { NextRequest } from 'next/server'
import { auth } from "@clerk/nextjs/server"
import { supabaseAdmin } from '@/lib/supabase/admin'
import { OpenAIImageService } from '@/lib/services/openai-image-service'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const { projectId, prompt, quality = 'medium', personaName } = body

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single()

    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    let enhancedPrompt = prompt
    if (personaName) {
      enhancedPrompt = `${prompt}. Feature ${personaName} prominently in the thumbnail with professional appearance.`
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'progress', message: 'Starting image generation...', progress: 10
          })}\n\n`))

          const result = await OpenAIImageService.generateThumbnail({
            prompt: enhancedPrompt,
            projectId,
            quality: quality === 'hd' ? 'high' : quality as any,
          })

          if (!result) throw new Error('Image generation failed')

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'progress', message: 'Saving thumbnail...', progress: 80
          })}\n\n`))

          await supabaseAdmin
            .from('projects')
            .update({
              thumbnail_url: result.url,
              metadata: {
                ...project.metadata,
                thumbnailGenerated: true,
                thumbnailPrompt: enhancedPrompt,
                generatedWith: 'gpt-image-1.5'
              }
            })
            .eq('id', projectId)

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete', url: result.url, progress: 100,
            message: 'Thumbnail generated successfully!'
          })}\n\n`))

          controller.close()
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error', error: error instanceof Error ? error.message : 'Generation failed'
          })}\n\n`))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Thumbnail streaming error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to generate thumbnail'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
} 