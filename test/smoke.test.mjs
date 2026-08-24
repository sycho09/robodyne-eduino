import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.mjs';

test('인라인 스크립트가 오류 없이 로드된다 (DOM 참조 무결성)', async () => {
  const { errors } = await loadApp();
  assert.deepEqual(errors, [], '로드 중 스크립트 오류 발생: ' + errors.map(String).join(' | '));
});

test('기본 클래스가 각 학습 탭에 렌더링된다', async () => {
  const { doc } = await loadApp();
  // 이미지 탭: init() 이 클래스 2개 추가
  assert.equal(doc.querySelectorAll('#class-list .class-item').length, 2);
  // 동작 탭: poseInit() 이 클래스 2개 추가
  assert.equal(doc.querySelectorAll('#p-class-list .class-item').length, 2);
});

test('addClass / 최대 클래스 제한이 동작한다 (이미지 탭)', async () => {
  const { window, doc } = await loadApp();
  window.addClass('테스트');
  assert.equal(doc.querySelectorAll('#class-list .class-item').length, 3);
  // MAX_CLASSES(4) 초과 추가는 무시
  window.addClass('네번째');
  window.addClass('초과분');
  assert.equal(doc.querySelectorAll('#class-list .class-item').length, 4);
  assert.equal(doc.getElementById('add-class').disabled, true);
});

test('renderBars 가 클래스 수만큼 막대를 만든다', async () => {
  const { window, doc } = await loadApp();
  window.renderBars();
  const rows = doc.querySelectorAll('#bars .bar-row').length;
  assert.equal(rows, doc.querySelectorAll('#class-list .class-item').length);
});

test('사이드바 기능 전환 시 패널이 토글된다', async () => {
  const { doc } = await loadApp();
  doc.querySelector('.nav-item[data-feature="pose"]').click();
  assert.equal(doc.getElementById('panel-supervised').classList.contains('active'), true);
  assert.equal(doc.getElementById('panel-direct').classList.contains('active'), false);
  // 정보 카드도 갱신
  assert.equal(doc.getElementById('fi-model').textContent, 'MoveNet');
});

test('학습 곡선(pushChartPoint)이 polyline 좌표를 누적해 그린다', async () => {
  const { window, doc } = await loadApp();
  window.pushChartPoint(1, 5, 0.80, 0.40); // (ep, totalEp, loss, acc)
  window.pushChartPoint(2, 5, 0.40, 0.70);
  const acc = doc.getElementById('chart-acc').getAttribute('points');
  const loss = doc.getElementById('chart-loss').getAttribute('points');
  // 2개 점이 누적되어 "x,y x,y" 형태로 그려져야 함
  assert.equal(acc.trim().split(/\s+/).length, 2, 'acc polyline 점 2개');
  assert.equal(loss.trim().split(/\s+/).length, 2, 'loss polyline 점 2개');
  assert.match(acc, /^[\d.]+,[\d.]+\s+[\d.]+,[\d.]+$/);
});

// 이미지 탭에서 두 클래스에 임베딩을 수집하고 학습을 돌리는 헬퍼
async function trainImageTab(window, doc, { epochs = 5, perClass = 3 } = {}) {
  await window.toggleCam();
  const items = doc.querySelectorAll('#class-list .class-item');
  items[0].click();
  for (let i = 0; i < perClass; i++) window.captureSample();
  items[1].click();
  for (let i = 0; i < perClass; i++) window.captureSample();
  doc.getElementById('epochs').value = String(epochs);
  await window.train();
  await new Promise((r) => setTimeout(r, 0)); // 혼동행렬 마이크로태스크 정리
}

test('학습 흐름: head 생성·fit·학습곡선·혼동행렬이 동작한다 (이미지 탭)', async () => {
  const { window, doc, errors } = await loadApp();
  await trainImageTab(window, doc, { epochs: 5 });
  assert.deepEqual(errors, [], '학습 중 오류: ' + errors.map(String).join(' | '));
  // 학습 완료 안내
  assert.match(doc.getElementById('train-hint').textContent, /학습 완료/);
  // 학습곡선 5 epoch
  assert.equal(doc.getElementById('chart-acc').getAttribute('points').trim().split(/\s+/).length, 5);
});

test('혼동행렬이 클래스 수(2x2) 만큼 데이터 셀을 렌더한다', async () => {
  const { window, doc } = await loadApp();
  await trainImageTab(window, doc, { epochs: 5 });
  const cells = doc.querySelectorAll('#confusion-table-wrap tbody td').length;
  assert.equal(cells, 4, '2x2 = 4개 데이터 셀');
  assert.equal(doc.getElementById('confusion-box').classList.contains('on'), true);
});

test('학습 흐름(동작 탭): 공통 trainHead 경로가 동작한다', async () => {
  const { window, doc, errors } = await loadApp();
  doc.querySelector('.nav-item[data-feature="pose"]').click();
  await window.poseToggleCam();
  const items = doc.querySelectorAll('#p-class-list .class-item');
  items[0].click();
  for (let i = 0; i < 3; i++) await window.poseCaptureSample();
  items[1].click();
  for (let i = 0; i < 3; i++) await window.poseCaptureSample();
  doc.getElementById('p-epochs').value = '5';
  await window.poseTrain();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(errors, [], '동작 학습 중 오류: ' + errors.map(String).join(' | '));
  assert.match(doc.getElementById('p-train-hint').textContent, /학습 완료/);
  assert.equal(doc.querySelectorAll('#p-confusion-table-wrap tbody td').length, 4);
});

test('추론 1틱이 막대와 최상위 예측을 갱신한다 (이미지 탭)', async () => {
  const { window, doc } = await loadApp();
  await trainImageTab(window, doc, { epochs: 5 });
  window.startInfer(); // RAF 는 stub 이라 inferLoop 1회만 실행
  await new Promise((r) => setTimeout(r, 0));
  // 막대 퍼센트가 채워졌는지(0% 가 아닌 값 또는 갱신 흔적)
  assert.ok(doc.getElementById('pct-0').textContent.endsWith('%'));
  const tpName = doc.querySelector('#top-pred .tp-name').textContent;
  assert.ok(tpName.length > 0, '최상위 예측 이름이 표시됨');
});

test('음성 녹음 관리 모달: 목록 표시 + 개별 삭제', async () => {
  const { window, doc } = await loadApp();
  doc.querySelector('.nav-item[data-feature="audio"]').click();
  await window.audioToggleMic(); // 마이크 켜기(스텁) → 클래스별 녹음 버튼 활성
  // 첫 음성 클래스에 2회 녹음 (클래스 카드의 녹음 버튼 경로)
  const aId = +doc.querySelectorAll('#a-class-list .class-item')[0].dataset.id;
  await window.audioCaptureFor(aId);
  await window.audioCaptureFor(aId);
  // 카운트 배지 클릭 → 녹음 모달 열림
  doc.querySelector('#a-class-list .class-item .class-count').click();
  assert.equal(doc.getElementById('audio-rec-overlay').classList.contains('on'), true);
  assert.equal(doc.querySelectorAll('#audio-rec-grid .gallery-item').length, 2, '녹음 2개 표시');
  // 하나 삭제 → 1개 남음
  doc.querySelector('#audio-rec-grid .gallery-item').click();
  assert.equal(doc.querySelectorAll('#audio-rec-grid .gallery-item').length, 1, '삭제 후 1개');
});



test('StepNav 가 학습 진행에 따라 done 표시된다 (이미지)', async () => {
  const { window, doc } = await loadApp();
  const pills = () => doc.querySelectorAll('#step-nav .step-pill');
  // 기본 2클래스 → 1단계(클래스 만들기) 완료
  assert.equal(pills()[0].classList.contains('done'), true);
  assert.equal(pills()[2].classList.contains('done'), false);
  await trainImageTab(window, doc, { epochs: 3 });
  // 학습 완료 → 3단계(모델 학습) 완료
  assert.equal(pills()[2].classList.contains('done'), true);
});

test('추론 시 도넛 게이지(%)가 갱신된다 (이미지)', async () => {
  const { window, doc } = await loadApp();
  await trainImageTab(window, doc, { epochs: 3 });
  window.startInfer();
  await new Promise((r) => setTimeout(r, 0));
  assert.match(doc.getElementById('top-donut-pct').textContent, /\d+%/);
});


test('클래스 선택 시 입력칸이 유지된다 (터치 수정 회귀)', async () => {
  const { doc } = await loadApp();
  const input0 = doc.querySelectorAll('#class-list .class-item')[0].querySelector('.class-name');
  doc.querySelectorAll('#class-list .class-item')[1].click();
  doc.querySelectorAll('#class-list .class-item')[0].click();
  const input0After = doc.querySelectorAll('#class-list .class-item')[0].querySelector('.class-name');
  assert.equal(input0After, input0, '선택해도 입력칸 요소가 재생성되지 않아야 함(포커스 유지)');
  assert.equal(doc.querySelectorAll('#class-list .class-item')[0].classList.contains('selected'), true);
});
