#!/usr/bin/env node
import { createWriteStream } from 'node:fs'
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import https from 'node:https'
import { fileURLToPath } from 'node:url'

function run(command, args, cwd = process.cwd()) {
  return new Promise((resolveRun, rejectRun) => {
    const proc = spawn(command, args, { cwd, stdio: 'inherit', shell: false })
    proc.once('error', rejectRun)
    proc.once('exit', (code) => {
      if (code === 0) {
        resolveRun()
        return
      }
      rejectRun(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 'null'}`))
    })
  })
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

function download(url, outPath) {
  return new Promise((resolveDownload, rejectDownload) => {
    const file = createWriteStream(outPath)
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          download(res.headers.location, outPath).then(resolveDownload).catch(rejectDownload)
          return
        }
        if (res.statusCode !== 200) {
          rejectDownload(new Error(`Download failed (${res.statusCode ?? 'unknown'}): ${url}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          resolveDownload()
        })
      })
      .on('error', rejectDownload)
  })
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('[prepare-python-runtime] Non-Windows platform detected. Skipping bundled runtime prep.')
    return
  }

  const version = process.env.MEETR_PYTHON_VERSION || '3.12.10'
  const archTag = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : null
  if (!archTag) {
    throw new Error(`Unsupported Windows architecture: ${process.arch}`)
  }

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const platformArch = `win32-${process.arch}`
  const runtimeDir = join(projectRoot, 'resources', 'python-runtime', platformArch)
  const markerPath = join(runtimeDir, '.core-runtime-v1')
  const embedZip = `python-${version}-embed-${archTag}.zip`
  const pythonZipUrl = `https://www.python.org/ftp/python/${version}/${embedZip}`
  const pthFile = join(runtimeDir, `python${version.split('.')[0]}${version.split('.')[1]}._pth`)
  const pythonExe = join(runtimeDir, 'python.exe')
  const getPipPath = join(runtimeDir, 'get-pip.py')
  const requirementsPath = join(projectRoot, 'python', 'requirements-core.txt')

  if (await exists(markerPath)) {
    console.log(`[prepare-python-runtime] Bundled runtime already prepared at ${runtimeDir}`)
    return
  }

  console.log(`[prepare-python-runtime] Preparing bundled Python runtime ${version} (${platformArch})`)
  await rm(runtimeDir, { recursive: true, force: true })
  await mkdir(runtimeDir, { recursive: true })

  const zipPath = join(runtimeDir, embedZip)
  console.log(`[prepare-python-runtime] Downloading ${pythonZipUrl}`)
  await download(pythonZipUrl, zipPath)

  console.log('[prepare-python-runtime] Extracting embedded Python')
  await run('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${runtimeDir}' -Force`
  ])

  console.log('[prepare-python-runtime] Enabling site-packages in ._pth')
  const pthText = await readFile(pthFile, 'utf8')
  const pthLines = pthText.split(/\r?\n/)
  const nextLines = []
  let sawImportSite = false
  let sawSitePackages = false
  for (const line of pthLines) {
    const trimmed = line.trim()
    if (trimmed === '#import site' || trimmed === 'import site') {
      nextLines.push('import site')
      sawImportSite = true
      continue
    }
    if (trimmed.toLowerCase() === 'lib\\site-packages') {
      sawSitePackages = true
    }
    nextLines.push(line)
  }
  if (!sawSitePackages) nextLines.splice(Math.max(0, nextLines.length - 1), 0, 'Lib\\site-packages')
  if (!sawImportSite) nextLines.push('import site')
  await writeFile(pthFile, `${nextLines.join('\r\n')}\r\n`, 'utf8')

  console.log('[prepare-python-runtime] Bootstrapping pip')
  await download('https://bootstrap.pypa.io/get-pip.py', getPipPath)
  await run(pythonExe, [getPipPath, '--disable-pip-version-check', '--no-warn-script-location'], runtimeDir)

  console.log('[prepare-python-runtime] Installing core transcription dependencies')
  await run(
    pythonExe,
    ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir', '-r', requirementsPath],
    runtimeDir
  )

  const rtStat = await stat(runtimeDir)
  await writeFile(
    markerPath,
    JSON.stringify({ version, platformArch, preparedAt: new Date().toISOString(), mtimeMs: rtStat.mtimeMs }, null, 2),
    'utf8'
  )
  console.log(`[prepare-python-runtime] Runtime ready: ${runtimeDir}`)
}

main().catch((err) => {
  console.error(`[prepare-python-runtime] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
