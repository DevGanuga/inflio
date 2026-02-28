/**
 * Enhanced Thumbnail Service
 *
 * Uses GPT-Image 1.5 via OpenAIImageService for high-fidelity thumbnail
 * generation with persona reference images for character consistency.
 *
 * Key features:
 * - Multi-layered prompts from Content Assistant analysis
 * - Persona reference image integration for consistent character appearance
 * - Click psychology-driven composition
 * - Brand color and style alignment
 * - Iterative refinement via the edit endpoint
 */

import { v4 as uuidv4 } from 'uuid'
import { OpenAIImageService, type ImageQuality } from '@/lib/services/openai-image-service'

const getSupabaseAdmin = async () => {
  const { supabaseAdmin } = await import('@/lib/supabase/admin')
  return supabaseAdmin
}

// Types
export interface ThumbnailGenerationInput {
  prompt: string
  negativePrompt?: string

  persona?: {
    id: string
    name: string
    referenceImageUrls: string[]
  }

  brand?: {
    primaryColor?: string
    secondaryColor?: string
    accentColor?: string
  }

  options?: {
    quality?: 'low' | 'medium' | 'high'
    aspectRatio?: '16:9' | '1:1' | '9:16'
    numVariations?: number
    outputFormat?: 'png' | 'jpeg' | 'webp'
    inputFidelity?: 'low' | 'high'
  }

  projectId: string
  userId: string
}

export interface GeneratedThumbnail {
  id: string
  url: string
  localUrl?: string
  width: number
  height: number
  prompt: string
  model: string
  generatedAt: string
}

export interface ThumbnailGenerationResult {
  success: boolean
  thumbnails: GeneratedThumbnail[]
  error?: string
  metadata: {
    model: string
    quality: string
    processingTime: number
    personaUsed: boolean
  }
}

const MODEL_NAME = 'gpt-image-1.5'

/**
 * Enhanced Thumbnail Service using OpenAI GPT-Image 1.5 directly.
 */
export class EnhancedThumbnailService {

  async generateThumbnail(input: ThumbnailGenerationInput): Promise<ThumbnailGenerationResult> {
    const startTime = Date.now()
    const options = input.options || {}
    const enhancedPrompt = this.buildEnhancedPrompt(input)
    const size = this.mapAspectRatioToSize(options.aspectRatio || '16:9')
    const storagePath = `thumbnails/${input.projectId}`

    try {
      const hasPersona = !!input.persona?.referenceImageUrls?.length

      let result

      if (hasPersona) {
        result = await OpenAIImageService.generateWithPersona(
          enhancedPrompt,
          input.persona!.referenceImageUrls,
          { size, quality: (options.quality || 'high') as ImageQuality, storagePath }
        )
      } else {
        result = await OpenAIImageService.generate(
          enhancedPrompt,
          { size, quality: (options.quality || 'high') as ImageQuality, storagePath }
        )
      }

      if (!result) throw new Error('Image generation returned no result')

      const thumbnailId = uuidv4()
      const dimensions = this.getDimensions(options.aspectRatio || '16:9')

      const thumbnail: GeneratedThumbnail = {
        id: thumbnailId,
        url: result.url,
        localUrl: result.url,
        width: dimensions.width,
        height: dimensions.height,
        prompt: enhancedPrompt,
        model: MODEL_NAME,
        generatedAt: new Date().toISOString()
      }

      await this.saveThumbnailHistory(input, [thumbnail])

      // If numVariations > 1, generate more
      const thumbnails: GeneratedThumbnail[] = [thumbnail]
      const extraCount = (options.numVariations || 1) - 1
      if (extraCount > 0) {
        const variations = await this.generateVariations(input, extraCount)
        thumbnails.push(...variations.thumbnails)
      }

      return {
        success: true,
        thumbnails,
        metadata: {
          model: MODEL_NAME,
          quality: options.quality || 'high',
          processingTime: Date.now() - startTime,
          personaUsed: hasPersona
        }
      }
    } catch (error) {
      console.error('Enhanced thumbnail generation error:', error)
      return {
        success: false,
        thumbnails: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          model: MODEL_NAME,
          quality: options.quality || 'high',
          processingTime: Date.now() - startTime,
          personaUsed: !!input.persona
        }
      }
    }
  }

  async generateVariations(
    input: ThumbnailGenerationInput,
    count: number = 3
  ): Promise<ThumbnailGenerationResult> {
    const variationPrompts = this.createVariationPrompts(input.prompt, count)
    const allThumbnails: GeneratedThumbnail[] = []
    let totalTime = 0

    for (const variationPrompt of variationPrompts) {
      const result = await this.generateThumbnail({
        ...input,
        prompt: variationPrompt,
        options: { ...input.options, numVariations: 1 }
      })

      if (result.success) {
        allThumbnails.push(...result.thumbnails)
      }
      totalTime += result.metadata.processingTime
    }

    return {
      success: allThumbnails.length > 0,
      thumbnails: allThumbnails,
      metadata: {
        model: MODEL_NAME,
        quality: input.options?.quality || 'high',
        processingTime: totalTime,
        personaUsed: !!input.persona
      }
    }
  }

  async refineThumbnail(
    existingThumbnailUrl: string,
    refinementPrompt: string,
    input: Partial<ThumbnailGenerationInput>
  ): Promise<ThumbnailGenerationResult> {
    const startTime = Date.now()

    try {
      const imageUrls = [existingThumbnailUrl]
      if (input.persona?.referenceImageUrls) {
        imageUrls.push(...input.persona.referenceImageUrls.slice(0, 2))
      }

      const storagePath = `thumbnails/${input.projectId || 'general'}`

      const result = await OpenAIImageService.edit(
        imageUrls,
        refinementPrompt,
        {
          size: 'auto',
          quality: (input.options?.quality || 'high') as ImageQuality,
          inputFidelity: 'high',
          storagePath
        }
      )

      const thumbnailId = uuidv4()
      const thumbnail: GeneratedThumbnail = {
        id: thumbnailId,
        url: result.url,
        localUrl: result.url,
        width: 1920,
        height: 1080,
        prompt: refinementPrompt,
        model: MODEL_NAME,
        generatedAt: new Date().toISOString()
      }

      return {
        success: true,
        thumbnails: [thumbnail],
        metadata: {
          model: MODEL_NAME,
          quality: input.options?.quality || 'high',
          processingTime: Date.now() - startTime,
          personaUsed: !!input.persona
        }
      }
    } catch (error) {
      console.error('Thumbnail refinement error:', error)
      return {
        success: false,
        thumbnails: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          model: MODEL_NAME,
          quality: input.options?.quality || 'high',
          processingTime: Date.now() - startTime,
          personaUsed: !!input.persona
        }
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private buildEnhancedPrompt(input: ThumbnailGenerationInput): string {
    let prompt = input.prompt

    if (input.persona) {
      prompt = `Create a professional YouTube thumbnail featuring ${input.persona.name}.
The person in the reference images should be the main subject, maintaining their exact appearance, facial features, and identity.

${prompt}

CRITICAL REQUIREMENTS FOR PERSONA:
- Maintain exact facial features and appearance from reference images
- Professional lighting on face with clear visibility
- Face should occupy 30-40% of the frame
- Direct eye contact with viewer
- Sharp, high-definition facial details
- Natural skin tones and textures`
    }

    if (input.brand) {
      const colorHints = []
      if (input.brand.primaryColor) colorHints.push(`primary color: ${input.brand.primaryColor}`)
      if (input.brand.accentColor) colorHints.push(`accent color: ${input.brand.accentColor}`)

      if (colorHints.length > 0) {
        prompt += `\n\nBRAND COLORS: ${colorHints.join(', ')}. Incorporate these colors subtly in the composition.`
      }
    }

    prompt += `

THUMBNAIL TECHNICAL REQUIREMENTS:
- Ultra HD quality, 4K resolution appearance
- High contrast for visibility at small sizes
- Clean composition with clear focal point
- Professional color grading
- No blur, artifacts, or distortions
- Optimized for YouTube thumbnail display`

    return prompt
  }

  private createVariationPrompts(basePrompt: string, count: number): string[] {
    const variations = [
      `${basePrompt}\n\nEMPHASIS: Focus on emotional expression and connection with viewer. Make the emotion the primary visual element.`,
      `${basePrompt}\n\nEMPHASIS: Use dynamic angles and dramatic composition. Create visual tension and energy.`,
      `${basePrompt}\n\nEMPHASIS: Bold, vibrant colors that pop. High saturation and contrast for maximum scroll-stopping impact.`,
      `${basePrompt}\n\nEMPHASIS: Clean, minimalist composition with strong negative space. Let the subject breathe.`,
      `${basePrompt}\n\nEMPHASIS: Capture a specific moment that tells a story. Create narrative intrigue.`
    ]
    return variations.slice(0, count)
  }

  private mapAspectRatioToSize(aspectRatio: string): '1024x1024' | '1536x1024' | '1024x1536' {
    const sizeMap: Record<string, '1024x1024' | '1536x1024' | '1024x1536'> = {
      '16:9': '1536x1024',
      '1:1': '1024x1024',
      '9:16': '1024x1536'
    }
    return sizeMap[aspectRatio] || '1536x1024'
  }

  private getDimensions(aspectRatio: string): { width: number; height: number } {
    const dims: Record<string, { width: number; height: number }> = {
      '16:9': { width: 1920, height: 1080 },
      '1:1': { width: 1080, height: 1080 },
      '9:16': { width: 1080, height: 1920 }
    }
    return dims[aspectRatio] || { width: 1920, height: 1080 }
  }

  private async saveThumbnailHistory(
    input: ThumbnailGenerationInput,
    thumbnails: GeneratedThumbnail[]
  ): Promise<void> {
    try {
      const supabase = await getSupabaseAdmin()

      for (const thumbnail of thumbnails) {
        await supabase.from('thumbnail_history').insert({
          id: thumbnail.id,
          project_id: input.projectId,
          user_id: input.userId,
          prompt: thumbnail.prompt,
          image_url: thumbnail.localUrl || thumbnail.url,
          model: thumbnail.model,
          status: 'completed',
          metadata: {
            width: thumbnail.width,
            height: thumbnail.height,
            personaId: input.persona?.id,
            personaName: input.persona?.name,
            quality: input.options?.quality || 'high',
            aspectRatio: input.options?.aspectRatio || '16:9'
          }
        })
      }
    } catch (error) {
      console.error('Failed to save thumbnail history:', error)
    }
  }
}

export function createEnhancedThumbnailService(): EnhancedThumbnailService {
  return new EnhancedThumbnailService()
}

export default EnhancedThumbnailService
