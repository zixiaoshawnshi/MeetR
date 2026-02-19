#!/usr/bin/env node
/**
 * Dev launcher — clears ELECTRON_RUN_AS_NODE before starting electron-vite.
 *
 * VS Code / Claude Code sets ELECTRON_RUN_AS_NODE=1 in their shell environment
 * so they can invoke the Electron binary as a Node.js interpreter. If that
 * variable is inherited by our Electron app process, Electron skips its full
 * browser-process initialisation and require("electron") returns the npm
 * stub path string instead of the live Electron API.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

// Strip the offending variable from the environment we pass to electron-vite
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const evBin = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../node_modules/.bin/electron-vite'
)

const ps = spawn(evBin, ['dev'], { stdio: 'inherit', env, shell: true })
ps.on('close', (code) => process.exit(code ?? 0))
