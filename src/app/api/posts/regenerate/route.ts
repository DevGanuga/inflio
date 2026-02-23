import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { AdvancedPostsService } from '@/lib/ai-posts-advanced'
import { fetchBrandAndPersonaContext, extractTranscriptText } from '@/lib/ai-context'
import { v4 as uuidv4 } from 'uuid'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { suggestionId, feedback } = body

    if (!suggestionId) {
      return NextResponse.json(
        { error: 'Suggestion ID is required' },
        { status: 400 }
      )
    }

    const { data: suggestion, error: fetchError } = await supabaseAdmin
      .from('post_suggestions')
      .select('*, projects:project_id (id, title, transcription, content_analysis, content_brief)')
      .eq('id', suggestionId)
      .single()

    if (fetchError || !suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
    }

    if (suggestion.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    await supabaseAdmin
      .from('post_suggestions')
      .update({ status: 'generating' })
      .eq('id', suggestionId)

    const project = suggestion.projects
    const fullTranscript = extractTranscriptText(project?.transcription)
    const contentAnalysis = project?.content_analysis || {}

    const { brand, persona } = await fetchBrandAndPersonaContext(
      userId,
      suggestion.persona_id,
      true
    )

    const input = {
      transcript: fullTranscript,
      projectTitle: project?.title || 'Untitled',
      contentAnalysis: {
        topics: contentAnalysis.topics || [],
        keywords: contentAnalysis.keywords || [],
        keyPoints: contentAnalysis.keyPoints || [],
        sentiment: contentAnalysis.sentiment,
        summary: contentAnalysis.summary,
        keyMoments: contentAnalysis.keyMoments || [],
        socialMediaHooks: contentAnalysis.contentSuggestions?.socialMediaHooks || [],
      },
      platforms: suggestion.platforms || ['instagram', 'twitter', 'linkedin'],
      brand,
      persona,
      tone: suggestion.metadata?.tone,
      contentGoal: suggestion.metadata?.content_goal,
      contentTypes: [suggestion.content_type],
      contentBrief: project?.content_brief || null,
    }

    const posts = await AdvancedPostsService.generateAdvancedPosts(input)
    const post = posts[0]

    if (!post) {
      throw new Error('AI did not return a post')
    }

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

    const images = []
    if (post.imagePrompt) {
      const heroId = uuidv4()
      let imageUrl = null
      let imageModel = null

      try {
        const imageResult = await AdvancedPostsService.generatePostImage({
          prompt: post.imagePrompt,
          contentType: post.contentType,
          persona,
          brandColors: brand?.colors?.primary || [],
        })
        if (imageResult) {
          imageUrl = imageResult.url
          imageModel = imageResult.model
        }
      } catch (imgErr) {
        console.error('[regenerate] Image generation failed:', imgErr)
      }

      images.push({
        id: heroId,
        type: 'hero',
        prompt: post.imagePrompt,
        url: imageUrl,
        model: imageModel,
        dimensions: post.imageDimensions || '1080x1350',
        position: 0,
      })
    }

    const { error: updateError } = await supabaseAdmin
      .from('post_suggestions')
      .update({
        title: post.title,
        description: post.hook,
        content_type: post.contentType,
        type: post.contentType,
        platforms: Object.keys(copyVariants),
        copy_variants: copyVariants,
        images,
        visual_style: {
          style: post.imageStyle || 'modern',
          colors: brand?.colors?.primary || [],
          description: post.imagePrompt,
        },
        engagement_data: {
          predicted_reach: post.engagement?.estimatedReach || 'medium',
          target_audience: post.engagement?.targetAudience || '',
          best_time: post.engagement?.bestTimeToPost || '',
          why_it_works: post.engagement?.whyItWorks || '',
        },
        metadata: {
          hook: post.hook,
          transcript_quote: post.transcriptQuote,
          carousel_slides: post.carouselSlides || null,
          content_goal: suggestion.metadata?.content_goal || null,
          tone: suggestion.metadata?.tone || null,
          feedback: feedback || null,
          regenerated: true,
          regeneration_count: (suggestion.metadata?.regeneration_count || 0) + 1,
        },
        status: 'ready',
        generation_model: 'gpt-5.2',
        updated_at: new Date().toISOString(),
      })
      .eq('id', suggestionId)

    if (updateError) {
      throw new Error(`Failed to save regenerated post: ${updateError.message}`)
    }

    const { data: updated } = await supabaseAdmin
      .from('post_suggestions')
      .select('*')
      .eq('id', suggestionId)
      .single()

    return NextResponse.json({ success: true, suggestion: updated })
  } catch (error) {
    console.error('Regeneration error:', error)

    try {
      const body = await request.clone().json()
      if (body.suggestionId) {
        await supabaseAdmin
          .from('post_suggestions')
          .update({ status: 'ready' })
          .eq('id', body.suggestionId)
      }
    } catch { /* ignore cleanup errors */ }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to regenerate suggestion' },
      { status: 500 }
    )
  }
}
