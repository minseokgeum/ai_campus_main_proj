#!/bin/zsh
# 나은 맥 원본 → 이 폴더로 다시 복사(FILES.json 목록 기준). 바뀐 파일만 알려 준다.
cd "$(dirname "$0")"
~/4Digit/.venv/bin/python - <<'PY'
import json, shutil, pathlib, filecmp
here = pathlib.Path(".").resolve(); n = 0
for m in json.load(open("FILES.json")):
    src = pathlib.Path(m["src"]).expanduser(); dst = here / m["dst"]
    if not src.exists(): print("원본 없음:", m["src"]); continue
    if dst.exists() and filecmp.cmp(src, dst, shallow=False): continue
    dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src, dst); n += 1; print("바뀜:", m["dst"])
print(f"다시 맞춤 {n}개")
PY
