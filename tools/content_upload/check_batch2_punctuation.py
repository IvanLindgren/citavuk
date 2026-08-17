import glob
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

forbidden_chars = [":", "—", "–"]
issues = []

for f in sorted(glob.glob("tools/content_upload/generated_lessons_batch2/*.json")):
    data = json.loads(Path(f).read_text(encoding="utf-8"))
    
    def check_obj(obj, path=""):
        if isinstance(obj, str):
            if obj.startswith("http"):
                return
            for char in forbidden_chars:
                if char in obj:
                    issues.append(f"Found '{char}' in {f} at {path}: {obj}")
            if " - " in obj:
                issues.append(f"Found ' - ' in {f} at {path}: {obj}")
        elif isinstance(obj, list):
            for i, it in enumerate(obj):
                check_obj(it, f"{path}[{i}]")
        elif isinstance(obj, dict):
            for k, v in obj.items():
                check_obj(v, f"{path}.{k}")

    check_obj(data)

if issues:
    print(f"Total issues found: {len(issues)}")
    for issue in issues:
        print(issue)
else:
    print("ALL CLEAN: No colons, dashes or forbidden characters in batch 2 lessons!")
