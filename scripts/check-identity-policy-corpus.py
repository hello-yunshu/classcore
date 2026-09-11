from __future__ import annotations
from pathlib import Path
import json
import sys
from lib.identity_policy import find_private_identity_violations

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "config" / "private-identity-mutation-corpus.json"

def main() -> int:
    data = json.loads(CORPUS.read_text(encoding="utf-8"))
    results = []
    failed = False
    for case in data.get("cases", []):
        violations = find_private_identity_violations(case.get("value"))
        valid = len(violations) == 0
        expected = bool(case.get("valid"))
        results.append({"id": case.get("id"), "valid": valid, "expected": expected, "violations": violations})
        if valid != expected:
            failed = True
    print(json.dumps(results, ensure_ascii=False))
    return 1 if failed else 0

if __name__ == "__main__":
    raise SystemExit(main())
