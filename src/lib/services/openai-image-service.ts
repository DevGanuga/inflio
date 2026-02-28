/**
 * Unified OpenAI Image Service
 *
 * Single service for all image generation across the app:
 * posts, thumbnails, iterations, social graphics, persona-referenced images.
 *
 * Uses GPT Image 1.5 via OpenAI's direct API for:
 *   generate()          — text-to-image (no input images)
 *   edit()              — modify an existing image with a prompt
 *   generateWithPersona() — generate with persona portrait references
 */

import { getOpenAI } from '@/lib/openai'
import { SupabaseImageStorage } from '@/lib/supabase-image-storage'
import { v4 as uuidv4 } from 'uuid'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ImageSize = 'auto' | '1024x1024' | '1536x1024' | '1024x1536'
export type ImageQuality = 'low' | 'medium' | 'high' | 'auto'
export type OutputFormat = 'png' | 'jpeg' | 'webp'
export type InputFidelity = 'high' | 'low'

export interface GenerateOptions {
  size?: ImageSize
  quality?: ImageQuality
  outputFormat?: OutputFormat
  n?: number
  storagePath?: string
}

export interface EditOptions {
  size?: ImageSize
  quality?: ImageQuality
  outputFormat?: OutputFormat
  inputFidelity?: InputFidelity
  storagePath?: string
}

export interface GeneratedImage {
  url: string
  model: string
  storagePath: string
}

// Preset sizes for common content types
export const IMAGE_SIZES: Record<string, ImageSize> = {
  thumbnail:  '1536x1024',
  carousel:   '1024x1536',
  single:     '1024x1536',
  story:      '1024x1536',
  reel:       '1024x1536',
  quote:      '1024x1024',
  thread:     '1536x1024',
  square:     '1024x1024',
  landscape:  '1536x1024',
  portrait:   '1024x1536',
}

// ─── Service ─────────────────────────────────────────────────────────────────

const MODEL = 'gpt-image-1.5'

export class OpenAIImageService {

  /**
   * Text-to-image generation. No input images.
   */
  static async generate(
    prompt: string,
    options: GenerateOptions = {}
  ): Promise<GeneratedImage> {
    const openai = getOpenAI()
    const {
      size = '1024x1536',
      quality = 'high',
      outputFormat = 'png',
      n = 1,
      storagePath = 'images/general',
    } = options

    console.log(`[OpenAIImageService] generate — size=${size}, quality=${quality}`)

    const result = await openai.images.generate({
      model: MODEL,
      prompt,
      size,
      quality,
      n,
    })

    return this.processResult(result, storagePath, outputFormat)
  }

  /**
   * Edit an existing image with a prompt.
   * Use for iterations, refinements, style transfers.
   *
   * inputFidelity:
   *   "high" — preserve most of the original (small tweaks)
   *   "low"  — looser interpretation (bigger changes)
   */
  static async edit(
    imageUrls: string[],
    prompt: string,
    options: EditOptions = {}
  ): Promise<GeneratedImage> {
    const openai = getOpenAI()
    const {
      size = 'auto',
      quality = 'high',
      inputFidelity = 'high',
      storagePath = 'images/edits',
      outputFormat = 'png',
    } = options

    const images = imageUrls.map(url => ({ image_url: url }))

    console.log(`[OpenAIImageService] edit — ${images.length} input image(s), fidelity=${inputFidelity}`)

    // SDK types may lag behind the API — the `images` array param
    // is supported by GPT Image models on the /images/edits endpoint
    const result = await (openai.images.edit as Function)({
      model: MODEL,
      images,
      prompt,
      size,
      quality,
      input_fidelity: inputFidelity,
    })

    return this.processResult(result, storagePath, outputFormat)
  }

  /**
   * Generate an image featuring a persona.
   * Passes portrait photos as reference images so GPT maintains likeness.
   */
  static async generateWithPersona(
    prompt: string,
    portraitUrls: string[],
    options: EditOptions = {}
  ): Promise<GeneratedImage> {
    if (!portraitUrls.length) {
      throw new Error('generateWithPersona requires at least one portrait URL')
    }

    // Limit to 4 reference images (diminishing returns beyond that)
    const refs = portraitUrls.slice(0, 4)

    console.log(`[OpenAIImageService] generateWithPersona — ${refs.length} portrait ref(s)`)

    const personaPrompt =
      `Generate an image featuring the person shown in the reference photo(s). ` +
      `Maintain their exact likeness, facial features, and appearance. ` +
      prompt

    return this.edit(refs, personaPrompt, {
      inputFidelity: 'low',
      ...options,
    })
  }

  // ─── Convenience helpers ─────────────────────────────────────────────────

  /**
   * Get the preset size for a content type.
   */
  static sizeFor(contentType: string): ImageSize {
    return IMAGE_SIZES[contentType] || '1024x1536'
  }

  /**
   * Generate a post image (with or without persona).
   * Convenience wrapper used by AdvancedPostsService.
   */
  static async generatePostImage(params: {
    prompt: string
    contentType: string
    brandColors?: string[]
    postTitle?: string
    personaPortraitUrls?: string[]
    projectId?: string
  }): Promise<GeneratedImage | null> {
    try {
      const { prompt, contentType, brandColors, postTitle, personaPortraitUrls, projectId } = params

      let imagePrompt = prompt
      if (postTitle && !prompt.toLowerCase().includes(postTitle.toLowerCase().substring(0, 20))) {
        imagePrompt = `Visual for "${postTitle}". ${imagePrompt}`
      }
      if (brandColors?.length) {
        imagePrompt += ` Brand color palette: ${brandColors.join(', ')}.`
      }

      const size = this.sizeFor(contentType)
      const storagePath = `posts/${projectId || 'general'}`

      if (personaPortraitUrls?.length) {
        return await this.generateWithPersona(imagePrompt, personaPortraitUrls, { size, storagePath })
      }

      return await this.generate(imagePrompt, { size, storagePath })
    } catch (error) {
      console.error('[OpenAIImageService] generatePostImage failed:', error)
      return null
    }
  }

  /**
   * Generate a thumbnail (with or without persona).
   */
  static async generateThumbnail(params: {
    prompt: string
    personaPortraitUrls?: string[]
    projectId?: string
    quality?: ImageQuality
  }): Promise<GeneratedImage | null> {
    try {
      const { prompt, personaPortraitUrls, projectId, quality = 'high' } = params
      const storagePath = `thumbnails/${projectId || 'general'}`
      const size: ImageSize = '1536x1024'

      if (personaPortraitUrls?.length) {
        return await this.generateWithPersona(prompt, personaPortraitUrls, { size, quality, storagePath })
      }

      return await this.generate(prompt, { size, quality, storagePath })
    } catch (error) {
      console.error('[OpenAIImageService] generateThumbnail failed:', error)
      return null
    }
  }

  /**
   * Iterate on an existing thumbnail with feedback.
   */
  static async iterateThumbnail(params: {
    currentImageUrl: string
    feedback: string
    projectId?: string
    fidelity?: InputFidelity
  }): Promise<GeneratedImage | null> {
    try {
      const { currentImageUrl, feedback, projectId, fidelity = 'high' } = params
      const storagePath = `thumbnails/${projectId || 'general'}`

      return await this.edit(
        [currentImageUrl],
        feedback,
        { size: '1536x1024', inputFidelity: fidelity, storagePath }
      )
    } catch (error) {
      console.error('[OpenAIImageService] iterateThumbnail failed:', error)
      return null
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private static async processResult(
    result: any,
    storagePath: string,
    outputFormat: OutputFormat
  ): Promise<GeneratedImage> {
    const imageData = result.data?.[0]

    if (!imageData?.b64_json && !imageData?.url) {
      throw new Error('No image data in GPT Image response')
    }

    // GPT Image models return base64 — upload to Supabase for a permanent URL
    if (imageData.b64_json) {
      const imageId = uuidv4()
      const publicUrl = await SupabaseImageStorage.uploadImage(
        imageData.b64_json,
        storagePath,
        imageId,
        outputFormat
      )
      return { url: publicUrl, model: MODEL, storagePath }
    }

    // Fallback for URL-based responses (DALL-E models)
    return { url: imageData.url, model: MODEL, storagePath }
  }
}
