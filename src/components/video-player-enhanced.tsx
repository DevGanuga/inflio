"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { IconLoader2, IconPlayerPlay, IconVideo } from "@tabler/icons-react"
import { createPlaceholderThumbnail } from "@/lib/video-utils"
import { cn } from "@/lib/utils"

export interface VideoChapterMarker {
  timestamp: number
  title: string
}

interface EnhancedVideoPlayerProps {
  videoUrl: string | null
  thumbnailUrl?: string | null
  className?: string
  chapters?: VideoChapterMarker[]
  onLoadedMetadata?: (duration: number) => void
  onPlayingStateChange?: (isPlaying: boolean) => void
  onTimeUpdate?: (currentTime: number) => void
  autoGenerateThumbnail?: boolean
}

export const EnhancedVideoPlayer = forwardRef<HTMLVideoElement, EnhancedVideoPlayerProps>(({
  videoUrl,
  thumbnailUrl,
  className,
  chapters,
  onLoadedMetadata,
  onPlayingStateChange,
  onTimeUpdate,
  autoGenerateThumbnail = true
}, forwardedRef) => {
  const internalVideoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(forwardedRef, () => internalVideoRef.current!, [])

  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [posterImage, setPosterImage] = useState<string>("")
  const [showOverlay, setShowOverlay] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [activeChapter, setActiveChapter] = useState<VideoChapterMarker | null>(null)
  const [hoveredChapter, setHoveredChapter] = useState<VideoChapterMarker | null>(null)
  const [hoverX, setHoverX] = useState(0)

  useEffect(() => {
    if (!videoUrl) {
      if (autoGenerateThumbnail) {
        setPosterImage(createPlaceholderThumbnail())
        setShowOverlay(true)
      }
      return
    }
    if (thumbnailUrl) {
      setPosterImage(thumbnailUrl)
      setShowOverlay(true)
    } else {
      setPosterImage("")
      setShowOverlay(false)
    }
  }, [videoUrl, thumbnailUrl, autoGenerateThumbnail])

  const getActiveChapter = useCallback((time: number) => {
    if (!chapters?.length) return null
    let active: VideoChapterMarker | null = null
    for (const ch of chapters) {
      if (ch.timestamp <= time) active = ch
      else break
    }
    return active
  }, [chapters])

  const handlePlayClick = () => {
    if (internalVideoRef.current) {
      internalVideoRef.current.play()
      setShowOverlay(false)
    }
  }

  const handleVideoPlay = () => {
    setIsPlaying(true)
    setShowOverlay(false)
    setIsLoading(false)
    onPlayingStateChange?.(true)
  }

  const handleVideoPause = () => {
    setIsPlaying(false)
    if (internalVideoRef.current && internalVideoRef.current.currentTime < 0.1) {
      setShowOverlay(true)
    }
    onPlayingStateChange?.(false)
  }

  const handleVideoEnded = () => {
    setIsPlaying(false)
    setShowOverlay(true)
    onPlayingStateChange?.(false)
  }

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget
    setIsLoading(false)
    setDuration(video.duration)
    onLoadedMetadata?.(video.duration)
  }

  const handleTimeUpdateInternal = () => {
    if (!internalVideoRef.current) return
    const time = internalVideoRef.current.currentTime
    setCurrentTime(time)
    setActiveChapter(getActiveChapter(time))
    onTimeUpdate?.(time)
  }

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setIsLoading(false)
    setHasError(true)
    const video = e.currentTarget as HTMLVideoElement
    if (video.error?.code === 2) {
      setHasError(false)
    }
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !internalVideoRef.current || duration === 0) return
    const rect = progressRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    internalVideoRef.current.currentTime = fraction * duration
  }

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration === 0) return
    const rect = progressRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const hoverTime = fraction * duration
    setHoverX(e.clientX - rect.left)
    setHoveredChapter(getActiveChapter(hoverTime))
  }

  const hasChapters = chapters && chapters.length > 0
  const progressFraction = duration > 0 ? currentTime / duration : 0

  if (!videoUrl) {
    return (
      <div className={cn("relative aspect-video bg-black rounded-lg overflow-hidden", className)}>
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
          <div className="text-center">
            <IconVideo className="h-16 w-16 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No video available</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("relative bg-black rounded-lg overflow-hidden group", className)}>
      {/* Main Video Area */}
      <div className="relative aspect-video">
        {isLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center">
              <IconLoader2 className="h-12 w-12 animate-spin text-white/80 mx-auto" />
              <p className="text-white/60 text-sm mt-3 font-medium">Loading video...</p>
            </div>
          </div>
        )}

        {showOverlay && !isPlaying && posterImage && !hasError && (
          <div className="absolute inset-0 z-20 cursor-pointer" onClick={handlePlayClick}>
            <img
              src={posterImage}
              alt="Video thumbnail"
              className="w-full h-full object-cover"
              onError={() => setPosterImage("")}
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-all duration-200" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="transform transition-transform duration-200 group-hover:scale-110">
                <div className="bg-white/95 backdrop-blur-md rounded-full p-5 shadow-2xl">
                  <IconPlayerPlay className="h-10 w-10 text-slate-900 ml-1" />
                </div>
              </div>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-br from-red-950/20 to-slate-900">
            <div className="text-center p-6">
              <IconVideo className="h-16 w-16 text-red-400/60 mx-auto mb-3" />
              <p className="text-red-400 text-sm font-medium">Failed to load video</p>
            </div>
          </div>
        )}

        <video
          ref={internalVideoRef}
          src={videoUrl}
          poster={posterImage || undefined}
          className="w-full h-full object-contain"
          controls
          controlsList="nodownload"
          playsInline
          preload="metadata"
          onLoadStart={() => setIsLoading(true)}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlayThrough={() => setIsLoading(false)}
          onWaiting={() => isPlaying && setIsLoading(true)}
          onPlaying={handleVideoPlay}
          onPlay={handleVideoPlay}
          onPause={handleVideoPause}
          onEnded={handleVideoEnded}
          onTimeUpdate={handleTimeUpdateInternal}
          onError={handleError}
        />
      </div>

      {/* Chapter Progress Bar (below native controls) */}
      {hasChapters && duration > 0 && (
        <div className="relative px-0">
          {/* Clickable progress track */}
          <div
            ref={progressRef}
            className="relative h-6 cursor-pointer group/progress"
            onClick={handleProgressClick}
            onMouseMove={handleProgressHover}
            onMouseLeave={() => setHoveredChapter(null)}
          >
            {/* Track background */}
            <div className="absolute top-2 left-0 right-0 h-2 bg-white/10 rounded-sm" />

            {/* Filled progress */}
            <div
              className="absolute top-2 left-0 h-2 bg-red-500 rounded-sm transition-[width] duration-100"
              style={{ width: `${progressFraction * 100}%` }}
            />

            {/* Chapter markers */}
            {chapters!.map((ch, i) => {
              if (i === 0) return null
              const pos = (ch.timestamp / duration) * 100
              return (
                <div
                  key={i}
                  className="absolute top-1 w-0.5 h-4 bg-white/40 z-10"
                  style={{ left: `${pos}%` }}
                  title={ch.title}
                />
              )
            })}

            {/* Hover tooltip */}
            {hoveredChapter && (
              <div
                className="absolute -top-8 transform -translate-x-1/2 px-2 py-1 bg-black/90 text-white text-xs rounded whitespace-nowrap pointer-events-none z-20"
                style={{ left: hoverX }}
              >
                {hoveredChapter.title}
              </div>
            )}
          </div>

          {/* Active chapter name */}
          {activeChapter && (
            <div className="px-3 pb-2 flex items-center gap-2">
              <span className="text-xs text-white/60 font-mono">
                {formatTime(currentTime)}
              </span>
              <span className="text-xs text-white/40">/</span>
              <span className="text-xs text-white/90 font-medium truncate">
                {activeChapter.title}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

EnhancedVideoPlayer.displayName = "EnhancedVideoPlayer"

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
