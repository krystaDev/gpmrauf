import {ChangeDetectionStrategy, ChangeDetectorRef, Component} from '@angular/core';
import {ElectronService} from './core/services';
import {TranslateService} from '@ngx-translate/core';
import {BehaviorSubject, map, Observable, tap} from "rxjs";
import {isSameDay} from 'date-fns'

interface FilesFromDisk {
  path: string;
  ctime?: Date;
  mtime?: Date;
  photoTakenTime?: {
    timestamp: number
  };
}

interface FileToFix {
  fileName: string;
  filePath: string;
  fileDate: string;
  photoTaken: string;
  isCorrect: boolean
}
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  private processedFiles = new BehaviorSubject(0);
  public processedFiles$ = this.processedFiles.asObservable();
  private searchedFilesSubject = new BehaviorSubject<FilesFromDisk[]>([]);
  public searchedFiles$: Observable<{path: string, name: string, extensions: string}[]> = this.searchedFilesSubject.asObservable().pipe(
    map((array: FilesFromDisk[]) => {
      return array.map(file => ({
        path: file.path,
        name: this.getFileName(file.path),
        extensions: this.getExtension(file.path)
      })) as {path: string, name: string, extensions: string}[]
    }
  ));

  public filesToFix$: Observable<FileToFix[]> = this.searchedFilesSubject.asObservable().pipe(
    map((array) => {
      const mediaFiles = [
        'mp4', 'mov', 'jpg', 'jpeg', 'mkv', 'png', 'raw', 'hevc', 'heif'
      ]
      const jsons = array.filter(t => this.getExtension(t.path) === 'json');
      const media = array.filter((t) => mediaFiles.includes(this.getExtension(t.path)))
      return jsons.map(t => {
        const mediaFile = media.find(y => y.path === t.path.replace('.json', ''));
        const fileDate = new Date(mediaFile.ctime)
        const photoTakenFromJson = new Date(t.photoTakenTime.timestamp * 1000);
        return {
          filePath: mediaFile.path,
          fileName: this.getFileName(mediaFile.path),
          fileDate: fileDate.toISOString(),
          photoTaken: photoTakenFromJson.toISOString(),
          isCorrect: isSameDay(photoTakenFromJson, fileDate)
        }
      })
    })
  )
  public filesWithoutJsonData$: Observable<FilesFromDisk[]> = this.searchedFilesSubject.asObservable().pipe(
    map((files) => {
      const mediaFiles = [
        'mp4', 'mov', 'jpg', 'jpeg', 'mkv', 'png', 'raw', 'hevc', 'heif'
      ]
      const jsons = files.filter(t => this.getExtension(t.path) === 'json');
      const media = files.filter((t) => mediaFiles.includes(this.getExtension(t.path)))
      return media.filter((media) => {
        return jsons.filter(j => j.path === media.path + '.json').length === 0
      })
    })
  )

  constructor(
    private electronService: ElectronService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService
  ) {
    this.translate.setDefaultLang('pl');

    if (electronService.isElectron) {
      console.log('Run in electron');
      this.electronService.ipcRenderer.on('selected-directory', (event, args) => {
        this.searchedFilesSubject.next(args)
        this.cdr.detectChanges();
      })

      this.electronService.ipcRenderer.on('update-many-file-time-progress', (event, number) => {
        this.processedFiles.next(number);
        this.cdr.detectChanges();
      })
    } else {
      console.log('Run in browser');
    }
  }

  selectDirectory() {
    if (this.electronService.isElectron) {
      this.electronService.ipcRenderer.send('select-directory', '')
    }
  }

  private getFileName(path: string): string {
    return path.split('\\').pop().split('/').pop();
  }

  private getExtension(path: string): string {
    return path.split('.').pop()
  }

  fixFile(file: FileToFix) {
    this.electronService.ipcRenderer.send('update-file-time', {
      file: file.filePath,
      ctime: new Date(file.photoTaken).getTime()
    })
  }

  fixAll(files: FileToFix[]) {
    this.electronService.ipcRenderer.send('update-many-file-time', {
      files: files.map((file) => ({
        file: file.filePath,
        ctime: new Date(file.photoTaken).getTime()
      }))
    })
  }
}
