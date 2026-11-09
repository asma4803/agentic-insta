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

Publishing is optional. Leave the Instagram variables empty until you want to send an approved post:

```
IG_USER_ID=
IG_ACCESS_TOKEN=
PUBLIC_BASE_URL=
META_GRAPH_VERSION=v23.0
```

`META_GRAPH_VERSION` is optional and defaults to `v23.0`.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Review and publishing

1. Choose a mood and draft a post. The agent only writes a draft. It never publishes.
2. Review the images, their order, the caption, the hashtags, and the alt text. Edits save on their own.
3. Approve the draft. Any later edit clears that approval.
4. Publish sends the approved snapshot only. The page shows in progress, published, or failed, including Instagram’s error when publishing fails.

### Connect the Instagram account

Publishing uses the [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/content-publishing/). This app keeps one account in environment variables. There is no Facebook Page requirement for that login type.

- Switch the Instagram account to **Business** or **Creator**. Personal accounts cannot publish.
- Create a Meta app of type **Business** and add the Instagram product.
- For an account you own, Standard Access is enough. In the app dashboard open **Instagram → API setup with Instagram login → Generate token**. That token lasts about 60 days. This app does not refresh it.
- Grant `instagram_business_basic` and `instagram_business_content_publish`.
- Put the professional account id in `IG_USER_ID` and the token in `IG_ACCESS_TOKEN`.
- Advanced Access and App Review are only required to publish for accounts you do not manage.

`PUBLIC_BASE_URL` must be a public `https` origin that serves this app, because Instagram downloads each image from `{PUBLIC_BASE_URL}/api/library/images/{id}`. Localhost is rejected. For local development, point the variable at an https tunnel that forwards to the dev server.

If those values are missing, approval still works and Publish explains what to set.

### Limits

- Images must be public HTTPS JPEG, at most 8 MB, with an aspect ratio from 4:5 to 1.91:1 and a width from 320 to 1440. This app does not crop. A bad ratio fails when you publish, and the error is shown on the draft.
- A carousel is 2 to 10 images. Instagram crops every image to the first image’s aspect ratio. The caption is on the post. Slide text is sent as alt text, not drawn on the photo.
- The caption plus hashtags can be at most 2,200 characters, with at most 30 hashtags.
- Publishing quota is a rolling 24-hour cap. Meta’s docs disagree between 50 and 100, so the app reads `quota_usage` and `quota_total` for the connected account. A carousel counts as one post.
- Media containers expire if they are left unpublished for about 24 hours. A failed post can be edited, approved again, and retried.
- Stories, Reels, product tags, and locations are not published.
- Page Publishing Authorization or two-factor rules on a linked Facebook Page can still block publishing. The failed state shows Instagram’s message.
