"use client"

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Sparkles, User, Users, Wand2,
  CheckCircle2, TrendingUp, Hash, Eye, 
  Target, Brain, Send,
  Instagram, Twitter, Linkedin, Facebook, Youtube,
  Info, Plus, RefreshCw,
  MessageSquare, Image, Film, Layout, Smartphone,
  Quote, ChevronDown, ChevronUp, Lightbulb
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SmartPostsGeneratorProps {
  projectId: string
  projectTitle: string
  contentAnalysis: any
  transcript?: string
  onPostsGenerated?: (posts: any[]) => void
}

interface Persona {
  id: string
  name: string
  avatar_url?: string
  description?: string
  brand_voice?: string
  photo_count: number
}

interface ContentSettings {
  contentTypes: string[]
  platforms: string[]
  creativity: number
  tone: 'professional' | 'casual' | 'funny' | 'educational' | 'inspirational'
  includeEmojis: boolean
  includeHashtags: boolean
  includeCTA: boolean
  optimizeForEngagement: boolean
  usePersona: boolean
  selectedPersonaId?: string
  targetAudience: string
  contentGoal: 'awareness' | 'engagement' | 'conversion' | 'education'
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CONTENT_TYPES = [
  { id: 'carousel', name: 'Carousel', icon: Layout, description: 'Multi-slide posts for storytelling', color: 'from-purple-500 to-pink-500' },
  { id: 'quote', name: 'Quote', icon: MessageSquare, description: 'Powerful quotes with visual design', color: 'from-blue-500 to-cyan-500' },
  { id: 'single', name: 'Single', icon: Image, description: 'Eye-catching single image posts', color: 'from-green-500 to-emerald-500' },
  { id: 'thread', name: 'Thread', icon: Hash, description: 'Multi-part text threads', color: 'from-orange-500 to-red-500' },
  { id: 'reel', name: 'Reel/Short', icon: Film, description: 'Short-form video ideas', color: 'from-pink-500 to-rose-500' },
  { id: 'story', name: 'Story', icon: Smartphone, description: 'Ephemeral content ideas', color: 'from-indigo-500 to-purple-500' },
]

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'bg-gradient-to-r from-purple-500 to-pink-500' },
  { id: 'twitter', name: 'Twitter/X', icon: Twitter, color: 'bg-black' },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'bg-blue-700' },
  { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'bg-blue-600' },
  { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'bg-red-600' },
  { id: 'tiktok', name: 'TikTok', icon: Hash, color: 'bg-black' },
]

const CONTENT_TYPE_ICONS: Record<string, typeof Layout> = {
  carousel: Layout,
  quote: MessageSquare,
  single: Image,
  thread: Hash,
  reel: Film,
  story: Smartphone,
}

// ─── Suggestion Card ────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  index,
  onApprove,
  onRegenerate,
}: {
  suggestion: any
  index: number
  onApprove?: (id: string) => void
  onRegenerate?: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [approving, setApproving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const contentType = suggestion.content_type || suggestion.type || 'single'
  const TypeIcon = CONTENT_TYPE_ICONS[contentType] || MessageSquare
  const platforms = suggestion.platforms || Object.keys(suggestion.copy_variants || {})
  const hook = suggestion.metadata?.hook || suggestion.description || ''
  const transcriptQuote = suggestion.metadata?.transcript_quote || ''
  const engagementData = suggestion.engagement_data || {}
  const copyVariants = suggestion.copy_variants || {}
  const carouselSlides = suggestion.metadata?.carousel_slides || []
  const personaUsed = suggestion.persona_used
  const heroImage = suggestion.images?.[0]
  const isApproved = suggestion.status === 'approved'

  const handleApprove = async () => {
    setApproving(true)
    try {
      const res = await fetch('/api/posts/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: suggestion.id }),
      })
      if (res.ok) {
        toast.success('Post approved and moved to staging!')
        onApprove?.(suggestion.id)
      } else {
        toast.error('Failed to approve post')
      }
    } catch {
      toast.error('Failed to approve post')
    } finally {
      setApproving(false)
    }
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const res = await fetch('/api/posts/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId: suggestion.id }),
      })
      if (res.ok) {
        toast.success('Post regenerated!')
        onRegenerate?.(suggestion.id)
      } else {
        toast.error('Failed to regenerate post')
      }
    } catch {
      toast.error('Failed to regenerate post')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      <Card className={cn("h-full hover:shadow-lg transition-all group", isApproved && "border-green-300 dark:border-green-700")}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-md bg-primary/10 flex-shrink-0">
                <TypeIcon className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-sm leading-tight line-clamp-2">
                {suggestion.title}
              </CardTitle>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {isApproved && (
                <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-0">
                  <CheckCircle2 className="h-3 w-3 mr-0.5" />
                  Approved
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] capitalize">
                {contentType}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {/* Hero Image */}
          {heroImage?.url && (
            <div className="rounded-md overflow-hidden border border-border/50">
              <img
                src={heroImage.url}
                alt={suggestion.title}
                className="w-full h-40 object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Hook / Opening Line */}
          {hook && (
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-3">
              {hook}
            </p>
          )}

          {/* Transcript Quote */}
          {transcriptQuote && (
            <div className="flex gap-2 p-2.5 rounded-md bg-muted/50 border border-border/50">
              <Quote className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-2">
                &ldquo;{transcriptQuote}&rdquo;
              </p>
            </div>
          )}

          {/* Platform Badges */}
          <div className="flex gap-1.5 flex-wrap">
            {platforms.map((platform: string) => {
              const cfg = PLATFORMS.find(p => p.id === platform)
              return cfg ? (
                <Badge key={platform} variant="secondary" className="text-[10px] px-1.5 py-0.5">
                  <cfg.icon className="h-3 w-3 mr-1" />
                  {cfg.name}
                </Badge>
              ) : (
                <Badge key={platform} variant="secondary" className="text-[10px] capitalize">
                  {platform}
                </Badge>
              )
            })}
            {personaUsed && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-purple-300 text-purple-600 dark:text-purple-400">
                <User className="h-3 w-3 mr-1" />
                Persona
              </Badge>
            )}
          </div>

          {/* Why It Works */}
          {engagementData.why_it_works && (
            <div className="flex gap-2 items-start">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {engagementData.why_it_works}
              </p>
            </div>
          )}

          {/* Reach Badge */}
          {engagementData.predicted_reach && (
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  engagementData.predicted_reach === 'viral' && 'border-red-300 text-red-600 dark:text-red-400',
                  engagementData.predicted_reach === 'high' && 'border-orange-300 text-orange-600 dark:text-orange-400',
                  engagementData.predicted_reach === 'medium' && 'border-blue-300 text-blue-600 dark:text-blue-400',
                  engagementData.predicted_reach === 'targeted' && 'border-green-300 text-green-600 dark:text-green-400',
                )}
              >
                <TrendingUp className="h-3 w-3 mr-1" />
                {engagementData.predicted_reach} reach
              </Badge>
              {engagementData.best_time && (
                <span className="text-[10px] text-muted-foreground">
                  {engagementData.best_time}
                </span>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant={isApproved ? 'secondary' : 'default'}
              className={cn("flex-1 h-8 text-xs", !isApproved && "bg-green-600 hover:bg-green-700 text-white")}
              disabled={approving || isApproved}
              onClick={handleApprove}
            >
              {approving ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1" />
              ) : (
                <CheckCircle2 className="h-3 w-3 mr-1" />
              )}
              {isApproved ? 'Approved' : 'Approve'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={regenerating}
              onClick={handleRegenerate}
            >
              {regenerating ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary mr-1" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Redo
            </Button>
            {isApproved && (
              <Button
                size="sm"
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                disabled={publishing}
                onClick={async () => {
                  setPublishing(true)
                  try {
                    const res = await fetch('/api/posts/quick-publish', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ suggestionId: suggestion.id }),
                    })
                    const data = await res.json()
                    if (res.ok && data.success) {
                      const published = data.results?.filter((r: any) => r.status === 'published').length || 0
                      const drafted = data.results?.filter((r: any) => r.status === 'draft').length || 0
                      if (published > 0) toast.success(`Published to ${published} platform(s)!`)
                      else if (drafted > 0) toast.info(`Saved as draft for ${drafted} platform(s). Connect accounts to publish.`)
                      else toast.info('Post queued for publishing')
                      onApprove?.(suggestion.id)
                    } else {
                      toast.error(data.error || 'Failed to publish')
                    }
                  } catch {
                    toast.error('Failed to publish post')
                  } finally {
                    setPublishing(false)
                  }
                }}
              >
                {publishing ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1" />
                ) : (
                  <Send className="h-3 w-3 mr-1" />
                )}
                Publish
              </Button>
            )}
          </div>

          {/* Expandable: Platform Copy + Carousel Slides */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground h-7"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Hide details
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Show platform copy{carouselSlides.length > 0 ? ' & slides' : ''}
              </>
            )}
          </Button>

          {expanded && (
            <div className="space-y-3 pt-1">
              {/* Platform-specific copy */}
              {Object.entries(copyVariants).map(([platform, copy]: [string, any]) => {
                const cfg = PLATFORMS.find(p => p.id === platform)
                return (
                  <div key={platform} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      {cfg && <cfg.icon className="h-3 w-3 text-muted-foreground" />}
                      <span className="text-xs font-medium capitalize">{platform}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap border-l-2 border-border pl-3">
                      {copy.caption?.substring(0, 500)}{copy.caption?.length > 500 ? '...' : ''}
                    </p>
                    {copy.hashtags?.length > 0 && (
                      <p className="text-[10px] text-blue-500">
                        {copy.hashtags.slice(0, 10).map((h: string) => `#${h}`).join(' ')}
                      </p>
                    )}
                    {copy.cta && (
                      <p className="text-[10px] text-purple-500 font-medium">
                        CTA: {copy.cta}
                      </p>
                    )}
                  </div>
                )
              })}

              {/* Carousel slides */}
              {carouselSlides.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium">Carousel Slides</span>
                  {carouselSlides.map((slide: any, i: number) => (
                    <div key={i} className="text-xs p-2 bg-muted/30 rounded-md space-y-0.5">
                      <span className="font-medium text-foreground">Slide {slide.slideNumber || i + 1}: {slide.headline}</span>
                      {slide.body && <p className="text-muted-foreground">{slide.body}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Engagement details */}
              {engagementData.target_audience && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Audience: </span>
                  {engagementData.target_audience}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SmartPostsGenerator({
  projectId,
  projectTitle,
  contentAnalysis,
  transcript,
  onPostsGenerated
}: SmartPostsGeneratorProps) {
  const [showIntakeDialog, setShowIntakeDialog] = useState(false)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loadingPersonas, setLoadingPersonas] = useState(true)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState('')
  const [activeTab, setActiveTab] = useState('content')
  const [generationInProgress, setGenerationInProgress] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true)

  const [settings, setSettings] = useState<ContentSettings>({
    contentTypes: ['carousel', 'quote', 'single'],
    platforms: ['instagram', 'twitter', 'linkedin'],
    creativity: 0.7,
    tone: 'professional',
    includeEmojis: true,
    includeHashtags: true,
    includeCTA: true,
    optimizeForEngagement: true,
    usePersona: false,
    selectedPersonaId: undefined,
    targetAudience: '',
    contentGoal: 'engagement',
  })

  // ── Load on mount ─────────────────────────────────────────────────────

  useEffect(() => {
    loadPersonas()

    // Check for a pre-selected post idea from AI insights
    const storedPost = sessionStorage.getItem('selectedPostIdea')
    if (storedPost) {
      try {
        const post = JSON.parse(storedPost)
        const generatedPost = {
          id: `ai-${Date.now()}`,
          type: post.type,
          platform: post.platform?.[0] || 'instagram',
          content: `${post.hook}\n\n${post.mainContent}\n\n${post.callToAction}`,
          hashtags: contentAnalysis?.keywords?.slice(0, 5).map((k: string) => `#${k.replace(/\s+/g, '')}`) || [],
        }
        setSuggestions([generatedPost])
        toast.success('AI post idea loaded!')
        sessionStorage.removeItem('selectedPostIdea')
      } catch { /* ignore */ }
    }

    loadExistingSuggestionsAndAutoGenerate()
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data loaders ──────────────────────────────────────────────────────

  const loadPersonas = async () => {
    setLoadingPersonas(true)
    try {
      const response = await fetch('/api/personas')
      if (response.ok) {
        const data = await response.json()
        setPersonas(data.personas || [])
        if (data.personas?.length > 0 && !settings.selectedPersonaId) {
          setSettings(prev => ({ ...prev, selectedPersonaId: data.personas[0].id }))
        }
      }
    } catch { /* ignore */ } finally {
      setLoadingPersonas(false)
    }
  }

  const loadExistingSuggestions = async () => {
    setIsLoadingSuggestions(true)
    try {
      const response = await fetch(`/api/posts/suggestions?projectId=${projectId}`)
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.suggestions || [])
        return data.suggestions || []
      }
    } catch { /* ignore */ } finally {
      setIsLoadingSuggestions(false)
    }
    return []
  }

  const checkGenerationStatus = async () => {
    try {
      const response = await fetch(`/api/posts/generation-status?projectId=${projectId}`)
      if (response.ok) {
        const data = await response.json()
        return data.status
      }
    } catch { /* ignore */ }
    return 'idle'
  }

  const loadExistingSuggestionsAndAutoGenerate = async () => {
    const existingSuggestions = await loadExistingSuggestions()
    const status = await checkGenerationStatus()

    if (status === 'pending' || status === 'running') {
      setGenerationInProgress(true)
      setIsGenerating(true)
      setGenerationStep(status === 'pending' ? 'Queued for generation...' : 'Generating posts with AI...')
      pollForCompletion()
    } else if (existingSuggestions.length === 0 && contentAnalysis && transcript) {
      await autoGeneratePosts()
    }
  }

  const pollForCompletion = () => {
    const interval = setInterval(async () => {
      const status = await checkGenerationStatus()
      if (status === 'completed') {
        clearInterval(interval)
        setIsGenerating(false)
        setGenerationInProgress(false)
        await loadExistingSuggestions()
        toast.success('AI posts created successfully!')
      } else if (status === 'failed') {
        clearInterval(interval)
        setIsGenerating(false)
        setGenerationInProgress(false)
        toast.error('Generation failed. Please try again.')
      } else if (status === 'running') {
        setGenerationStep('Generating posts & images with AI...')
      }
    }, 4000)
  }

  // ── Generation ────────────────────────────────────────────────────────

  const callGenerateAPI = async (settingsOverride: ContentSettings) => {
    const response = await fetch('/api/posts/generate-smart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        projectTitle,
        contentAnalysis,
        transcript, // Send full transcript — API handles truncation
        settings: settingsOverride,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[SmartPostsGenerator] Generation failed:', errorText)
      throw new Error('Failed to generate posts')
    }

    return response.json()
  }

  const autoGeneratePosts = async () => {
    setIsGenerating(true)
    setGenerationStep('Analyzing video content with AI...')
    toast.info('Creating AI-powered posts from your video...', { duration: 3000 })

    const autoSettings: ContentSettings = {
      ...settings,
      contentTypes: ['carousel', 'quote', 'single', 'thread', 'reel'],
      platforms: ['instagram', 'twitter', 'linkedin'],
      creativity: 0.7,
      tone: 'professional',
      includeEmojis: true,
      includeHashtags: true,
      includeCTA: true,
      optimizeForEngagement: true,
      usePersona: true,
      selectedPersonaId: personas[0]?.id || undefined,
      targetAudience: '',
      contentGoal: 'engagement',
    }

    try {
      const data = await callGenerateAPI(autoSettings)
      if (data.jobId) {
        setGenerationStep('Generating posts & images...')
        pollForCompletion()
      } else {
        await loadExistingSuggestions()
        setIsGenerating(false)
        setGenerationStep('')
      }
    } catch (error) {
      console.error('Auto-generation error:', error)
      setIsGenerating(false)
      setGenerationStep('')
      toast.error('Failed to start post generation')
    }
  }

  const handleGeneratePosts = async () => {
    setIsGenerating(true)
    setGenerationStep('Generating content-aware posts with AI...')

    try {
      const data = await callGenerateAPI(settings)
      setShowIntakeDialog(false)
      if (data.jobId) {
        setGenerationStep('Generating posts & images...')
        pollForCompletion()
      } else {
        await loadExistingSuggestions()
        setIsGenerating(false)
        setGenerationStep('')
        toast.success('Posts generated!')
      }
    } catch (error) {
      console.error('Generation error:', error)
      toast.error('Failed to generate posts. Please try again.')
      setIsGenerating(false)
      setGenerationStep('')
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  const toggleContentType = (typeId: string) => {
    setSettings(prev => ({
      ...prev,
      contentTypes: prev.contentTypes.includes(typeId)
        ? prev.contentTypes.filter(t => t !== typeId)
        : [...prev.contentTypes, typeId],
    }))
  }

  const togglePlatform = (platformId: string) => {
    setSettings(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platformId)
        ? prev.platforms.filter(p => p !== platformId)
        : [...prev.platforms, platformId],
    }))
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header Card */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-blue-500/10" />
          <CardHeader className="relative">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-purple-500" />
                  AI Social Posts
                </CardTitle>
                <CardDescription className="mt-2">
                  Content-aware posts generated from your video using GPT-5.2
                </CardDescription>
              </div>
              <Badge variant="secondary" className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
                GPT-5.2
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="flex gap-3">
              <Button
                size="lg"
                onClick={() => setShowIntakeDialog(true)}
                disabled={isGenerating}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    {generationStep || 'Generating...'}
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-5 w-5" />
                    {suggestions.length > 0 ? 'Regenerate Posts' : 'Generate Smart Posts'}
                  </>
                )}
              </Button>
              {suggestions.length > 0 && (
                <Badge variant="outline" className="px-4 py-2 self-center">
                  {suggestions.length} posts
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Generation Dialog ──────────────────────────────────────────── */}
        <Dialog open={showIntakeDialog} onOpenChange={setShowIntakeDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-2">
                <Brain className="h-6 w-6 text-purple-500" />
                Post Generation Settings
              </DialogTitle>
              <DialogDescription>
                Configure content types, platforms, persona, and tone
              </DialogDescription>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="persona">Persona</TabsTrigger>
                <TabsTrigger value="audience">Audience</TabsTrigger>
                <TabsTrigger value="optimization">AI Settings</TabsTrigger>
              </TabsList>

              {/* ── Content Tab ─────────────────────────────────────────── */}
              <TabsContent value="content" className="space-y-6">
                <div>
                  <Label className="text-base font-semibold mb-3 block">Content Types</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {CONTENT_TYPES.map(type => (
                      <Card
                        key={type.id}
                        className={cn(
                          "cursor-pointer transition-all hover:shadow-md",
                          settings.contentTypes.includes(type.id)
                            ? "border-purple-500 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20"
                            : "hover:border-gray-300"
                        )}
                        onClick={() => toggleContentType(type.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={cn("p-2 rounded-lg bg-gradient-to-br text-white", type.color)}>
                              <type.icon className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">{type.name}</div>
                              <div className="text-sm text-muted-foreground">{type.description}</div>
                            </div>
                            {settings.contentTypes.includes(type.id) && (
                              <CheckCircle2 className="h-5 w-5 text-purple-500 flex-shrink-0" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-base font-semibold mb-3 block">Target Platforms</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {PLATFORMS.map(platform => (
                      <Button
                        key={platform.id}
                        variant={settings.platforms.includes(platform.id) ? "default" : "outline"}
                        className={cn("h-auto py-3 justify-start", settings.platforms.includes(platform.id) && platform.color)}
                        onClick={() => togglePlatform(platform.id)}
                      >
                        <platform.icon className="h-4 w-4 mr-2" />
                        {platform.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* ── Persona Tab ─────────────────────────────────────────── */}
              <TabsContent value="persona" className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-base font-semibold">Use Brand Persona</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Switch
                            checked={settings.usePersona}
                            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, usePersona: checked }))}
                            disabled={personas.length === 0}
                          />
                        </div>
                      </TooltipTrigger>
                      {personas.length === 0 && (
                        <TooltipContent><p>No personas available. Create one first.</p></TooltipContent>
                      )}
                    </Tooltip>
                  </div>

                  {loadingPersonas ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
                    </div>
                  ) : personas.length === 0 ? (
                    <Card className="border-dashed bg-muted/10">
                      <CardContent className="py-8 text-center">
                        <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                        <p className="text-muted-foreground mb-4">No personas found</p>
                        <Button variant="outline" size="sm" onClick={() => window.location.href = '/personas'}>
                          <Plus className="h-4 w-4 mr-1" /> Create Persona
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {personas.map(persona => (
                        <Card
                          key={persona.id}
                          className={cn(
                            "cursor-pointer transition-all",
                            settings.usePersona && settings.selectedPersonaId === persona.id
                              ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
                              : "hover:border-gray-300",
                            !settings.usePersona && "opacity-50 cursor-not-allowed"
                          )}
                          onClick={() => settings.usePersona && setSettings(prev => ({ ...prev, selectedPersonaId: persona.id }))}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              {persona.avatar_url ? (
                                <img src={persona.avatar_url} alt={persona.name} className="w-12 h-12 rounded-full object-cover" />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                                  {persona.name[0]?.toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="font-medium">{persona.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {persona.description || `${persona.photo_count} photos available`}
                                </div>
                                {persona.brand_voice && <Badge variant="secondary" className="mt-1">{persona.brand_voice}</Badge>}
                              </div>
                              {settings.usePersona && settings.selectedPersonaId === persona.id && (
                                <CheckCircle2 className="h-5 w-5 text-purple-500" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {settings.usePersona && personas.length > 0 && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4">
                      <div className="flex gap-2">
                        <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-blue-900 dark:text-blue-100">Persona Active</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            Brand voice and visual style will be applied to generated content.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ── Audience Tab ────────────────────────────────────────── */}
              <TabsContent value="audience" className="space-y-6">
                <div>
                  <Label htmlFor="audience" className="text-base font-semibold mb-2 block">Target Audience</Label>
                  <Textarea
                    id="audience"
                    placeholder="e.g., Young professionals interested in productivity..."
                    value={settings.targetAudience}
                    onChange={(e) => setSettings(prev => ({ ...prev, targetAudience: e.target.value }))}
                    className="min-h-[100px]"
                  />
                </div>

                <div>
                  <Label className="text-base font-semibold mb-3 block">Primary Content Goal</Label>
                  <RadioGroup
                    value={settings.contentGoal}
                    onValueChange={(value: any) => setSettings(prev => ({ ...prev, contentGoal: value }))}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'awareness', label: 'Brand Awareness', icon: Eye, description: 'Increase visibility' },
                        { value: 'engagement', label: 'Engagement', icon: TrendingUp, description: 'Maximize interactions' },
                        { value: 'conversion', label: 'Conversion', icon: Target, description: 'Drive sales/sign-ups' },
                        { value: 'education', label: 'Education', icon: Brain, description: 'Share knowledge' },
                      ].map(goal => (
                        <div key={goal.value}>
                          <RadioGroupItem value={goal.value} id={goal.value} className="peer sr-only" />
                          <Label
                            htmlFor={goal.value}
                            className={cn(
                              "flex flex-col items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-all",
                              "hover:border-purple-300",
                              "peer-checked:border-purple-500 peer-checked:bg-purple-50 dark:peer-checked:bg-purple-950/20"
                            )}
                          >
                            <goal.icon className="h-8 w-8 mb-2 text-purple-500" />
                            <span className="font-medium">{goal.label}</span>
                            <span className="text-xs text-muted-foreground text-center mt-1">{goal.description}</span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-base font-semibold mb-3 block">Content Tone</Label>
                  <Select value={settings.tone} onValueChange={(value: any) => setSettings(prev => ({ ...prev, tone: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="funny">Funny</SelectItem>
                      <SelectItem value="educational">Educational</SelectItem>
                      <SelectItem value="inspirational">Inspirational</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              {/* ── AI Settings Tab ─────────────────────────────────────── */}
              <TabsContent value="optimization" className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-base font-semibold">Creativity Level</Label>
                      <span className="text-sm text-muted-foreground">{Math.round(settings.creativity * 100)}%</span>
                    </div>
                    <Slider
                      value={[settings.creativity]}
                      onValueChange={([value]) => setSettings(prev => ({ ...prev, creativity: value }))}
                      min={0} max={1} step={0.1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Conservative</span>
                      <span>Balanced</span>
                      <span>Creative</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      { key: 'includeEmojis', label: 'Include Emojis', icon: '😊', description: 'Add relevant emojis' },
                      { key: 'includeHashtags', label: 'Auto-generate Hashtags', icon: '#', description: 'Create trending hashtags' },
                      { key: 'includeCTA', label: 'Add Call-to-Actions', icon: '🎯', description: 'Include action prompts' },
                      { key: 'optimizeForEngagement', label: 'Optimize for Engagement', icon: '📈', description: 'Maximize interactions' },
                    ].map(setting => (
                      <div key={setting.key} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{setting.icon}</span>
                          <div>
                            <Label htmlFor={setting.key} className="cursor-pointer font-medium">{setting.label}</Label>
                            <p className="text-xs text-muted-foreground">{setting.description}</p>
                          </div>
                        </div>
                        <Switch
                          id={setting.key}
                          checked={settings[setting.key as keyof ContentSettings] as boolean}
                          onCheckedChange={(checked) => setSettings(prev => ({ ...prev, [setting.key]: checked }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => setShowIntakeDialog(false)}>Cancel</Button>
              <Button
                onClick={handleGeneratePosts}
                disabled={isGenerating || settings.contentTypes.length === 0 || settings.platforms.length === 0}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    {generationStep || 'Generating...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Posts
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Generation In-Progress ─────────────────────────────────────── */}
        {(isGenerating || generationInProgress) && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto" />
                <p className="font-medium">{generationStep || 'Generating posts...'}</p>
                <p className="text-sm text-muted-foreground">
                  GPT-5.2 is analyzing your video content and creating platform-optimized posts.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Loading State ──────────────────────────────────────────────── */}
        {isLoadingSuggestions && !isGenerating && (
          <Card className="animate-pulse">
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto" />
                <p className="text-muted-foreground">Loading posts...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Empty State ────────────────────────────────────────────────── */}
        {!isLoadingSuggestions && suggestions.length === 0 && !isGenerating && !generationInProgress && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
              <p className="text-muted-foreground mb-4">
                {contentAnalysis && transcript
                  ? "Click 'Generate Smart Posts' to create AI-powered content from your video"
                  : "Waiting for video analysis to complete..."}
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Generated Suggestions ──────────────────────────────────────── */}
        {!isLoadingSuggestions && suggestions.length > 0 && !isGenerating && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Generated Posts</h3>
              <div className="flex gap-2">
                <Badge variant="secondary">{suggestions.length} posts</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/posts/export?projectId=${projectId}`)
                      if (!res.ok) throw new Error('Export failed')
                      const data = await res.json()
                      const blob = new Blob([data.fullTextExport], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${projectTitle.replace(/[^a-zA-Z0-9]/g, '_')}_social_content.txt`
                      a.click()
                      URL.revokeObjectURL(url)
                      toast.success(`Exported ${data.stats.totalPosts} posts for ${data.stats.platforms.length} platforms`)
                    } catch {
                      toast.error('Failed to export content')
                    }
                  }}
                >
                  <ChevronDown className="h-4 w-4 mr-1" /> Export All
                </Button>
                <Button variant="outline" size="sm" onClick={loadExistingSuggestions}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {suggestions.map((suggestion, index) => (
                <SuggestionCard
                  key={suggestion.id || index}
                  suggestion={suggestion}
                  index={index}
                  onApprove={() => loadExistingSuggestions()}
                  onRegenerate={() => loadExistingSuggestions()}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
