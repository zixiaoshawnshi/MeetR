import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

function ffmpegBinaryName(): string {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

function candidateBundledPaths(): string[] {
  const bin = ffmpegBinaryName()
  const platformArch = `${process.platform}-${process.arch}`
  return [
    join(process.resourcesPath, 'ffmpeg', platformArch, bin),
    join(process.resourcesPath, 'ffmpeg', bin),
    join(app.getAppPath(), 'resources', 'ffmpeg', platformArch, bin),
    join(app.getAppPath(), 'resources', 'ffmpeg', bin)
  ]
}

export function configureBundledFfmpegPath(): void {
  if ((process.env.FFMPEG_PATH ?? '').trim()) {
    return
  }
  const match = candidateBundledPaths().find((p) => existsSync(p))
  if (match) {
    process.env.FFMPEG_PATH = match
  }
}
