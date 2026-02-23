'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'
import { Loader2, Play, SkipBack, SkipForward, Download, Copy, Check, AlertCircle, Sparkles, FileText, Settings, Eye, Video, Clock, CheckCircle2, Edit, Scissors } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { IconPlayerPlay } from '@tabler/icons-react'

interface TranscriptSegment {
  start: number
  end: number
  text: string
}

interface SubtitleSettings {
  fontFamily: string
  fontSize: number
  fontColor: string
  backgroundColor: string
  backgroundOpacity: number
  position: 'top' | 'center' | 'bottom'
  alignment: 'left' | 'center' | 'right'
  strokeColor: string
  strokeWidth: number
  animation: 'none' | 'fade' | 'slide'
  animationDuration: number
  lineHeight: number
  padding: number
  maxWidth: number
  shadow: boolean
  shadowColor: string
  shadowBlur: number
}

interface EnhancedTranscriptEditorProps {
  segments: TranscriptSegment[]
  onSegmentsChange: (segments: TranscriptSegment[]) => void
  projectId: string
  videoUrl: string
  onVideoUrlUpdate?: (newUrl: string, vttUrl?: string) => void
  videoDuration?: number
  onSegmentClick?: (segment: TranscriptSegment) => void
}

export function EnhancedTranscriptEditor({
  segments,
  onSegmentsChange,
  projectId,
  videoUrl,
  onVideoUrlUpdate,
  videoDuration = 0,
  onSegmentClick
}: EnhancedTranscriptEditorProps) {
  const [editingSegments, setEditingSegments] = useState(segments)
  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>({
    fontFamily: 'Arial',
    fontSize: 24,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 80,
    position: 'bottom',
    alignment: 'center',
    strokeColor: '#000000',
    strokeWidth: 0,
    animation: 'none',
    animationDuration: 300,
    lineHeight: 1.5,
    padding: 8,
    maxWidth: 90,
    shadow: true,
    shadowColor: '#000000',
    shadowBlur: 4
  })
  const [isApplying, setIsApplying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0)
  const [hasChanges, setHasChanges] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [activeTab, setActiveTab] = useState('edit')
  const [processingStage, setProcessingStage] = useState('')
  const [subtitlesApplied, setSubtitlesApplied] = useState(false)
  const [vttBlobUrl, setVttBlobUrl] = useState<string | null>(null)
  const [burnSubtitles, setBurnSubtitles] = useState(false)
  const [processingTaskId, setProcessingTaskId] = useState<string | null>(null)
  const [burningProgress, setBurningProgress] = useState(0)

  useEffect(() => {
    setEditingSegments(segments)
  }, [segments])

  useEffect(() => {
    // Cleanup VTT blob URL on unmount
    return () => {
      if (vttBlobUrl) {
        URL.revokeObjectURL(vttBlobUrl)
      }
    }
  }, [vttBlobUrl])


  const handleSegmentEdit = (index: number, field: keyof TranscriptSegment, value: any) => {
    const newSegments = [...editingSegments]
    newSegments[index] = { ...newSegments[index], [field]: value }
    setEditingSegments(newSegments)
    setHasChanges(true)
  }

  const handleSaveChanges = () => {
    onSegmentsChange(editingSegments)
    setHasChanges(false)
    toast.success('Transcript saved successfully')
  }

  const estimateProcessingTime = () => {
    // Estimate based on video duration (roughly 1 minute per 5 minutes of video)
    const minutes = Math.ceil(videoDuration / 60)
    const processingMinutes = Math.max(1, Math.ceil(minutes / 5))
    return processingMinutes
  }

  const pollBurningProgress = async (taskId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/apply-subtitles?taskId=${taskId}`)
        if (response.ok) {
          const task = await response.json()
          
          setBurningProgress(task.progress)
          setProgress(20 + (task.progress * 0.7)) // 20-90%
          
          if (task.status === 'completed' && task.outputVideoUrl) {
            clearInterval(pollInterval)
            setProgress(95)
            setProcessingStage('Finalizing video...')
            
            // Update video URL with burned-in version
            onVideoUrlUpdate?.(task.outputVideoUrl)
            
            setProgress(100)
            setProcessingStage('Subtitles burned successfully!')
            setSubtitlesApplied(true)
            
            toast.success('🎬 Video with burned-in subtitles is ready!')
            
            setTimeout(() => {
              setIsApplying(false)
              setProgress(0)
              setProcessingStage('')
              setBurningProgress(0)
              setProcessingTaskId(null)
            }, 2000)
            
          } else if (task.status === 'failed') {
            clearInterval(pollInterval)
            throw new Error(task.error || 'Subtitle burning failed')
          }
        }
      } catch (error) {
        clearInterval(pollInterval)
        console.error('Polling error:', error)
        toast.error('Failed to process subtitles')
        setIsApplying(false)
        setProgress(0)
        setProcessingStage('')
      }
    }, 2000) // Poll every 2 seconds
  }

  const handleApplySubtitles = async () => {
    try {
      setIsApplying(true)
      setProgress(0)
      setProcessingStage('Generating subtitle file...')
      
      // Cleanup previous VTT URL if exists
      if (vttBlobUrl) {
        URL.revokeObjectURL(vttBlobUrl)
        setVttBlobUrl(null)
      }
      
      await new Promise(resolve => setTimeout(resolve, 500)) // Small delay for better UX
      
      if (burnSubtitles) {
        setProcessingStage('Burning subtitles via Cloudinary...')
        setProgress(20)
        
        const response = await fetch('/api/apply-subtitles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            videoUrl,
            segments: editingSegments,
            settings: subtitleSettings,
          })
        })
        
        if (response.ok) {
          const result = await response.json()
          setProcessingTaskId(result.taskId)
          setProcessingStage('Burning subtitles into video...')
          
          // Poll for progress
          pollBurningProgress(result.taskId)
        } else {
          throw new Error('Failed to start subtitle burning')
        }
      } else {
        // Apply VTT overlay (existing functionality)
        // Generate VTT with custom styling
        const vttContent = generateStyledVTT(editingSegments, subtitleSettings)
        const vttBlob = new Blob([vttContent], { type: 'text/vtt' })
        const newVttUrl = URL.createObjectURL(vttBlob)
        setVttBlobUrl(newVttUrl)
        
        setProgress(30)
        setProcessingStage('Applying subtitles to video player...')
        
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // Apply VTT subtitles to the video player with proper video URL
        onVideoUrlUpdate?.(videoUrl, newVttUrl)
        
        setProgress(60)
        setProcessingStage('Configuring subtitle display...')
        
        await new Promise(resolve => setTimeout(resolve, 300))
        
        setSubtitlesApplied(true)
        setProgress(100)
        setProcessingStage('Subtitles applied successfully!')
        
        // Also try to burn subtitles using cloud service if available (background task)
        if (!burnSubtitles) {
          tryCloudSubtitleBurning(newVttUrl)
        }
        
        setTimeout(() => {
          setIsApplying(false)
          setProgress(0)
          setProcessingStage('')
        }, 2000)
        
        toast.success('✅ Subtitles applied! Your content is ready for publishing.')
      }
      
    } catch (error) {
      console.error('Error applying subtitles:', error)
      toast.error('Failed to apply subtitles')
      setIsApplying(false)
      setProgress(0)
      setProcessingStage('')
    }
  }
  
  const tryCloudSubtitleBurning = async (vttUrl: string) => {
    try {
      const response = await fetch('/api/apply-subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          videoUrl,
          segments: editingSegments,
          settings: subtitleSettings
        })
      })

      if (response.ok) {
        const result = await response.json()
        
        if (result.status === 'completed' && result.videoUrl) {
          // Update with burned-in video if available
          onVideoUrlUpdate?.(result.videoUrl, vttUrl)
          toast.info('🎬 Enhanced video with burned-in subtitles is ready!')
        } else if (result.taskId) {
          // Poll for progress in background
          pollTaskStatusBackground(result.taskId, vttUrl)
        }
      }
    } catch (error) {
      // Silent fail - we already have VTT subtitles working
      console.log('Cloud subtitle service unavailable, using VTT overlay')
    }
  }
  
  const generateStyledVTT = (segments: TranscriptSegment[], settings: SubtitleSettings): string => {
    let vtt = 'WEBVTT\n\n'
    
    // Add VTT styling header with enhanced settings
    vtt += 'STYLE\n'
    vtt += '::cue {\n'
    vtt += `  font-family: ${settings.fontFamily}, -apple-system, BlinkMacSystemFont, sans-serif;\n`
    vtt += `  font-size: ${settings.fontSize}px;\n`
    vtt += `  font-weight: 600;\n`
    vtt += `  color: ${settings.fontColor};\n`
    vtt += `  background-color: ${settings.backgroundColor}${Math.round(settings.backgroundOpacity * 2.55).toString(16).padStart(2, '0')};\n`
    vtt += `  text-align: ${settings.alignment};\n`
    vtt += `  line-height: ${settings.lineHeight};\n`
    vtt += `  padding: ${settings.padding}px;\n`
    vtt += `  border-radius: 0.4em;\n`
    vtt += `  backdrop-filter: blur(4px);\n`
    vtt += `  -webkit-backdrop-filter: blur(4px);\n`
    
    // Add text shadow for better readability
    const shadows = []
    if (settings.strokeWidth > 0) {
      // Text stroke simulation using multiple shadows
      const strokeColor = settings.strokeColor || '#000000'
      for (let angle = 0; angle < 360; angle += 45) {
        const x = Math.cos(angle * Math.PI / 180) * settings.strokeWidth
        const y = Math.sin(angle * Math.PI / 180) * settings.strokeWidth
        shadows.push(`${strokeColor} ${x}px ${y}px 0px`)
      }
    }
    
    // Add drop shadow if enabled
    if (settings.shadow) {
      shadows.push(`${settings.shadowColor} 0px 2px ${settings.shadowBlur}px`)
    }
    
    // Always add subtle shadow for readability
    shadows.push('rgba(0, 0, 0, 0.8) 0px 1px 2px')
    shadows.push('rgba(0, 0, 0, 0.5) 0px 0px 4px')
    
    if (shadows.length > 0) {
      vtt += `  text-shadow: ${shadows.join(', ')};\n`
    }
    
    // Add animation class if specified
    if (settings.animation && settings.animation !== 'none') {
      vtt += `  animation: ${settings.animation === 'fade' ? 'subtitleFadeIn' : 'subtitleSlideUp'} ${settings.animationDuration || 300}ms ease-out;\n`
    }
    
    vtt += '}\n\n'
    
    // Add specific position styling
    if (settings.position === 'top') {
      vtt += '::cue(.subtitle-position-top) {\n'
      vtt += '  vertical-align: top;\n'
      vtt += '}\n\n'
    } else if (settings.position === 'center') {
      vtt += '::cue(.subtitle-position-center) {\n'
      vtt += '  vertical-align: middle;\n'
      vtt += '}\n\n'
    }
    
    // Add subtitle entries with enhanced positioning
    segments.forEach((segment, index) => {
      const start = formatVTTTime(segment.start)
      const end = formatVTTTime(segment.end)
      
      // Calculate position based on settings
      const position = settings.position === 'top' ? 10 : settings.position === 'center' ? 50 : 90
      const align = settings.alignment || 'center'
      const size = settings.maxWidth || 90
      
      vtt += `${index + 1}\n`
      vtt += `${start} --> ${end} position:${position}% line:${position}% align:${align} size:${size}%`
      
      // Add position class
      if (settings.position) {
        vtt += ` class:subtitle-position-${settings.position}`
      }
      
      vtt += '\n'
      vtt += `${segment.text}\n\n`
    })
    
    return vtt
  }

  const formatVTTTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }

  const pollTaskStatusBackground = async (taskId: string, vttUrl: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/apply-subtitles/status/${taskId}`)
        if (!response.ok) throw new Error('Failed to get status')
        
        const task = await response.json()
        
        if (task.status === 'completed' && task.outputVideoUrl) {
          clearInterval(interval)
          onVideoUrlUpdate?.(task.outputVideoUrl, vttUrl)
          toast.info('🎬 Enhanced video with burned-in subtitles is ready!')
        } else if (task.status === 'failed') {
          clearInterval(interval)
          // Silent fail - we already have working subtitles
        }
      } catch (error) {
        clearInterval(interval)
        // Silent fail - we already have working subtitles
      }
    }, 5000) // Check every 5 seconds in background
    
    // Stop checking after 5 minutes
    setTimeout(() => clearInterval(interval), 300000)
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const downloadTranscript = (format: 'txt' | 'srt' | 'vtt') => {
    let content = ''
    const filename = `transcript.${format}`
    
    switch (format) {
      case 'txt':
        content = editingSegments.map(s => s.text).join('\n\n')
        break
      case 'srt':
        content = editingSegments.map((s, i) => {
          const start = `${Math.floor(s.start/3600).toString().padStart(2,'0')}:${Math.floor((s.start%3600)/60).toString().padStart(2,'0')}:${Math.floor(s.start%60).toString().padStart(2,'0')},${Math.floor((s.start%1)*1000).toString().padStart(3,'0')}`
          const end = `${Math.floor(s.end/3600).toString().padStart(2,'0')}:${Math.floor((s.end%3600)/60).toString().padStart(2,'0')}:${Math.floor(s.end%60).toString().padStart(2,'0')},${Math.floor((s.end%1)*1000).toString().padStart(3,'0')}`
          return `${i + 1}\n${start} --> ${end}\n${s.text}\n`
        }).join('\n')
        break
      case 'vtt':
        content = generateStyledVTT(editingSegments, subtitleSettings)
        break
    }
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyFullTranscript = () => {
    const fullText = editingSegments.map(s => s.text).join('\n\n')
    navigator.clipboard.writeText(fullText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const wordCount = editingSegments.reduce((acc, s) => acc + s.text.split(' ').length, 0)

  return (
    <div className="h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Transcript & Subtitles</CardTitle>
            <CardDescription className="text-sm">
              Edit transcript and prepare for long-form publishing
            </CardDescription>
          </div>
          {subtitlesApplied && (
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Long-form Ready
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="mb-4 space-y-4">
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Pro tip:</span> Each segment represents a subtitle that will appear on your video. 
                  Keep them concise for better readability.
                </p>
              </div>
            </div>
            
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="edit" className="gap-2">
                <Edit className="h-3 w-3" />
                Edit
              </TabsTrigger>
              <TabsTrigger value="subtitles" className="gap-2">
                <Settings className="h-3 w-3" />
                Style
              </TabsTrigger>
              <TabsTrigger value="export" className="gap-2">
                <Download className="h-3 w-3" />
                Export
              </TabsTrigger>
            </TabsList>
          </div>
          
          <div className="flex-1 overflow-hidden">
            <TabsContent value="edit" className="h-full space-y-4">
              {hasChanges && (
                <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>You have unsaved changes</span>
                    <Button size="sm" onClick={handleSaveChanges}>
                      Save Changes
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {editingSegments.length} segments • {wordCount} words
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentSegmentIndex(Math.max(0, currentSegmentIndex - 1))}
                    disabled={currentSegmentIndex === 0}
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">
                    {currentSegmentIndex + 1} / {editingSegments.length}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentSegmentIndex(Math.min(editingSegments.length - 1, currentSegmentIndex + 1))}
                    disabled={currentSegmentIndex === editingSegments.length - 1}
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-400px)] custom-scrollbar">
                {editingSegments.map((segment, index) => (
                  <div
                    key={index}
                    className={cn(
                      "p-4 rounded-lg border-2 transition-all cursor-pointer group",
                      index === currentSegmentIndex 
                        ? "border-primary bg-primary/5 shadow-md" 
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                    )}
                    onClick={() => {
                      setCurrentSegmentIndex(index)
                      onSegmentClick?.(segment)
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 space-y-1">
                        <Badge variant="outline" className="font-mono text-xs bg-background">
                          {formatTime(segment.start)}
                        </Badge>
                        <div className="text-[10px] text-muted-foreground text-center">
                          {Math.round(segment.end - segment.start)}s
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            Segment {index + 1} • {segment.text.split(' ').length} words
                          </span>
                          {index === currentSegmentIndex && (
                            <Badge variant="default" className="text-xs">
                              <Edit className="h-3 w-3 mr-1" />
                              Editing
                            </Badge>
                          )}
                        </div>
                        <Textarea
                          value={segment.text}
                          onChange={(e) => handleSegmentEdit(index, 'text', e.target.value)}
                          className="flex-1 min-h-[80px] resize-none font-medium text-sm leading-relaxed"
                          placeholder="Enter subtitle text..."
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>Duration: {formatTime(segment.end)} - {formatTime(segment.start)}</span>
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                // Split segment functionality
                              }}
                            >
                              <Scissors className="h-3 w-3 mr-1" />
                              Split
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="subtitles" className="h-full flex flex-col gap-4">
              <div className="flex-1 space-y-4 overflow-y-auto subtitle-settings-scroll">

                {/* Live Preview - at the top for immediate feedback */}
                <div className="bg-black rounded-lg flex items-center justify-center aspect-video relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-20">
                    <Video className="h-16 w-16 text-white/50" />
                  </div>
                  <div 
                    className="relative"
                    style={{
                      maxWidth: `${subtitleSettings.maxWidth}%`,
                      textAlign: subtitleSettings.alignment as any,
                      position: 'absolute',
                      bottom: subtitleSettings.position === 'bottom' ? '10%' : undefined,
                      top: subtitleSettings.position === 'top' ? '10%' : undefined,
                      left: '50%',
                      transform: 'translateX(-50%)'
                    }}
                  >
                    <p 
                      style={{
                        fontFamily: `${subtitleSettings.fontFamily}, sans-serif`,
                        fontSize: `${subtitleSettings.fontSize}px`,
                        color: subtitleSettings.fontColor,
                        backgroundColor: subtitleSettings.backgroundColor + Math.round(subtitleSettings.backgroundOpacity * 2.55).toString(16).padStart(2, '0'),
                        padding: `${subtitleSettings.padding}px ${subtitleSettings.padding * 2}px`,
                        borderRadius: '4px',
                        lineHeight: subtitleSettings.lineHeight,
                        textShadow: subtitleSettings.strokeWidth > 0 
                          ? `${subtitleSettings.strokeColor} 0px 0px ${subtitleSettings.strokeWidth}px` 
                          : undefined,
                        boxShadow: subtitleSettings.shadow 
                          ? `${subtitleSettings.shadowColor} 0px 2px ${subtitleSettings.shadowBlur}px` 
                          : undefined,
                        display: 'inline-block',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {editingSegments[currentSegmentIndex]?.text || 'Sample subtitle text'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-5">
                  {/* Typography */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Typography</h3>
                    <div className="grid gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Font</Label>
                          <Select
                            value={subtitleSettings.fontFamily}
                            onValueChange={(value) => setSubtitleSettings({...subtitleSettings, fontFamily: value})}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Arial">Arial</SelectItem>
                              <SelectItem value="Helvetica">Helvetica</SelectItem>
                              <SelectItem value="Roboto">Roboto</SelectItem>
                              <SelectItem value="Open Sans">Open Sans</SelectItem>
                              <SelectItem value="Montserrat">Montserrat</SelectItem>
                              <SelectItem value="Inter">Inter</SelectItem>
                              <SelectItem value="Poppins">Poppins</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Size: {subtitleSettings.fontSize}px</Label>
                          <Slider
                            value={[subtitleSettings.fontSize]}
                            onValueChange={([value]) => setSubtitleSettings({...subtitleSettings, fontSize: value})}
                            min={12}
                            max={48}
                            step={1}
                            className="mt-2"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Position</Label>
                          <Select
                            value={subtitleSettings.position}
                            onValueChange={(value: 'top' | 'center' | 'bottom') => setSubtitleSettings({...subtitleSettings, position: value})}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="top">Top</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="bottom">Bottom</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Align</Label>
                          <Select
                            value={subtitleSettings.alignment}
                            onValueChange={(value: 'left' | 'center' | 'right') => setSubtitleSettings({...subtitleSettings, alignment: value})}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Animation</Label>
                          <Select
                            value={subtitleSettings.animation}
                            onValueChange={(value: 'none' | 'fade' | 'slide') => setSubtitleSettings({...subtitleSettings, animation: value})}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="fade">Fade</SelectItem>
                              <SelectItem value="slide">Slide Up</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* Colors */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Colors</h3>
                    <div className="grid gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Text</Label>
                          <div className="flex gap-1.5 mt-1">
                            <Input
                              type="color"
                              value={subtitleSettings.fontColor}
                              onChange={(e) => setSubtitleSettings({...subtitleSettings, fontColor: e.target.value})}
                              className="w-9 h-8 p-0.5 cursor-pointer"
                            />
                            <Input
                              value={subtitleSettings.fontColor}
                              onChange={(e) => setSubtitleSettings({...subtitleSettings, fontColor: e.target.value})}
                              className="flex-1 font-mono text-xs h-8"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Background</Label>
                          <div className="flex gap-1.5 mt-1">
                            <Input
                              type="color"
                              value={subtitleSettings.backgroundColor}
                              onChange={(e) => setSubtitleSettings({...subtitleSettings, backgroundColor: e.target.value})}
                              className="w-9 h-8 p-0.5 cursor-pointer"
                            />
                            <Input
                              value={subtitleSettings.backgroundColor}
                              onChange={(e) => setSubtitleSettings({...subtitleSettings, backgroundColor: e.target.value})}
                              className="flex-1 font-mono text-xs h-8"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">BG Opacity: {subtitleSettings.backgroundOpacity}%</Label>
                        <Slider
                          value={[subtitleSettings.backgroundOpacity]}
                          onValueChange={([value]) => setSubtitleSettings({...subtitleSettings, backgroundOpacity: value})}
                          min={0}
                          max={100}
                          step={5}
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Effects */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Effects</h3>
                    <div className="grid gap-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="shadow" className="text-xs">Drop Shadow</Label>
                        <Switch
                          id="shadow"
                          checked={subtitleSettings.shadow}
                          onCheckedChange={(checked) => setSubtitleSettings({...subtitleSettings, shadow: checked})}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Stroke: {subtitleSettings.strokeWidth}px</Label>
                          <Slider
                            value={[subtitleSettings.strokeWidth]}
                            onValueChange={([value]) => setSubtitleSettings({...subtitleSettings, strokeWidth: value})}
                            min={0}
                            max={5}
                            step={0.5}
                            className="mt-1.5"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Padding: {subtitleSettings.padding}px</Label>
                          <Slider
                            value={[subtitleSettings.padding]}
                            onValueChange={([value]) => setSubtitleSettings({...subtitleSettings, padding: value})}
                            min={0}
                            max={20}
                            step={1}
                            className="mt-1.5"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Action Section - clean and consolidated */}
              <div className="space-y-3 pt-3 border-t">
                {/* Processing indicator */}
                {isApplying && (
                  <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span className="text-xs font-medium">{processingStage || 'Processing...'}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                )}

                {/* Success state */}
                {subtitlesApplied && !isApplying && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="text-xs text-green-600 font-medium">
                      Subtitles applied successfully
                    </span>
                  </div>
                )}

                {/* Apply button */}
                <Button
                  onClick={handleApplySubtitles}
                  disabled={isApplying || segments.length === 0}
                  className="w-full"
                  size="default"
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Apply Subtitles
                    </>
                  )}
                </Button>

                {/* Burn option - clearly a secondary action */}
                <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/40 border">
                  <Switch
                    id="burn-subtitles"
                    checked={burnSubtitles}
                    onCheckedChange={setBurnSubtitles}
                    className="flex-shrink-0"
                  />
                  <Label htmlFor="burn-subtitles" className="text-xs cursor-pointer leading-relaxed">
                    <span className="font-medium">Burn into video</span>
                    <span className="text-muted-foreground"> &mdash; permanently encode subtitles for YouTube</span>
                  </Label>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="export" className="h-full space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-3">Download Transcript</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => downloadTranscript('txt')}>
                      <FileText className="h-4 w-4 mr-2" />
                      Text File
                    </Button>
                    <Button variant="outline" onClick={() => downloadTranscript('srt')}>
                      <Video className="h-4 w-4 mr-2" />
                      SRT Subtitles
                    </Button>
                    <Button variant="outline" onClick={() => downloadTranscript('vtt')}>
                      <Video className="h-4 w-4 mr-2" />
                      WebVTT
                    </Button>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h3 className="font-medium mb-3">Copy Transcript</h3>
                  <Button variant="outline" onClick={copyFullTranscript}>
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy to Clipboard
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </div>
  )
}