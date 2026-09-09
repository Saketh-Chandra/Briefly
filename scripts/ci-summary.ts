/**
 * Writes Vitest results (and coverage, when present) to the GitHub Actions job summary.
 * Safe to run after a passing or failing job; missing files produce a short fallback.
 */
import * as core from '@actions/core'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const RESULTS_PATH = resolve(process.cwd(), 'test-results.json')
const COVERAGE_PATH = resolve(process.cwd(), 'coverage/coverage-summary.json')
const MAX_FAILED_ROWS = 25
const MAX_FAILURE_CHARS = 2500
const COVERAGE_METRICS = ['lines', 'statements', 'functions', 'branches'] as const

type StepOutcome = 'success' | 'failure' | 'cancelled' | 'skipped'
type Lane = 'main' | 'renderer'
type TableRows = Parameters<typeof core.summary.addTable>[0]

interface JsonRead<T> {
  missing?: boolean
  error?: string
  data?: T
}

interface VitestAssertion {
  ancestorTitles?: string[]
  fullName?: string
  title?: string
  status?: string
  duration?: number | null
  failureMessages?: string[] | null
}

interface VitestFileResult {
  name: string
  status: string
  startTime: number
  endTime: number
  message?: string
  assertionResults?: VitestAssertion[]
}

interface VitestJsonResults {
  numFailedTests: number
  numPassedTests: number
  numPendingTests?: number
  numTodoTests?: number
  numTotalTests: number
  startTime: number
  success: boolean
  testResults?: VitestFileResult[]
  snapshot?: {
    unmatched?: number
    filesUnmatched?: number
  }
}

interface CoverageMetric {
  total: number
  covered: number
  skipped: number
  pct: number
}

interface CoverageSummaryFile {
  total?: Partial<Record<(typeof COVERAGE_METRICS)[number], CoverageMetric>>
}

interface FailedAssertion {
  file: string
  name: string
  message: string
}

const OUTCOME_LABEL: Record<StepOutcome, string> = {
  success: 'passed',
  failure: 'failed',
  cancelled: 'cancelled',
  skipped: 'skipped'
}

function readJson<T>(path: string): JsonRead<T> {
  if (!existsSync(path)) return { missing: true }
  try {
    const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
    return { data: JSON.parse(raw) as T }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function relPath(file: string): string {
  const root = process.env.GITHUB_WORKSPACE || process.cwd()
  return core.toPosixPath(relative(root, file))
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function isStepOutcome(value: string): value is StepOutcome {
  return value in OUTCOME_LABEL
}

function outcomeEmoji(outcome: string): string {
  if (outcome === 'success') return '✅'
  if (outcome === 'failure') return '❌'
  if (outcome === 'cancelled') return '⚠️'
  if (outcome === 'skipped') return '⏭️'
  return '•'
}

function outcomeLabel(outcome: string): string {
  if (!outcome) return 'not run'
  return isStepOutcome(outcome) ? OUTCOME_LABEL[outcome] : outcome
}

function coverageBadge(pct: number): string {
  if (Number.isNaN(pct)) return '—'
  if (pct >= 80) return '🟢'
  if (pct >= 50) return '🟡'
  return '🔴'
}

function formatPct(pct: number): string {
  if (Number.isNaN(pct)) return '—'
  return `${pct.toFixed(1)}%`
}

function testDurationMs(results: VitestJsonResults): number {
  if (!Array.isArray(results.testResults) || results.testResults.length === 0) {
    return Date.now() - results.startTime
  }
  const start = Math.min(...results.testResults.map((file) => file.startTime))
  const end = Math.max(...results.testResults.map((file) => file.endTime))
  return end - start
}

function laneForFile(file: string): Lane | 'other' {
  const path = relPath(file)
  if (path.includes('src/main/')) return 'main'
  if (path.includes('src/renderer/')) return 'renderer'
  return 'other'
}

function emptyLaneCounts(): Record<Lane, { passed: number; failed: number; skipped: number }> {
  return {
    main: { passed: 0, failed: 0, skipped: 0 },
    renderer: { passed: 0, failed: 0, skipped: 0 }
  }
}

function laneCounts(results: VitestJsonResults): ReturnType<typeof emptyLaneCounts> {
  const lanes = emptyLaneCounts()
  for (const file of results.testResults ?? []) {
    const lane = laneForFile(file.name)
    if (lane === 'other') continue
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status === 'passed') lanes[lane].passed += 1
      else if (assertion.status === 'failed') lanes[lane].failed += 1
      else lanes[lane].skipped += 1
    }
  }
  return lanes
}

function failedAssertions(results: VitestJsonResults): FailedAssertion[] {
  const rows: FailedAssertion[] = []
  for (const file of results.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status !== 'failed') continue
      rows.push({
        file: relPath(file.name),
        name: assertion.fullName || assertion.title || '(unnamed test)',
        message: (assertion.failureMessages ?? []).filter(Boolean).join('\n\n')
      })
    }
  }
  return rows
}

function headerRow(...labels: string[]): TableRows[number] {
  return labels.map((data) => ({ data, header: true }))
}

function addChecks(): void {
  const checks: Array<[string, string]> = (
    [
      ['Tests', process.env.TEST_OUTCOME ?? ''],
      ['Typecheck', process.env.TYPECHECK_OUTCOME ?? ''],
      ['Lint', process.env.LINT_OUTCOME ?? '']
    ] satisfies Array<[string, string]>
  ).filter(([, outcome]) => Boolean(outcome))

  if (checks.length === 0) return

  core.summary
    .addHeading('Checks', 2)
    .addTable([
      headerRow('Check', 'Result'),
      ...checks.map(([name, outcome]) => [
        name,
        `${outcomeEmoji(outcome)} ${outcomeLabel(outcome)}`
      ])
    ])
}

function addTests(resultsFile: JsonRead<VitestJsonResults>): void {
  core.summary.addHeading('Tests', 2)

  if (resultsFile.missing) {
    core.warning('No test-results.json was produced')
    core.summary.addQuote(
      'No `test-results.json` was produced. The test step may have failed before Vitest wrote a report.'
    )
    return
  }

  if (resultsFile.error) {
    core.warning(`Could not parse test-results.json: ${resultsFile.error}`)
    core.summary.addQuote(`Could not parse \`test-results.json\`: ${resultsFile.error}`)
    return
  }

  const results = resultsFile.data
  if (!results) {
    core.summary.addQuote('Test results were empty.')
    return
  }

  const skipped = (results.numPendingTests ?? 0) + (results.numTodoTests ?? 0)
  const lanes = laneCounts(results)
  const failed = failedAssertions(results)

  core.summary
    .addTable([
      headerRow('Stat', 'Count'),
      ['Passed', String(results.numPassedTests)],
      ['Failed', String(results.numFailedTests)],
      ['Skipped / todo', String(skipped)],
      ['Total', String(results.numTotalTests)],
      ['Duration', formatDuration(testDurationMs(results))]
    ])
    .addHeading('Projects', 3)
    .addTable([
      headerRow('Project', 'Passed', 'Failed', 'Skipped'),
      ['main', String(lanes.main.passed), String(lanes.main.failed), String(lanes.main.skipped)],
      [
        'renderer',
        String(lanes.renderer.passed),
        String(lanes.renderer.failed),
        String(lanes.renderer.skipped)
      ]
    ])

  if (failed.length > 0) {
    const shown = failed.slice(0, MAX_FAILED_ROWS)
    core.summary
      .addHeading('Failed tests', 3)
      .addTable([
        headerRow('File', 'Test'),
        ...shown.map((row) => [`<code>${escapeHtml(row.file)}</code>`, escapeHtml(row.name)])
      ])

    if (failed.length > shown.length) {
      core.summary.addRaw(`_…and ${failed.length - shown.length} more._`, true)
    }

    const detail = shown
      .filter((row) => row.message)
      .map((row) => {
        const body = row.message.slice(0, MAX_FAILURE_CHARS)
        const truncated = row.message.length > MAX_FAILURE_CHARS ? '\n…(truncated)' : ''
        return [
          `<h4><code>${escapeHtml(row.file)}</code></h4>`,
          `<p>${escapeHtml(row.name)}</p>`,
          `<pre><code>${escapeHtml(body + truncated)}</code></pre>`
        ].join('\n')
      })
      .join('\n')

    if (detail) {
      core.summary.addDetails('Failure details', detail)
    }
  }

  const snapshot = results.snapshot
  if (snapshot && ((snapshot.unmatched ?? 0) > 0 || (snapshot.filesUnmatched ?? 0) > 0)) {
    core.summary
      .addHeading('Snapshots', 3)
      .addRaw(
        `${snapshot.unmatched ?? 0} unmatched snapshot(s) across ${snapshot.filesUnmatched ?? 0} file(s).`,
        true
      )
  }
}

function addCoverage(coverageFile: JsonRead<CoverageSummaryFile>): void {
  core.summary.addHeading('Coverage', 2)

  if (coverageFile.missing) {
    core.summary.addQuote('No `coverage/coverage-summary.json` was produced.')
    return
  }

  if (coverageFile.error) {
    core.summary.addQuote(
      `Could not parse \`coverage/coverage-summary.json\`: ${coverageFile.error}`
    )
    return
  }

  const summary = coverageFile.data
  if (!summary?.total) {
    core.summary.addQuote('Coverage summary did not include totals.')
    return
  }

  const rows: TableRows = [headerRow('Metric', 'Coverage', 'Covered / Total')]
  for (const key of COVERAGE_METRICS) {
    const metric = summary.total[key]
    if (!metric) continue
    rows.push([
      key,
      `${coverageBadge(metric.pct)} ${formatPct(metric.pct)}`,
      `${metric.covered} / ${metric.total}`
    ])
  }

  core.summary
    .addTable(rows)
    .addRaw('_HTML report is uploaded as the `coverage-report` artifact._', true)
}

function overallStatus(resultsFile: JsonRead<VitestJsonResults>): string {
  const testOutcome = process.env.TEST_OUTCOME
  if (testOutcome) {
    return `${outcomeEmoji(testOutcome)} ${outcomeLabel(testOutcome)}`
  }
  if (resultsFile.data) {
    return resultsFile.data.success ? '✅ passed' : '❌ failed'
  }
  return '⚠️ unknown'
}

async function main(): Promise<void> {
  const resultsFile = readJson<VitestJsonResults>(RESULTS_PATH)
  const coverageFile = readJson<CoverageSummaryFile>(COVERAGE_PATH)
  const job = process.env.GITHUB_JOB || 'ci'
  const title = job === 'coverage' ? 'Coverage' : 'CI'
  const hasCoverage = Boolean(coverageFile.data?.total) || job === 'coverage'

  core.summary.addHeading(title).addRaw(`**Status:** ${overallStatus(resultsFile)}`, true)

  addChecks()
  addTests(resultsFile)

  if (hasCoverage) {
    addCoverage(coverageFile)
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    await core.summary.write()
    core.info('Wrote job summary')
    return
  }

  process.stdout.write(core.summary.stringify())
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error : String(error)
  core.warning(message)
})
