# Suggested features:

| Feature | Do people need it? | Need Rating | Effort |
|---|---|---|---|
| **Key decisions + participants display** | Yes — the LLM already extracts them but they're silently dropped. Users lose structured data they paid LLM tokens for. | 9/10 | Low |
| **Full-text transcript search** | Yes — once you have 20+ meetings, finding "what did we decide about X" is the primary use case. | 9/10 | Low–Medium |
| **Meeting templates / custom prompts** | Yes — a standup, a 1:1, and a design review need completely different outputs. Hardcoded prompts limit usefulness. | 8/10 | Low–Medium |
| **Audio playback with transcript sync** | Moderately — useful for reviewing specific moments, but most users read rather than re-listen. | 7/10 | Medium |
| **Raycast extension** | Yes, for the target audience (macOS power users). Start/stop recording without switching apps is a daily workflow. | 7/10 | Low (separate repo) |
| **Vision LLM context (screenshots → LLM)** | Yes, if the user has a vision-capable model. Slide content that wasn't spoken is otherwise lost. | 7/10 | Medium |
| **Screenshot timeline markers in transcript** | Moderately — nice UX, but only valuable if screenshots are taken frequently. | 6/10 | Low |
| **Weekly digest** | Moderately — useful for reflection, but most users want per-meeting output first. | 6/10 | Medium |
| **OCR on screenshots** | Moderately — powerful for slide-heavy meetings, but adds a heavy dependency. | 6/10 | High |
| **Export to Obsidian / markdown with frontmatter** | Niche but highly valued by the PKM audience that overlaps with this app's users. | 6/10 | Low |
| **Meeting thumbnail from first screenshot** | Nice to have — purely cosmetic improvement to the Recordings list. | 5/10 | Low |
| **Include screenshots in Markdown export** | Low — most users won't need the images in the exported file. | 4/10 | Low |

**Recommended order to tackle (impact ÷ effort):**

1.[x] Key decisions + participants — highest need, lowest effort
2.[x] Full-text transcript search — high need, one migration + one IPC handler
3.[ ] Meeting templates — high need, settings-only change
4.[ ] Raycast extension — separate repo, leverages existing deep links
5.[ ] Export to Obsidian — pure renderer change, no backend
6.[ ] Screenshot timeline markers — data already exists, UI-only
7.[ ] Vision LLM context — needs a settings flag + prompt change
8.[ ] Audio playback — `readAudio` IPC exists, needs a player UI
9.[ ] Weekly digest — builds on existing journal infrastructure
10. [ ] OCR — defer until the above are done