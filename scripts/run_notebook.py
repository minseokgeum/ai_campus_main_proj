"""노트북을 화면 없이 돌린다(예약 실행용). 노트북 파일은 고치지 않는다.

코드 셀을 차례로 실행하되, 실행 스위치(예: RUN_COLLECT)를 정하는 셀까지만 돈다(그 뒤 셀은 결과 보기·시험용).
스위치 값은 --set으로 바꾼다. 작업 폴더는 노트북 폴더(노트북의 ROOT = Path.cwd() 규칙).

    python scripts/run_notebook.py news_search/news_collect.ipynb --set RUN_COLLECT=True
    python scripts/run_notebook.py news_search/news_process.ipynb --set WATCH_RUN=True

외부 요청은 노트북 코드가 보내는 것뿐이다. 표준 라이브러리만 쓴다.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path


def code_cells(nb_path: Path, sets: dict[str, str]) -> list[str]:
    cells = [''.join(c['source']) for c in json.loads(nb_path.read_text(encoding='utf-8'))['cells'] if c['cell_type'] == 'code']
    out, hit = [], set()
    for src in cells:
        lines = [l for l in src.splitlines() if not re.match(r'\s*[%!]', l)]   # 매직 명령은 뺀다
        for name, value in sets.items():
            pat = re.compile(rf'^{re.escape(name)}\s*=\s*[^#\n]*')
            for i, l in enumerate(lines):
                if pat.match(l):
                    lines[i] = pat.sub(f'{name} = {value}', l, count=1)
                    hit.add(name)
        out.append('\n'.join(lines))
        if sets and hit == set(sets):        # 스위치를 모두 정한 셀까지만
            return out
    missing = set(sets) - hit
    if missing:
        sys.exit(f'노트북에서 스위치를 못 찾음: {sorted(missing)}')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('notebook')
    ap.add_argument('--set', action='append', default=[], metavar='NAME=VALUE')
    a = ap.parse_args()
    nb = Path(a.notebook).resolve()
    sets = dict(s.split('=', 1) for s in a.set)
    cells = code_cells(nb, sets)
    os.chdir(nb.parent)
    sys.stdout.reconfigure(line_buffering=True)
    ns = {'__name__': '__main__', 'display': lambda *x, **k: print(*x)}
    for i, src in enumerate(cells):
        exec(compile(src, f'{nb.name}[code {i}]', 'exec'), ns)


if __name__ == '__main__':
    main()
