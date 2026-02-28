import { NextRequest, NextResponse } from 'next/server'
import { auth } from "@clerk/nextjs/server"
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { OpenAIImageService } from '@/lib/services/openai-image-service'

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseBrowserClient()
    const body = await req.json()
    const { 
      projectId, 
      count = 3,  // Number of variations to generate
      basePrompt,
      styles = ['photorealistic', 'gradient', 'corporate'],
      quality = 'high',
      projectContext
    } = body

    // Validate inputs
    if (!projectId || !basePrompt) {
      return NextResponse.json({ 
        error: 'Missing required fields: projectId and basePrompt' 
      }, { status: 400 })
    }

    // Fetch project
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      throw new Error('Project not found')
    }

    // Generate multiple thumbnails in parallel
    const thumbnailPromises = styles.slice(0, count).map(async (style: string, index: number) => {
      try {
        // Add variation to prompt
        const variations = [
          'dramatic lighting, high impact',
          'vibrant colors, eye-catching design',
          'professional look, clean aesthetic',
          'trendy style, modern appeal',
          'bold composition, striking visuals'
        ]
        
        const enhancedPrompt = `${basePrompt}, ${variations[index % variations.length]}, YouTube thumbnail, ultra HD quality`

        const result = await OpenAIImageService.generate(enhancedPrompt, {
          size: '1536x1024',
          quality: quality === 'high' ? 'high' : 'medium',
          storagePath: `thumbnails/${projectId}/batch`,
        })

        return {
          imageUrl: result.url,
          style,
          prompt: enhancedPrompt,
          variation: index
        }
      } catch (error) {
        console.error(`Failed to generate thumbnail variant ${index}:`, error)
        return null
      }
    })

    // Wait for all thumbnails to complete
    const results = await Promise.all(thumbnailPromises)
    const successfulResults = results.filter(r => r !== null)

    if (successfulResults.length === 0) {
      throw new Error('Failed to generate any thumbnails')
    }

    // Store all generated thumbnails in history
    const thumbnailsFolder = project.folders?.thumbnails || []
    const batchId = `batch_${Date.now()}`
    
    successfulResults.forEach(result => {
      if (result) {
        thumbnailsFolder.push({
          projectId,
          imageUrl: result.imageUrl,
          prompt: result.prompt,
          mode: 'batch',
          style: result.style,
          quality,
          metadata: {
            seed: result.seed,
            batchId,
            variation: result.variation
          },
          createdAt: new Date().toISOString()
        })
      }
    })

    // Update project with thumbnails history
    await supabase
      .from('projects')
      .update({
        folders: {
          ...project.folders,
          thumbnails: thumbnailsFolder
        }
      })
      .eq('id', projectId)

    // Set the first successful thumbnail as the current one if none exists
    if (!project.thumbnail_url && successfulResults[0]) {
      await supabase
        .from('projects')
        .update({
          thumbnail_url: successfulResults[0].imageUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId)
    }

    return NextResponse.json({
      success: true,
      batchId,
      thumbnails: successfulResults,
      count: successfulResults.length,
      totalRequested: count
    })

  } catch (error) {
    console.error('Batch thumbnail generation error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to generate thumbnails' 
    }, { status: 500 })
  }
} 