## Cursor Cloud specific instructions

This is a purely static website (vanilla HTML/CSS/JS, no build tools, no dependencies).

### Running the site

Cloud Agents start the site on port 8000 with `bash start.sh`, which runs `project/serve.py`. The same command starts it manually.

Site available at `http://localhost:8000/vintage/index.html` (main page).

`serve.py` redirects `/dj` to `/vintage/dj.html` and strips a mistaken `/project/` prefix.

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
- `project/assets/realtime-config.js` turns realtime on and points at a Supabase host. That host does not resolve in this environment, so play and chat stay on the remote path. Pages, navigation, and local interactions such as Шар Джаха work from the static server.
