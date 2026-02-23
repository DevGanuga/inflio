import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import {
  processKlapVideo,
  checkKlapStatus,
  processVizardVideo,
  generatePersonaPortraits,
  trainPersonaLoRA,
  batchGenerateThumbnails,
  processKlapVideoClips,
  generatePostsWorker,
} from '@/inngest/functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processKlapVideo,
    checkKlapStatus,
    processVizardVideo,
    generatePersonaPortraits,
    trainPersonaLoRA,
    batchGenerateThumbnails,
    processKlapVideoClips,
    generatePostsWorker,
  ],
}) 