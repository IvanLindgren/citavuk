import glob
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

files = sorted(glob.glob("tools/content_upload/generated_lessons_batch2/*.json"))
print(f"Uploading {len(files)} batch 2 lessons...")

success = 0
for f in files:
    cmd = [
        sys.executable,
        "tools/content_upload/upload_lesson.py",
        f,
        "--publish",
        "public",
        "--approve"
    ]
    res = subprocess.run(cmd, capture_output=True, text=False)
    stdout = res.stdout.decode("utf-8", errors="replace") if res.stdout else ""
    stderr = res.stderr.decode("utf-8", errors="replace") if res.stderr else ""
    if res.returncode == 0:
        print(f"SUCCESS: {Path(f).name}")
        for line in stdout.strip().splitlines():
            print(" ", line)
        success += 1
    else:
        print(f"FAILED: {Path(f).name}")
        print(stdout)
        print(stderr)

print(f"\nUploaded and approved: {success}/{len(files)} batch 2 lessons.")
