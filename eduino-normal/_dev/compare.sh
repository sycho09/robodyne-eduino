#!/bin/sh
# 시작화면 비교 도구 — main(이전)과 현재 작업본을 한 화면에서 오간다.
#
# 서버를 왜 둘 쓰는가:
# 두 버전 모두 /platform/... 같은 절대경로로 서로를 링크한다. 그래서 각 버전은
# 자기 폴더를 최상위로 하는 서버가 하나씩 있어야 한다. 그래야 코스 카드를 눌러
# 상세 페이지로 들어가도 그 버전 안에 머문다. 서버 하나로 합치면 두 버전의
# 링크가 전부 같은 곳을 가리켜 상세 페이지가 한 버전으로 합쳐져 버린다.
#
# 포트: 작업본 = LIVE_PORT, main 스냅샷 = LIVE_PORT + 2
set -e
cd "$(dirname "$0")/.."
PROJ=$(basename "$PWD")
LIVE=${LIVE_PORT:-5180}
BASE=$((LIVE + 2))

# main 스냅샷은 실행할 때마다 새로 뽑는다 — main 이 바뀌면 자동으로 따라간다.
# git archive 는 하위 디렉토리에서 실행하면 현재 경로로 암묵 필터링돼 거의 빈 결과가
# 나온다. 그래서 반드시 저장소 루트에서 돌린다.
ROOT=$(git rev-parse --show-toplevel)
rm -rf _dev/baseline
mkdir -p _dev/baseline
git -C "$ROOT" archive "main:$PROJ" | tar -x -C _dev/baseline

# 파이프라인이라 set -e 가 git 쪽 실패를 잡지 못한다. 직접 확인한다.
if [ ! -f _dev/baseline/platform/index.html ]; then
  echo "오류: main 스냅샷을 만들지 못했습니다 (_dev/baseline/platform/index.html 없음)" >&2
  exit 1
fi

python3 -m http.server "$BASE" --directory _dev/baseline >/dev/null 2>&1 &
BASE_PID=$!
trap 'kill $BASE_PID 2>/dev/null' EXIT INT TERM

echo ""
echo "  비교 화면    http://localhost:$LIVE/_dev/compare.html"
echo "  작업본       http://localhost:$LIVE"
echo "  main 스냅샷  http://localhost:$BASE"
echo ""
echo "  Ctrl+C 로 종료"
echo ""

(sleep 1 && open "http://localhost:$LIVE/_dev/compare.html") >/dev/null 2>&1 &
python3 -m http.server "$LIVE" >/dev/null 2>&1
