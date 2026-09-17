"""
46차 파트5 — 선언 순서(TDZ) 훑기.

찾는 것: 끌어올려진 function 선언을 초기화 도중에 부르는데, 그 함수(또는 그 함수가 부르는
함수)가 아직 선언되지 않은 const/let 을 읽는 자리. 45차 버그가 정확히 이 모양이었다.
값이 있을 때만 그 줄을 지나가면 평소에는 안 터지므로 실행 검증만으로는 못 잡는다.
"""
import os, re, sys

# 저장소 어디에서 돌려도 같게 동작하도록 이 파일 위치에서 되짚는다.
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'src')
IDENT = re.compile(r'[A-Za-z_$][A-Za-z0-9_$]*')
FUNC = re.compile(r'^([ \t]*)function\s*\*?\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(', re.M)
DECL = re.compile(r'^([ \t]*)(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=', re.M)
CALL = re.compile(r'^([ \t]*)(?:await\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(')
KEYWORDS = {'if','for','while','switch','return','typeof','new','catch','function','else','do','of','in'}


# 정규식 리터럴을 나누기(/)와 가른다. /\* 로 시작하는 정규식을 블록 주석으로 읽으면
# 그 뒤 중괄호가 통째로 밀려 깊이 계산이 무너진다 — 실제로 무너졌다.
REGEX_PREV = set('(,=:[!&|?{};+-*%~^') | {'return', 'typeof', 'case', 'in', 'of', 'new', 'do', 'else'}


def starts_regex(src, i):
    j = i - 1
    while j >= 0 and src[j] in ' \t':
        j -= 1
    if j < 0 or src[j] == '\n':
        return True
    if src[j] in REGEX_PREV:
        return True
    k = j
    while k >= 0 and (src[k].isalnum() or src[k] == '_'):
        k -= 1
    return src[k+1:j+1] in REGEX_PREV


def skip_regex(src, i, n):
    """여는 / 다음부터 닫는 / 까지. 문자셋 [] 안의 / 는 닫지 않는다."""
    i += 1
    in_class = False
    while i < n and src[i] != '\n':
        c = src[i]
        if c == '\\':
            i += 2
            continue
        if c == '[':
            in_class = True
        elif c == ']':
            in_class = False
        elif c == '/' and not in_class:
            return i + 1
        i += 1
    return i


def body_span(src, open_idx):
    """{ 부터 짝이 맞는 } 까지. 문자열·주석은 대충 건너뛴다."""
    i, depth = open_idx, 0
    n = len(src)
    while i < n:
        c = src[i]
        if c == '/' and i + 1 < n and src[i+1] == '/':
            while i < n and src[i] != '\n':
                i += 1
        elif c == '/' and i + 1 < n and src[i+1] == '*':
            i = src.find('*/', i) + 1
        elif c == '/' and starts_regex(src, i):
            i = skip_regex(src, i, n)
            continue
        elif c in '"\'`':
            q, i = c, i + 1
            while i < n and src[i] != q:
                i += 2 if src[i] == '\\' else 1
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return n


def line_of(src, idx):
    return src.count('\n', 0, idx) + 1


def depth_map(src):
    """글자마다 중괄호 깊이. 문자열·주석 안의 괄호는 세지 않는다."""
    out = [0] * (len(src) + 1)
    i, depth, n = 0, 0, len(src)
    while i < n:
        c = src[i]
        if c == '/' and i + 1 < n and src[i+1] == '/':
            while i < n and src[i] != '\n':
                out[i] = depth
                i += 1
            continue
        elif c == '/' and i + 1 < n and src[i+1] == '*':
            j = src.find('*/', i)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                out[k] = depth
            i = j
            continue
        elif c == '/' and starts_regex(src, i):
            j = skip_regex(src, i, n)
            for k in range(i, j):
                out[k] = depth
            i = j
            continue
        elif c in '"\'`':
            q = c
            out[i] = depth
            i += 1
            while i < n and src[i] != q:
                out[i] = depth
                i += 2 if src[i] == '\\' else 1
        elif c == '{':
            depth += 1
            out[i] = depth
        elif c == '}':
            out[i] = depth
            depth -= 1
        else:
            out[i] = depth
        i += 1
    out[n] = depth
    return out


def scan(path):
    src = open(path, encoding='utf-8').read()
    funcs = {}
    for m in FUNC.finditer(src):
        indent, name = m.group(1), m.group(2)
        brace = src.find('{', m.end())
        if brace < 0:
            continue
        end = body_span(src, brace)
        funcs[name] = {
            'indent': len(indent.expandtabs(2)),
            'line': line_of(src, m.start()),
            'end_line': line_of(src, end),
            'body': src[brace:end],
        }
    LOCAL = re.compile(r'\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)')
    for f in funcs.values():
        used = set(IDENT.findall(f['body'])) - KEYWORDS
        # 그 함수 안에서 다시 선언되는 이름은 바깥 것을 가린다. 빼지 않으면 wheelPoint 의
        # 지역 rad 같은 것이 바깥 rad 를 읽는 것처럼 잡힌다.
        f['locals'] = set(LOCAL.findall(f['body']))
        f['uses'] = used - f['locals']
        f['calls'] = used & set(funcs)

    # 함수가 부르는 함수까지 따라가며 읽는 이름을 넓힌다.
    for _ in range(6):
        for f in funcs.values():
            for c in list(f['calls']):
                f['uses'] |= (funcs[c]['uses'] - f['locals'])
                f['calls'] |= funcs[c]['calls']

    dm = depth_map(src)
    decls = []
    for m in DECL.finditer(src):
        decls.append({'name': m.group(2), 'idx': m.start(),
                      'depth': dm[m.start()], 'line': line_of(src, m.start())})

    hits = []
    pos = 0
    for i, line in enumerate(src.split('\n'), 1):
        start = pos
        pos += len(line) + 1
        m = CALL.match(line)
        if not m:
            continue
        name = m.group(2)
        f = funcs.get(name)
        if not f:
            continue
        if f['line'] <= i <= f['end_line']:
            continue                       # 자기 몸 안에서 부르는 것(재귀)은 뺀다
        ci = start + len(m.group(1))
        cd = dm[ci]
        for d in decls:
            if d['idx'] <= ci:
                continue                    # 이미 선언된 뒤라면 문제 없다
            if d['depth'] != cd:
                continue                    # 같은 블록이 아니다
            # 부르는 자리와 선언 사이에서 블록을 한 번이라도 빠져나가면 다른 스코프다.
            if min(dm[ci:d['idx']]) < cd:
                continue
            if f['line'] <= d['line'] <= f['end_line']:
                continue                    # 그 함수 안에서 선언되는 지역 변수다
            if d['name'] not in f['uses']:
                continue
            hits.append((path, i, name, d['name'], d['line']))
    return hits


all_hits = []
scanned = 0
for base, _dirs, files in os.walk(ROOT):
    for fn in sorted(files):
        if fn.endswith('.js'):
            scanned += 1
            all_hits += scan(os.path.join(base, fn))

# 57차 보강2 — 한 파일도 못 훑었으면 의심 0건은 "깨끗하다" 가 아니라 "본 것이 없다" 이다.
if not scanned:
    print('훑은 파일 0개 — 본 것이 없습니다. 통과로 세지 않습니다.')
    sys.exit(1)

print('파일                              부르는 줄  부르는 함수            아직 선언 안 된 이름   선언 줄')
for path, line, fname, dname, dline in all_hits:
    rel = os.path.relpath(path, os.path.dirname(ROOT))
    print(f'{rel:33s} {line:>9}  {fname:22s} {dname:22s} {dline:>7}')
print(f'\n훑은 파일 {scanned}개 · 의심 {len(all_hits)}건 · 기준: 훑은 파일 1개 이상 · 의심 0건')
sys.exit(1 if all_hits else 0)
