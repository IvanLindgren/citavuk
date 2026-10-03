"""Проверяет публичные параметры в AOT-сборке, не печатая их значения."""
import argparse
import os
from pathlib import Path


def contains_value(data: bytes, value: str) -> bool:
    return any(value.encode(encoding) in data for encoding in ("utf-8", "utf-16le", "utf-16be"))


def verify(root: Path, names: list[str]) -> None:
    values = {name: os.environ.get(name, "").strip() for name in names}
    if any(not value for value in values.values()):
        raise ValueError("Не задан публичный параметр сборки")
    if not root.exists():
        raise ValueError("Каталог сборки не найден")
    found: set[str] = set()
    files = [root] if root.is_file() else root.rglob("*")
    for path in files:
        if not path.is_file() or path.is_symlink():
            continue
        # Ищем в фактических AOT-бинарниках. Generated.xcconfig не доказывает,
        # что define попал в приложение. Framework/Versions/A обходится напрямую.
        if path.suffix not in (".so", ".dll", "", ".exe"):
            continue
        data = path.read_bytes()
        for name, value in values.items():
            if name not in found and contains_value(data, value):
                found.add(name)
                print(f"{name}: найден в {path}")
        if len(found) == len(values):
            return
    missing = ", ".join(name for name in values if name not in found)
    raise ValueError(f"В AOT-сборке отсутствуют параметры: {missing}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("names", nargs="+")
    args = parser.parse_args()
    verify(args.root, args.names)
