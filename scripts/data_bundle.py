"""팀 구글 드라이브로 공유하는 데이터 묶음을 만들고(pack), 받은 묶음을 제자리에 푼다(place).

git에는 코드·문서·기준 자료만 올리고, 코드가 만든 데이터는 이 묶음으로 공유한다(루트 README "데이터 받기").
묶음(zip) 안의 파일은 저장소 기준 경로 그대로 들어 있고, 파일 목록(MANIFEST.csv: 경로, 크기, SHA-256)과 안내(README.txt)가 함께 있다.
드라이브에는 묶음마다 최신 파일 하나만 둔다(이름 끝의 날짜로 언제 만든 것인지 안다). 그래서 pack은 같은 묶음의 옛 날짜 zip을 저장 위치에서 지우고,
place는 이미 있는 파일도 내용이 다르면 묶음의 것으로 바꾼다.

사용
    python scripts/data_bundle.py list                       # 묶음 종류와 지금 로컬에 있는 용량
    python scripts/data_bundle.py pack                       # 모든 묶음 만들기(기본 저장 위치: ~/Downloads/ai_campus_main_proj_data, 같은 묶음의 옛 zip은 지움)
    python scripts/data_bundle.py pack --only graph_data     # 일부만
    python scripts/data_bundle.py place                      # ~/Downloads(와 그 아래 ai_campus_main_proj_data)에 둔 묶음을 찾아 묶음마다 최신 것을 제자리에 풀기
    python scripts/data_bundle.py place 받은.zip [더.zip ...] # 받은 묶음을 제자리에 풀기
    (place는 이미 있는 파일이 내용이 다르면 묶음의 것으로 바꾸고, 같으면 건너뛴다)

외부 요청은 없다. 표준 라이브러리만 쓴다.
"""
import argparse
import csv
import datetime as dt
import hashlib
import io
import shutil
import sys
import time
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]          # 저장소 루트(이 파일이 scripts/ 안에 있다)
KST = dt.timezone(dt.timedelta(hours=9))

# 묶음: 이름 → 설명, 넣을 폴더(저장소 기준), 뺄 폴더
BUNDLES = {
    'graph_data': dict(
        desc='graph_db/source 전체에서 DART 원문만 뺀 것: DART 파싱 표·사업의 내용(입력·LLM 응답·최종본), 뉴스(거르기·LLM 응답·최종본·DB 스냅샷), '
             '이름 통일·제품 사전·LLM 제품 사전·검색어 결과, Neo4j 표, 대상 기업. 다음 단계부터 이어서 돌리는 데 필요한 것',
        include=['graph_db/source'], exclude=['graph_db/source/dart/raw']),
    'dart_raw': dict(
        desc='DART 원문 다운로드(graph_db/source/dart/raw). DART 파싱(dart_parser, dart_business_parser)부터 다시 돌릴 때만 필요',
        include=['graph_db/source/dart/raw'], exclude=[]),
    'news_search_data': dict(
        desc='밤사이 뉴스 수집·처리(news_search/source): 보고 날짜별 수집 기사·응답 원본·수집 마감 뒤 처리 결과(summary_<표시 시각>, 프롬프트 입력. 11-16까지는 1·2차 처리 결과), '
             '임시 검색어 표(terms), 캐시(임베딩·원문 페이지·이야기). 수집·처리를 이어서 돌리거나 지난 결과를 볼 때',
        include=['news_search/source'], exclude=[]),
    'news_tests': dict(
        desc='뉴스 매체 시험(news_source_tests)과 구글 뉴스 검색 방식 시험(news_search_tests)의 결과와 캐시. 시험 노트북을 요청 없이 다시 볼 때만 필요',
        include=['news_source_tests/google_rss_sources', 'news_source_tests/rss_history', 'news_source_tests/rss_live', 'news_search_tests/source'],
        exclude=[]),
    'backtest_data': dict(
        desc='백테스트 캐시와 결과(backtest/data: KRX API 캐시·분봉 캐시·야후 분봉, backtest/outputs). 백테스트 노트북을 API 요청 없이 다시 돌릴 때',
        include=['backtest/data', 'backtest/outputs'], exclude=[]),
    'creon_1min': dict(
        desc='크레온 KRX 1분봉(stockdata_collection/creon_1min: snapshots 전체 종목·반도체 15종목, probe 조회 범위 점검). 분봉 백테스트에 필요. 윈도우 크레온으로 다시 받으려면 하루 넘게 걸린다',
        include=['stockdata_collection/creon_1min'], exclude=[]),
}
FIND_DIRS = ['~/Downloads', '~/Downloads/ai_campus_main_proj_data']   # place에 zip을 주지 않으면 여기서 찾는다
SKIP_NAMES = {'.DS_Store', '.gitignore', 'collector.lock', 'Thumbs.db'}   # .gitignore는 git이 관리한다
SKIP_DIRS = {'__pycache__', '.ipynb_checkpoints'}
SKIP_DIR_PREFIX = 'backup_'                                       # 작업 전에 로컬에 만든 백업 폴더(예: backup_20261117_before_unify)는 공유하지 않는다
STORED = {'.gz', '.zip', '.parquet', '.png', '.jpg', '.xlsx'}           # 이미 압축된 형식은 다시 압축하지 않는다(시간 절약)


def sha256(path=None, fileobj=None):
    h = hashlib.sha256()
    f = open(path, 'rb') if path else fileobj
    try:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    finally:
        if path:
            f.close()
    return h.hexdigest()


def bundle_files(name):
    """묶음에 넣을 파일(저장소 기준 경로, 정렬). iCloud 사본("이름 2.확장자")으로 보이는 것은 따로 돌려준다."""
    b = BUNDLES[name]
    files, dups = [], []
    for inc in b['include']:
        base = ROOT / inc
        if not base.exists():
            continue
        for p in base.rglob('*'):
            if not p.is_file() or p.name in SKIP_NAMES or SKIP_DIRS & set(p.parts) or any(x.startswith(SKIP_DIR_PREFIX) for x in p.parts):
                continue
            rel = p.relative_to(ROOT).as_posix()
            if any(rel == e or rel.startswith(e + '/') for e in b['exclude']):
                continue
            (dups if ' 2.' in p.name or p.stem.endswith(' 2') else files).append(rel)
    return sorted(files), sorted(dups)


def human(n):
    for unit in ('B', 'KB', 'MB', 'GB'):
        if n < 1024 or unit == 'GB':
            return f'{n:.0f}{unit}' if unit == 'B' else f'{n:.1f}{unit}'
        n /= 1024


def cmd_list(_):
    for name, b in BUNDLES.items():
        files, dups = bundle_files(name)
        size = sum((ROOT / f).stat().st_size for f in files)
        print(f'{name:11} 파일 {len(files):6,}개 {human(size):>8}  {b["desc"]}')
        if dups:
            print(f'{"":11} iCloud 사본으로 보여 뺄 파일 {len(dups)}개: {dups[:3]}')


def cmd_pack(args):
    out = Path(args.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    day = dt.datetime.now(KST).strftime('%Y%m%d')
    names = args.only.split(',') if args.only else list(BUNDLES)
    for name in names:
        files, dups = bundle_files(name)
        if not files:
            print(f'{name}: 넣을 파일이 없어 건너뜀')
            continue
        if dups:
            print(f'{name}: iCloud 사본으로 보이는 파일 {len(dups)}개는 뺀다: {dups[:3]}')
        zpath = out / f'{name}_{day}.zip'                # 같은 날 다시 만들면 덮어쓴다
        rows, total = [], 0
        tmp = zpath.with_suffix('.zip.part')
        with zipfile.ZipFile(tmp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for i, rel in enumerate(files, 1):
                p = ROOT / rel
                data = p.read_bytes()                   # 한 번 읽은 내용으로 목록과 압축을 같이 만든다(수집 중에 바뀌는 파일도 서로 맞게)
                rows.append((rel, len(data), hashlib.sha256(data).hexdigest()))
                total += len(data)
                info = zipfile.ZipInfo(rel, date_time=time.localtime(p.stat().st_mtime)[:6])
                info.compress_type = zipfile.ZIP_STORED if p.suffix.lower() in STORED else zipfile.ZIP_DEFLATED
                zf.writestr(info, data, compresslevel=6)
                if i % 2000 == 0:
                    print(f'  {name}: {i:,}/{len(files):,}')
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(['path', 'size', 'sha256'])
            w.writerows(rows)
            zf.writestr('MANIFEST.csv', buf.getvalue())
            zf.writestr('README.txt', (
                f'묶음: {name} ({day})\n내용: {BUNDLES[name]["desc"]}\n파일 {len(rows):,}개, 원래 크기 {human(total)}\n\n'
                f'압축을 풀지 말고, 저장소 루트에서 아래를 실행하면 제자리(저장소 기준 경로)에 풀린다.\n'
                f'    python scripts/data_bundle.py place <이 파일 경로>\n'
                f'이미 있는 파일은 내용이 다르면 이 묶음의 것으로 바꾸고, 같으면 건너뛴다.\n'))
        tmp.replace(zpath)
        print(f'{name}: {zpath} 파일 {len(rows):,}개, 원래 {human(total)} → 압축 {human(zpath.stat().st_size)}')
        old = [z for z in out.glob(f'{name}_*.zip') if z != zpath and z.stem.rpartition('_')[0] == name]
        for z in old:                                   # 드라이브와 같게 묶음마다 최신 하나만 둔다
            z.unlink()
        if old:
            print(f'  옛 묶음 지움: {", ".join(z.name for z in old)} (드라이브에서도 지우고 새 파일을 올린다)')


def safe_target(root, rel):
    """zip 안 경로가 저장소 밖을 가리키지 않는지 확인한다."""
    pp = PurePosixPath(rel)
    if pp.is_absolute() or '..' in pp.parts:
        raise ValueError(f'잘못된 경로: {rel}')
    return root / Path(*pp.parts)


def find_bundles(dirs=FIND_DIRS):
    """zip 경로를 주지 않았을 때: 정해진 폴더에서 묶음 이름(<묶음>_<날짜>.zip)인 파일을 찾아 묶음마다 가장 최근 날짜 것만 고른다."""
    latest = {}
    for d in dirs:
        d = Path(d).expanduser()
        if not d.is_dir():
            continue
        for zp in d.glob('*.zip'):
            name, _, day = zp.stem.rpartition('_')
            if name in BUNDLES and day.isdigit() and len(day) == 8 and day > latest.get(name, ('', None))[0]:
                latest[name] = (day, zp)
    return [zp for _, zp in sorted(latest.values(), key=lambda v: str(v[1]))]


def cmd_place(args):
    root = Path(args.root).expanduser().resolve() if args.root else ROOT
    zips = args.zips or find_bundles()
    if not zips:
        print('풀 묶음이 없다. 드라이브에서 받은 zip을 ~/Downloads(또는 ~/Downloads/ai_campus_main_proj_data)에 두거나 경로를 직접 준다.')
        return
    if not args.zips:
        print('찾은 묶음(묶음마다 가장 최근 날짜):', ', '.join(str(z) for z in zips))
    for z in zips:
        zp = Path(z).expanduser()
        with zipfile.ZipFile(zp) as zf:
            if 'MANIFEST.csv' not in zf.namelist():
                print(f'{zp.name}: MANIFEST.csv가 없어 이 스크립트로 만든 묶음이 아니다. 건너뜀')
                continue
            manifest = list(csv.DictReader(io.StringIO(zf.read('MANIFEST.csv').decode('utf-8'))))
            new = replaced = same = bad = 0
            for i, m in enumerate(manifest, 1):
                target = safe_target(root, m['path'])
                existed = target.exists()
                if existed and target.stat().st_size == int(m['size']) and sha256(target) == m['sha256']:
                    same += 1
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                tmp = target.with_name(target.name + '.part')
                with zf.open(m['path']) as src, open(tmp, 'wb') as dst:
                    shutil.copyfileobj(src, dst, 1 << 20)
                if sha256(tmp) != m['sha256']:
                    tmp.unlink()
                    bad += 1
                    print(f'  확인 실패(내용이 목록과 다름): {m["path"]}')
                    continue
                tmp.replace(target)                     # 이미 있던 파일은 묶음의 것으로 바뀐다
                if existed:
                    replaced += 1
                else:
                    new += 1
                if i % 2000 == 0:
                    print(f'  {zp.name}: {i:,}/{len(manifest):,}')
            print(f'{zp.name} → {root}: 새로 놓음 {new:,} / 바꿈 {replaced:,} / 이미 같음 {same:,} / 확인 실패 {bad:,} (전체 {len(manifest):,})')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('list', help='묶음 종류와 지금 로컬 용량')
    p = sub.add_parser('pack', help='묶음 만들기')
    p.add_argument('--out', default='~/Downloads/ai_campus_main_proj_data', help='저장 위치')
    p.add_argument('--only', default='', help='쉼표로 묶음 이름(예: graph_data)')
    p = sub.add_parser('place', help='받은 묶음을 제자리에 풀기')
    p.add_argument('zips', nargs='*', help='풀 zip(주지 않으면 ~/Downloads와 ~/Downloads/ai_campus_main_proj_data에서 묶음마다 최신 것을 찾는다)')
    p.add_argument('--root', default='', help='풀 위치(기본: 이 저장소 루트). 시험용')
    args = ap.parse_args()
    {'list': cmd_list, 'pack': cmd_pack, 'place': cmd_place}[args.cmd](args)


if __name__ == '__main__':
    sys.exit(main())
