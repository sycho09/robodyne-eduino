// Eduino AI Lab — Electron 데스크톱 래퍼
// index.html 을 독립 앱 창으로 띄운다. file:// 은 보안 컨텍스트로 취급되고
// 권한 핸들러가 카메라/마이크를 허용하므로 getUserMedia 가 정상 동작한다.
const { app, BrowserWindow, session, protocol, net } = require('electron');
const path = require('path');

// 사용자 정의 프로토콜을 등록하여 절대 경로가 프로젝트 폴더를 가리키게 함
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0d1016',
    title: 'Eduino AI Lab',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadURL('app://-/platform/index.html');
}

app.whenReady().then(() => {
  // 카메라·마이크 등 권한 자동 허용 (로컬 단독 앱)
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(true));
  
  // app:// 프로토콜 핸들러: app://-/경로 -> file://프로젝트폴더/경로 로 매핑
  protocol.handle('app', (request) => {
    let url = request.url.replace(/^app:\/\/-/, '');
    // URL 디코딩 및 쿼리/해시 제거
    url = decodeURIComponent(new URL('http://dummy' + url).pathname);
    return net.fetch('file://' + path.join(__dirname, url));
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
