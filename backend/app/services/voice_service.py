import os
import re
import io
import shutil
import tempfile
import logging
from typing import Optional, Dict, Any
import whisper
from gtts import gTTS
import imageio_ffmpeg
from app.config import settings

logger = logging.getLogger("askmate.voice")

# Ensure imageio-ffmpeg binary is accessible in system PATH for Whisper
def _setup_ffmpeg_path():
    try:
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        dir_path = os.path.dirname(exe)
        target = os.path.join(dir_path, "ffmpeg.exe" if os.name == "nt" else "ffmpeg")
        if not os.path.exists(target):
            shutil.copyfile(exe, target)
        if dir_path not in os.environ.get("PATH", ""):
            os.environ["PATH"] = dir_path + os.pathsep + os.environ.get("PATH", "")
        logger.info(f"FFmpeg configured at: {target}")
    except Exception as e:
        logger.warning(f"Could not auto-configure imageio-ffmpeg PATH: {e}")

_setup_ffmpeg_path()

class VoiceService:
    """
    Speech-to-Text using OpenAI Whisper and Text-to-Speech using Google Text-to-Speech (gTTS).
    """

    def __init__(self, model_name: str = "tiny"):
        self.model_name = model_name
        self._whisper_model: Optional[whisper.Whisper] = None

    def _get_whisper_model(self) -> whisper.Whisper:
        """Lazy load Whisper model."""
        if self._whisper_model is None:
            logger.info(f"Loading Whisper model '{self.model_name}'...")
            _setup_ffmpeg_path()
            self._whisper_model = whisper.load_model(self.model_name)
            logger.info("Whisper model loaded successfully.")
        return self._whisper_model

    def transcribe_audio_file(self, file_path: str) -> Dict[str, Any]:
        """
        Transcribe an audio file on disk using Whisper.
        Returns:
            {"text": str, "language": str, "duration": float}
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Audio file not found: {file_path}")

        model = self._get_whisper_model()
        logger.info(f"Transcribing audio file: {file_path}")
        result = model.transcribe(file_path, fp16=False)

        text = result.get("text", "").strip()
        language = result.get("language", "en")

        # Estimate duration from segments
        duration = 0.0
        segments = result.get("segments", [])
        if segments:
            duration = round(float(segments[-1].get("end", 0.0)), 2)

        logger.info(f"Whisper transcription complete: '{text[:50]}...' (lang: {language})")
        return {
            "text": text,
            "language": language,
            "duration": duration
        }

    def transcribe_audio_bytes(self, file_bytes: bytes, original_filename: str = "audio.wav") -> Dict[str, Any]:
        """
        Write audio bytes to a temporary file and transcribe with Whisper.
        """
        ext = os.path.splitext(original_filename)[1].lower() or ".wav"
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp_path = tmp.name
            tmp.write(file_bytes)

        try:
            return self.transcribe_audio_file(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception as e:
                    logger.warning(f"Failed to remove temporary audio file '{tmp_path}': {e}")

    def clean_text_for_speech(self, text: str) -> str:
        """Strip markdown markers and citations for smooth TTS playback."""
        clean = re.sub(r"\[Document:.*?\]", "", text)
        clean = re.sub(r"\[Source:.*?\]", "", clean)
        clean = re.sub(r"#{1,6}\s*", "", clean)  # headings
        clean = re.sub(r"\*\*([^*]+)\*\*", r"\1", clean)  # bold
        clean = re.sub(r"\*([^*]+)\*", r"\1", clean)  # italics
        clean = re.sub(r"`([^`]+)`", r"\1", clean)  # inline code
        clean = re.sub(r"```.*?```", "code block omitted", clean, flags=re.DOTALL)
        clean = re.sub(r"\n+", " ", clean).strip()
        return clean or text

    def synthesize_speech(self, text: str, lang: str = "en") -> bytes:
        """
        Convert text into speech MP3 bytes using gTTS.
        """
        clean_text = self.clean_text_for_speech(text)
        if not clean_text:
            clean_text = "I have no response to speak."

        # Limit text length to avoid extremely long audio synthesis
        if len(clean_text) > 3000:
            clean_text = clean_text[:3000] + "... Response truncated for audio playback."

        logger.info(f"Synthesizing speech for {len(clean_text)} characters with lang '{lang}'...")
        tts = gTTS(text=clean_text, lang=lang, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        return buf.getvalue()

voice_service = VoiceService()

