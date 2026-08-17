import re
import json
from pathlib import Path

def sanitize_text(text: str) -> str:
    if not isinstance(text, str):
        return text
    if text.startswith("http"):
        return text
    # Replace colons with comma or period
    text = text.replace(":", ",")
    # Replace dashes
    text = text.replace("—", ",")
    text = text.replace("–", ",")
    text = re.sub(r"\s+-\s+", ", ", text)
    text = text.replace(" → ", " дает ")
    text = text.replace("->", " дает ")
    # Fix double commas
    text = re.sub(r",\s*,+", ",", text)
    return text

def sanitize_obj(obj):
    if isinstance(obj, str):
        return sanitize_text(obj)
    elif isinstance(obj, list):
        return [sanitize_obj(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: sanitize_obj(v) for k, v in obj.items()}
    return obj

lessons_dir = Path("tools/content_upload/generated_lessons")
for f in sorted(lessons_dir.glob("*.json")):
    data = json.loads(f.read_text(encoding="utf-8"))
    sanitized = sanitize_obj(data)
    f.write_text(json.dumps(sanitized, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Sanitized:", f.name)

print("All lessons sanitized.")
