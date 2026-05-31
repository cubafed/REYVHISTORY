## Cursor Cloud specific instructions

This is a purely static website (vanilla HTML/CSS/JS, no build tools, no dependencies).

### Running the site

```bash
cd /workspace/project && python3 -m http.server 8000
```

Site available at `http://localhost:8000/vintage/index.html` (main page).

### Pages

- `/vintage/` — main "Эфир" page
- `/dub/` — Даб-станция
- `/tropical/` — Тропик-стрит
- `/zalipay/` — Залипай (hypnotic visuals)
- `/taro/` — Таро
- `/chai/` — Чай
- `/shar/` — Шар Джаха (magic 8-ball)

### Notes

- No package manager, no build step, no tests, no linter.
- All audio is synthesized via Web Audio API (no media files).
- Pages use relative links between each other — must be served via HTTP, not `file://`.
