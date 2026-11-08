import pytest
from app.services.classifier_service import classifier_service

def test_classifier_categories():
    assert len(classifier_service.CATEGORIES) == 4
    assert "Document Question" in classifier_service.CATEGORIES
    assert "Summarization" in classifier_service.CATEGORIES
    assert "General Question" in classifier_service.CATEGORIES
    assert "Clarification Required" in classifier_service.CATEGORIES

def test_classify_document_question():
    res = classifier_service.classify_query("What does the uploaded PDF say about the refund policy?")
    assert res["predicted_category"] == "Document Question"
    assert res["confidence"] > 0.30
    assert "probabilities" in res

def test_classify_summarization():
    res = classifier_service.classify_query("Please give me an executive summary of the document")
    assert res["predicted_category"] == "Summarization"
    assert res["confidence"] > 0.30

def test_classify_general_question():
    res = classifier_service.classify_query("Write a Python function to sort a list of numbers")
    assert res["predicted_category"] == "General Question"
    assert res["confidence"] > 0.30

def test_classify_clarification_required():
    res = classifier_service.classify_query("Explain that in more detail")
    assert res["predicted_category"] == "Clarification Required"
    assert res["confidence"] > 0.30

def test_classify_empty_query():
    res = classifier_service.classify_query("   ")
    assert res["predicted_category"] == "Clarification Required"
    assert res["is_confident"] is True

