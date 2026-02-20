import Anthropic from '@anthropic-ai/sdk'
import { AppSettings, AiProvider } from '../settings'

interface TranscriptChunk {
  speaker: string
  text: string
  start_ms: number
}

export interface MeetingUpdateInput {
  transcript: TranscriptChunk[]
  notes: string
  agenda: string
}

export interface MeetingUpdateOutput {
  summary: string
  agenda: string
  modelUsed: string
}

const PROVIDER_DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4.1',
  openrouter: 'anthropic/claude-sonnet-4.5',
  ollama: 'llama3.1:8b'
}

const SYSTEM_PROMPT = `You are a meeting assistant. You help keep meetings on track and produce
structured, useful outputs. You will be given:
- A meeting transcript with speaker labels
- Manual notes taken by the facilitator
- The current meeting agenda in markdown format

Your job is to:
1. Write a concise free-form summary of the meeting so far.
   Include: key points discussed, decisions made, open questions.
2. Return an updated version of the agenda in the same markdown format.
   You may: tick completed items [x], add sub-items with detail from
   the discussion, annotate items with brief notes, reorder items to
   reflect the actual flow, or add new items that emerged in discussion.
   Do not remove items. Mark them skipped with [~] if needed.

Return your response in this exact format:
<summary>
...free-form summary here...
</summary>
<agenda>
...updated markdown agenda here...
</agenda>`

export async function generateMeetingUpdate(
  input: MeetingUpdateInput,
  settings: AppSettings['ai']
): Promise<MeetingUpdateOutput> {
  switch (settings.provider) {
    case 'anthropic':
      return await runAnthropicMeetingUpdate(input, settings)
    case 'openai':
      throw new Error('OpenAI provider is not implemented yet.')
    case 'openrouter':
      throw new Error('OpenRouter provider is not implemented yet.')
    case 'ollama':
      throw new Error('Ollama provider is not implemented yet.')
    default:
      throw new Error('Unknown AI provider configuration.')
  }
}

async function runAnthropicMeetingUpdate(
  input: MeetingUpdateInput,
  settings: AppSettings['ai']
): Promise<MeetingUpdateOutput> {
  const apiKey = settings.anthropicApiKey.trim()
  if (!apiKey) {
    throw new Error('Anthropic API key is missing in Settings.')
  }

  const model = (settings.model || PROVIDER_DEFAULT_MODEL.anthropic).trim()
  const client = new Anthropic({ apiKey })
  const userPrompt = buildUserPrompt(input)
  const response = await client.messages.create({
    model,
    system: SYSTEM_PROMPT,
    temperature: 0.2,
    max_tokens: 1800,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ]
  })

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()

  if (!text) {
    throw new Error('Anthropic returned an empty response.')
  }

  const parsed = parseMeetingUpdateResponse(text, input.agenda)
  return {
    summary: parsed.summary,
    agenda: parsed.agenda,
    modelUsed: model
  }
}

function buildUserPrompt(input: MeetingUpdateInput): string {
  const transcript = input.transcript
    .map((row) => `${row.speaker}: ${row.text} [${formatTimestamp(row.start_ms)}]`)
    .join('\n')

  return [
    '## Transcript',
    transcript || '(No transcript yet)',
    '',
    '## Manual Notes',
    input.notes || '(No notes yet)',
    '',
    '## Current Agenda',
    input.agenda || '(No agenda yet)'
  ].join('\n')
}

function parseMeetingUpdateResponse(
  raw: string,
  fallbackAgenda: string
): { summary: string; agenda: string } {
  const summaryMatch = raw.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/i)
  const agendaMatch = raw.match(/<agenda>\s*([\s\S]*?)\s*<\/agenda>/i)

  const summary = summaryMatch?.[1]?.trim() || raw.trim()
  const agenda = agendaMatch?.[1]?.trim() || fallbackAgenda

  if (!summary) {
    throw new Error('AI response parsing failed: summary is empty.')
  }

  return { summary, agenda }
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
