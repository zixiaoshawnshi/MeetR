import { spawn } from 'child_process'

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegBin = (process.env.FFMPEG_PATH ?? '').trim() || 'ffmpeg'
    const proc = spawn(ffmpegBin, args, {
      windowsHide: true
    })

    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(
          new Error(
            'FFmpeg was not found. Install ffmpeg or set FFMPEG_PATH to enable audio compression.'
          )
        )
        return
      }
      reject(err)
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      const detail = stderr.trim() || `ffmpeg exited with code ${code}`
      reject(new Error(detail))
    })
  })
}

export async function transcodeWavToFlac(inputPath: string, outputPath: string): Promise<void> {
  await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-sample_fmt',
    's16',
    '-c:a',
    'flac',
    outputPath
  ])
}

export async function transcodeAudioToWav16kMono(
  inputPath: string,
  outputPath: string
): Promise<void> {
  await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-sample_fmt',
    's16',
    '-c:a',
    'pcm_s16le',
    outputPath
  ])
}
