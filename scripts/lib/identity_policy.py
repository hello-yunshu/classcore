from __future__ import annotations
from pathlib import Path
import html
import json
import re
from typing import Any
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT / "config" / "private-identity-policy.json"


def load_identity_policy() -> dict[str, Any]:
    with POLICY_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


IDENTITY_POLICY = load_identity_policy()
PRIVATE_IDENTITY_FIELD_NAMES = frozenset(IDENTITY_POLICY["privateFieldNames"])
PRIVATE_PARTICIPANT_REFERENCE_PREFIXES = tuple(IDENTITY_POLICY["participantReferencePrefixes"])
_PREFIX_WORDS = [re.escape(prefix[:-1]) for prefix in PRIVATE_PARTICIPANT_REFERENCE_PREFIXES]
_PRIVATE_REFERENCE_PATTERN = re.compile(r"(?:" + "|".join(_PREFIX_WORDS) + r"):[A-Za-z0-9][A-Za-z0-9._:-]*", re.IGNORECASE)


def is_private_identity_field_name(key: str) -> bool:
    return key in PRIVATE_IDENTITY_FIELD_NAMES


def _decode_identity_layer(value: str) -> str:
    out = html.unescape(value)
    out = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), out)
    out = re.sub(r"\\x([0-9a-fA-F]{2})", lambda m: chr(int(m.group(1), 16)), out)
    try:
        out = unquote(out)
    except Exception:
        pass
    return out


def identity_text_variants(value: str, max_layers: int = 5) -> list[str]:
    if not isinstance(value, str):
        return []
    variants = [value]
    current = value
    for _ in range(max_layers):
        nxt = _decode_identity_layer(current)
        if nxt == current or nxt in variants:
            break
        variants.append(nxt)
        current = nxt
    return variants


def is_private_participant_reference(value: str) -> bool:
    return isinstance(value, str) and any(_PRIVATE_REFERENCE_PATTERN.search(candidate) for candidate in identity_text_variants(value))


def find_private_identity_violations(value: Any, path_label: str = "$") -> list[dict[str, str]]:
    out: list[dict[str, str]] = []

    def visit(current: Any, current_path: str) -> None:
        if isinstance(current, str):
            if is_private_participant_reference(current):
                out.append({"kind": "reference", "path": current_path, "value": current})
            return
        if isinstance(current, list):
            for index, item in enumerate(current):
                visit(item, f"{current_path}[{index}]")
            return
        if not isinstance(current, dict):
            return
        for key, item in current.items():
            key_text = str(key)
            child_path = f"{current_path}.{key_text}"
            if is_private_identity_field_name(key_text):
                out.append({"kind": "field", "path": child_path, "value": key_text})
            if is_private_participant_reference(key_text):
                out.append({"kind": "reference", "path": child_path, "value": key_text})
            visit(item, child_path)

    visit(value, path_label)
    return out
