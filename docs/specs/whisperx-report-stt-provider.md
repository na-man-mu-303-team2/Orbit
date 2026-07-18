# Spec: WhisperX Report STT Provider

**Status:** Implementation contract for P2 STT Abstractions
**Scope:** Server-side report transcription only. Browser live-control STT must not use this provider.

## Environment

```txt
REPORT_STT_PROVIDER=whisperx
WHISPERX_API_URL=https://whisperx.example.test/transcribe
WHISPERX_API_KEY=
WHISPERX_MODEL=large-v3
WHISPERX_TIMEOUT_MS=30000
REPORT_TRANSCRIPTION_PROMPT="한국어 발표 리허설 음성입니다. 말을 매끄럽게 다듬지 말고 들리는 대로 전사하세요."
```

`WHISPERX_API_KEY` is a secret and must come from local `.env.local` or the deployment secret store.

## Request

The Python worker sends a `POST` request to `WHISPERX_API_URL`.

Headers:

```http
Authorization: Bearer <WHISPERX_API_KEY>
Content-Type: multipart/form-data; boundary=<generated>
User-Agent: orbit-python-worker
```

Multipart fields:

| field | value |
|---|---|
| `file` | assembled rehearsal audio file |
| `language` | `ko` |
| `model` | `WHISPERX_MODEL` |
| `diarization` | `false` |
| `initial_prompt` | `REPORT_TRANSCRIPTION_PROMPT` when non-empty |

The provider receives only assembled report audio from the rehearsal upload flow. It never receives browser live-control microphone streams.

## Response

```json
{
  "transcript": "발표 전사",
  "language": "ko",
  "provider": "whisperx",
  "model": "large-v3",
  "durationSeconds": 120.5,
  "segments": [
    {
      "text": "발표 전사",
      "startSeconds": 0,
      "endSeconds": 2.4
    }
  ]
}
```

The Python worker normalizes this response into `AudioTranscribeResponse`.

## Error Mapping

| condition | `AudioTranscriptionError.code` | status |
|---|---|---|
| request failure, auth failure, timeout, provider 5xx | `stt_provider_failed` | 502 |
| empty transcript | `empty_transcript` | 502 |
| malformed `segments` | `malformed_provider_response` | 502 |
| missing provider config | `provider_not_configured` | 500 |

## Privacy

Server logs must not include `WHISPERX_API_KEY`, raw audio, transcript text, speaker notes, presenter script, or file base64.
