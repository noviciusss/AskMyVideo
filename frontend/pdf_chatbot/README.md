## PDF + Text Chat Frontend

This package is a lightweight Next.js 16 UI that talks to the FastAPI backend at `NEXT_PUBLIC_BACKEND_URL` (defaults to `http://127.0.0.1:8000`). It lets you upload a PDF, a `.txt` file, or paste raw text, then chat with the indexed document via the `/upload` + `/chat` endpoints implemented in `backend/main.py`.

### Features

- Modern chat layout with glassmorphic cards and source bubbles.
- Segmented control to pick the ingestion type (PDF, TXT, paste).
- Inline status + error messaging for upload and chat operations.
- Conversation history that keeps both user questions and model answers with cited sources.

### Running Locally

```bash
cd frontend/youtube_chat
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). Optionally set `NEXT_PUBLIC_BACKEND_URL` to point at a remote backend instance.

### Developer Notes

- Main UI: `app/page.tsx`
- Global styles: `app/globals.css`
- Tailwind v4 is enabled via the `@import "tailwindcss";` directive.

The page auto-refreshes in dev mode, so you can iterate on the chat experience quickly.
