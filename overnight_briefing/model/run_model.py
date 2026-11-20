"""서버 일정(cron)이 model_live.ipynb의 단계를 부르는 실행기. 처리 코드는 모두 노트북에 있다.

사용: python run_model.py <단계> [YYYYMMDD]
  단계: bootstrap(처음 자료 받기) · bootstrap_rest(NXT·시장·공시만 다시) · save_boot(처음 자료를 DB에) · morning0730 · morning0811 · open · close
노트북에서 'run-skip' 표시가 붙은 칸(손으로 돌리는 예시)은 건너뛴다.
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
os.chdir(HERE)
os.environ.setdefault('MODEL_DIR', str(HERE))
nb = json.loads((HERE / 'model_live.ipynb').read_text(encoding='utf-8'))
g = {'__name__': 'model_live'}
for c in nb['cells']:
    if c['cell_type'] == 'code' and 'run-skip' not in c.get('metadata', {}).get('tags', []):
        exec(compile(''.join(c['source']), 'model_live.ipynb', 'exec'), g)
g['run_step'](sys.argv[1], *(sys.argv[2:3]))
