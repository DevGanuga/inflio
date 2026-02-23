"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  IconFileText,
  IconScissors,
  IconSparkles,
  IconClock,
  IconLock,
  IconCheck,
  IconChevronDown,
  IconDeviceMobile,
  IconSquare,
  IconRectangle,
  IconRectangleVertical,
  IconSettings,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ClipSettings, DEFAULT_CLIP_SETTINGS } from "@/lib/project-types"
import { useState } from "react"

export interface WorkflowOptions {
  transcription: boolean
  clips: boolean
  blog: boolean
  social: boolean
  clipSettings?: ClipSettings
}

interface WorkflowSelectionProps {
  options: WorkflowOptions
  onChange: (options: WorkflowOptions) => void
  disabled?: boolean
  variant?: 'default' | 'grid'
}

const ASPECT_RATIOS = [
  { value: 1 as const, label: '9:16', name: 'Vertical', desc: 'TikTok, Reels, Shorts', icon: IconDeviceMobile },
  { value: 2 as const, label: '1:1', name: 'Square', desc: 'Instagram, Facebook Feed', icon: IconSquare },
  { value: 3 as const, label: '4:5', name: 'Portrait', desc: 'Instagram Optimized', icon: IconRectangleVertical },
  { value: 4 as const, label: '16:9', name: 'Horizontal', desc: 'YouTube, LinkedIn, Twitter', icon: IconRectangle },
]

const CLIP_LENGTHS = [
  { value: '0', label: 'Auto (AI decides)' },
  { value: '1', label: 'Ultra Short (< 30s)' },
  { value: '2', label: 'Short (30-60s)' },
  { value: '3', label: 'Medium (60-90s)' },
  { value: '4', label: 'Long (90s - 3min)' },
]

const STYLE_TOGGLES = [
  { key: 'subtitleSwitch' as const, label: 'Subtitles', desc: 'Auto-generated captions on clips' },
  { key: 'headlineSwitch' as const, label: 'AI Headline / Hook', desc: 'Attention-grabbing title overlay' },
  { key: 'removeSilenceSwitch' as const, label: 'Remove Silence & Fillers', desc: 'Cut dead air and filler words' },
  { key: 'emojiSwitch' as const, label: 'Auto Emoji', desc: 'Add contextual emojis to subtitles' },
  { key: 'highlightSwitch' as const, label: 'Highlight Keywords', desc: 'Emphasize key words in subtitles' },
  { key: 'autoBrollSwitch' as const, label: 'Auto B-Roll', desc: 'AI-inserted supplementary footage' },
]

function ClipStylePanel({
  settings,
  onChange,
  disabled,
}: {
  settings: ClipSettings
  onChange: (settings: ClipSettings) => void
  disabled?: boolean
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const update = (patch: Partial<ClipSettings>) => onChange({ ...settings, ...patch })

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <div className="pt-4 pb-1 space-y-5 border-t border-dashed border-primary/20 mt-4">
        {/* Aspect Ratio */}
        <div className="space-y-2.5">
          <Label className="text-sm font-medium">Aspect Ratio</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ASPECT_RATIOS.map((ar) => {
              const Icon = ar.icon
              const selected = settings.ratioOfClip === ar.value
              return (
                <button
                  key={ar.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => update({ ratioOfClip: ar.value })}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all text-center",
                    selected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-muted hover:border-primary/40"
                  )}
                >
                  <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("text-sm font-semibold", selected && "text-primary")}>{ar.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{ar.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Clip Length */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Clip Length</Label>
          <Select
            value={String(settings.preferLength[0])}
            onValueChange={(v) => update({ preferLength: [Number(v)] })}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIP_LENGTHS.map((cl) => (
                <SelectItem key={cl.value} value={cl.value}>{cl.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Max Clips */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Max Clips</Label>
            <span className="text-sm font-mono text-muted-foreground">{settings.maxClipNumber}</span>
          </div>
          <Slider
            value={[settings.maxClipNumber]}
            onValueChange={([v]) => update({ maxClipNumber: v })}
            min={1}
            max={50}
            step={1}
            disabled={disabled}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>1</span>
            <span>50</span>
          </div>
        </div>

        {/* Keywords */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Keywords / Topics</Label>
          <Input
            placeholder='e.g. "AI trends, product launch, key takeaways"'
            value={settings.keywords}
            onChange={(e) => update({ keywords: e.target.value })}
            disabled={disabled}
          />
          <p className="text-[11px] text-muted-foreground">
            Guide the AI to find clips about specific topics or moments
          </p>
        </div>

        {/* Style Toggles */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Style Options</Label>
          <div className="grid gap-2">
            {STYLE_TOGGLES.map((toggle) => (
              <div
                key={toggle.key}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5"
              >
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">{toggle.label}</span>
                  <p className="text-[11px] text-muted-foreground">{toggle.desc}</p>
                </div>
                <Switch
                  checked={settings[toggle.key] === 1}
                  onCheckedChange={(v) => update({ [toggle.key]: v ? 1 : 0 } as any)}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Advanced - Template ID */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <IconSettings className="h-4 w-4" />
            Advanced
            <IconChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Template ID</Label>
              <Input
                type="number"
                placeholder="Enter Vizard template ID"
                value={settings.templateId ?? ''}
                onChange={(e) => update({ templateId: e.target.value ? Number(e.target.value) : null })}
                disabled={disabled}
              />
              <p className="text-[11px] text-muted-foreground">
                Apply a saved Vizard template style. Find template IDs in your Vizard editor under the Template tab.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </motion.div>
  )
}

export function WorkflowSelection({
  options,
  onChange,
  disabled = false,
  variant = 'default'
}: WorkflowSelectionProps) {
  const clipSettings = options.clipSettings ?? { ...DEFAULT_CLIP_SETTINGS }

  const workflows = [
    {
      id: 'transcription' as const,
      name: 'Transcript & AI Summary',
      description: 'Convert speech to text and generate AI project insights',
      icon: IconFileText,
      color: 'from-blue-500 to-blue-600',
      estimatedTime: '2-3 minutes',
      features: ['99% accuracy', 'Speaker detection', 'AI summary', 'Key insights'],
      required: true,
      checked: true,
      popular: false
    },
    {
      id: 'clips' as const,
      name: 'Generate Short-Form Clips',
      description: 'AI extracts the best moments for viral social media content',
      icon: IconScissors,
      color: 'from-purple-500 to-purple-600',
      estimatedTime: '10-20 minutes',
      features: ['Viral detection', 'Auto-captions', 'Multiple formats', 'Up to 50 clips'],
      required: false,
      checked: options.clips,
      popular: true
    }
  ]

  const handleToggle = (workflowId: 'transcription' | 'clips' | 'blog' | 'social') => {
    const workflow = workflows.find(w => w.id === workflowId)
    if (workflow?.required) return

    const toggled = !options[workflowId]
    const newClipsState = workflowId === 'clips' ? toggled : options.clips
    onChange({
      ...options,
      [workflowId]: toggled,
      clipSettings: newClipsState ? (options.clipSettings ?? { ...DEFAULT_CLIP_SETTINGS }) : undefined,
    })
  }

  const handleClipSettingsChange = (newSettings: ClipSettings) => {
    onChange({ ...options, clipSettings: newSettings })
  }

  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 gradient-premium" />
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Processing Options</CardTitle>
            <CardDescription className="mt-1">
              Choose what to generate from your video
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn(
          variant === 'grid' 
            ? "grid grid-cols-1 gap-4"
            : "space-y-4"
        )}>
          {workflows.map((workflow, index) => {
            const Icon = workflow.icon
            const isSelected = workflow.required || !!options[workflow.id as keyof Pick<WorkflowOptions, 'transcription' | 'clips' | 'blog' | 'social'>]
            
            return (
              <motion.div
                key={workflow.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div
                  className={cn(
                    "group relative overflow-hidden rounded-xl border-2 transition-all duration-300",
                    isSelected && "border-primary shadow-lg bg-primary/5",
                    !isSelected && "border-muted hover:border-primary/50",
                    disabled && "pointer-events-none opacity-60"
                  )}
                >
                  <div className="relative p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "p-2.5 rounded-lg bg-gradient-to-br text-white shadow-lg",
                          workflow.color
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-base flex items-center gap-2">
                            {workflow.name}
                            {workflow.required && (
                              <Badge variant="secondary" className="text-xs">
                                <IconLock className="h-3 w-3 mr-1" />
                                Required
                              </Badge>
                            )}
                            {workflow.popular && !workflow.required && (
                              <Badge className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                Popular
                              </Badge>
                            )}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {workflow.description}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {workflow.required ? (
                          <div className="p-1 rounded-full bg-primary text-primary-foreground">
                            <IconCheck className="h-4 w-4" />
                          </div>
                        ) : (
                          <Switch
                            checked={isSelected}
                            onCheckedChange={() => handleToggle(workflow.id)}
                            disabled={disabled || workflow.required}
                            className="data-[state=checked]:bg-primary"
                          />
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <IconClock className="h-3.5 w-3.5" />
                          {workflow.estimatedTime}
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <IconSparkles className="h-3.5 w-3.5" />
                          AI-Powered
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-1.5">
                        {workflow.features.map((feature, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className={cn(
                              "text-xs font-normal",
                              isSelected && "bg-primary/10 text-primary"
                            )}
                          >
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Clip Style Panel - shown when clips are enabled */}
                    {workflow.id === 'clips' && (
                      <AnimatePresence>
                        {isSelected && (
                          <ClipStylePanel
                            settings={clipSettings}
                            onChange={handleClipSettingsChange}
                            disabled={disabled}
                          />
                        )}
                      </AnimatePresence>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
        
        <Alert className="mt-6 border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
          <IconSparkles className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm">
            <strong>More features available after processing:</strong> Once your video is processed, you can generate blog posts, 
            social media content, images, thumbnails, and more from your project dashboard.
          </AlertDescription>
        </Alert>
        
        {!options.clips && (
          <Alert className="mt-3 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
            <AlertDescription className="text-sm">
              <strong>Skipping clips?</strong> You won't get auto-generated short-form content with captions for TikTok, Instagram Reels, or YouTube Shorts. 
              You can still generate clips later from your project dashboard, but it will take additional processing time.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
