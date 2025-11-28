export enum Complexity {
  STANDARD = 'Standard',
  LIGHT = 'Light',
  SIMPLE = 'Very Simple'
}

export interface GeneratedImage {
  id: string;
  url: string; // Base64 data URL
  promptUsed: string;
}

export interface PresentationPage {
  pageNumber: number;
  title: string;
  content: string;
  visualCue: string;
  emphasis: string;
  mood: string;
}

export enum AppMode {
  SINGLE = 'Single Slide',
  PRESENTATION = 'Presentation Deck'
}

export interface AppState {
  mode: AppMode;
  step: number; // 1: Input, 2: Outline(Pres)/Selection(Single), 3: Final
  prompt: string;
  complexity: Complexity;
  stylePreferences: string;
  imageCount: number; // For single slide variations or presentation page count
  generatedImages: GeneratedImage[];
  selectedImageId: string | null;
  isGenerating: boolean;
  aiSuggestions: string[];
  
  // New features
  referenceImage: string | null; // Base64
  presentationOutline: PresentationPage[];
  isAnimationMode: boolean; // For single slide split/animation
}

export enum ImageAspect {
  SQUARE = '1:1',
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16'
}