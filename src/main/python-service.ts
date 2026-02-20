import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { app } from 'electron'
import { join } from 'path'

let pythonProc: ChildProcessWithoutNullStreams | null = null
let setupPromise: Promise<void> | null = null

function pythonEntryPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python', 'main.py')
  }
  return join(process.cwd(), 'python', 'main.py')
}

function pythonWorkingDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python')
  }
  return join(process.cwd(), 'python')
}

function requirementsPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python', 'requirements.txt')
  }
  return join(process.cwd(), 'python', 'requirements.txt')
}

function runtimeVenvDir(): string {
  return join(app.getPath('userData'), 'python-runtime')
}

function runtimeVenvPythonPath(): string {
  if (process.platform === 'win32') {
    return join(runtimeVenvDir(), 'Scripts', 'python.exe')
  }
  return join(runtimeVenvDir(), 'bin', 'python')
}

function devVenvPythonPath(): string {
  if (process.platform === 'win32') {
    return join(process.cwd(), '.venv', 'Scripts', 'python.exe')
  }
  return join(process.cwd(), '.venv', 'bin', 'python')
}

function systemPythonCandidates(): Array<{ command: string; args: string[] }> {
  if (process.platform === 'win32') {
    return [
      { command: 'python', args: [] },
      { command: 'py', args: ['-3'] }
    ]
  }
  return [
    { command: 'python3', args: [] },
    { command: 'python', args: [] }
  ]
}

async function findSystemPythonCandidate(): Promise<{ command: string; args: string[] } | null> {
  for (const candidate of systemPythonCandidates()) {
    const ok = await canExecute(candidate.command, [...candidate.args, '--version'])
    if (ok) return candidate
  }
  return null
}

function pythonCandidates(): Array<{ command: string; args: string[] }> {
  if (app.isPackaged) {
    const runtimePy = runtimeVenvPythonPath()
    if (existsSync(runtimePy)) {
      return [{ command: runtimePy, args: [] }]
    }
  }

  const devPy = devVenvPythonPath()
  if (existsSync(devPy)) {
    return [{ command: devPy, args: [] }]
  }

  return systemPythonCandidates()
}

async function canExecute(command: string, args: string[]): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const proc = spawn(command, args, { windowsHide: true })
    proc.once('error', () => resolve(false))
    proc.once('exit', (code) => resolve(code === 0))
  })
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  label: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    })

    proc.stdout.on('data', (chunk) => {
      console.log(`[python-service] ${label}: ${String(chunk).trimEnd()}`)
    })

    proc.stderr.on('data', (chunk) => {
      console.error(`[python-service] ${label}: ${String(chunk).trimEnd()}`)
    })

    proc.once('error', (err) => reject(err))
    proc.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${label} failed with exit code ${code ?? 'null'}`))
    })
  })
}

async function ensurePackagedPythonRuntime(): Promise<void> {
  if (!app.isPackaged) return
  if (existsSync(runtimeVenvPythonPath())) return
  if (setupPromise) {
    await setupPromise
    return
  }

  const doSetup = async () => {
    const reqPath = requirementsPath()
    if (!existsSync(reqPath)) {
      throw new Error(`requirements.txt not found: ${reqPath}`)
    }

    mkdirSync(runtimeVenvDir(), { recursive: true })
    const systemPy = await findSystemPythonCandidate()
    if (!systemPy) {
      throw new Error('Python is not installed or not available on PATH.')
    }

    console.log(
      `[python-service] Creating runtime venv with "${systemPy.command} ${systemPy.args.join(' ')}"...`
    )
    await runCommand(
      systemPy.command,
      [...systemPy.args, '-m', 'venv', runtimeVenvDir()],
      app.getPath('userData'),
      'venv'
    )

    const runtimePy = runtimeVenvPythonPath()
    console.log('[python-service] Installing Python dependencies for packaged app...')
    await runCommand(runtimePy, ['-m', 'pip', 'install', '--upgrade', 'pip'], runtimeVenvDir(), 'pip-upgrade')
    await runCommand(
      runtimePy,
      ['-m', 'pip', 'install', '-r', reqPath],
      runtimeVenvDir(),
      'pip-install'
    )
    console.log('[python-service] Runtime Python environment is ready.')
  }

  setupPromise = doSetup()
  try {
    await setupPromise
  } finally {
    setupPromise = null
  }
}

export async function startPythonService(): Promise<void> {
  if (pythonProc) return

  const entry = pythonEntryPath()
  if (!existsSync(entry)) {
    console.error(`[python-service] Python entry not found: ${entry}`)
    return
  }

  try {
    await ensurePackagedPythonRuntime()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[python-service] Runtime setup failed: ${message}`)
    return
  }

  const cwd = pythonWorkingDir()
  const candidates = pythonCandidates()

  const trySpawn = (index: number): void => {
    if (index >= candidates.length) {
      console.error('[python-service] Could not find a usable Python executable.')
      return
    }

    const candidate = candidates[index]
    const proc = spawn(candidate.command, [...candidate.args, entry], {
      cwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      windowsHide: true
    })

    let started = false

    proc.once('spawn', () => {
      started = true
      pythonProc = proc
      console.log(`[python-service] Started with "${candidate.command} ${candidate.args.join(' ')}".`)
      console.log(`[python-service] Script: ${entry}`)
    })

    proc.once('error', (err: NodeJS.ErrnoException) => {
      if (!started && err.code === 'ENOENT') {
        trySpawn(index + 1)
        return
      }
      console.error('[python-service] Failed to start:', err.message)
    })

    proc.stdout.on('data', (chunk) => {
      console.log(`[python-service] ${String(chunk).trimEnd()}`)
    })

    proc.stderr.on('data', (chunk) => {
      console.error(`[python-service] ${String(chunk).trimEnd()}`)
    })

    proc.on('exit', (code, signal) => {
      if (pythonProc === proc) pythonProc = null
      console.log(`[python-service] Exited (code=${code ?? 'null'} signal=${signal ?? 'null'})`)
    })
  }

  trySpawn(0)
}

export async function stopPythonService(): Promise<void> {
  if (!pythonProc) return
  const proc = pythonProc

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (pythonProc === proc) {
        proc.kill('SIGKILL')
      }
      resolve()
    }, 3_000)

    proc.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    proc.kill('SIGTERM')
  })

  if (pythonProc === proc) pythonProc = null
}
