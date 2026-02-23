import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ChapterGenerator } from '@/lib/chapter-generator'

/**
 * GET /api/posts/export?projectId=xxx
 *
 * Exports all generated content for a project in a single structured response.
 * Includes: platform-specific copy for all posts, YouTube description with chapters,
 * and a formatted text export for each platform.
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projectId = req.nextUrl.searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, title, description, chapters, user_id')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== userId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: suggestions } = await supabaseAdmin
      .from('post_suggestions')
      .select('*')
      .eq('project_id', projectId)
      .in('status', ['ready', 'approved', 'published'])
      .order('created_at', { ascending: true })

    const posts = suggestions || []

    // Build platform exports
    const platformExports: Record<string, string[]> = {}

    for (const post of posts) {
      const cv = post.copy_variants || {}
      for (const [platform, copy] of Object.entries(cv) as [string, any][]) {
        if (!platformExports[platform]) platformExports[platform] = []

        let text = ''
        if (copy.caption) text += copy.caption
        if (copy.hashtags?.length) {
          const tags = copy.hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`)
          text += '\n\n' + tags.join(' ')
        }
        if (copy.cta) text += '\n\n' + copy.cta

        platformExports[platform].push(text)
      }
    }

    // YouTube description with chapters
    let youtubeDescription = ''
    if (project.chapters?.length > 0) {
      youtubeDescription = ChapterGenerator.generateYouTubeDescription(
        project.chapters,
        project.description
      )
    }

    // Build full text export
    let fullExport = `=== ${project.title} ===\n`
    fullExport += `Generated ${posts.length} posts for ${Object.keys(platformExports).length} platforms\n\n`

    if (youtubeDescription) {
      fullExport += `${'='.repeat(50)}\nYOUTUBE DESCRIPTION (with chapters)\n${'='.repeat(50)}\n\n`
      fullExport += youtubeDescription + '\n\n'
    }

    for (const [platform, copies] of Object.entries(platformExports)) {
      fullExport += `${'='.repeat(50)}\n${platform.toUpperCase()} (${copies.length} posts)\n${'='.repeat(50)}\n\n`
      copies.forEach((text, i) => {
        fullExport += `--- Post ${i + 1} ---\n${text}\n\n`
      })
    }

    return NextResponse.json({
      success: true,
      project: { id: project.id, title: project.title },
      stats: {
        totalPosts: posts.length,
        platforms: Object.keys(platformExports),
        chaptersCount: project.chapters?.length || 0,
      },
      platformExports,
      youtubeDescription: youtubeDescription || null,
      fullTextExport: fullExport,
    })
  } catch (error) {
    console.error('[posts/export] Error:', error)
    return NextResponse.json(
      { error: 'Failed to export content' },
      { status: 500 }
    )
  }
}
