import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Response
from app.schemas.voice import TranscribeResponse, SynthesizeRequest
from app.services.voice_service import voice_service

logger = logging.getLogger("askmate.routes.voice")
router = APIRouter(prefix="/voice", tags=["Voice"])

@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Transcribe recorded or uploaded audio into text using Whisper.
    Supports WAV, MP3, WebM, OGG, M4A, etc.
    """
    if not file:
        raise HTTPException(status_code=400, detail="Audio file must be provided")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty")

    # Max 25MB audio file
    if len(file_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file exceeds 25MB size limit")

    try:
        result = voice_service.transcribe_audio_bytes(
            file_bytes=file_bytes,
            original_filename=file.filename or "recording.wav"
        )
        return TranscribeResponse(
            text=result["text"],
            language=result["language"],
            duration=result["duration"]
        )
    except Exception as e:
        logger.error(f"Whisper transcription error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to transcribe audio: {str(e)}")

@router.post("/speak")
def synthesize_speech(request: SynthesizeRequest):
    """
    Convert text into speech MP3 audio using gTTS.
    Returns audio/mpeg stream for browser playback.
    """
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        audio_bytes = voice_service.synthesize_speech(text=text, lang=request.lang)
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": 'inline; filename="response.mp3"',
                "Content-Length": str(len(audio_bytes)),
                "Cache-Control": "no-cache"
            }
        )
    except Exception as e:
        logger.error(f"gTTS speech synthesis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to synthesize speech: {str(e)}")

