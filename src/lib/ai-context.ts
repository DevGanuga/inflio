/**
 * Shared AI context utilities
 *
 * Centralizes fetching of brand identity and persona data so that
 * every AI generation endpoint (posts, blog, captions, thumbnails)
 * works from the same rich context.
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import type { BrandContext, PersonaContext } from '@/lib/ai-posts-advanced'

export type { BrandContext, PersonaContext }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the full transcript text from a project's transcription field.
 * Handles both string and object (with .text or .segments) formats.
 */
export function extractTranscriptText(transcription: any): string {
  if (!transcription) return ''
  if (typeof transcription === 'string') return transcription
  if (transcription.text) return transcription.text
  if (transcription.segments && Array.isArray(transcription.segments)) {
    return transcription.segments.map((s: any) => s.text).join(' ')
  }
  return ''
}

// ─── Brand context ───────────────────────────────────────────────────────────

/**
 * Fetch the full brand identity from user_profiles.
 * Supports both the new brand_identity JSONB structure (from onboarding)
 * and the legacy flat fields (brand_voice, brand_colors, etc.).
 */
export async function fetchBrandContext(userId: string): Promise<BrandContext | undefined> {
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('company_name, brand_voice, brand_colors, brand_fonts, target_audience, content_goals, primary_platforms, brand_identity, brand_analysis')
    .eq('clerk_user_id', userId)
    .single()

  if (!profile) return undefined

  const bi = profile.brand_identity || profile.brand_analysis

  return {
    companyName: profile.company_name || undefined,
    voice: profile.brand_voice || (bi?.voice?.tone
      ? (Array.isArray(bi.voice.tone) ? bi.voice.tone.join(', ') : bi.voice.tone)
      : undefined),
    personality: bi?.voice?.personality || undefined,
    voicePhrases: bi?.voice?.phrases || undefined,
    voiceDos: bi?.voice?.dos || undefined,
    voiceDonts: bi?.voice?.donts || undefined,
    voiceGuidelines: bi?.voice?.guidelines || undefined,
    mission: bi?.brandStrategy?.mission || undefined,
    vision: bi?.brandStrategy?.vision || undefined,
    values: bi?.brandStrategy?.values || undefined,
    positioning: bi?.brandStrategy?.positioning || undefined,
    pillars: bi?.brandStrategy?.pillars || undefined,
    brandStory: bi?.brandStrategy?.story || undefined,
    colors: {
      primary: bi?.colors?.primary?.hex || (profile.brand_colors?.primary ? [profile.brand_colors.primary] : undefined),
      secondary: bi?.colors?.secondary?.hex || (profile.brand_colors?.secondary ? [profile.brand_colors.secondary] : undefined),
      accent: bi?.colors?.accent?.hex || (profile.brand_colors?.accent ? [profile.brand_colors.accent] : undefined),
    },
    visualStyle: {
      photographyStyle: bi?.visualStyle?.photography?.style || undefined,
      photographyMood: bi?.visualStyle?.photography?.mood || undefined,
      photographyComposition: bi?.visualStyle?.photography?.composition || undefined,
      principles: bi?.visualStyle?.principles || undefined,
    },
    targetAudience: {
      description: profile.target_audience?.description || undefined,
      demographics: bi?.targetAudience?.demographics || undefined,
      psychographics: bi?.targetAudience?.psychographics || undefined,
      needs: bi?.targetAudience?.needs || undefined,
      painPoints: bi?.targetAudience?.painPoints || undefined,
      personas: bi?.targetAudience?.personas || undefined,
    },
    differentiators: bi?.competitors?.differentiators || undefined,
    contentGoals: profile.content_goals || undefined,
    primaryPlatforms: profile.primary_platforms || undefined,
  }
}

// ─── Persona context ─────────────────────────────────────────────────────────

/**
 * Fetch persona details including portrait availability.
 */
export async function fetchPersonaContext(personaId: string): Promise<PersonaContext | null> {
  const { data: personaRecord } = await supabaseAdmin
    .from('personas')
    .select('id, name, description, status, metadata, lora_model_url, lora_trigger_phrase')
    .eq('id', personaId)
    .single()

  if (!personaRecord) return null

  // Collect portrait URLs from all possible storage locations
  const portraitUrls: string[] =
    personaRecord.metadata?.generalPortraitUrls ||
    personaRecord.metadata?.portraitUrls ||
    personaRecord.metadata?.portraits?.map((p: any) => p.url).filter(Boolean) ||
    []

  return {
    id: personaRecord.id,
    name: personaRecord.name,
    description: personaRecord.description || undefined,
    brandVoice: personaRecord.metadata?.brandVoice || undefined,
    hasPortraits: portraitUrls.length > 0,
    portraitCount: portraitUrls.length,
    portraitUrls: portraitUrls.length > 0 ? portraitUrls : undefined,
    loraModelUrl: personaRecord.lora_model_url || undefined,
    loraTriggerPhrase: personaRecord.lora_trigger_phrase || undefined,
  }
}

// ─── Combined fetch ──────────────────────────────────────────────────────────

/**
 * Fetch both brand and persona context in parallel.
 * This is the main entry point for AI generation routes.
 */
export async function fetchBrandAndPersonaContext(
  userId: string,
  personaId?: string | null,
  autoResolvePersona = false
): Promise<{ brand: BrandContext | undefined; persona: PersonaContext | null }> {
  let resolvedPersonaId = personaId

  if (!resolvedPersonaId && autoResolvePersona) {
    resolvedPersonaId = await fetchDefaultPersonaId(userId)
  }

  const [brand, persona] = await Promise.all([
    fetchBrandContext(userId),
    resolvedPersonaId ? fetchPersonaContext(resolvedPersonaId) : Promise.resolve(null),
  ])

  return { brand, persona }
}

/**
 * Fetch the user's default persona ID from their profile.
 */
export async function fetchDefaultPersonaId(userId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('default_persona_id')
    .eq('clerk_user_id', userId)
    .single()

  return profile?.default_persona_id || null
}
