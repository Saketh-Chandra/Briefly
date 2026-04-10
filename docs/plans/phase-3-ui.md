# Phase 3 — UI

> Objective: A polished, functional macOS desktop UI using React + Tailwind CSS v4 + shadcn/ui. All pages connected to the IPC layer. App feels native and focused.

---

## 3.1 Design Principles

- **Minimal chrome** — the app is a tool, not a dashboard. Content first.
- **macOS-native feel** — sidebar navigation, translucent surfaces, system fonts
- **Status-driven** — every meeting has a clear status; pipeline progress is visible
- **Keyboard-first shortcuts** for record start/stop

---

## 3.2 App Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Sidebar]      │  [Main Content Area]                   │
│                 │                                         │
│  ○ Dashboard    │  <page content>                         │
│  ○ Recordings   │                                         │
│  ○ Journal      │                                         │
│  ─────────────  │                                         │
│  ● Recording... │                                         │
│  [■ Stop]       │                                         │
│                 │                                         │
│  ─────────────  │                                         │
│  ⚙ Settings     │                                         │
└─────────────────────────────────────────────────────────┘
```

- Fixed sidebar (220px), collapsible on small windows
- No top menu bar (macOS `autoHideMenuBar: true` already set)
- Frameless titlebar area with drag region (`-webkit-app-region: drag`)
- Traffic lights (macOS window controls) remain visible

---

## 3.3 Pages

### Dashboard (`/`)

Purpose: Overview of today's activity and quick-start recording.

**Sections:**
- **Quick Record** — large "Start Recording" button (or waveform + stop if recording)
- **Today** — meetings recorded/processed today, with status badges
- **Recent** — last 5 meetings across all dates

**Components:**
- `<RecordButton />` — primary CTA, animates to waveform when active
- `<MeetingCard />` — title, date, duration, status badge, quick actions (open, delete)
- `<StatusBadge />` — color-coded: `recorded` | `transcribing` | `transcribed` | `processing` | `done` | `error`

---

### Recordings (`/recordings`)

Purpose: Full meeting library, searchable, filterable.

**Features:**
- List view (date-grouped) or grid view toggle
- Search by title/transcript content
- Filter by status, date range
- Click row → opens Transcript page for that meeting

**Components:**
- `<MeetingList />` — virtualized if > 50 items
- `<MeetingListItem />` — expandable row with summary preview
- `<SearchBar />` — debounced, queries DB via IPC
- `<FilterBar />` — status filter chips, date picker

---

### Transcript (`/recordings/:id`)

Purpose: Full detail view for a single meeting.

**Layout (3-column on wide screens, tabbed on narrow):**

```
┌────────────────┬────────────────┬──────────────────┐
│  Transcript    │  Summary       │  To-Dos          │
│                │  ─────────     │  ─────────────   │
│  [timestamp]   │  • bullet 1    │  ☐ Action item 1 │
│  Speaker text  │  • bullet 2    │  ☐ Action item 2 │
│  ...           │                │                  │
│                │  Journal       │                  │
│                │  ─────────     │                  │
│                │  Narrative...  │                  │
└────────────────┴────────────────┴──────────────────┘
```

**Components:**
- `<TranscriptViewer />` — scrollable, click timestamp to seek (future: audio playback)
- `<SummaryPanel />` — markdown rendering for bullet summary
- `<TodoList />` — checkboxes, mark done persisted to DB
- `<JournalPanel />` — editable text (user can amend narrative)
- `<PipelineStatus />` — shown while transcribing/processing: step indicators + progress bar

**Actions toolbar:**
- Copy transcript to clipboard
- Export as Markdown (opens save dialog)
- Re-run LLM (re-generate summary/todos/journal)
- Delete meeting

---

### Journal (`/journal`)

Purpose: Daily view aggregating all meeting entries for a given day.

**Layout:**
- Date picker / calendar navigation (week view by default)
- Each day shows: combined journal entries from all meetings that day
- "Daily Summary" auto-generated if > 1 meeting: merged narrative paragraph

**Components:**
- `<DateNavigator />` — prev/next day, jump to date
- `<DayView />` — list of journal entries for the selected day
- `<JournalEntryCard />` — meeting title, time, editable journal text
- `<DailySummary />` — collapsed by default, expand to read aggregate

---

### Settings (`/settings`)

**Sections:**

#### LLM Configuration
- Base URL input (e.g. `https://your-resource.openai.azure.com/...`)
- API Key input (masked, saved to macOS Keychain)
- Model name (text input, default `gpt-4o`)
- API Version (optional, for Azure)
- [Test Connection] button — sends a minimal completion request, shows ✓ or error

#### Whisper / Transcription
- Model selector (dropdown: tiny / base / large-v3-turbo)
- Language selector (English / Auto-detect / other common languages)
- GPU status indicator: shows "WebGPU (Metal)" or "CPU (WASM)"
- [Download Model] / [Delete Model] with disk size shown

#### Storage
- Show userData path (click to reveal in Finder)
- Total disk usage (audio files + DB)
- [Clear all recordings] — destructive, confirmation dialog required

#### About
- App version
- GitHub link (future open source)

---

## 3.4 Recording Flow (UI State Machine)

```
idle
  → user clicks "Start Recording"
  → permission check (Screen Recording + Mic if --mix-mic)
      ✗ permission denied → show permission guide sheet
      ✓ granted
  → IPC: capture:start
  → state: recording
      sidebar shows waveform animation + elapsed timer
      "Stop" button with ⌘⇧R shortcut

recording
  → user clicks "Stop" (or ⌘⇧R)
  → IPC: capture:stop
  → state: processing
      show spinner: "Saving audio..."
  → IPC confirms session saved, DB row created
  → auto-navigate to Transcript page for that meeting
  → if model not downloaded: show download prompt first
  → IPC: transcription:start
  → state: transcribing (shown on Transcript page)
      streaming chunks appear in TranscriptViewer as they arrive
  → transcription done → IPC: llm:process
  → state: processing (LLM)
      step indicators: "Summarizing… (1/3)", "Extracting to-dos… (2/3)", "Writing journal… (3/3)"
  → done → display full results
```

---

## 3.5 shadcn/ui Components to Add

```bash
npx shadcn add button card badge separator scroll-area \
  sheet dialog tooltip progress tabs input label \
  textarea select dropdown-menu command calendar popover
```

Custom components built on top of shadcn primitives (not generated by shadcn):
- `<RecordButton />` — pulse animation when recording
- `<AudioWaveform />` — CSS/SVG bars animating from audio level data
- `<StatusBadge />` — semantic color map over `<Badge />`
- `<PipelineStatus />` — multi-step progress (uses `<Progress />` + step list)
- `<TranscriptViewer />` — virtualized scroll list of chunks
- `<MarkdownRenderer />` — lightweight `remark` or direct `marked` parser

---

## 3.6 Routing

Use `react-router-dom` v7:

```
/                     Dashboard
/recordings           Recording library
/recordings/:id       Transcript detail
/journal              Journal view
/journal/:date        Journal for specific date (YYYY-MM-DD)
/settings             Settings
```

Install: `npm install react-router-dom`

---

## 3.7 Global State

Use React context + `useReducer` (no external state library needed):

**`RecordingContext`** — tracks active recording session:
```typescript
{
  status: 'idle' | 'recording' | 'stopping' | 'saving'
  sessionId: string | null
  elapsed: number   // seconds, updated by setInterval
  audioPath: string | null
}
```

**`TranscriptionContext`** — tracks active transcription per meeting:
```typescript
{
  meetingId: number | null
  status: 'idle' | 'downloading-model' | 'transcribing' | 'processing-llm' | 'done' | 'error'
  progress: number   // 0-100
  chunks: TranscriptChunk[]
}
```

Both contexts provided at the `App` root, consumed by Sidebar (recording status) and Transcript page.

---

## 3.8 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘⇧R` | Start / stop recording |
| `⌘1` | Navigate to Dashboard |
| `⌘2` | Navigate to Recordings |
| `⌘3` | Navigate to Journal |
| `⌘,` | Open Settings |

Register via Electron `globalShortcut` in main process for system-level shortcuts, and `useEffect` + `keydown` in renderer for in-app shortcuts.

---

## 3.9 Dependencies to Install

```bash
# Routing
npm install react-router-dom

# Markdown rendering (lightweight)
npm install marked

# Date utilities (for journal)
npm install date-fns

# shadcn component additions (run npx shadcn add ...)
```

---

## Phase 3 Checklist

**Layout & Navigation**
- [ ] `Sidebar.tsx` with navigation links, recording status section
- [ ] Frameless titlebar drag region configured
- [ ] `react-router-dom` routes wired in `App.tsx`

**Dashboard**
- [ ] `RecordButton` with idle / recording states
- [ ] Today's meetings list with `StatusBadge`
- [ ] Recent meetings section

**Recordings Page**
- [ ] Meeting list, date-grouped
- [ ] Search input (debounced IPC query)
- [ ] Status filter chips

**Transcript Page**
- [ ] `TranscriptViewer` shows streamed chunks during transcription
- [ ] Summary, to-do, and journal panels
- [ ] `PipelineStatus` step indicator
- [ ] Export Markdown action
- [ ] Re-run LLM action

**Journal Page**
- [ ] Day navigation
- [ ] Journal entry cards per meeting
- [ ] Editable journal text (persisted to DB)

**Settings Page**
- [ ] LLM config form (base URL, API key to keychain, model, API version)
- [ ] Test Connection button
- [ ] Whisper model selector + download/delete
- [ ] GPU/WASM status indicator

**Global**
- [ ] `RecordingContext` and `TranscriptionContext` provided at App root
- [ ] `⌘⇧R` global shortcut registered
- [ ] Permission denied sheet/dialog with instructions
- [ ] All destructive actions (delete meeting, clear all) use confirmation dialogs
