const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 820,
    minHeight: 560,
    title: 'Платок и Борода',
    backgroundColor: '#0d0b14',
    icon: path.join(__dirname, 'app', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });
  Menu.setApplicationMenu(null);
  win.maximize();
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
