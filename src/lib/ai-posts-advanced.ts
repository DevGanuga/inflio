/**
 * Advanced AI Posts Generation Service
 * 
 * Creates high-quality, platform-optimized social media post suggestions
 * tied to actual video content using GPT-5.2 via the Responses API.
 * 
 * Each post is grounded in real transcript quotes, aligned with the user's
 * brand identity and persona, and includes platform-specific copy.
 */

import { getOpenAI } from '@/lib/openai'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BrandContext {
  companyName?: string
  voice?: string
  personality?: string[]
  voicePhrases?: string[]
  voiceDos?: string[]
  voiceDonts?: string[]
  voiceGuidelines?: string[]
  mission?: string
  vision?: string
  values?: string[]
  positioning?: string
  pillars?: string[]
  brandStory?: string
  colors?: { primary?: string[]; secondary?: string[]; accent?: string[] }
  visualStyle?: {
    photographyStyle?: string[]
    photographyMood?: string[]
    photographyComposition?: string[]
    principles?: string[]
  }
  targetAudience?: {
    description?: string
    demographics?: { age?: string; location?: string; interests?: string[] }
    psychographics?: string[]
    needs?: string[]
    painPoints?: string[]
    personas?: string[]
  }
  differentiators?: string[]
  contentGoals?: string[]
  primaryPlatforms?: string[]
}

export interface PersonaContext {
  id: string
  name: string
  description?: string
  brandVoice?: string
  hasPortraits: boolean
  portraitCount: number
  portraitUrls?: string[]
  loraModelUrl?: string
  loraTriggerPhrase?: string
}

export interface ContentAnalysisContext {
  topics?: string[]
  keywords?: string[]
  keyPoints?: string[]
  sentiment?: string
  summary?: string
  keyMoments?: Array<{ timestamp?: number; description?: string }>
  socialMediaHooks?: string[]
}

export interface GeneratePostsInput {
  transcript: string
  projectTitle: string
  contentAnalysis: ContentAnalysisContext
  platforms: string[]
  brand?: BrandContext
  persona?: PersonaContext | null
  tone?: string
  contentGoal?: string
  contentTypes?: string[]
  creativity?: number
  contentBrief?: ContentBrief | null
}

export interface GeneratedPost {
  contentType: 'carousel' | 'single' | 'reel' | 'story' | 'thread' | 'quote'
  title: string
  transcriptQuote: string
  hook: string
  platformCopy: Record<string, {
    caption: string
    hashtags: string[]
    cta: string
  }>
  carouselSlides?: Array<{
    slideNumber: number
    headline: string
    body: string
    visualPrompt: string
  }>
  imagePrompt: string
  imageStyle: string
  imageDimensions: string
  engagement: {
    whyItWorks: string
    targetAudience: string
    bestTimeToPost: string
    estimatedReach: 'viral' | 'high' | 'medium' | 'targeted'
  }
}

export interface ContentBrief {
  coreNarrative: string
  primaryTheme: string
  keyTakeaways: string[]
  transcriptHighlights: string[]
  targetAudience: string
  toneGuidance: string
  visualDirection: string
  cta: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function extractOutputText(response: any): string {
  if (response.output && Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.type === 'output_text' && content.text) {
            return content.text
          }
        }
      }
    }
  }
  if (response.output_text) {
    return response.output_text
  }
  throw new Error('Could not extract output text from GPT-5.2 response')
}

function isResponseTruncated(response: any): boolean {
  if (response.status === 'incomplete') return true
  if (response.incomplete_details?.reason === 'max_output_tokens') return true
  if (response.output) {
    for (const item of response.output) {
      if (item.status === 'incomplete') return true
    }
  }
  return false
}

/**
 * Attempt to repair truncated JSON by closing open brackets/braces.
 * Works for the common case where the JSON was cut off mid-array/object.
 */
function repairTruncatedJSON(text: string): string {
  let trimmed = text.trim()

  // Strip trailing comma if present (common truncation artifact)
  trimmed = trimmed.replace(/,\s*$/, '')

  // Strip any trailing incomplete key-value (e.g. `"someKey": ` with no value)
  trimmed = trimmed.replace(/,?\s*"[^"]*"\s*:\s*$/, '')

  // Strip trailing incomplete string value (e.g. `"someKey": "partial text` with no closing quote)
  trimmed = trimmed.replace(/,?\s*"[^"]*"\s*:\s*"[^"]*$/, '')

  // Count open brackets/braces and close them
  const opens: string[] = []
  let inString = false
  let escape = false

  for (const ch of trimmed) {
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{' || ch === '[') opens.push(ch)
    if (ch === '}' || ch === ']') opens.pop()
  }

  // Close remaining open brackets/braces in reverse order
  while (opens.length > 0) {
    const open = opens.pop()
    trimmed += open === '{' ? '}' : ']'
  }

  return trimmed
}

/**
 * Validate and sanitize a generated post, filling in defaults for missing fields.
 */
function validatePost(post: any, platforms: string[]): GeneratedPost | null {
  if (!post || typeof post !== 'object') return null
  if (!post.title && !post.hook) return null

  const platformCopy: Record<string, { caption: string; hashtags: string[]; cta: string }> = {}
  if (post.platformCopy && typeof post.platformCopy === 'object') {
    for (const [platform, copy] of Object.entries(post.platformCopy) as [string, any][]) {
      platformCopy[platform] = {
        caption: copy?.caption || post.hook || post.title || '',
        hashtags: Array.isArray(copy?.hashtags) ? copy.hashtags : [],
        cta: copy?.cta || '',
      }
    }
  }

  // If no platformCopy was generated, create entries for each requested platform using the hook
  if (Object.keys(platformCopy).length === 0 && platforms.length > 0) {
    const fallbackCaption = post.hook || post.title || ''
    for (const platform of platforms) {
      platformCopy[platform] = {
        caption: fallbackCaption,
        hashtags: [],
        cta: '',
      }
    }
  }

  return {
    contentType: post.contentType || 'single',
    title: post.title || 'Untitled Post',
    transcriptQuote: post.transcriptQuote || '',
    hook: post.hook || post.title || '',
    platformCopy,
    carouselSlides: post.contentType === 'carousel' && Array.isArray(post.carouselSlides)
      ? post.carouselSlides
      : undefined,
    imagePrompt: post.imagePrompt || `Social media post visual for: ${post.title || 'content'}`,
    imageStyle: post.imageStyle || 'modern',
    imageDimensions: post.imageDimensions || '1080x1350',
    engagement: {
      whyItWorks: post.engagement?.whyItWorks || '',
      targetAudience: post.engagement?.targetAudience || '',
      bestTimeToPost: post.engagement?.bestTimeToPost || '',
      estimatedReach: post.engagement?.estimatedReach || 'medium',
    },
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AdvancedPostsService {
  private static readonly MODEL = 'gpt-5.2'

  /**
   * Generate high-quality, content-tied post suggestions.
   * Uses GPT-5.2 Responses API with medium reasoning for structured output.
   */
  static async generateAdvancedPosts(
    input: GeneratePostsInput
  ): Promise<GeneratedPost[]> {
    const openai = getOpenAI()

    const {
      transcript,
      projectTitle,
      contentAnalysis,
      platforms,
      brand,
      persona,
      tone,
      contentGoal,
      contentTypes,
      creativity,
      contentBrief
    } = input

    // ── Build rich context blocks ──────────────────────────────────────────

    const transcriptBlock = transcript.substring(0, 8000)

    const topicsBlock = contentAnalysis.topics?.slice(0, 8).join(', ') || 'not analysed'
    const keywordsBlock = contentAnalysis.keywords?.slice(0, 12).join(', ') || ''
    const keyPointsBlock = contentAnalysis.keyPoints?.map(p => `  - ${p}`).join('\n') || '  (none)'
    const sentimentBlock = contentAnalysis.sentiment || 'neutral'
    const summaryBlock = contentAnalysis.summary || ''

    const keyMomentsBlock = contentAnalysis.keyMoments?.slice(0, 6).map((m) => {
      const ts = m.timestamp || 0
      const min = Math.floor(ts / 60)
      const sec = String(Math.floor(ts % 60)).padStart(2, '0')
      return `  [${min}:${sec}] ${m.description || ''}`
    }).join('\n') || '  (none identified)'

    const hooksBlock = contentAnalysis.socialMediaHooks?.slice(0, 5).join('\n  - ') || ''

    // Brand context — the full brand book drives every word
    let brandBlock = ''
    let brandVoiceRules = ''
    let brandVisualDirection = ''
    if (brand) {
      const identity: string[] = []
      if (brand.companyName) identity.push(`Company: ${brand.companyName}`)
      if (brand.voice) identity.push(`Voice tone: ${brand.voice}`)
      if (brand.personality?.length) identity.push(`Personality: ${brand.personality.join(', ')}`)
      if (brand.positioning) identity.push(`Positioning: ${brand.positioning}`)
      if (brand.mission) identity.push(`Mission: ${brand.mission}`)
      if (brand.vision) identity.push(`Vision: ${brand.vision}`)
      if (brand.values?.length) identity.push(`Values: ${brand.values.join(', ')}`)
      if (brand.pillars?.length) identity.push(`Content pillars: ${brand.pillars.join(', ')}`)
      if (brand.brandStory) identity.push(`Brand story: ${brand.brandStory}`)
      if (brand.differentiators?.length) identity.push(`What makes us different: ${brand.differentiators.join(', ')}`)
      if (brand.colors?.primary?.length) identity.push(`Primary colors: ${brand.colors.primary.join(', ')}`)
      if (brand.colors?.accent?.length) identity.push(`Accent colors: ${brand.colors.accent.join(', ')}`)
      if (brand.contentGoals?.length) identity.push(`Content goals: ${brand.contentGoals.join(', ')}`)

      // Audience
      const audience: string[] = []
      if (brand.targetAudience?.description) audience.push(`Who they are: ${brand.targetAudience.description}`)
      if (brand.targetAudience?.demographics?.age) audience.push(`Age: ${brand.targetAudience.demographics.age}`)
      if (brand.targetAudience?.demographics?.interests?.length) {
        audience.push(`Interests: ${brand.targetAudience.demographics.interests.join(', ')}`)
      }
      if (brand.targetAudience?.psychographics?.length) {
        audience.push(`Psychographics: ${brand.targetAudience.psychographics.join(', ')}`)
      }
      if (brand.targetAudience?.painPoints?.length) {
        audience.push(`Pain points to address: ${brand.targetAudience.painPoints.join(', ')}`)
      }
      if (brand.targetAudience?.needs?.length) {
        audience.push(`What they need: ${brand.targetAudience.needs.join(', ')}`)
      }
      if (brand.targetAudience?.personas?.length) {
        audience.push(`Audience personas: ${brand.targetAudience.personas.join('; ')}`)
      }
      if (audience.length > 0) {
        identity.push(`\nTARGET AUDIENCE:\n${audience.join('\n')}`)
      }

      brandBlock = identity.join('\n')

      // Voice rules — the most important part for writing captions
      const voiceRules: string[] = []
      if (brand.voicePhrases?.length) {
        voiceRules.push(`EXAMPLE PHRASES (write like these):\n  - ${brand.voicePhrases.slice(0, 6).join('\n  - ')}`)
      }
      if (brand.voiceDos?.length) {
        voiceRules.push(`DO:\n  - ${brand.voiceDos.join('\n  - ')}`)
      }
      if (brand.voiceDonts?.length) {
        voiceRules.push(`DON'T:\n  - ${brand.voiceDonts.join('\n  - ')}`)
      }
      if (brand.voiceGuidelines?.length) {
        voiceRules.push(`Voice guidelines:\n  - ${brand.voiceGuidelines.join('\n  - ')}`)
      }
      if (voiceRules.length > 0) {
        brandVoiceRules = `\nBRAND VOICE RULES — follow these strictly when writing every caption:\n${voiceRules.join('\n\n')}`
      }

      // Visual direction from brand book — shapes image prompts
      const visual: string[] = []
      if (brand.visualStyle?.photographyStyle?.length) {
        visual.push(`Photography style: ${brand.visualStyle.photographyStyle.join(', ')}`)
      }
      if (brand.visualStyle?.photographyMood?.length) {
        visual.push(`Visual mood: ${brand.visualStyle.photographyMood.join(', ')}`)
      }
      if (brand.visualStyle?.photographyComposition?.length) {
        visual.push(`Composition: ${brand.visualStyle.photographyComposition.join(', ')}`)
      }
      if (brand.visualStyle?.principles?.length) {
        visual.push(`Design principles: ${brand.visualStyle.principles.join(', ')}`)
      }
      if (visual.length > 0) {
        brandVisualDirection = `\nBRAND VISUAL DIRECTION — all image prompts must follow this style:\n${visual.join('\n')}`
      }
    }

    // Persona context — the human voice behind the brand
    let personaBlock = ''
    if (persona) {
      const parts = [
        `Creator: ${persona.name}`,
        persona.description ? `Bio: ${persona.description}` : '',
        persona.brandVoice ? `Writing style: ${persona.brandVoice}` : '',
        persona.hasPortraits
          ? `The creator's portrait photos are available and will be used as reference when generating images — write image prompts that describe scenes featuring the creator naturally (e.g. speaking, gesturing, presenting). Do NOT describe their physical appearance; the reference photos handle likeness.`
          : ''
      ].filter(Boolean)
      personaBlock = parts.join('\n')
    }

    // Determine which content types to generate
    const requestedTypes = contentTypes?.length
      ? contentTypes
      : ['carousel', 'quote', 'single', 'thread', 'reel']

    // ── System instructions ────────────────────────────────────────────────

    const companyLabel = brand?.companyName || persona?.name || 'the creator'

    const instructions = `You are the dedicated social media strategist for ${companyLabel}. Every post you write must sound authentically like this brand — never generic, never templated.

${brandBlock ? `BRAND IDENTITY — match this voice in EVERY caption:\n${brandBlock}\n\nWrite as if you ARE this brand. If the voice is "witty and casual", be witty and casual. If it is "authoritative and professional", be exactly that. Never fall back to generic marketing language.` : 'No brand profile provided — write in an engaging, authentic, human voice.'}
${brandVoiceRules}
${personaBlock ? `\nCREATOR PERSONA:\n${personaBlock}\nWrite as if ${persona!.name} is speaking directly to their audience. Use first person where appropriate.\n` : ''}
${brandVisualDirection}

${contentBrief ? `CONTENT BRIEF — all posts MUST align with this narrative:\n- Core story: ${contentBrief.coreNarrative}\n- Theme: ${contentBrief.primaryTheme}\n- Key takeaways: ${contentBrief.keyTakeaways?.join('; ')}\n- Tone: ${contentBrief.toneGuidance}\n- CTA direction: ${contentBrief.cta}\n- Visual direction: ${contentBrief.visualDirection}\n` : ''}

ABSOLUTE RULES:
1. Every post MUST include a real quote or closely paraphrased line from the transcript. No filler.
2. Every hook must reference something the speaker actually said or a specific insight from the video.
3. Platform copy must be GENUINELY NATIVE to each platform — not the same text resized.
4. Each post is a COHESIVE NARRATIVE. The title, hook, caption, image, and CTA must all serve the same single story or insight. The image is not decoration — it is the visual expression of the post's core message.
5. Image prompts must visualize the post's KEY MESSAGE. Start with what the image should communicate (the idea, emotion, or moment), THEN add technical details: composition, camera angle, lighting, color palette${brand?.colors?.primary?.length ? ` (brand colors: ${brand.colors.primary.join(', ')})` : ''}, mood, and style.${brand?.visualStyle?.photographyMood?.length ? ` Follow the brand visual mood: ${brand.visualStyle.photographyMood.join(', ')}.` : ''} 80+ words minimum.${persona?.hasPortraits ? ' Describe scenes featuring the creator (the reference photos will be used automatically — do NOT describe their appearance).' : ''}
6. Carousel slides must tell a sequential story — each slide advances the narrative, not rephrases the same idea.
7. Engagement rationale must reference the specific content, not generic "this type works well."
${tone ? `8. Content tone: ${tone}` : ''}
${contentGoal ? `${tone ? '9' : '8'}. Primary content goal: ${contentGoal} — optimize every post for this.` : ''}

PLATFORM-SPECIFIC COPY RULES:
- Instagram: Max 2200 chars. Visual-first storytelling, emoji-friendly, place hashtags at the end (up to 30), use line breaks for readability.
- Twitter/X: Max 280 chars per tweet. Punchy, conversational, weave 2-3 hashtags into text, use thread format for longer ideas.
- LinkedIn: Max 3000 chars. Professional but human, storytelling with line breaks, 3-5 hashtags, open with a bold statement or hook question.
- Facebook: Max 2200 chars. Community tone, question-based engagement, 5-10 hashtags.
- YouTube: Title max 100 chars, description max 5000 chars. SEO-optimized with relevant tags.
- TikTok: Max 2200 chars. Trend-aware hooks, 10-15 hashtags, short punchy sentences.`

    // ── User prompt ────────────────────────────────────────────────────────

    const userPrompt = `Create 5 high-quality social media post suggestions from this video content.

═══ VIDEO ═══
Title: "${projectTitle}"

═══ CONTENT ANALYSIS ═══
Topics: ${topicsBlock}
Keywords: ${keywordsBlock}
Sentiment: ${sentimentBlock}
${summaryBlock ? `Summary: ${summaryBlock}` : ''}

Key Points:
${keyPointsBlock}

Key Moments:
${keyMomentsBlock}

${hooksBlock ? `Suggested Hooks:\n  - ${hooksBlock}` : ''}

═══ FULL TRANSCRIPT ═══
${transcriptBlock}

═══ REQUIREMENTS ═══
Target platforms: ${platforms.join(', ')}
Content types to generate: ${requestedTypes.join(', ')}
${persona?.hasPortraits ? 'Include the persona/creator in image prompts where appropriate.' : ''}

Generate exactly 5 posts. For each post, return this JSON structure:

{
  "posts": [
    {
      "contentType": "carousel|single|reel|story|thread|quote",
      "title": "Compelling title for the dashboard (based on actual content)",
      "transcriptQuote": "An exact or closely paraphrased quote from the transcript that this post is built around",
      "hook": "The opening line — must reference the transcript quote or a specific video insight",
      "platformCopy": {
        "<platform>": {
          "caption": "Full platform-optimized caption with formatting, emojis where appropriate",
          "hashtags": ["relevant", "hashtags", "without-hash-symbol"],
          "cta": "Platform-specific call to action"
        }
      },
      "carouselSlides": [
        {
          "slideNumber": 1,
          "headline": "Slide headline",
          "body": "Slide body text",
          "visualPrompt": "Detailed image prompt for this slide (60+ words) with composition, colors${brand?.colors?.primary?.length ? ` (brand colors: ${brand.colors.primary.join(', ')})` : ''}, and text overlay content.${persona?.hasPortraits ? ' Include the creator in the scene if appropriate.' : ''}"
        }
      ],
      "imagePrompt": "The visual representation of THIS post's core message (80+ words). Start with WHAT the image communicates — the specific insight, emotion, or moment from the post. Then describe: subject, composition, camera angle, lighting, color palette${brand?.colors?.primary?.length ? ` (brand colors: ${brand.colors.primary.join(', ')})` : ''}, mood, style, and text overlays if needed. The image must make sense WITH the caption — a viewer should see the image and caption as telling the same story.${persona?.hasPortraits ? ' Describe a scene featuring the creator naturally (the reference photos will handle their likeness — do NOT describe their physical appearance).' : ''} No generic stock imagery.",
      "imageStyle": "photorealistic|modern|minimalist|bold|artistic|editorial",
      "imageDimensions": "1080x1350 for carousel/single, 1080x1920 for story/reel",
      "engagement": {
        "whyItWorks": "Specific reason tied to the actual content and audience psychology",
        "targetAudience": "Who specifically will engage with this and why",
        "bestTimeToPost": "Day and time recommendation",
        "estimatedReach": "viral|high|medium|targeted"
      }
    }
  ]
}

IMPORTANT:
- Only include "carouselSlides" for carousel type posts. Omit for other types.
- Include a platformCopy entry for each of these platforms: ${platforms.join(', ')}
- Each caption must respect platform character limits (Twitter: 280, Instagram: 2200, LinkedIn: 3000, Facebook: 2200).
- Mix up the content types. Don't make all 5 the same type.
- Every "transcriptQuote" must be a real phrase from the transcript above.`

    // ── Call GPT-5.2 Responses API ─────────────────────────────────────────

    console.log('[AdvancedPostsService] Calling GPT-5.2 with', {
      transcriptLength: transcriptBlock.length,
      platforms,
      hasBrand: !!brand,
      hasPersona: !!persona,
      contentTypes: requestedTypes
    })

    let validPosts: GeneratedPost[] = []
    let attempts = 0
    const maxAttempts = 2

    while (validPosts.length === 0 && attempts < maxAttempts) {
      attempts++
      const tokenLimit = attempts === 1 ? 16384 : 24000

      console.log(`[AdvancedPostsService] Attempt ${attempts}/${maxAttempts} with max_output_tokens=${tokenLimit}`)

      const response = await openai.responses.create({
        model: this.MODEL,
        input: userPrompt,
        instructions,
        reasoning: { effort: 'medium' },
        text: { format: { type: 'json_object' } },
        max_output_tokens: tokenLimit,
      })

      const truncated = isResponseTruncated(response)
      if (truncated) {
        console.warn(`[AdvancedPostsService] Response was truncated (attempt ${attempts})`)
      }

      const outputText = extractOutputText(response)

      console.log(`[AdvancedPostsService] Raw output length: ${outputText.length} chars, truncated: ${truncated}`)

      let parsed: { posts: any[] }
      try {
        parsed = JSON.parse(outputText)
      } catch (parseError) {
        if (truncated) {
          console.warn('[AdvancedPostsService] Truncated response — attempting JSON repair')
          try {
            const repaired = repairTruncatedJSON(outputText)
            parsed = JSON.parse(repaired)
            console.log('[AdvancedPostsService] JSON repair succeeded')
          } catch (repairError) {
            console.error('[AdvancedPostsService] JSON repair failed, raw output (first 500 chars):', outputText.substring(0, 500))
            if (attempts < maxAttempts) continue
            throw new Error('Failed to parse AI response as JSON even after repair')
          }
        } else {
          console.error('[AdvancedPostsService] Failed to parse GPT response (first 500 chars):', outputText.substring(0, 500))
          if (attempts < maxAttempts) continue
          throw new Error('Failed to parse AI response as JSON')
        }
      }

      if (!parsed!.posts || !Array.isArray(parsed!.posts)) {
        console.error('[AdvancedPostsService] Response missing "posts" array. Keys found:', Object.keys(parsed!))
        if (attempts < maxAttempts) continue
        throw new Error('AI response missing "posts" array')
      }

      // Validate each post and fill in defaults for missing fields
      for (const rawPost of parsed!.posts) {
        const validated = validatePost(rawPost, platforms)
        if (validated) {
          validPosts.push(validated)
        } else {
          console.warn('[AdvancedPostsService] Skipping invalid post:', JSON.stringify(rawPost).substring(0, 200))
        }
      }

      if (validPosts.length === 0 && attempts < maxAttempts) {
        console.warn('[AdvancedPostsService] No valid posts in response, retrying...')
      }
    }

    if (validPosts.length === 0) {
      throw new Error('AI generated no valid posts after all attempts')
    }

    console.log('[AdvancedPostsService] Generated', validPosts.length, 'valid posts')

    return validPosts
  }

  /**
   * Generate a post image via the unified OpenAIImageService.
   * Handles persona portrait references, brand colors, and content-type sizing.
   */
  static async generatePostImage(params: {
    prompt: string
    contentType: string
    persona?: PersonaContext | null
    brandColors?: string[]
    postTitle?: string
    postHook?: string
    projectId?: string
  }): Promise<{ url: string; model: string } | null> {
    const { OpenAIImageService } = await import('@/lib/services/openai-image-service')

    return OpenAIImageService.generatePostImage({
      prompt: params.prompt,
      contentType: params.contentType,
      brandColors: params.brandColors,
      postTitle: params.postTitle,
      personaPortraitUrls: params.persona?.portraitUrls,
      projectId: params.projectId,
    })
  }

  /**
   * Generate a Content Brief that ties all downstream content together.
   * Called once after content analysis, stored on the project.
   */
  static async generateContentBrief(
    transcript: string,
    contentAnalysis: ContentAnalysisContext,
    brand?: BrandContext,
    persona?: PersonaContext | null
  ): Promise<ContentBrief> {
    const openai = getOpenAI()

    const transcriptBlock = transcript.substring(0, 6000)

    let brandBlock = ''
    if (brand) {
      const parts: string[] = []
      if (brand.companyName) parts.push(`Company: ${brand.companyName}`)
      if (brand.voice) parts.push(`Voice: ${brand.voice}`)
      if (brand.targetAudience?.description) parts.push(`Audience: ${brand.targetAudience.description}`)
      if (brand.contentGoals?.length) parts.push(`Goals: ${brand.contentGoals.join(', ')}`)
      if (brand.mission) parts.push(`Mission: ${brand.mission}`)
      brandBlock = `\nBRAND:\n${parts.join('\n')}`
    }

    let personaBlock = ''
    if (persona) {
      personaBlock = `\nPERSONA: ${persona.name}${persona.description ? ` - ${persona.description}` : ''}`
    }

    const instructions = `You are a content strategist. Create a concise Content Brief that will align ALL downstream content (blog posts, social posts, captions, thumbnails) around the same narrative.

The brief must be grounded in real content from the transcript.${brandBlock}${personaBlock}

Return a JSON object with these exact keys:
- coreNarrative: 1-2 sentence summary of the key message
- primaryTheme: The main topic/theme
- keyTakeaways: Array of 3-5 specific, quotable takeaways
- transcriptHighlights: Array of 3-5 of the best actual quotes from the transcript (exact words)
- targetAudience: Who this content is for
- toneGuidance: How all content should sound (be specific)
- visualDirection: Consistent visual style for images/thumbnails
- cta: What the creator wants the audience to do`

    const input = `Create a Content Brief for this video content.

TOPICS: ${contentAnalysis.topics?.join(', ') || 'N/A'}
KEY POINTS: ${contentAnalysis.keyPoints?.join(', ') || 'N/A'}
SENTIMENT: ${contentAnalysis.sentiment || 'neutral'}
SUMMARY: ${contentAnalysis.summary || ''}

TRANSCRIPT:
${transcriptBlock}`

    console.log('[AdvancedPostsService] Generating content brief...')

    const response = await openai.responses.create({
      model: this.MODEL,
      input,
      instructions,
      reasoning: { effort: 'medium' },
      text: { format: { type: 'json_object' } },
      max_output_tokens: 1500,
    })

    const outputText = extractOutputText(response)
    const brief = JSON.parse(outputText) as ContentBrief

    console.log('[AdvancedPostsService] Content brief generated:', brief.primaryTheme)

    return brief
  }
}
