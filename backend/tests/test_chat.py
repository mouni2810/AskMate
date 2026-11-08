from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app

def test_chat_empty_message_validation():
    with TestClient(app) as client:
        response = client.post("/api/chat", json={"message": ""})
        assert response.status_code in [400, 422]

def test_chat_without_api_key():
    with TestClient(app) as client:
        with patch("app.routes.chat.gemini_service.is_configured", return_value=False), \
             patch("app.routes.chat.rag_service.search_similar_chunks", return_value=[]):
            response = client.post("/api/chat", json={"message": "Hello AskMate!"})
            assert response.status_code == 200
            data = response.json()
            assert "response" in data
            assert "Gemini API key is not configured" in data["response"]
            assert data["sources"] == []
            assert data["intent_category"] == "General Question"

def test_chat_with_mocked_gemini():
    with TestClient(app) as client:
        with patch("app.routes.chat.gemini_service.chat_conversation", return_value="Hello! I am AskMate, your AI Knowledge Assistant."), \
             patch("app.routes.chat.rag_service.search_similar_chunks", return_value=[]):

            payload = {
                "message": "What can you help me with?",
                "conversation_history": [
                    {"role": "user", "content": "Hi"},
                    {"role": "assistant", "content": "Hello! How can I assist you?"}
                ]
            }

            response = client.post("/api/chat", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data["response"] == "Hello! I am AskMate, your AI Knowledge Assistant."
            assert data["tool_used"] == "general_response"
