from pydantic import BaseModel, Field

class TranscribeResponse(BaseModel):
    text: str
    language: str = "en"
    duration: float = 0.0

class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to convert to speech")
    lang: str = Field(default="en", description="Language code for gTTS")

