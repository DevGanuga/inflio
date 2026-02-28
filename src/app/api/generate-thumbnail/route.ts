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
      prompt,
      referenceImageUrl,
      style = 'modern',
      quality = 'hd',
      personaName
    } = body

    if (!projectId || !prompt) {
      return NextResponse.json({
        error: 'Missing required fields: projectId and prompt'
      }, { status: 400 })
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Build prompt with content analysis context
    let enhancedPrompt = prompt
    if (!prompt && project.content_analysis) {
      const { topics, keywords, mood } = project.content_analysis
      enhancedPrompt = `YouTube thumbnail for video titled "${project.title}". `
      if (topics?.length) enhancedPrompt += `Main topics: ${topics.slice(0, 2).join(', ')}. `
      if (keywords?.length) enhancedPrompt += `Key elements: ${keywords.slice(0, 3).join(', ')}. `
    }

    const styleHint =
      style === 'modern' ? 'Clean, minimalist design with strong visual hierarchy' :
      style === 'vibrant' ? 'Bright, saturated colors with dynamic composition' :
      style === 'professional' ? 'Polished, trustworthy appearance' :
      style === 'dramatic' ? 'High contrast, cinematic lighting, intense mood' : ''

    const thumbnailPrompt = `Create a high-impact YouTube thumbnail. ${enhancedPrompt}

CRITICAL Requirements:
- 16:9 aspect ratio, bold readable text overlay if applicable
- High contrast and vibrant colors, clear focal point
- Emotion-evoking imagery, professional quality, no blur or artifacts
${styleHint ? `- ${styleHint}` : ''}
${personaName ? `- Feature ${personaName} prominently with engaging expression` : ''}

Style: ${style}, photorealistic, ultra HD quality, professional YouTube thumbnail`

    // Resolve persona portrait URLs if available
    let personaPortraitUrls: string[] = []
    try {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('default_persona_id')
        .eq('clerk_user_id', userId)
        .single()

      if (profile?.default_persona_id) {
        const { data: persona } = await supabaseAdmin
          .from('personas')
          .select('id, name, metadata')
          .eq('id', profile.default_persona_id)
          .single()

        if (persona) {
          personaPortraitUrls =
            persona.metadata?.generalPortraitUrls?.slice(0, 4) ||
            persona.metadata?.portraitUrls?.slice(0, 4) ||
            []
        }
      }
    } catch (e) {
      console.warn('Persona lookup skipped:', e)
    }

    // Generate thumbnail — edit mode if we have a reference image, otherwise generate
    let result
    const imgQuality = quality === 'hd' ? 'high' : 'medium'
    const storagePath = `thumbnails/${projectId}`

    if (referenceImageUrl) {
      result = await OpenAIImageService.edit(
        [referenceImageUrl, ...personaPortraitUrls.slice(0, 2)],
        thumbnailPrompt,
        { size: '1536x1024', quality: imgQuality as any, inputFidelity: 'low', storagePath }
      )
    } else if (personaPortraitUrls.length > 0) {
      result = await OpenAIImageService.generateWithPersona(
        thumbnailPrompt,
        personaPortraitUrls,
        { size: '1536x1024', quality: imgQuality as any, storagePath }
      )
    } else {
      result = await OpenAIImageService.generate(
        thumbnailPrompt,
        { size: '1536x1024', quality: imgQuality as any, storagePath }
      )
    }

    const publicUrl = result.url

    // Save to thumbnail history
    const { data: thumbnailHistory } = await supabaseAdmin
      .from('thumbnail_history')
      .insert({
        project_id: projectId,
        user_id: userId,
        type: 'generate',
        prompt,
        base_prompt: thumbnailPrompt,
        params: { style, quality, dimensions: { width: 1920, height: 1080 } },
        model: 'gpt-image-1.5',
        output_url: publicUrl,
        width: 1920,
        height: 1080,
        status: 'completed',
        created_by: userId
      })
      .select()
      .single()

    // Update project thumbnail
    await supabaseAdmin
      .from('projects')
      .update({
        thumbnail_url: publicUrl,
        metadata: {
          ...project.metadata,
          thumbnailGenerated: true,
          thumbnailStyle: style,
          thumbnailPrompt,
          hasPersona: personaPortraitUrls.length > 0,
          lastThumbnailId: thumbnailHistory?.id
        }
      })
      .eq('id', projectId)

    // Generate text overlay suggestions
    let textSuggestions: string[] = []
    if (project.content_analysis) {
      textSuggestions = generateTextOverlaySuggestions(
        project.title,
        project.content_analysis
      )
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      imageUrl: publicUrl,
      prompt: thumbnailPrompt,
      textSuggestions,
      metadata: {
        style,
        quality,
        model: 'gpt-image-1.5',
        dimensions: '1920x1080',
        hasPersona: personaPortraitUrls.length > 0
      }
    })

  } catch (error) {
    console.error('Thumbnail generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate thumbnail' },
      { status: 500 }
    )
  }
}

function generateTextOverlaySuggestions(title: string, contentAnalysis: any): string[] {
  const suggestions: string[] = []

  if (contentAnalysis.contentSuggestions?.socialMediaHooks) {
    suggestions.push(
      ...contentAnalysis.contentSuggestions.socialMediaHooks
        .map((hook: string) => hook.substring(0, 30) + (hook.length > 30 ? '...' : ''))
        .slice(0, 2)
    )
  }

  if (contentAnalysis.topics?.length) {
    suggestions.push(`What is ${contentAnalysis.topics[0]}?`)
    suggestions.push(`${contentAnalysis.topics[0]} Explained`)
  }

  if (contentAnalysis.keywords?.length > 1) {
    suggestions.push(`Master ${contentAnalysis.keywords[0]}`)
  }

  suggestions.push(title.length > 40 ? title.substring(0, 35) + '...' : title)

  return suggestions.slice(0, 5)
}

// Get thumbnail generation history
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    const limit = parseInt(searchParams.get('limit') || '20')

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
    }

    // Fetch thumbnail history with feedback
    const { data: thumbnails, error } = await supabaseAdmin
      .from('thumbnail_history')
      .select(`
        *,
        thumbnail_feedback (
          rating,
          feedback_text,
          created_at
        )
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch thumbnail history' 
      }, { status: 500 })
    }

    // Build iteration tree structure
    const thumbnailMap = new Map()
    const roots: any[] = []

    // First pass: create map of all thumbnails
    thumbnails?.forEach(thumb => {
      thumbnailMap.set(thumb.id, { 
        ...thumb, 
        children: [],
        averageRating: thumb.thumbnail_feedback?.length > 0 
          ? thumb.thumbnail_feedback.reduce((acc: number, f: any) => acc + f.rating, 0) / thumb.thumbnail_feedback.length
          : null
      })
    })

    // Second pass: build parent-child relationships
    thumbnails?.forEach(thumb => {
      if (thumb.parent_id) {
        const parent = thumbnailMap.get(thumb.parent_id)
        if (parent) {
          parent.children.push(thumbnailMap.get(thumb.id))
        }
      } else {
        roots.push(thumbnailMap.get(thumb.id))
      }
    })
    
    return NextResponse.json({
      history: roots,
      count: thumbnails?.length || 0,
      hasMore: thumbnails?.length === limit
    })

  } catch (error) {
    console.error('Error fetching thumbnail history:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch thumbnail history' 
    }, { status: 500 })
  }
} 