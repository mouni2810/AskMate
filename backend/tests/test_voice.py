import io
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app

def test_transcribe_empty_file():
    with TestClient(app) as client:
        files = {"file": ("empty.wav", io.BytesIO(b""), "audio/wav")}
        res = client.post("/api/voice/transcribe", files=files)
        assert res.status_code == 400
        assert "empty" in res.json()["detail"].lower()

def test_transcribe_success_mocked():
    with TestClient(app) as client:
        with patch("app.services.voice_service.voice_service.transcribe_audio_bytes") as mock_stt:
            mock_stt.return_value = {
                "text": "What are the leadership principles in the uploaded document?",
                "language": "en",
                "duration": 3.85
            }
            fake_audio = io.BytesIO(b"RIFF....WAVEfmt ....data....")
            files = {"file": ("test_voice.wav", fake_audio, "audio/wav")}
            res = client.post("/api/voice/transcribe", files=files)
            assert res.status_code == 200
            data = res.json()
            assert "leadership principles" in data["text"]
            assert data["language"] == "en"
            assert data["duration"] == 3.85

def test_speak_empty_text():
    with TestClient(app) as client:
        res = client.post("/api/voice/speak", json={"text": "   ", "lang": "en"})
        assert res.status_code == 400
        assert "empty" in res.json()["detail"].lower()

def test_speak_success():
    with TestClient(app) as client:
        with patch("app.services.voice_service.voice_service.synthesize_speech") as mock_tts:
            mock_tts.return_value = b"\xff\xfb\x90\x44fake_mp3_audio_bytes_data"
            res = client.post("/api/voice/speak", json={"text": "Hello, this is AskMate AI.", "lang": "en"})
            assert res.status_code == 200
            assert res.headers["content-type"] == "audio/mpeg"
            assert len(res.content) > 0

