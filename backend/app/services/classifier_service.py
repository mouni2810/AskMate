import os
import logging
from typing import Tuple, Dict, Any, List
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

logger = logging.getLogger("askmate.classifier")

# Labeled training dataset for query classification (Feature 7)
TRAINING_SAMPLES = [
    # Document Question
    ("What are the 14 leadership principles?", "Document Question"),
    ("What does the uploaded PDF say about refund policy?", "Document Question"),
    ("Who is the author of this report?", "Document Question"),
    ("What is the propulsion efficiency rating in Apollo?", "Document Question"),
    ("What are the security rules outlined in the document?", "Document Question"),
    ("What is the operating temperature of the cryogenic subsystem?", "Document Question"),
    ("What does section 3 of the document state?", "Document Question"),
    ("Explain the architecture described in the uploaded file", "Document Question"),
    ("What is the penalty for policy violation in the guidelines?", "Document Question"),
    ("What are the terms of service mentioned in the PDF?", "Document Question"),
    ("According to page 4, what are the key findings?", "Document Question"),
    ("What does the document say about data sovereignty?", "Document Question"),
    ("What is the budget mentioned in the document?", "Document Question"),
    ("What does the document say about multi-region failover?", "Document Question"),
    ("Find information about data encryption in the document", "Document Question"),
    ("What are the guidelines for remote work in the policy?", "Document Question"),
    ("What are the performance metrics listed in the report?", "Document Question"),
    ("Does the document mention ISO 27001 compliance?", "Document Question"),
    ("What is the deadline mentioned on page 2?", "Document Question"),
    ("What does the document say about intellectual property?", "Document Question"),

    # Summarization
    ("Summarize the uploaded document", "Summarization"),
    ("Give me an executive summary of the PDF", "Summarization"),
    ("Provide a detailed summary of the document", "Summarization"),
    ("What are the key points and takeaways from the document?", "Summarization"),
    ("Can you summarize page 1 and page 2?", "Summarization"),
    ("Give me a high-level overview of the document", "Summarization"),
    ("Summarize this paper with bullet points", "Summarization"),
    ("Extract the main insights and summarize the report", "Summarization"),
    ("Provide core takeaways from the uploaded file", "Summarization"),
    ("Short summary of the file please", "Summarization"),
    ("Give me a comprehensive breakdown of the entire document", "Summarization"),
    ("Summarize the leadership principles document", "Summarization"),
    ("Briefly summarize what this document is about", "Summarization"),
    ("Can I get a summary of the technical report?", "Summarization"),
    ("Condense this document into key points", "Summarization"),
    ("Give me a synopsis of the document", "Summarization"),
    ("Summary please", "Summarization"),
    ("Summarize all findings", "Summarization"),

    # General Question
    ("Hello, how are you today?", "General Question"),
    ("Hi there, who are you?", "General Question"),
    ("Write a Python function to reverse a linked list", "General Question"),
    ("What is the distance between the Earth and the Moon?", "General Question"),
    ("How does quantum computing differ from classical computing?", "General Question"),
    ("What is the capital city of Australia?", "General Question"),
    ("Explain the difference between SQL and NoSQL databases", "General Question"),
    ("Can you write a poem about artificial intelligence?", "General Question"),
    ("What are the best practices in AI Engineering in 2026?", "General Question"),
    ("How do transformers work in deep learning?", "General Question"),
    ("Solve this equation: 3x + 12 = 48", "General Question"),
    ("What is Newton's third law of motion?", "General Question"),
    ("Write a JavaScript code snippet to debounce an input", "General Question"),
    ("Good morning, what can you do for me?", "General Question"),
    ("Tell me a funny programming joke", "General Question"),
    ("What is Docker and why is containerization used?", "General Question"),
    ("Explain recursion to a beginner", "General Question"),

    # Clarification Required
    ("Explain that in more detail", "Clarification Required"),
    ("Can you elaborate on that?", "Clarification Required"),
    ("What does that mean?", "Clarification Required"),
    ("Tell me more about it", "Clarification Required"),
    ("Why did that happen?", "Clarification Required"),
    ("What else?", "Clarification Required"),
    ("Can you give more details?", "Clarification Required"),
    ("Why is that?", "Clarification Required"),
    ("What does it say?", "Clarification Required"),
    ("Explain it", "Clarification Required"),
    ("Tell me about it", "Clarification Required"),
    ("What is it?", "Clarification Required"),
    ("How so?", "Clarification Required"),
    ("More details please", "Clarification Required"),
    ("Elaborate please", "Clarification Required"),
    ("Continue", "Clarification Required"),
    ("Why?", "Clarification Required"),
    ("How?", "Clarification Required"),
    ("Explain please", "Clarification Required"),
]

class QueryClassifierService:
    """
    Scikit-learn Query Classifier using TF-IDF and Logistic Regression.
    Classifies user queries into:
    - Document Question
    - Summarization
    - General Question
    - Clarification Required
    """

    CATEGORIES = [
        "Document Question",
        "Summarization",
        "General Question",
        "Clarification Required"
    ]

    def __init__(self, confidence_threshold: float = 0.35):
        self.confidence_threshold = confidence_threshold
        self._pipeline: Pipeline = None
        self._train_model()

    def _train_model(self):
        """Train TF-IDF + Logistic Regression pipeline."""
        X = [sample[0] for sample in TRAINING_SAMPLES]
        y = [sample[1] for sample in TRAINING_SAMPLES]

        self._pipeline = Pipeline([
            ("tfidf", TfidfVectorizer(
                ngram_range=(1, 2),
                lowercase=True,
                strip_accents="unicode",
                sublinear_tf=True
            )),
            ("clf", LogisticRegression(
                C=2.0,
                max_iter=300,
                class_weight="balanced",
                random_state=42
            ))
        ])

        self._pipeline.fit(X, y)
        logger.info(f"Query Classifier trained with {len(X)} samples across {len(self.CATEGORIES)} categories.")

    def classify_query(self, query: str) -> Dict[str, Any]:
        """
        Classify user query and return prediction with confidence and probability distribution.
        Returns:
            {
                "predicted_category": str,
                "confidence": float,
                "is_confident": bool,
                "probabilities": Dict[str, float]
            }
        """
        q_clean = query.strip()
        if not q_clean:
            return {
                "predicted_category": "Clarification Required",
                "confidence": 1.0,
                "is_confident": True,
                "probabilities": {cat: 0.0 for cat in self.CATEGORIES}
            }

        probs = self._pipeline.predict_proba([q_clean])[0]
        classes = self._pipeline.classes_

        class_probs = {cls_name: round(float(prob), 4) for cls_name, prob in zip(classes, probs)}
        best_idx = probs.argmax()
        predicted_category = str(classes[best_idx])
        confidence = round(float(probs[best_idx]), 4)
        is_confident = confidence >= self.confidence_threshold

        logger.debug(f"Query: '{q_clean[:40]}' -> {predicted_category} (confidence: {confidence:.2f})")

        return {
            "predicted_category": predicted_category,
            "confidence": confidence,
            "is_confident": is_confident,
            "probabilities": class_probs
        }

classifier_service = QueryClassifierService()

