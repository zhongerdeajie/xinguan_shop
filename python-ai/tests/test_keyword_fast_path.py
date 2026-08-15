# -*- coding: utf-8 -*-
"""Smoke tests for the keyword fast-path entry point."""
from app.core.intent_classifier import _keyword_fast_path


def test_returns_none_for_message_with_no_keywords():
    """A message without strong keywords must fall through (return None)."""
    intent = _keyword_fast_path("xyz_no_keyword_xyz")
    assert intent is None


def test_merchant_role_short_circuits_to_marketing_with_full_confidence():
    """Merchant role always takes the keyword path and returns marketing."""
    intent = _keyword_fast_path("xyz_no_keyword_xyz", role="merchant")
    assert intent is not None
    intent_name, confidence = intent
    assert intent_name == "marketing"
    assert confidence == 1.0


def test_default_role_uses_user():
    """When role is omitted the default is 'user' (no short-circuit)."""
    intent = _keyword_fast_path("xyz_no_keyword_xyz")
    assert intent is None