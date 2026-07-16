from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

SUPPORTED_AUDIO_MIME_TYPES = {
    "audio/m4a",
    "audio/mp3",
    "audio/mp4",
    "audio/mpeg",
    "audio/mpga",
    "audio/flac",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
    "audio/x-wav",
    "video/mp4",
}


class AudioReference(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    file_id: str = Field(alias="fileId", min_length=1)
    object_key: str | None = Field(default=None, alias="objectKey", min_length=1)
    storage_url: str | None = Field(default=None, alias="storageUrl", min_length=1)
    mime_type: str = Field(alias="mimeType", min_length=1)

    @model_validator(mode="after")
    def validate_reference(self) -> AudioReference:
        if not self.object_key and not self.storage_url:
            raise ValueError("audio reference requires objectKey or storageUrl")

        if self.mime_type not in SUPPORTED_AUDIO_MIME_TYPES:
            raise ValueError(f"unsupported audio mime type: {self.mime_type}")

        return self


class AudioContent(BaseModel):
    data: bytes
    file_name: str
    mime_type: str
