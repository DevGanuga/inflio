import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { v4 as uuidv4 } from 'uuid'
import {
  AdvancedPostsService,
  type GeneratePostsInput,
  type ContentAnalysisContext
} from '@/lib/ai-posts-advanced'
import {
  fetchBrandAndPersonaContext,
  extractTranscriptText,
} from '@/lib/ai-context'

export const maxDuration = 120

/**
 * POST /api/posts/generate
 *
 * Synchronous generation endpoint. For most cases, prefer /api/posts/generate-smart
 * which uses Inngest for background processing (including image generation).
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      projectId,
      projectTitle,
      contentAnalysis,
      transcript,
      personaId,
      contentTypes,
      platforms,
      settings = {}
    } = body

    if (!projectId || !projectTitle) {
      return NextResponse.json({ error: 'Project ID and title are required' }, { status: 400 })
    }

    let fullTranscript = transcript || ''
    if (!fullTranscript) {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('transcription')
        .eq('id', projectId)
        .single()
      fullTranscript = extractTranscriptText(project?.transcription)
    }

    if (!fullTranscript) {
      return NextResponse.json(
        { error: 'Transcript is required for content-aware post generation' },
        { status: 400 }
      )
    }

    const { brand, persona } = await fetchBrandAndPersonaContext(userId, personaId, true)

    const analysisCtx: ContentAnalysisContext = {
      topics: contentAnalysis?.topics || [],
      keywords: contentAnalysis?.keywords || [],
      keyPoints: contentAnalysis?.keyPoints || [],
      sentiment: contentAnalysis?.sentiment,
      summary: contentAnalysis?.summary,
      keyMoments: contentAnalysis?.keyMoments || [],
      socialMediaHooks: contentAnalysis?.contentSuggestions?.socialMediaHooks || [],
    }

    const input: GeneratePostsInput = {
      transcript: fullTranscript,
      projectTitle,
      contentAnalysis: analysisCtx,
      platforms: platforms || brand?.primaryPlatforms || ['instagram', 'twitter', 'linkedin'],
      brand,
      persona,
      tone: settings.tone,
      contentGoal: settings.contentGoal,
      contentTypes,
    }

    const posts = await AdvancedPostsService.generateAdvancedPosts(input)

    const suggestions = posts.map((post) => {
      const suggestionId = uuidv4()
      const copyVariants: Record<string, any> = {}
      if (post.platformCopy) {
        for (const [platform, copy] of Object.entries(post.platformCopy)) {
          copyVariants[platform] = {
            caption: copy.caption,
            hashtags: copy.hashtags || [],
            cta: copy.cta || '',
            title: post.title,
            description: post.hook,
          }
        }
      }

      return {
        id: suggestionId,
        project_id: projectId,
        user_id: userId,
        type: post.contentType,
        content_type: post.contentType,
        title: post.title,
        description: post.hook,
        platforms: Object.keys(copyVariants),
        copy_variants: copyVariants,
        images: post.imagePrompt
          ? [{ id: uuidv4(), type: 'hero', prompt: post.imagePrompt, dimensions: post.imageDimensions || '1080x1350', position: 0, url: null }]
          : [],
        visual_style: { style: post.imageStyle || 'modern', colors: brand?.colors?.primary || [] },
        engagement_data: {
          predicted_reach: post.engagement?.estimatedReach || 'medium',
          target_audience: post.engagement?.targetAudience || '',
          best_time: post.engagement?.bestTimeToPost || '',
          why_it_works: post.engagement?.whyItWorks || '',
        },
        persona_id: persona?.id || null,
        persona_used: !!persona,
        generation_model: 'gpt-5.2',
        metadata: {
          hook: post.hook,
          transcript_quote: post.transcriptQuote,
          carousel_slides: post.carouselSlides || null,
        },
        status: 'ready',
        created_at: new Date().toISOString(),
      }
    })

    if (suggestions.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('post_suggestions')
        .insert(suggestions)
      if (insertError) {
        console.error('[posts/generate] DB insert error:', insertError)
      }
    }

    return NextResponse.json({
      success: true,
      suggestions,
      count: suggestions.length,
    })
  } catch (error) {
    console.error('[posts/generate] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate post suggestions' },
      { status: 500 }
    )
  }
}
