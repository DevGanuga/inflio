import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import {
  processVizardVideo,
  checkVizardStatus,
  generatePersonaPortraits,
  trainPersonaLoRA,
  batchGenerateThumbnails,
  processKlapVideoClips,
  generatePostsWorker,
} from '@/inngest/functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processVizardVideo,
    checkVizardStatus,
    generatePersonaPortraits,
    trainPersonaLoRA,
    batchGenerateThumbnails,
    processKlapVideoClips,
    generatePostsWorker,
  ],
}) 