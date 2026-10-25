# Audio providers

OhMyGame treats audio as a capability family rather than a TTS-only feature. The shared contract has four operations:

- `speech` for narration and character voices;
- `dialogue` for multi-speaker synthesis when a provider supports it;
- `sound-effect` for prompted effects and ambience;
- `music` for instrumental or lyrical music.

The daemon owns credentials, provider calls, generated files, and Library registration. The renderer and agents submit provider-neutral requests and never receive saved API keys.

## Architecture

`src/shared/audio.ts` defines requests, output settings, model capabilities, catalogs, and generated-audio metadata. A provider adapter implements `AudioProviderAdapter`; `ProviderAudio` selects only a configured, enabled model that advertises the requested operation. `ToolRunner` then persists MP3, WAV, or FLAC output through the same job and Library flow used by image, video, and 3D generation.

The stable tool boundary is:

| Tool                    | Operation      | Current implementation                     |
| ----------------------- | -------------- | ------------------------------------------ |
| `generate-speech`       | `speech`       | Volcengine Doubao Speech synthesis 2.0     |
| `generate-sound-effect` | `sound-effect` | Volcengine Doubao Seed Audio 1.0            |
| `generate-music`        | `music`        | Volcengine Doubao Seed Audio 1.0, Custom Music API |

Unsupported operations fail before an incompatible provider is called. Adding ElevenLabs, MiniMax, Suno, Gemini, Fish Audio, or SiliconFlow should normally require a new adapter and settings integration, not changes to jobs or Library storage.

## Asset Canvas audio nodes

Asset Canvas exposes the common layer as three generation node types: **Speech**, **Sound effect**, and **Music**. The Add menu shows a type only when the live audio catalog contains a configured, enabled model for that operation, and each existing node filters the same catalog by its required operation. A speech-only model therefore cannot be selected for music or effects. A Text or Document node can be connected as a prompt source; its current content is combined with the node's local text when the job starts.

Speech nodes store provider-neutral model, speaker, and speed settings. Sound-effect and music nodes store provider-neutral prompt, duration, and loop settings, plus capability-gated options such as negative prompts, lyrics, and instrumental mode. Generated MP3, WAV, or FLAC output is registered in the Library, written back to the node as an `assetId`, and playable in both generation nodes and Library asset nodes. Model and option selections are remembered independently for each node type.

Existing nodes remain readable when a provider is disconnected, but generation stays disabled until a compatible model is available. Installing a future adapter that advertises sound-effect or music activates the existing node contract and adds that node type to the menu without another canvas schema change. Agent generation tools follow the same live capability filter, so unsupported operations are not offered on a turn.

## Volcengine Doubao Speech

The first adapter uses the official TTS v3 unidirectional HTTP streaming endpoint. Configure it in **Settings → Providers & Models → Doubao Speech**. The key is stored in the local data directory with restricted file permissions and is sent only from the daemon.

Configure a default Volcengine Speaker ID from the console's Voice Library, or supply `voiceId` on an individual request. The adapter supports the official Speech synthesis 2.0 service, MP3 output, mono audio, supported sample rates, language hints, delivery context, and speech-rate control. The first adapter deliberately avoids streamed WAV because the provider documents repeated WAV headers as a streaming caveat; the common layer still supports WAV for adapters that return a valid complete file. Account activation, API key access, model entitlement, quota, and the exact voice ID still belong to the user's Volcengine account and must be verified with a real credential. Voice Clone 2.0 (`seed-icl-2.0`) is intentionally separate because its resource ID, entitlements, and model options differ.

The settings page ships the published seed-tts-2.0 preset voice catalog (`VOLCENGINE_TTS_VOICES` in `src/shared/audio.ts`) as a picker. The provider's `ListSpeakers` API is a console API that requires AccessKey signing instead of the console API key, so the catalog is bundled from the official voice list; cloned or custom Speaker IDs can still be entered as raw IDs. The default voice saves on its own without re-entering the API key, and a preview action synthesizes a short sample (up to 500 characters) to verify the connection and voice before real use.

The daemon endpoints are:

- `GET /audio-models/catalog` — available models plus provider status;
- `GET /settings/models/providers/volcengine-tts` — saved settings without the key;
- `PUT /settings/models/providers/volcengine-tts` — save `{ "apiKey": "..." }`, `{ "defaultVoiceId": "..." }`, or both (voice-only updates keep the stored key; `defaultVoiceId: null` clears it);
- `POST /settings/models/providers/volcengine-tts/preview` — synthesize a short sample and return MP3 bytes;
- `DELETE /settings/models/providers/volcengine-tts` — remove the saved connection;
- `POST /tools/generate-speech/jobs` — enqueue speech generation.

Example job body:

```json
{
  "text": "欢迎来到雾港。",
  "voiceId": "your-volcengine-voice-id",
  "style": "calm fantasy narrator",
  "speed": 0,
  "output": { "format": "mp3", "sampleRate": 24000 }
}
```

The model can be omitted to use the first configured compatible model, or supplied explicitly as `{ "provider": "volcengine-tts", "id": "seed-tts-2.0" }`.

## Volcengine Doubao Seed Audio

The Seed Audio adapter uses the official non-streaming `POST /api/v3/tts/create` endpoint with model `seed-audio-1.0`. Configure it separately in **Settings → Providers & Models → Doubao Seed Audio**. Its API key is stored in `volcengine-seed-audio.json` and is never returned by a settings or catalog endpoint. Doubao Speech and Doubao Seed Audio deliberately remain separate connections, so enabling, disabling, replacing, or deleting one does not change the other.

The first integration exposes text-to-audio generation for standalone game sound effects and instrumental game background music. It supports MP3 and WAV at 8, 16, 24, or 48 kHz, an optional target duration from 1 to 120 seconds, and Chinese or English prompts. Provider-specific prompt instructions keep sound-effect jobs free of dialogue and music, and music jobs free of voices and lyrics. Generated bytes are validated before they enter the normal job and Library flow.

Although the underlying Seed Audio API can accept richer scene prompts and reference media, this adapter does not yet advertise reference audio, images, lyrics, negative prompts, channel selection, or guaranteed seamless loops. Those options stay hidden in Asset Canvas and are rejected at the daemon boundary rather than being silently ignored. A real Volcengine account must have Seed Audio 1.0 access; a Doubao Speech key alone does not prove that entitlement is enabled.

The daemon endpoints are:

- `GET /settings/models/providers/volcengine-seed-audio` — saved connection state without the key;
- `PUT /settings/models/providers/volcengine-seed-audio` — save `{ "apiKey": "..." }`;
- `DELETE /settings/models/providers/volcengine-seed-audio` — remove only the Seed Audio connection;
- `POST /tools/generate-sound-effect/jobs` — enqueue sound-effect generation;
- `POST /tools/generate-music/jobs` — enqueue instrumental music generation.

Example sound-effect job body:

```json
{
  "prompt": "A heavy castle door slams shut with a short stone echo",
  "durationSeconds": 3,
  "output": { "format": "mp3", "sampleRate": 48000 }
}
```

Example music job body:

```json
{
  "prompt": "Quiet harbor exploration theme with piano and soft strings",
  "instrumental": true,
  "durationSeconds": 30,
  "output": { "format": "wav", "sampleRate": 48000 }
}
```

The model can be omitted to use the configured compatible model, or supplied explicitly as `{ "provider": "volcengine-seed-audio", "id": "seed-audio-1.0" }`.

## Custom Music API

The music adapter targets OpenAI-compatible gateway endpoints that expose `POST {base}/music/generations`, such as FreeAiProxy in front of the wenxin web music service. Configure it in **Settings → Providers & Models → Custom Music API**: a Base URL (required, ending in `/v1`), an optional Bearer API key, an optional model ID (defaults to `wenxin-music`), and optional default `style` and `voice` values. Settings live in `custom-music.json`; the key is never returned by a settings or catalog endpoint (`hasApiKey` only reports whether one is stored).

Each generation returns one song with vocals as FLAC. FreeAiProxy's `doubao-music` model is not supported: it returns an MP4 with a cover image plus the audio track, while this adapter and the audio Library store audio files only (the provider reports that container explicitly). Use `wenxin-music` or another model that returns an audio file. The model advertises `vocalsOnly`, so Asset Canvas keeps the instrumental option off and shows the lyrics field instead; providing `lyrics` switches the request into custom-lyrics mode, and without it the provider writes lyrics from the prompt. A requested duration is passed along as a prompt hint only. Loops, reference audio, non-FLAC output, and sample-rate or channel selection are rejected at the daemon boundary rather than being silently ignored: this gateway family returns FLAC regardless of the requested format, and the downloaded bytes are validated by magic number (with duration, sample rate, and channels read from the FLAC STREAMINFO block) before entering the normal job and Library flow. `style` and `voice` are free text here because other gateways may use different vocabularies; an invalid value comes back as a mapped provider error.

The daemon endpoints are:

- `GET /settings/models/providers/custom-music` — saved connection state without the key;
- `PUT /settings/models/providers/custom-music` — partial update: string values are saved, `null` clears a field, and omitted keys keep their stored value (so saving without an API key keeps the current one);
- `DELETE /settings/models/providers/custom-music` — remove the Custom Music connection;
- `POST /tools/generate-music/jobs` — enqueue music generation.

Example music job body:

```json
{
  "prompt": "热血的 Boss 战主题曲，太鼓与电吉他",
  "instrumental": false,
  "lyrics": "[Verse]\nWe rise again",
  "durationSeconds": 30
}
```

The model can be omitted to use the configured compatible model, or supplied explicitly as `{ "provider": "custom-music", "id": "wenxin-music" }`.

## Adding another provider

1. Describe every offered model with precise operations, formats, duration/text limits, execution mode, and optional features.
2. Implement an adapter that translates only supported fields and maps authentication, quota, validation, provider, and network failures to `AudioGenerationError`.
3. Keep task polling or streaming details inside the adapter. Return final bytes plus normalized metadata.
4. Add a secret settings store and provider UI. Never expose the secret from a read endpoint.
5. Add request-translation, failure-mapping, catalog, job, and Library tests.

Do not make one adapter pretend to support all audio operations. Capability-driven selection is what lets TTS, effects, music, dialogue, voice cloning, and future realtime speech coexist behind one contract.
