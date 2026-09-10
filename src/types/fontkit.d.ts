// fontkit は型定義を同梱していないため、NDA PDF生成で使う最小限のAPIのみ宣言する。
declare module 'fontkit' {
  export interface FontkitFont {
    postscriptName: string | null;
    familyName?: string | null;
    subfamilyName?: string | null;
  }

  export interface FontkitFontCollection {
    fonts: FontkitFont[];
  }

  export function openSync(filename: string, postscriptName?: string): FontkitFont | FontkitFontCollection;
  export function open(filename: string, postscriptName?: string): Promise<FontkitFont | FontkitFontCollection>;
}
