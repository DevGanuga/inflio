"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { IconLoader2, IconPlayerPlay, IconPlayerPause, IconVideo, IconVolume, IconVolumeOff, IconVolume2, IconMaximize, IconMinimize } from "@tabler/icons-react"
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
  aspectRatio?: "video" | "portrait"
  compact?: boolean
  autoPlay?: boolean
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
  aspectRatio = "video",
  compact = false,
  autoPlay = false,
  onLoadedMetadata,
  onPlayingStateChange,
  onTimeUpdate,
  autoGenerateThumbnail = true
}, forwardedRef) => {
  const internalVideoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const [hoverTime, setHoverTime] = useState(0)
  const [showHoverTime, setShowHoverTime] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [buffered, setBuffered] = useState(0)

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
      setShowOverlay(!autoPlay)
    }
  }, [videoUrl, thumbnailUrl, autoGenerateThumbnail, autoPlay])

  useEffect(() => {
    const handleFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", handleFSChange)
    return () => document.removeEventListener("fullscreenchange", handleFSChange)
  }, [])

  const getActiveChapter = useCallback((time: number) => {
    if (!chapters?.length) return null
    let active: VideoChapterMarker | null = null
    for (const ch of chapters) {
      if (ch.timestamp <= time) active = ch
      else break
    }
    return active
  }, [chapters])

  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    setShowControls(true)
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [isPlaying])

  const handlePlayPause = () => {
    if (!internalVideoRef.current) return
    if (isPlaying) {
      internalVideoRef.current.pause()
    } else {
      internalVideoRef.current.play()
      setShowOverlay(false)
    }
  }

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
    resetControlsTimeout()
  }

  const handleVideoPause = () => {
    setIsPlaying(false)
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    if (internalVideoRef.current && internalVideoRef.current.currentTime < 0.1) {
      setShowOverlay(true)
    }
    onPlayingStateChange?.(false)
  }

  const handleVideoEnded = () => {
    setIsPlaying(false)
    setShowOverlay(true)
    setShowControls(true)
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
    const video = internalVideoRef.current
    const time = video.currentTime
    setCurrentTime(time)
    setActiveChapter(getActiveChapter(time))
    onTimeUpdate?.(time)

    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1))
    }
  }

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setIsLoading(false)
    setHasError(true)
    const video = e.currentTarget as HTMLVideoElement
    if (video.error?.code === 2) {
      setHasError(false)
    }
  }

  const getTimeFromProgressEvent = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!progressRef.current || duration === 0) return null
    const rect = progressRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return { fraction, time: fraction * duration, x: e.clientX - rect.left }
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const result = getTimeFromProgressEvent(e)
    if (!result || !internalVideoRef.current) return
    internalVideoRef.current.currentTime = result.time
  }

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const result = getTimeFromProgressEvent(e)
    if (!result) return
    setHoverX(result.x)
    setHoverTime(result.time)
    setShowHoverTime(true)
    setHoveredChapter(getActiveChapter(result.time))
  }

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    handleProgressClick(e)

    const handleMouseMove = (me: MouseEvent) => {
      const result = getTimeFromProgressEvent(me)
      if (result && internalVideoRef.current) {
        internalVideoRef.current.currentTime = result.time
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setVolume(val)
    if (internalVideoRef.current) {
      internalVideoRef.current.volume = val
      internalVideoRef.current.muted = val === 0
    }
    setIsMuted(val === 0)
  }

  const toggleMute = () => {
    if (!internalVideoRef.current) return
    const newMuted = !isMuted
    setIsMuted(newMuted)
    internalVideoRef.current.muted = newMuted
    if (!newMuted && volume === 0) {
      setVolume(0.5)
      internalVideoRef.current.volume = 0.5
    }
  }

  const toggleFullscreen = async () => {
    if (!containerRef.current) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await containerRef.current.requestFullscreen()
      }
    } catch {}
  }

  const handleContainerMouseMove = () => resetControlsTimeout()
  const handleContainerMouseLeave = () => {
    if (isPlaying && !isDragging) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 1500)
    }
  }

  const hasChapters = chapters && chapters.length > 0
  const progressFraction = duration > 0 ? currentTime / duration : 0
  const bufferedFraction = duration > 0 ? buffered / duration : 0
  const aspectClass = aspectRatio === "portrait" ? "aspect-[9/16]" : "aspect-video"

  if (!videoUrl) {
    return (
      <div className={cn("relative bg-black rounded-lg overflow-hidden", aspectClass, className)}>
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
          <div className="text-center">
            <IconVideo className="h-16 w-16 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No video available</p>
          </div>
        </div>
      </div>
    )
  }

  const VolumeIcon = isMuted || volume === 0 ? IconVolumeOff : volume < 0.5 ? IconVolume : IconVolume2

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-black rounded-lg overflow-hidden group select-none",
        isFullscreen && "rounded-none",
        className
      )}
      onMouseMove={handleContainerMouseMove}
      onMouseLeave={handleContainerMouseLeave}
    >
      <div className={cn("relative", isFullscreen ? "h-full flex items-center justify-center" : aspectClass)}>
        {isLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center">
              <IconLoader2 className="h-10 w-10 animate-spin text-white/80 mx-auto" />
              <p className="text-white/60 text-xs mt-2 font-medium">Loading...</p>
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
            <div className="absolute inset-0 bg-black/30 hover:bg-black/40 transition-all duration-200" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="transform transition-transform duration-200 hover:scale-110">
                <div className="bg-white/95 backdrop-blur-md rounded-full p-4 shadow-2xl">
                  <IconPlayerPlay className="h-8 w-8 text-slate-900 ml-0.5" />
                </div>
              </div>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-br from-red-950/20 to-slate-900">
            <div className="text-center p-6">
              <IconVideo className="h-12 w-12 text-red-400/60 mx-auto mb-2" />
              <p className="text-red-400 text-sm font-medium">Failed to load video</p>
            </div>
          </div>
        )}

        <video
          ref={internalVideoRef}
          src={videoUrl}
          poster={posterImage || undefined}
          className={cn(
            "w-full h-full",
            isFullscreen ? "max-h-full max-w-full object-contain" : "object-contain"
          )}
          playsInline
          preload="metadata"
          autoPlay={autoPlay}
          onClick={handlePlayPause}
          onDoubleClick={toggleFullscreen}
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

        {/* Center play/pause indicator on click */}
        {!showOverlay && !isPlaying && !hasError && !isLoading && duration > 0 && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
            onClick={handlePlayPause}
          >
            <div className="bg-black/50 backdrop-blur-sm rounded-full p-4">
              <IconPlayerPlay className="h-8 w-8 text-white ml-0.5" />
            </div>
          </div>
        )}

        {/* Custom Controls Overlay */}
        {duration > 0 && !showOverlay && (
          <div
            className={cn(
              "absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300",
              showControls || !isPlaying || isDragging ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
          >
            <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-10 pb-1 px-3">
              {/* Progress Bar */}
              <div
                ref={progressRef}
                className="relative h-5 cursor-pointer group/progress flex items-center"
                onClick={handleProgressClick}
                onMouseDown={handleProgressMouseDown}
                onMouseMove={handleProgressHover}
                onMouseLeave={() => { setShowHoverTime(false); setHoveredChapter(null) }}
              >
                <div className="absolute left-0 right-0 h-1 group-hover/progress:h-1.5 transition-all rounded-full bg-white/20">
                  {/* Buffered */}
                  <div
                    className="absolute top-0 left-0 h-full bg-white/20 rounded-full"
                    style={{ width: `${bufferedFraction * 100}%` }}
                  />
                  {/* Progress */}
                  <div
                    className="absolute top-0 left-0 h-full bg-red-500 rounded-full transition-[width] duration-75"
                    style={{ width: `${progressFraction * 100}%` }}
                  />
                  {/* Chapter markers */}
                  {hasChapters && chapters!.map((ch, i) => {
                    if (i === 0) return null
                    const pos = (ch.timestamp / duration) * 100
                    return (
                      <div
                        key={i}
                        className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-white/50 rounded-full z-10"
                        style={{ left: `${pos}%` }}
                      />
                    )
                  })}
                </div>

                {/* Scrubber thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full shadow-md opacity-0 group-hover/progress:opacity-100 transition-opacity z-20 pointer-events-none"
                  style={{ left: `calc(${progressFraction * 100}% - 6px)` }}
                />

                {/* Hover tooltip */}
                {showHoverTime && (
                  <div
                    className="absolute -top-8 transform -translate-x-1/2 px-2 py-1 bg-black/90 text-white text-xs rounded whitespace-nowrap pointer-events-none z-30"
                    style={{ left: hoverX }}
                  >
                    {hoveredChapter ? hoveredChapter.title : formatTime(hoverTime)}
                  </div>
                )}
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between gap-2 h-9">
                <div className="flex items-center gap-1.5">
                  {/* Play/Pause */}
                  <button
                    onClick={handlePlayPause}
                    className="text-white hover:text-white/80 transition-colors p-1"
                  >
                    {isPlaying
                      ? <IconPlayerPause className={cn("fill-white", compact ? "h-4 w-4" : "h-5 w-5")} />
                      : <IconPlayerPlay className={cn("fill-white ml-0.5", compact ? "h-4 w-4" : "h-5 w-5")} />}
                  </button>

                  {/* Volume */}
                  <div className="flex items-center gap-1 group/vol">
                    <button onClick={toggleMute} className="text-white hover:text-white/80 transition-colors p-1">
                      <VolumeIcon className={compact ? "h-4 w-4" : "h-5 w-5"} />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-0 group-hover/vol:w-16 transition-all duration-200 accent-white h-1 cursor-pointer opacity-0 group-hover/vol:opacity-100"
                    />
                  </div>

                  {/* Time */}
                  <span className={cn("text-white/80 font-mono tabular-nums ml-1", compact ? "text-[10px]" : "text-xs")}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {/* Active chapter label */}
                  {activeChapter && !compact && (
                    <span className="text-white/60 text-xs truncate max-w-[180px] mr-2">
                      {activeChapter.title}
                    </span>
                  )}

                  {/* Fullscreen */}
                  <button onClick={toggleFullscreen} className="text-white hover:text-white/80 transition-colors p-1">
                    {isFullscreen
                      ? <IconMinimize className={compact ? "h-4 w-4" : "h-5 w-5"} />
                      : <IconMaximize className={compact ? "h-4 w-4" : "h-5 w-5"} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

EnhancedVideoPlayer.displayName = "EnhancedVideoPlayer"

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  return `${m}:${s.toString().padStart(2, "0")}`
}
