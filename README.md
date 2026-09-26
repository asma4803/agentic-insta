# Frame & Words

Turn a photograph into a story — an AI Instagram caption agent.

## Setup

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` with either NVIDIA (recommended free NIM models) or OpenAI:

```
# NVIDIA NIM (OpenAI-compatible). Preferred when NVIDIA_API_KEY is set.
NVIDIA_API_KEY=
NVIDIA_MODEL=nvidia/nemotron-3.5-bolt-e4b
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1

# OpenAI fallback — used only if NVIDIA_API_KEY is unset.
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

Set **`NVIDIA_API_KEY`** or **`OPENAI_API_KEY`** (at least one). If both are set, **NVIDIA wins**. Model and base URL vars are optional. Use a **vision-capable** model (this app uploads a photo). `nvidia/nemotron-3.5-bolt-e4b` works on the public NIM endpoint. `meta/llama-3.2-11b-vision-instruct` is still listed, but calls to it often return 404 because that hosted model is not deployed for the key.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
