import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * POST /api/posts/quick-publish
 *
 * Takes an approved post suggestion and publishes it directly to
 * connected social platforms using the platform-specific copy variants.
 *
 * Body: { suggestionId: string, platforms?: string[], scheduledFor?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { suggestionId, platforms: requestedPlatforms, scheduledFor } = await req.json()

    if (!suggestionId) {
      return NextResponse.json({ error: 'suggestionId is required' }, { status: 400 })
    }

    // Fetch the suggestion
    const { data: suggestion, error: fetchErr } = await supabaseAdmin
      .from('post_suggestions')
      .select('*')
      .eq('id', suggestionId)
      .single()

    if (fetchErr || !suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
    }

    if (suggestion.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const copyVariants = suggestion.copy_variants || {}
    const availablePlatforms = Object.keys(copyVariants)

    if (availablePlatforms.length === 0) {
      return NextResponse.json(
        { error: 'No platform copy available for this post' },
        { status: 400 }
      )
    }

    const targetPlatforms = requestedPlatforms?.length
      ? requestedPlatforms.filter((p: string) => availablePlatforms.includes(p))
      : availablePlatforms

    if (targetPlatforms.length === 0) {
      return NextResponse.json(
        { error: 'None of the requested platforms have copy available' },
        { status: 400 }
      )
    }

    // Get connected integrations
    const { data: integrations } = await supabaseAdmin
      .from('social_integrations')
      .select('*')
      .eq('user_id', userId)
      .in('platform', targetPlatforms)
      .eq('disabled', false)

    // Get hero image URL if available
    const heroImageUrl = suggestion.images?.[0]?.url || null
    const mediaUrls = heroImageUrl ? [heroImageUrl] : []

    const results: any[] = []
    const errors: any[] = []

    for (const platform of targetPlatforms) {
      const copy = copyVariants[platform]
      if (!copy?.caption) continue

      const integration = integrations?.find((i: any) => i.platform === platform)

      // Build full content with hashtags
      let content = copy.caption
      if (copy.hashtags?.length > 0) {
        const tags = copy.hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`)
        content += '\n\n' + tags.join(' ')
      }

      // Create social_posts record
      const { data: post, error: postErr } = await supabaseAdmin
        .from('social_posts')
        .insert({
          user_id: userId,
          integration_id: integration?.id || null,
          project_id: suggestion.project_id,
          state: scheduledFor ? 'scheduled' : (integration ? 'publishing' : 'draft'),
          publish_date: scheduledFor || new Date().toISOString(),
          content,
          media_urls: mediaUrls,
          metadata: {
            suggestion_id: suggestionId,
            platform,
            content_type: suggestion.content_type,
            cta: copy.cta,
            engagement_prediction: suggestion.engagement_data,
          },
          settings: {
            platform,
            autoHashtags: false,
          },
        })
        .select()
        .single()

      if (postErr) {
        errors.push({ platform, error: postErr.message })
        continue
      }

      // If we have an integration and not scheduled, attempt immediate publish
      if (integration && !scheduledFor) {
        try {
          const publishRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/social/publish`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Key': process.env.INTERNAL_API_KEY || '',
            },
            body: JSON.stringify({
              content,
              platforms: [platform],
              media: mediaUrls,
              projectId: suggestion.project_id,
            }),
          })

          if (publishRes.ok) {
            await supabaseAdmin
              .from('social_posts')
              .update({ state: 'published' })
              .eq('id', post.id)

            results.push({ platform, status: 'published', postId: post.id })
          } else {
            await supabaseAdmin
              .from('social_posts')
              .update({ state: 'failed' })
              .eq('id', post.id)

            errors.push({ platform, error: 'Platform API failed' })
          }
        } catch (pubErr) {
          await supabaseAdmin
            .from('social_posts')
            .update({ state: 'failed' })
            .eq('id', post.id)

          errors.push({ platform, error: 'Publish request failed' })
        }
      } else if (scheduledFor) {
        results.push({ platform, status: 'scheduled', postId: post.id })
      } else {
        results.push({ platform, status: 'draft', postId: post.id })
      }
    }

    // Mark suggestion as published
    await supabaseAdmin
      .from('post_suggestions')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', suggestionId)

    return NextResponse.json({
      success: results.length > 0,
      results,
      errors: errors.length > 0 ? errors : undefined,
      connectedPlatforms: integrations?.map((i: any) => i.platform) || [],
      draftPlatforms: targetPlatforms.filter(
        (p: string) => !integrations?.find((i: any) => i.platform === p)
      ),
    })
  } catch (error) {
    console.error('[quick-publish] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to publish' },
      { status: 500 }
    )
  }
}
