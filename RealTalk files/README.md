# Real Talk Germany

A website for an independent German immigration advisory service, with an
AI-powered chat widget that answers visitor questions in real time.

## How the chat assistant works

The chat widget in `index.html` sends each visitor message to a serverless
function (`api/chat.js`), which:

1. Attaches a fixed system prompt describing the assistant's role and
   guardrails (e.g. "not legal advice").
2. Forwards the conversation to Google's Gemini API (`gemini-2.5-flash`).
3. Returns just the reply text to the browser.

**Why a backend at all, instead of calling Gemini straight from the
browser?** Calling a third-party API directly from client-side JavaScript
means embedding the API key in code that anyone can view via "View Source."
Routing the request through a serverless function keeps the key entirely
server-side, in an environment variable, where the browser — and anyone
viewing the deployed site's source — never sees it.

The function also applies a small per-IP rate limit (10 requests/minute) to
reduce the chance of the API quota being burned by automated abuse.

## Stack

- Static HTML/CSS/JS frontend (no build step)
- One Node.js serverless function (`api/chat.js`), deployable on Vercel
- Google Gemini API (`generateContent`)

## Running it yourself

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/).
2. Deploy this repo to [Vercel](https://vercel.com/) (or any platform that
   supports Node serverless functions in an `api/` folder).
3. In your hosting platform's dashboard, set an environment variable:
   ```
   GEMINI_API_KEY=your-key-here
   ```
4. Deploy. The chat widget on the site will call `/api/chat` automatically.

No API key is ever stored in this repository.
