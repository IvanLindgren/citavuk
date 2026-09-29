"""One-time editorial draft generation; never invoked by the game/server.

Run on the operator host with -env /opt/citavuk/.env and an explicit output.
At most 12 requests, resumable, no automatic paid retries, no secret output.
"""
import argparse
import concurrent.futures
import json
from pathlib import Path
import re
import urllib.request

LEVELS = {
    "A1": "4–10 words. Basic concrete vocabulary, present tense, simple questions and negation. No subordinate clauses.",
    "A2": "7–16 words. Everyday situations, past/future tense, common comparisons, simple because/when/if clauses.",
    "B1": "12–24 words. Connected everyday speech, relative clauses, conditionals, reported speech. Avoid literary abstraction.",
    "B2": "16–30 words. Nuanced argument, concession, passive voice, workplace/cultural/social issues, some natural idioms.",
    "C1": "20–36 words. Nuanced idiomatic speech and prose, implicit meaning, register and complex syntax; not all academic prose.",
    "C2": "24–42 words. Subtle irony, ambiguity, idioms, stylistic contrast; varied literary/journalistic/conversational contexts, natural rather than artificially obscure.",
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-env", required=True)
    parser.add_argument("-out", required=True)
    parser.add_argument("-only", default="", help="Comma-separated direction/level pairs for an explicit repair run")
    args = parser.parse_args()
    env = dict(line.split("=", 1) for line in Path(args.env).read_text().splitlines()
               if line and not line.startswith("#") and "=" in line)
    key = env.get("POLZA_AI_KEY", "").strip().strip("\"'")
    if not key:
        raise SystemExit("Missing configured provider key")
    root = Path(args.out)
    root.mkdir(parents=True, exist_ok=True)

    def generate(direction, level):
        path = root / direction / (level + ".json")
        if path.exists():
            print(direction, level, "already saved", flush=True)
            return
        language = "natural Serbian, Latin script with č ć đ š ž, ekavian standard" if direction == "sr-ru" else "natural Russian, Cyrillic"
        prompt = (
            f"Create 100 ORIGINAL standalone sentences in {language} for a translation competition, CEFR {level}. "
            f"Level requirements: {LEVELS[level]} "
            "Use many topics: shopping, transport, housing, relationships, hobbies, food, work, health, nature, art, education. "
            "No near-duplicates, no repeated templates with merely changed names/numbers; each sentence must convey a distinct situation. "
            "Vary openings, sentence types, speaker gender and grammatical structures. "
            "Do not translate a pre-existing list, do not quote copyrighted works. "
            "No answers, translations, numbering, headings, markdown, English glosses, instructional placeholders or offensive content. "
            "Review grammar, cases, diacritics and sentence completeness before responding. "
            'Return ONLY JSON {"sentences":["...", "..."]} with exactly 100 different strings.'
        )
        payload = {"model": "deepseek/deepseek-v4-flash-0731",
                   "reasoning": {"effort": "low"}, "max_tokens": 18000,
                   "response_format": {"type": "json_object"},
                   "messages": [{"role": "system", "content": "You are a careful native-language educational content editor."},
                                {"role": "user", "content": prompt}]}
        request = urllib.request.Request("https://api.polza.ai/api/v1/chat/completions",
                    json.dumps(payload).encode(), {"Authorization": "Bearer " + key, "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=360) as response:
            result = json.load(response)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.with_suffix(".response.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        choice = result["choices"][0]
        content = choice["message"].get("content") or ""
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
        sentences = json.loads(content)["sentences"]
        if not isinstance(sentences, list) or not 95 <= len(sentences) <= 110:
            raise ValueError("Unexpected sentence count")
        if any(not isinstance(s, str) or "\n" in s or not 6 <= len(s) <= 550 for s in sentences):
            raise ValueError("Invalid phrase")
        if len(set(s.casefold().strip() for s in sentences)) != len(sentences):
            raise ValueError("Duplicate phrase")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"sentences": sentences, "model": payload["model"],
                      "usage": result.get("usage"), "prompt": prompt}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(direction, level, len(sentences), "phrases", "cost", result.get("usage", {}).get("cost_rub"), flush=True)

    failed = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        selected = set(args.only.split(",")) if args.only else None
        jobs = {executor.submit(generate, direction, level): (direction, level)
                for direction in ("sr-ru", "ru-sr") for level in LEVELS
                if selected is None or direction + "/" + level in selected}
        for future in concurrent.futures.as_completed(jobs):
            try:
                future.result()
            except Exception as exc:
                failed.append(jobs[future])
                print(*jobs[future], "FAILED", type(exc).__name__, flush=True)
    if failed:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
