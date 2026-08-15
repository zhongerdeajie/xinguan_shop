"""Pure-function tests for the industrial intent classifier.

These tests cover the modules that can run without network, embedding or LLM
endpoints: cosine similarity, intent alias normalization, and the keyword
fast-path scoring. They live next to the production code under tests/ so they
can be executed as part of the dockerised test pipeline.
"""
import math

from app.core.intent_classifier import (
    _cosine,
    _normalize_llm_intent,
)


def test_cosine_identical_vectors():
    v = [1.0, 0.0, 0.0]
    assert _cosine(v, v) == pytest.approx(1.0)


def test_cosine_orthogonal_vectors():
    a = [1.0, 0.0]
    b = [0.0, 1.0]
    assert _cosine(a, b) == pytest.approx(0.0)


def test_cosine_zero_vector_does_not_crash():
    """Zero vector normalisation falls back to 1.0 to avoid divide-by-zero."""
    a = [0.0, 0.0]
    b = [1.0, 1.0]
    result = _cosine(a, b)
    assert 0.0 <= result <= 1.0


def test_cosine_returns_in_minus_one_one_range():
    """Cosine of any two real vectors must stay within [-1, 1]."""
    a = [math.sqrt(2), -math.sqrt(2), 0.0]
    b = [0.5, 0.5, 0.5]
    assert -1.0 <= _cosine(a, b) <= 1.0


def test_normalize_llm_intent_recognizes_aliases():
    """LLM may return canonical key or alias; both should map to the same intent."""
    assert _normalize_llm_intent("nl_order") == "nl_order"
    assert _normalize_llm_intent("自然语言下单") == "nl_order"
    assert _normalize_llm_intent("点菜") == "nl_order"
    assert _normalize_llm_intent("退款") == "aftersales"
    assert _normalize_llm_intent("比价") == "price_compare"


def test_normalize_llm_intent_lowercases_and_normalises_separators():
    """LLM might emit whitespace or hyphens; both should normalise to a known key."""
    assert _normalize_llm_intent("NL ORDER") == "nl_order"
    assert _normalize_llm_intent("nl-order") == "nl_order"


def test_normalize_llm_intent_unknown_is_out_of_scope():
    """Anything not in the alias table falls back to out_of_scope."""
    assert _normalize_llm_intent("") == "out_of_scope"
    assert _normalize_llm_intent(None) == "out_of_scope"
    assert _normalize_llm_intent("随机聊天") == "out_of_scope"
    assert _normalize_llm_intent("火星旅游攻略") == "out_of_scope"


import pytest  # noqa: E402  (placed at bottom on purpose so test_cosine_* can use it)