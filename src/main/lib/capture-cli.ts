import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { ChildProcess } from 'child_process'
import type { Interface } from 'readline'
import type { CliEvent, CliCommand, WindowInfo } from './types'

function getCaptureBinaryPath(): string {
  if (is.dev) {
    return join(__dirname, '../../resources/briefly-capture')
  }
  return join(process.resourcesPath, 'briefly-capture')
}

export async function listWindows(): Promise<WindowInfo[]> {
  return new Promise((resolve, reject) => {
    const binaryPath = getCaptureBinaryPath()
    const proc = spawn(binaryPath, ['list-windows'], { stdio: ['ignore', 'pipe', 'pipe'] })

    let output = ''
    proc.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => console.error('[capture-cli]', chunk.toString()))

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`list-windows exited with code ${code}`))
      }
      try {
        resolve(JSON.parse(output) as WindowInfo[])
      } catch {
        reject(new Error('Failed to parse list-windows JSON output'))
      }
    })

    proc.on('error', reject)
  })
}

export class CaptureSession {
  private proc: ChildProcess
  private rl: Interface
  private onMessage: (msg: CliEvent) => void
  private onExit: (code: number) => void
  private readyPromise: Promise<void>
  private readyResolve!: () => void

  constructor(
    onMessage: (msg: CliEvent) => void,
    onExit: (code: number) => void
  ) {
    this.onMessage = onMessage
    this.onExit = onExit

    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve
    })

    const binaryPath = getCaptureBinaryPath()
    this.proc = spawn(binaryPath, ['session'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.rl = createInterface({ input: this.proc.stdout! })

    this.rl.on('line', (line) => {
      if (!line.trim()) return
      try {
        const msg: CliEvent = JSON.parse(line)
        if (msg.type === 'ready') {
          this.readyResolve()
        }
        this.onMessage(msg)
      } catch {
        console.error('[capture-cli] Failed to parse event line:', line)
      }
    })

    this.proc.stderr!.on('data', (chunk: Buffer) => {
      console.error('[capture-cli stderr]', chunk.toString())
    })

    this.proc.on('close', (code) => {
      this.onExit(code ?? 0)
    })

    this.proc.on('error', (err) => {
      console.error('[capture-cli] Process error:', err)
      this.onMessage({ type: 'error', message: err.message })
    })
  }

  async waitForReady(): Promise<void> {
    return this.readyPromise
  }

  send(cmd: CliCommand): void {
    const line = JSON.stringify(cmd) + '\n'
    this.proc.stdin!.write(line)
  }

  startRecording(output: string, mixMic: boolean): void {
    this.send({ cmd: 'start_recording', output, mix_mic: mixMic })
  }

  stopRecording(): void {
    this.send({ cmd: 'stop_recording' })
  }

  takeScreenshot(output: string): void {
    this.send({ cmd: 'take_screenshot', output })
  }

  kill(): void {
    this.proc.kill()
  }
}
