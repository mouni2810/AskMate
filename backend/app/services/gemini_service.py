import os
import logging
from typing import List, Optional, Dict, Any
from pathlib import Path
from google import genai
from google.genai import types
from app.config import settings, BASE_DIR

logger = logging.getLogger("askmate.gemini")

# Priority list of models to try if the default model is busy or unavailable
FALLBACK_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
]

class GeminiService:
    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        self._custom_key = api_key
        self._custom_model = model_name
        self._client: Optional[genai.Client] = None
        self._last_loaded_key: Optional[str] = None

    def get_api_key(self) -> str:
        """Dynamically resolve the Gemini API key from environment, settings, or .env file."""
        if self._custom_key:
            return self._custom_key.strip()

        # 1. Check settings / environment
        key = (
            settings.GEMINI_API_KEY
            or os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
            or ""
        ).strip()

        # 2. If empty, check .env file directly (handles live edits without server restart)
        if not key or len(key) < 5:
            env_file = BASE_DIR / ".env"
            if env_file.exists():
                try:
                    for line in env_file.read_text(encoding="utf-8").splitlines():
                        line = line.strip()
                        if line.startswith("GEMINI_API_KEY=") and not line.startswith("#"):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            if len(val) > 5:
                                key = val
                                break
                except Exception as e:
                    logger.warning(f"Could not read .env dynamically: {e}")

        return key

    def is_configured(self) -> bool:
        """Check if a valid Gemini API key is configured."""
        key = self.get_api_key()
        return bool(key and len(key) > 5)

    def _get_client(self) -> genai.Client:
        """Lazily initialize and return the google.genai Client."""
        key = self.get_api_key()
        if not key or len(key) <= 5:
            raise ValueError(
                "Gemini API key is not configured. Please set GEMINI_API_KEY in backend/.env"
            )

        # Invalidate client if key was updated
        if self._client is None or self._last_loaded_key != key:
            self._client = genai.Client(api_key=key)
            self._last_loaded_key = key

        return self._client

    def _get_candidate_models(self) -> List[str]:
        """Return ordered list of models to try."""
        primary = self._custom_model or settings.DEFAULT_GEMINI_MODEL or "gemini-3.5-flash"
        models = [primary]
        for m in FALLBACK_MODELS:
            if m not in models:
                models.append(m)
        return models

    def generate_response(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> str:
        """Generate a response using Gemini with automatic model fallback."""
        if not self.is_configured():
            return (
                "⚠️ Gemini API key is not configured. Please add your `GEMINI_API_KEY` "
                "to `backend/.env` to enable live AI responses."
            )

        client = self._get_client()
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            system_instruction=system_instruction
        )

        last_error = None
        for model in self._get_candidate_models():
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=config
                )
                if response and response.text:
                    return response.text.strip()
            except Exception as e:
                logger.warning(f"Gemini model {model} attempt failed: {e}. Trying fallback...")
                last_error = e

        return f"Error from Gemini API: {str(last_error)}"

    def chat_conversation(
        self,
        message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
    ) -> str:
        """
        Conduct a multi-turn conversation preserving context with automatic model fallback.
        """
        if not self.is_configured():
            return (
                "⚠️ Gemini API key is not configured. Please set `GEMINI_API_KEY` "
                "in your `backend/.env` file to chat with AskMate."
            )

        client = self._get_client()
        sys_prompt = system_instruction or (
            "You are AskMate, an intelligent, helpful, and concise AI knowledge assistant. "
            "Provide clear, professional, well-structured, and helpful answers. "
            "Format code snippets using markdown backticks and lists with clear bullet points."
        )

        # Build multi-turn contents list for google.genai
        contents = []
        if conversation_history:
            for msg in conversation_history:
                role = msg.get("role")
                content_text = msg.get("content", "").strip()
                if not content_text:
                    continue
                genai_role = "model" if role in ["assistant", "model", "ai"] else "user"
                contents.append(
                    types.Content(
                        role=genai_role,
                        parts=[types.Part.from_text(text=content_text)]
                    )
                )

        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=message)]
            )
        )

        config = types.GenerateContentConfig(
            temperature=temperature,
            system_instruction=sys_prompt
        )

        last_error = None
        for model in self._get_candidate_models():
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config
                )
                if response and response.text:
                    return response.text.strip()
            except Exception as e:
                logger.warning(f"Chat model {model} attempt failed: {e}. Trying fallback...")
                last_error = e

        return f"Error communicating with Gemini: {str(last_error)}"

# Singleton instance
gemini_service = GeminiService()
