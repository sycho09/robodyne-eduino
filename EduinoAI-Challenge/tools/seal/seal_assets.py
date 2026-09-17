"""
tools/seal/seal_assets.py — 에셋 파일명을 내용 해시로 봉인한다.

왜 필요한가:
    배경은 이미지 한 장과 사이드카 JSON 한 쌍으로만 뜻이 통한다. 사이드카에는 투영 축이,
    이미지에는 그 축으로 구운 그림이 들어 있다. 파일명이 늘 같으면 브라우저·CDN 이
    한쪽만 새로 받고 다른 쪽은 캐시에서 꺼내 쓰는 일이 생긴다. 그러면 코드도 데이터도
    멀쩡한데 화면만 어긋난다 — 37차·38차에서 실제로 그렇게 됐다.

무엇을 하는가:
    파일 내용의 sha256 앞 10자리를 파일명에 넣어 다시 쓴다. 내용이 바뀌면 이름이 바뀌므로
    낡은 캐시가 새 짝과 만날 수 없다. 사이드카는 짝이 되는 이미지의 해시를 함께 적어 두어,
    그래도 어긋나면 화면이 폴백하지 않고 오류로 알린다.

무엇을 하지 않는가:
    다시 굽지 않는다. 이미 구워진 파일의 바이트를 그대로 복사할 뿐이라 그림은 한 픽셀도
    달라지지 않는다. 옛 파일도 지우지 않는다 — 이미 그 주소를 캐시한 브라우저가 404 를
    만나면 안 되기 때문이다.

    python3 tools/seal/seal_assets.py
"""

import hashlib
import json
import os
import re
import shutil

# 56차 — tools/seal/ 로 옮겨 한 칸 깊어졌다. 저장소 뿌리까지 dirname 이 셋이다.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSET_DIR = os.path.join(ROOT, 'assets')
MANIFEST = os.path.join(ASSET_DIR, 'assets.manifest.json')

HASH_LEN = 10
# 이미 봉인된 이름. 두 번 돌려도 해시가 겹겹이 붙지 않게 벗겨 낸다.
SEALED = re.compile(r'\.[0-9a-f]{%d}$' % HASH_LEN)
# 이미 봉인된 프레임 폴더. 두 번 돌려도 폴더가 겹겹이 쌓이지 않게 벗겨 낸다.
SEALED_DIR = re.compile(r'^[0-9a-f]{%d}/' % HASH_LEN)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def stem_of(path):
    """봉인 해시를 뗀 원래 이름. seal 을 여러 번 돌려도 이름이 길어지지 않는다."""
    base = os.path.splitext(os.path.basename(path))[0]
    return SEALED.sub('', base)


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2).encode('utf-8')


def write_once(path, data):
    """같은 내용이면 다시 쓰지 않는다 — 해시가 이름에 들어 있으니 내용도 같다."""
    if os.path.exists(path) and open(path, 'rb').read() == data:
        return False
    with open(path, 'wb') as f:
        f.write(data)
    return True


def seal_background(meta_path):
    """배경 = 이미지 한 장 + 사이드카. 둘 다 해시 이름을 갖고, 사이드카가 이미지 해시를 적는다."""
    meta = json.load(open(meta_path, encoding='utf-8'))
    here = os.path.dirname(meta_path)
    img_src = os.path.join(here, meta['image'])
    img_hash = sha256_file(img_src)
    img_name = f'{stem_of(img_src)}.{img_hash[:HASH_LEN]}{os.path.splitext(img_src)[1]}'
    img_dst = os.path.join(here, img_name)
    if not os.path.exists(img_dst):
        shutil.copyfile(img_src, img_dst)

    sealed = dict(meta)
    sealed['image'] = img_name
    # 짝이 어긋나면 화면이 조용히 폴백하지 않고 오류 채널로 알린다.
    sealed['image_sha256'] = img_hash
    data = dump(sealed)
    meta_name = f'{stem_of(meta_path)}.{sha256_bytes(data)[:HASH_LEN]}.json'
    meta_dst = os.path.join(here, meta_name)
    write_once(meta_dst, data)
    return meta_name, [img_name, meta_name]


def seal_sheet(meta_path, dir_keys):
    """
    스프라이트 시트 = 프레임 PNG 여러 장 + 그 JSON.
    프레임은 해시 이름의 폴더로 통째로 옮긴다 — 장마다 이름을 바꾸면 JSON 이 통째로 커진다.
    폴더 이름이 프레임 전체의 해시라, 한 장만 바뀌어도 낡은 캐시와 만날 수 없다.
    """
    meta = json.load(open(meta_path, encoding='utf-8'))
    here = os.path.dirname(meta_path)
    # 봉인본을 다시 봉인해도 같은 결과가 나와야 한다 — 앞서 붙인 해시 폴더를 먼저 뗀다.
    meta.pop('frames_sha256', None)
    for key in (dir_keys or []):
        if meta.get(key):
            meta[key] = SEALED_DIR.sub('', meta[key])
    if not dir_keys:
        for st in meta.get('sets', {}).values():
            for fr in st.get('frames', []):
                fr['file'] = SEALED_DIR.sub('', fr['file'])
    files = []              # (원본 경로, JSON 이 적을 상대 경로)
    if dir_keys:
        for key in dir_keys:
            d = meta.get(key)
            if not d:
                continue
            for fr in meta['frames']:
                files.append((os.path.join(here, d, fr['file']), f"{d}/{fr['file']}"))
    else:
        for st in meta.get('sets', {}).values():
            for fr in st.get('frames', []):
                files.append((os.path.join(here, fr['file']), fr['file']))

    digest = hashlib.sha256()
    per_file = {}
    for src, rel in sorted(files, key=lambda p: p[1]):
        h = sha256_file(src)
        per_file[rel] = h
        digest.update(rel.encode('utf-8'))
        digest.update(h.encode('ascii'))
    tag = digest.hexdigest()[:HASH_LEN]

    out_dir = os.path.join(here, tag)
    written = []
    for src, rel in files:
        dst = os.path.join(out_dir, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not os.path.exists(dst):
            shutil.copyfile(src, dst)
        written.append(f'{tag}/{rel}')

    sealed = json.loads(json.dumps(meta))
    if dir_keys:
        for key in dir_keys:
            if sealed.get(key):
                sealed[key] = f'{tag}/{sealed[key]}'
    else:
        for st in sealed.get('sets', {}).values():
            for fr in st.get('frames', []):
                fr['file'] = f"{tag}/{fr['file']}"
    sealed['frames_sha256'] = per_file
    data = dump(sealed)
    meta_name = f'{stem_of(meta_path)}.{sha256_bytes(data)[:HASH_LEN]}.json'
    write_once(os.path.join(here, meta_name), data)
    return meta_name, written + [meta_name]


def main():
    manifest = json.load(open(MANIFEST, encoding='utf-8'))
    made = []
    for slot_id, slot in manifest['slots'].items():
        path = slot.get('path')
        if not path:
            continue
        abs_path = os.path.join(ASSET_DIR, path)
        # 매니페스트는 이미 봉인된 이름을 가리킨다. 봉인은 언제나 생성기가 쓴 원본에서
        # 시작해야 한다 — 봉인본을 다시 봉인하면 새로 구운 그림이 반영되지 않는다.
        base = os.path.join(os.path.dirname(abs_path),
                            stem_of(abs_path) + os.path.splitext(abs_path)[1])
        if os.path.exists(base):
            abs_path = base
        here = os.path.dirname(path)
        if slot['type'] == 'scene_background':
            name, files = seal_background(abs_path)
        elif slot['type'] == 'sprite_frames':
            name, files = seal_sheet(abs_path, ['body_dir', 'shadow_dir'])
        elif slot['type'] == 'sprite_sheet':
            name, files = seal_sheet(abs_path, None)
        else:
            continue                      # 단일 이미지는 슬롯이 곧 주소라 짝이 어긋날 일이 없다
        slot['path'] = f'{here}/{name}'
        made.append((slot_id, slot['path'], len(files)))

    with open(MANIFEST, 'w', encoding='utf-8') as f:
        f.write(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    for slot_id, path, n in made:
        print(f'  {slot_id:34s} → {path}  (파일 {n})')
    print(f'봉인 완료 — 슬롯 {len(made)}')


if __name__ == '__main__':
    main()
