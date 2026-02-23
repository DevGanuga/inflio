import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { z } from 'zod'
import { PLATFORM_CONFIGS } from '@/lib/social/oauth-config'

const publishSchema = z.object({
  content: z.string().min(1).max(5000),
  platforms: z.array(z.string()).min(1),
  media: z.array(z.string()).optional(),
  scheduledFor: z.string().datetime().optional(),
  projectId: z.string().uuid().optional(),
})

async function refreshToken(platform: string, refreshTokenStr: string): Promise<{ accessToken: string; expiresIn?: number }> {
  const config = PLATFORM_CONFIGS[platform]
  if (!config) throw new Error(`Platform ${platform} not configured`)

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenStr,
    client_id: config.oauth.clientId,
    client_secret: config.oauth.clientSecret,
  })

  const response = await fetch(config.oauth.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!response.ok) throw new Error('Token refresh failed')
  const data = await response.json()
  return { accessToken: data.access_token, expiresIn: data.expires_in }
}

async function getValidToken(integration: any): Promise<string> {
  const isExpired = integration.token_expiration
    ? new Date(integration.token_expiration) < new Date()
    : false

  if (isExpired && integration.refresh_token) {
    const result = await refreshToken(integration.platform, integration.refresh_token)
    await supabaseAdmin
      .from('social_integrations')
      .update({
        token: result.accessToken,
        token_expiration: new Date(Date.now() + (result.expiresIn || 3600) * 1000).toISOString(),
        refresh_needed: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)
    return result.accessToken
  }

  return integration.token
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validation = publishSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { content, platforms, media, scheduledFor, projectId } = validation.data

    const { data: integrations, error: integrationsError } = await supabaseAdmin
      .from('social_integrations')
      .select('*')
      .eq('user_id', userId)
      .in('platform', platforms)
      .eq('disabled', false)

    if (integrationsError || !integrations || integrations.length === 0) {
      return NextResponse.json(
        { error: 'No connected accounts found for the selected platforms' },
        { status: 400 }
      )
    }

    const mediaUrls = media || []
    const posts = []
    const errors = []

    for (const integration of integrations) {
      try {
        const { data: post, error: postError } = await supabaseAdmin
          .from('social_posts')
          .insert({
            user_id: userId,
            integration_id: integration.id,
            project_id: projectId,
            state: scheduledFor ? 'scheduled' : 'publishing',
            publish_date: scheduledFor || new Date().toISOString(),
            content,
            media_urls: mediaUrls,
            settings: { platform: integration.platform },
          })
          .select()
          .single()

        if (postError) throw postError

        if (!scheduledFor) {
          const token = await getValidToken(integration)
          const publishResult = await publishToPlatform(integration.platform, token, post, integration.provider_identifier, mediaUrls)

          if (publishResult.success) {
            await supabaseAdmin
              .from('social_posts')
              .update({
                state: 'published',
                analytics: publishResult.analytics || {},
              })
              .eq('id', post.id)

            posts.push({ ...post, state: 'published', platformResponse: publishResult.data || null })
          } else {
            await supabaseAdmin
              .from('social_posts')
              .update({ state: 'failed', error: publishResult.error })
              .eq('id', post.id)

            errors.push({ platform: integration.platform, error: publishResult.error })
          }
        } else {
          posts.push(post)
        }
      } catch (error) {
        errors.push({
          platform: integration.platform,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: posts.length > 0,
      posts,
      errors: errors.length > 0 ? errors : undefined,
      scheduled: !!scheduledFor,
    })
  } catch (error) {
    console.error('Publish error:', error)
    return NextResponse.json(
      { error: 'Failed to publish content', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function publishToPlatform(
  platform: string,
  token: string,
  post: any,
  providerIdentifier: string,
  mediaUrls: string[]
): Promise<any> {
  try {
    switch (platform) {
      case 'x':
      case 'twitter':
        return await publishToX(token, post.content)
      case 'linkedin':
        return await publishToLinkedIn(token, post.content, providerIdentifier, mediaUrls)
      case 'facebook':
        return await publishToFacebook(token, post.content, providerIdentifier, mediaUrls)
      case 'instagram':
        return await publishToInstagram(token, post.content, providerIdentifier, mediaUrls)
      case 'tiktok':
        return await publishToTikTok(token, post.content, providerIdentifier, mediaUrls)
      case 'youtube':
        return { success: false, error: 'Use the dedicated YouTube upload for video publishing' }
      default:
        return { success: false, error: `Platform ${platform} not supported` }
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Platform API error' }
  }
}

// --- X/Twitter ---
async function publishToX(token: string, content: string) {
  const response = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: content }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.detail || data.title || 'Failed to post to X')

  return {
    success: true,
    data,
    analytics: { post_id: data.data.id, url: `https://x.com/i/status/${data.data.id}` },
  }
}

// --- LinkedIn (Community API v2) ---
async function publishToLinkedIn(token: string, content: string, authorId: string, mediaUrls: string[]) {
  const postBody: any = {
    author: `urn:li:person:${authorId}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: content },
        shareMediaCategory: mediaUrls.length > 0 ? 'IMAGE' : 'NONE',
        ...(mediaUrls.length > 0 && {
          media: mediaUrls.map(url => ({ status: 'READY', originalUrl: url })),
        }),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(postBody),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Failed to post to LinkedIn')

  return {
    success: true,
    data,
    analytics: { post_id: data.id, url: `https://www.linkedin.com/feed/update/${data.id}` },
  }
}

// --- Facebook ---
async function publishToFacebook(token: string, content: string, pageId: string, mediaUrls: string[]) {
  const params = new URLSearchParams({ access_token: token, message: content })
  if (mediaUrls.length > 0) params.append('link', mediaUrls[0])

  const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
    method: 'POST',
    body: params,
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message || 'Failed to post to Facebook')

  return {
    success: true,
    data,
    analytics: { post_id: data.id, url: `https://www.facebook.com/${data.id}` },
  }
}

// --- Instagram (2-step: create media container -> publish) ---
async function publishToInstagram(token: string, content: string, pageId: string, mediaUrls: string[]) {
  if (!mediaUrls || mediaUrls.length === 0) {
    throw new Error('Instagram requires at least one image')
  }

  const createParams = new URLSearchParams({
    access_token: token,
    image_url: mediaUrls[0],
    caption: content,
  })

  const createRes = await fetch(`https://graph.facebook.com/v18.0/${pageId}/media`, {
    method: 'POST',
    body: createParams,
  })

  const createData = await createRes.json()
  if (!createRes.ok) throw new Error(createData.error?.message || 'Failed to create Instagram media')

  const publishRes = await fetch(`https://graph.facebook.com/v18.0/${pageId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ access_token: token, creation_id: createData.id }),
  })

  const publishData = await publishRes.json()
  if (!publishRes.ok) throw new Error(publishData.error?.message || 'Failed to publish Instagram post')

  return {
    success: true,
    data: publishData,
    analytics: { post_id: publishData.id, url: `https://www.instagram.com/p/${publishData.id}/` },
  }
}

// --- TikTok (Content Posting API) ---
async function publishToTikTok(token: string, content: string, _userId: string, mediaUrls: string[]) {
  if (!mediaUrls || mediaUrls.length === 0) {
    return { success: false, error: 'TikTok requires a video to publish. Use clips from your project.' }
  }

  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: content.substring(0, 150),
        privacy_level: 'SELF_ONLY',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: mediaUrls[0],
      },
    }),
  })

  const initData = await initRes.json()
  if (!initRes.ok || initData.error?.code) {
    throw new Error(initData.error?.message || 'Failed to publish to TikTok')
  }

  return {
    success: true,
    data: initData,
    analytics: { publish_id: initData.data?.publish_id },
  }
}
