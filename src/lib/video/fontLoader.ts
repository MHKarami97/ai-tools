const SAMPLE_TEXT = 'ابپتثجچحخدذرزسشصضطظعغفقکگلمنوهیAaBb';

export class FontLoader {
  private customCounter = 0;

  async ensure(family: string, weight: number): Promise<void> {
    await document.fonts.load(`${weight} 32px "${family}"`, SAMPLE_TEXT);
  }

  async loadFromFile(file: File): Promise<string> {
    this.customCounter += 1;
    const family = `UserFont${this.customCounter}`;
    const face = new FontFace(family, await file.arrayBuffer());

    await face.load();
    document.fonts.add(face);

    return family;
  }
}

export const fontLoader = new FontLoader();
