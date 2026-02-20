/**
 * Manages the WebSocket connection to the Python transcription service.
 * One connection is active at a time. Pushes events to the renderer via
 * the provided webContents reference.
 */

import WebSocket from 'ws'
import { WebContents } from 'electron'

const PYTHON_WS_URL = 'ws://127.0.0.1:8765/ws'
const CONNECT_TIMEOUT_MS = 5_000
const STOP_TIMEOUT_MS = 60_000

let activeWs: WebSocket | null = null

export interface SegmentPayload {
  speaker: string
  text: string
  start_ms: number
  end_ms: number
}

export interface InputDevicePayload {
  id: number
  name: string
  is_default: boolean
}

/**
 * Connect to the Python service and send a `start` message.
 * Resolves when Python responds with `ready`.
 * Rejects if the service is unreachable or returns an error.
 *
 * @param onSegment  Called for each incoming segment payload.
 *                   The caller is responsible for persisting to DB and
 *                   forwarding the full segment to the renderer.
 * @param webContents  Used only to push `transcription:state` events.
 */
export function startTranscriptionWs(
  sessionId: number,
  outputPath: string,
  inputDeviceId: number | null,
  transcriptionMode: 'local' | 'deepgram',
  diarizationEnabled: boolean,
  huggingFaceToken: string,
  localDiarizationModelPath: string | null,
  deepgramApiKey: string,
  deepgramModel: string,
  webContents: WebContents,
  onSegment: (payload: SegmentPayload) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Close any stale connection
    if (activeWs) {
      activeWs.removeAllListeners()
      activeWs.close()
      activeWs = null
    }

    const ws = new WebSocket(PYTHON_WS_URL)
    activeWs = ws

    const timeout = setTimeout(() => {
      ws.removeAllListeners()
      ws.close()
      activeWs = null
      reject(new Error('Timed out connecting to transcription service'))
    }, CONNECT_TIMEOUT_MS)

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'start',
        session_id: String(sessionId),
        output_path: outputPath,
        input_device_id: inputDeviceId,
        transcription_mode: transcriptionMode,
        diarization_enabled: diarizationEnabled,
        huggingface_token: huggingFaceToken,
        local_diarization_model_path: localDiarizationModelPath,
        deepgram_api_key: deepgramApiKey,
        deepgram_model: deepgramModel
      }))
    })

    ws.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }

      if (msg.type === 'ready') {
        clearTimeout(timeout)
        // Push recording-state change to renderer
        webContents.send('transcription:state', { recording: true })
        resolve()
        return
      }

      if (msg.type === 'segment') {
        onSegment({
          speaker: msg.speaker as string,
          text: msg.text as string,
          start_ms: msg.start_ms as number,
          end_ms: msg.end_ms as number
        })
        return
      }

      if (msg.type === 'error') {
        clearTimeout(timeout)
        reject(new Error(String(msg.message ?? 'Unknown error from transcription service')))
      }
    })

    ws.on('error', (err: Error) => {
      clearTimeout(timeout)
      activeWs = null
      webContents.send('transcription:state', { recording: false })
      reject(err)
    })

    ws.on('close', () => {
      activeWs = null
      webContents.send('transcription:state', { recording: false })
    })
  })
}

/**
 * Send a `stop` message and wait for `stopped` from Python.
 * Closes the WebSocket after receiving confirmation.
 * Returns the path to the saved WAV file, or null.
 */
export function stopTranscriptionWs(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!activeWs || activeWs.readyState !== WebSocket.OPEN) {
      activeWs = null
      resolve(null)
      return
    }

    const ws = activeWs

    // One-shot listener for the stopped confirmation
    const onMessage = (raw: Buffer): void => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (msg.type === 'stopped') {
        ws.removeListener('message', onMessage)
        ws.close()
        activeWs = null
        resolve((msg.audio_path as string | null) ?? null)
      }
    }

    ws.on('message', onMessage)
    ws.send(JSON.stringify({ type: 'stop' }))

    // Safety timeout: allow final transcription flush before giving up.
    setTimeout(() => {
      ws.removeListener('message', onMessage)
      if (activeWs === ws) {
        ws.close()
        activeWs = null
      }
      resolve(null)
    }, STOP_TIMEOUT_MS)
  })
}

export function isTranscribing(): boolean {
  return activeWs !== null && activeWs.readyState === WebSocket.OPEN
}

export function listInputDevicesWs(): Promise<InputDevicePayload[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(PYTHON_WS_URL)

    const timeout = setTimeout(() => {
      ws.removeAllListeners()
      ws.close()
      reject(new Error('Timed out querying transcription input devices'))
    }, CONNECT_TIMEOUT_MS)

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'list_inputs' }))
    })

    ws.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }

      if (msg.type === 'inputs') {
        clearTimeout(timeout)
        ws.close()
        resolve((msg.devices as InputDevicePayload[] | undefined) ?? [])
        return
      }

      if (msg.type === 'error') {
        clearTimeout(timeout)
        ws.close()
        reject(new Error(String(msg.message ?? 'Unknown error from transcription service')))
      }
    })

    ws.on('error', (err: Error) => {
      clearTimeout(timeout)
      reject(err)
    })

    ws.on('close', () => {
      clearTimeout(timeout)
    })
  })
}
