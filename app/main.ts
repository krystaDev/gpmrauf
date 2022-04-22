import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as url from 'url';
import * as find from 'find';
const { ipcMain, dialog, ipcRenderer } = require('electron')
import { utimes } from 'utimes';
import * as piexif from 'piexifjs';

let win: BrowserWindow = null;
const args = process.argv.slice(1),
  serve = args.some(val => val === '--serve');

function createWindow(): BrowserWindow {

  const electronScreen = screen;
  const size = electronScreen.getPrimaryDisplay().workAreaSize;

  // Create the browser window.
  win = new BrowserWindow({
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
    webPreferences: {
      nodeIntegration: true,
      allowRunningInsecureContent: (serve) ? true : false,
      contextIsolation: false,  // false if you want to run e2e test with Spectron
    },
  });


  if (serve) {
    win.webContents.openDevTools();
    require('electron-reload')(__dirname, {
      electron: require(path.join(__dirname, '/../node_modules/electron'))
    });
    win.loadURL('http://localhost:4200');
  } else {
    // Path when running electron executable
    let pathIndex = './index.html';

    if (fs.existsSync(path.join(__dirname, '../dist/index.html'))) {
       // Path when running electron in local folder
      pathIndex = '../dist/index.html';
    }

    win.loadURL(url.format({
      pathname: path.join(__dirname, pathIndex),
      protocol: 'file:',
      slashes: true
    }));
  }


  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store window
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null;
  });

  return win;
}

function searchFilesAndSendToFront(selectedPath: string, event: Electron.IpcMainEvent) {
  find.file(path.toNamespacedPath(selectedPath), function (files) {
    const getExtension = (path: string): string => {
      return path.split('.').pop()
    }
    event.reply('selected-directory', (files as string[]).map((t) => {
      const {birthtime, mtime} = fs.statSync(t)
      if (getExtension(t) === 'json') {
        return {
          path: t,
          ...JSON.parse(fs.readFileSync(t).toString())
        }
      }
      return {
        ctime: birthtime,
        mtime,
        path: t
      }
    }))
  })
}

function updateFile(file) {
  utimes(file.file, {
    btime: file.ctime,
    mtime: file.ctime
  })
}

try {
  let selectedPath = '';
  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  // Added 400 ms to fix the black background issue while using transparent window. More detais at https://github.com/electron/electron/issues/15947
  app.on('ready', () => setTimeout(createWindow, 400));

  // Quit when all windows are closed.
  app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  ipcMain.on('select-directory', (event) => {
    console.log('select-directory')
    dialog.showOpenDialog({
      properties: ['openDirectory']
    }).then((t) => {
      if (!t.canceled) {
        selectedPath = t.filePaths[0];
        searchFilesAndSendToFront(selectedPath, event);
      }
    })

    ipcMain.on('update-file-time', (event, file) => {
      try {
        updateFile(file);
        searchFilesAndSendToFront(selectedPath, event);
      } catch (t) {
        // searchFilesAndSendToFront(selectedPath, event);
      }

    })
    ipcMain.on('update-many-file-time', (event, args) => {
      try {
        args.files.forEach((file, index) => {
          updateFile(file);
          event.reply('update-many-file-time-progress', index + 1)
        })
        searchFilesAndSendToFront(selectedPath, event);
      } catch (t) {
        // searchFilesAndSendToFront(selectedPath, event);
      }

    })
  })

  app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
      createWindow();
    }
  });


} catch (e) {
  // Catch Error
  // throw e;
}
