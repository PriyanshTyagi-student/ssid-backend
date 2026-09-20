declare module 'adbkit-apkreader' {
  export interface Manifest {
    package: string;
    versionCode: number;
    versionName: string;
    application: {
      label?: string | number;
      icon?: string;
      [key: string]: any;
    };
    [key: string]: any;
  }

  export interface ApkReaderInstance {
    readManifest(): Promise<Manifest>;
  }

  export class ApkReader {
    static open(file: string): Promise<ApkReaderInstance>;
  }

  export default ApkReader;
}
