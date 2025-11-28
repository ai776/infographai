import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BuildingOfficeIcon,
  SparklesIcon,
  BoltIcon,
  PhotoIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  PencilSquareIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  DocumentDuplicateIcon,
  PresentationChartLineIcon,
  PlusIcon,
  FilmIcon,
  TableCellsIcon
} from '@heroicons/react/24/outline';
import { AppState, Complexity, GeneratedImage, AppMode, PresentationPage } from './types';
import {
  generateInfographics,
  generateSuggestions,
  editInfographic,
  generatePresentationOutline,
  generatePresentationPageImage
} from './services/geminiService';
import { uploadImagesToDrive, signInToGoogle, isSignedIn } from './services/googleDriveService';

const INITIAL_STATE: AppState = {
  mode: AppMode.SINGLE,
  step: 1,
  prompt: '',
  complexity: Complexity.STANDARD,
  stylePreferences: '',
  imageCount: 2,
  generatedImages: [],
  selectedImageId: null,
  isGenerating: false,
  aiSuggestions: [],
  referenceImage: null,
  presentationOutline: [],
  isAnimationMode: false
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [apiKeyReady, setApiKeyReady] = useState<boolean>(false);
  const [editInstruction, setEditInstruction] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState<boolean>(false);
  const [driveSaveStatus, setDriveSaveStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // --- API Key Management ---
  const checkApiKey = useCallback(async () => {
    // Vercel環境変数が設定されている場合は自動的に使用
    const envApiKey = import.meta.env.VITE_GEMINI_API_KEY;
    console.log('Environment check:', {
      hasEnvKey: !!envApiKey,
      envKeyLength: envApiKey?.length || 0,
      mode: import.meta.env.MODE
    });

    if (envApiKey) {
      console.log('Using environment variable for API key');
      setApiKeyReady(true);
      return;
    }
    // AI Studio環境の場合
    if ((window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      setApiKeyReady(hasKey);
    } else {
      // 環境変数もAI Studioもない場合
      console.warn('No API key found. Please set VITE_GEMINI_API_KEY environment variable or use AI Studio.');
      setApiKeyReady(false);
    }
  }, []);

  useEffect(() => {
    checkApiKey();
  }, [checkApiKey]);

  const handleSelectKey = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      await checkApiKey();
    }
  };

  // --- Helpers ---

  // Robust CSV Parser handling quotes and newlines within quotes
  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentVal = '';
    let inQuote = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i+1];

      if (char === '"') {
        if (inQuote && nextChar === '"') {
          currentVal += '"';
          i++; // skip next quote
        } else {
          inQuote = !inQuote;
        }
      } else if (char === ',' && !inQuote) {
        currentRow.push(currentVal);
        currentVal = '';
      } else if ((char === '\r' || char === '\n') && !inQuote) {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentVal);
        if (currentRow.length > 0 || currentVal) { // avoid empty lines
           rows.push(currentRow);
        }
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    if (currentVal || currentRow.length > 0) {
      currentRow.push(currentVal);
      rows.push(currentRow);
    }
    return rows;
  };

  // --- Handlers ---

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setState(prev => ({ ...prev, referenceImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const rows = parseCSV(text);
        if (rows.length === 0) return;

        // Determine if first row is header
        // Heuristic: check if first col contains "スライド" or "Slide" or "No"
        let startIndex = 0;
        const header = rows[0].map(c => c.toLowerCase());
        if (header[0].includes('スライド') || header[0].includes('slide') || header[1].includes('タイトル') || header[1].includes('title')) {
           startIndex = 1;
        }

        const newOutline: PresentationPage[] = [];

        for (let i = startIndex; i < rows.length; i++) {
          const cols = rows[i];
          // Expect at least: SlideNum, Title, Content.
          // If 2 cols, assume Title, Content.

          let pageNum = newOutline.length + 1;
          let title = "";
          let content = "";

          if (cols.length >= 3) {
             pageNum = parseInt(cols[0]) || pageNum;
             title = cols[1];
             content = cols[2];
          } else if (cols.length === 2) {
             title = cols[0];
             content = cols[1];
          } else if (cols.length === 1) {
             content = cols[0];
          }

          if (title || content) {
             newOutline.push({
                pageNumber: pageNum,
                title: title.trim(),
                content: content.trim(),
                visualCue: "",
                emphasis: "",
                mood: ""
             });
          }
        }

        if (newOutline.length > 0) {
           setState(prev => ({
              ...prev,
              presentationOutline: newOutline,
              imageCount: newOutline.length,
              step: 2 // Skip AI outline generation, go to review
           }));
        } else {
           alert("有効なデータが見つかりませんでした。");
        }
      } catch (err) {
        console.error(err);
        alert("CSVの読み込みに失敗しました。");
      }
    };
    reader.readAsText(file);
    // Reset input
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  // Single Image Flow Generation
  const handleGenerateSingle = async () => {
    if (!state.prompt) return;

    setState(prev => ({ ...prev, isGenerating: true }));

    try {
      const images = await generateInfographics(
        state.prompt,
        state.complexity,
        state.stylePreferences,
        state.imageCount,
        state.referenceImage,
        state.isAnimationMode
      );

      // Parallel fetch suggestions only if not animation mode (to save tokens)
      let suggestions: string[] = [];
      if (!state.isAnimationMode) {
        suggestions = await generateSuggestions(state.prompt);
      }

      setState(prev => ({
        ...prev,
        generatedImages: images,
        aiSuggestions: suggestions,
        step: 2,
        isGenerating: false
      }));
    } catch (error) {
      console.error("Generation error", error);
      alert("生成に失敗しました。もう一度お試しください。");
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  // Presentation Flow: Step 1 -> Outline
  const handleGenerateOutline = async () => {
    if (!state.prompt) return;
    setState(prev => ({ ...prev, isGenerating: true }));
    try {
      const outline = await generatePresentationOutline(state.prompt, state.imageCount, state.complexity);
      setState(prev => ({
        ...prev,
        presentationOutline: outline,
        isGenerating: false,
        step: 2 // Move to outline review
      }));
    } catch (error) {
      console.error(error);
      alert("構成案の作成に失敗しました。");
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  // Presentation Flow: Step 2 -> Generate Slides
  const handleGenerateDeck = async () => {
    setState(prev => ({ ...prev, isGenerating: true }));
    try {
      // Generate all pages in parallel (or sequential if rate limits issue, but usually parallel is fine for 4-5 pages)
      const imagePromises = state.presentationOutline.map(page =>
        generatePresentationPageImage(page, state.stylePreferences, state.referenceImage)
      );

      const results = await Promise.all(imagePromises);
      const validImages = results.filter((img): img is GeneratedImage => img !== null);

      setState(prev => ({
        ...prev,
        generatedImages: validImages,
        step: 3, // Move to final view
        isGenerating: false
      }));
    } catch (error) {
       console.error(error);
       alert("スライド画像の生成に失敗しました。");
       setState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const handleEditImage = async () => {
    const selectedImage = state.generatedImages.find(img => img.id === state.selectedImageId);
    if (!selectedImage || !editInstruction) return;

    setIsEditing(true);
    try {
      const newImage = await editInfographic(selectedImage.url, editInstruction);
      if (newImage) {
        setState(prev => ({
          ...prev,
          generatedImages: [newImage, ...prev.generatedImages], // Add new version to front
          selectedImageId: newImage.id
        }));
        setEditInstruction('');
      }
    } catch (error) {
      console.error("Edit error", error);
      alert("画像の編集に失敗しました。");
    } finally {
      setIsEditing(false);
    }
  };

  const handleImageSelect = (id: string) => {
    setState(prev => ({ ...prev, selectedImageId: id }));
  };

  const goToStep = (step: number) => {
     setState(prev => ({ ...prev, step }));
  };

  const switchMode = (mode: AppMode) => {
    setState({
      ...INITIAL_STATE,
      mode: mode,
      // Default counts differ by mode
      imageCount: mode === AppMode.PRESENTATION ? 4 : 2
    });
  };

  const handleOutlineChange = (index: number, field: keyof PresentationPage, value: string) => {
    const newOutline = [...state.presentationOutline];
    if (field === 'pageNumber') return; // Read only
    (newOutline[index] as any)[field] = value;
    setState(prev => ({ ...prev, presentationOutline: newOutline }));
  };

  // Google Drive保存ハンドラー
  const handleSaveToDrive = async () => {
    if (state.generatedImages.length === 0) {
      alert('保存する画像がありません');
      return;
    }

    setIsSavingToDrive(true);
    setDriveSaveStatus('');

    try {
      // Googleにサインイン確認
      const signedIn = await isSignedIn();
      if (!signedIn) {
        await signInToGoogle();
      }

      // 画像をアップロード
      const imagesToUpload = state.generatedImages.map((img, idx) => {
        const pageInfo = state.presentationOutline[idx];
        const fileName = pageInfo 
          ? `プレゼン_${pageInfo.pageNumber}_${pageInfo.title.replace(/[^\w\s]/g, '_')}.png`
          : `プレゼン_${idx + 1}.png`;
        return {
          url: img.url,
          name: fileName
        };
      });

      setDriveSaveStatus('アップロード中...');
      const fileUrls = await uploadImagesToDrive(imagesToUpload);
      
      setDriveSaveStatus(`✅ ${fileUrls.length}枚の画像をGoogleドライブに保存しました`);
      alert(`${fileUrls.length}枚の画像をGoogleドライブに保存しました！\nフォルダ: https://drive.google.com/drive/folders/1jHWaqo50qd68ko8fMoWtDbp7LQfG_0pA`);
    } catch (error: any) {
      console.error('Google Drive保存エラー:', error);
      setDriveSaveStatus('❌ 保存に失敗しました');
      alert(`Googleドライブへの保存に失敗しました: ${error.message || '不明なエラー'}`);
    } finally {
      setIsSavingToDrive(false);
    }
  };

  // --- Renders ---

  if (!apiKeyReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <SparklesIcon className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">InfographAIへようこそ</h1>
          <p className="text-gray-600 mb-8">
            Gemini 3 Proを使用して高品質なインフォグラフィックやプレゼンテーションを生成するには、APIキーを選択してください。
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <span>Gemini APIを接続</span>
            <ArrowPathIcon className="w-5 h-5" />
          </button>
          <p className="mt-4 text-xs text-gray-400">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-purple-600">
              請求情報について
            </a>
          </p>
        </div>
      </div>
    );
  }

  const selectedImage = state.generatedImages.find(img => img.id === state.selectedImageId);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.reload()}>
            <div className="bg-purple-600 p-1.5 rounded-lg">
              <PhotoIcon className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">InfographAI</span>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => switchMode(AppMode.SINGLE)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${state.mode === AppMode.SINGLE ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <DocumentDuplicateIcon className="w-4 h-4" />
              1枚絵を作る
            </button>
            <button
              onClick={() => switchMode(AppMode.PRESENTATION)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${state.mode === AppMode.PRESENTATION ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <PresentationChartLineIcon className="w-4 h-4" />
              プレゼン資料を作る
            </button>
          </div>

          <div className="flex gap-6 text-sm font-medium text-gray-500">
             <div className="flex items-center gap-2">
                <span className="text-gray-400">履歴</span>
             </div>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">

        {/* ==================== SINGLE MODE ==================== */}
        {state.mode === AppMode.SINGLE && (
          <>
            {/* Step 1: Input */}
            {state.step === 1 && (
              <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative">
                  <label className="block text-lg font-semibold text-gray-900 mb-2">
                    どのようなスライドを作成しますか？
                  </label>
                  <textarea
                    className="w-full h-32 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none text-gray-700"
                    placeholder="例: AI導入の指数関数的な成長と従来のソフトウェアの線形的な成長を比較するスライド..."
                    value={state.prompt}
                    onChange={(e) => setState(prev => ({ ...prev, prompt: e.target.value }))}
                  />

                  {/* Animation Toggle */}
                  <div className="mt-4 flex items-center gap-2">
                     <label className="flex items-center gap-2 cursor-pointer">
                        <input
                           type="checkbox"
                           checked={state.isAnimationMode}
                           onChange={(e) => setState(prev => ({...prev, isAnimationMode: e.target.checked}))}
                           className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                        />
                        <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                           <FilmIcon className="w-4 h-4" />
                           複数スライド版 (アニメーション用)
                        </span>
                     </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setState(prev => ({ ...prev, complexity: Complexity.STANDARD }))}
                    className={`p-6 rounded-xl border-2 text-left transition-all ${state.complexity === Complexity.STANDARD ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white hover:border-purple-300'}`}
                  >
                    <BuildingOfficeIcon className={`w-8 h-8 mb-3 ${state.complexity === Complexity.STANDARD ? 'text-purple-600' : 'text-gray-400'}`} />
                    <div className="font-semibold text-gray-900">しっかり (標準)</div>
                    <div className="text-sm text-gray-500 mt-1">ビジネス向け・詳細</div>
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, complexity: Complexity.LIGHT }))}
                    className={`p-6 rounded-xl border-2 text-left transition-all ${state.complexity === Complexity.LIGHT ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white hover:border-purple-300'}`}
                  >
                    <SparklesIcon className={`w-8 h-8 mb-3 ${state.complexity === Complexity.LIGHT ? 'text-purple-600' : 'text-gray-400'}`} />
                    <div className="font-semibold text-gray-900">ライトめ</div>
                    <div className="text-sm text-gray-500 mt-1">シンプル・親しみ</div>
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, complexity: Complexity.SIMPLE }))}
                    className={`p-6 rounded-xl border-2 text-left transition-all ${state.complexity === Complexity.SIMPLE ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white hover:border-purple-300'}`}
                  >
                    <BoltIcon className={`w-8 h-8 mb-3 ${state.complexity === Complexity.SIMPLE ? 'text-purple-600' : 'text-gray-400'}`} />
                    <div className="font-semibold text-gray-900">非常にシンプル</div>
                    <div className="text-sm text-gray-500 mt-1">要点のみ・インパクト</div>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                      <label className="block text-sm font-medium text-gray-700 mb-2">デザインの要望 (任意)</label>
                      <input
                         type="text"
                         className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                         placeholder="例: 全体的に青色を基調に..."
                         value={state.stylePreferences}
                         onChange={(e) => setState(prev => ({...prev, stylePreferences: e.target.value}))}
                      />
                   </div>

                   <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                      <label className="block text-sm font-medium text-gray-700 mb-2">参考画像 (任意・複数可)</label>
                      <div className="flex items-center gap-3">
                         {state.referenceImage ? (
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 group">
                               <img src={state.referenceImage} className="w-full h-full object-cover" />
                               <button
                                  onClick={() => setState(prev => ({...prev, referenceImage: null}))}
                                  className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                               >
                                  ×
                               </button>
                            </div>
                         ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-50 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                               <PhotoIcon className="w-6 h-6" />
                            </div>
                         )}
                         <div className="flex-1">
                            <input
                               type="file"
                               ref={fileInputRef}
                               className="hidden"
                               accept="image/*"
                               onChange={handleFileUpload}
                            />
                            <button
                               onClick={() => fileInputRef.current?.click()}
                               className="text-sm text-purple-600 font-medium hover:text-purple-800"
                            >
                               デフォルト画像から選択
                            </button>
                            <span className="block text-xs text-gray-400 mt-1">または画像をアップロード</span>
                         </div>
                         <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 text-gray-500"
                         >
                            <PlusIcon className="w-5 h-5" />
                         </button>
                      </div>
                   </div>
                </div>

                <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-center gap-4">
                     <span className="text-sm font-medium text-gray-700">生成する画像の数</span>
                     <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                        {[1, 2, 3, 4, 5, 6].map(num => (
                           <button
                              key={num}
                              onClick={() => setState(prev => ({...prev, imageCount: num}))}
                              className={`px-4 py-2 text-sm font-medium ${state.imageCount === num ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                           >
                              {num}
                           </button>
                        ))}
                     </div>
                  </div>
                  <button
                    onClick={handleGenerateSingle}
                    disabled={!state.prompt || state.isGenerating}
                    className={`flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white shadow-lg transition-all ${
                      !state.prompt || state.isGenerating ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 hover:shadow-purple-200'
                    }`}
                  >
                    {state.isGenerating ? (
                       <>
                         <ArrowPathIcon className="w-5 h-5 animate-spin" />
                         生成中...
                       </>
                    ) : (
                       <>
                         <SparklesIcon className="w-5 h-5" />
                         {state.imageCount}案を生成
                       </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 & 3 share similar view for Single Mode */}
            {(state.step === 2 || state.step === 3) && (
              <div className="space-y-6">
                 {/* Images Grid */}
                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-4">
                          <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-bold">1</span>
                          <h2 className="text-xl font-bold text-gray-900">生成された画像</h2>
                       </div>
                       <button onClick={() => goToStep(1)} className="text-sm text-gray-500 hover:text-purple-600">最初からやり直す</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                       {state.generatedImages.map((img) => (
                          <div
                             key={img.id}
                             onClick={() => {
                                handleImageSelect(img.id);
                                goToStep(3); // Auto move to edit/view
                             }}
                             className={`group bg-white rounded-xl shadow-sm overflow-hidden cursor-pointer border-2 transition-all ${state.selectedImageId === img.id ? 'border-purple-600 ring-2 ring-purple-100' : 'border-transparent hover:border-purple-200'}`}
                          >
                             <div className="aspect-video relative">
                                <img src={img.url} alt="Generated Infographic" className="w-full h-full object-cover" />
                                {state.selectedImageId === img.id && (
                                   <div className="absolute top-2 right-2 bg-purple-600 text-white p-1 rounded-full shadow-lg">
                                      <CheckCircleIcon className="w-5 h-5" />
                                   </div>
                                )}
                             </div>
                             <div className="p-3">
                                <div className="text-xs text-purple-600 font-mono">Est: $0.2593</div>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>

                 {/* Editor Area (Only visible if selected) */}
                 {state.step === 3 && selectedImage && (
                    <div className="mt-12 animate-fade-in">
                       <div className="flex items-center gap-4 mb-6">
                          <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-bold">2</span>
                          <h2 className="text-xl font-bold text-gray-900">ブラッシュアップ (編集) & PPT作成</h2>
                       </div>

                       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                          <div className="lg:col-span-2">
                             <div className="bg-white p-2 rounded-2xl shadow-lg border border-gray-100 relative group">
                                <img src={selectedImage.url} className="w-full rounded-xl" />
                                {isEditing && (
                                   <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-xl z-10">
                                      <div className="flex items-center gap-2 text-purple-600 font-semibold">
                                         <ArrowPathIcon className="w-6 h-6 animate-spin" />
                                         編集中...
                                      </div>
                                   </div>
                                )}
                                <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <a href={selectedImage.url} download="slide.png" className="bg-white/90 hover:bg-white text-gray-800 px-3 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2">
                                      <ArrowDownTrayIcon className="w-4 h-4" /> 画像DL
                                   </a>
                                   <button className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2">
                                      <PresentationChartLineIcon className="w-4 h-4" /> PPT作成
                                   </button>
                                </div>
                                {state.isAnimationMode && (
                                   <div className="absolute bottom-4 left-4 bg-gray-900/80 text-white px-3 py-1 rounded-lg text-xs">
                                      複数スライド版 (アニメーション用)
                                   </div>
                                )}
                             </div>
                          </div>

                          <div className="space-y-6">
                             <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <label className="block text-sm font-bold text-gray-700 mb-2">修正指示を入力</label>
                                <p className="text-xs text-gray-400 mb-3">「背景の人物を消して」「色をもっと明るく」「レトロなフィルターを追加」など</p>
                                <textarea
                                   className="w-full h-24 p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                                   placeholder="ここに修正内容を入力..."
                                   value={editInstruction}
                                   onChange={(e) => setEditInstruction(e.target.value)}
                                />
                                <div className="mt-3 flex justify-end">
                                   <button
                                      onClick={handleEditImage}
                                      disabled={!editInstruction || isEditing}
                                      className={`p-2 rounded-lg ${!editInstruction || isEditing ? 'text-gray-300' : 'text-purple-600 hover:bg-purple-50'}`}
                                   >
                                      <BoltIcon className="w-6 h-6" />
                                   </button>
                                </div>
                             </div>

                             <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                                <div className="flex items-center gap-2 mb-4 text-amber-700">
                                   <SparklesIcon className="w-5 h-5" />
                                   <h3 className="font-bold text-sm">AIからの提案</h3>
                                </div>
                                <ul className="space-y-3">
                                   {state.aiSuggestions.map((suggestion, idx) => (
                                      <li key={idx} className="flex gap-3 text-xs text-amber-900">
                                         <span className="text-amber-500 font-bold">•</span>
                                         {suggestion}
                                      </li>
                                   ))}
                                   {state.aiSuggestions.length === 0 && <li className="text-xs text-gray-500">提案なし</li>}
                                </ul>
                             </div>
                          </div>
                       </div>
                    </div>
                 )}
              </div>
            )}
          </>
        )}

        {/* ==================== PRESENTATION MODE ==================== */}
        {state.mode === AppMode.PRESENTATION && (
          <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
             <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">プレゼンテーション資料を作成</h2>
                <p className="text-gray-500 mb-6">1つの入力情報から、指定されたページ数に分割したプレゼンテーション資料を作成します。</p>

                {state.step === 1 && (
                   <div className="space-y-6">
                      <div className="relative">
                        <textarea
                           className="w-full h-32 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 transition-all resize-none text-gray-700"
                           placeholder="プレゼンのテーマや構成案を入力してください..."
                           value={state.prompt}
                           onChange={(e) => setState(prev => ({ ...prev, prompt: e.target.value }))}
                        />
                        <div className="absolute bottom-4 right-4 flex gap-2">
                           <input
                              type="file"
                              ref={csvInputRef}
                              accept=".csv"
                              className="hidden"
                              onChange={handleCsvUpload}
                           />
                           <button
                              onClick={() => csvInputRef.current?.click()}
                              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                              title="CSVファイルから構成を読み込む (スライド番号,タイトル,本文)"
                           >
                              <TableCellsIcon className="w-4 h-4" />
                              CSVで構成を読み込む
                           </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">ページ数</label>
                            <input
                               type="number"
                               min="1" max="10"
                               className="w-full p-3 border border-gray-300 rounded-lg"
                               value={state.imageCount}
                               onChange={(e) => setState(prev => ({...prev, imageCount: parseInt(e.target.value) || 4}))}
                            />
                         </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">デザインの複雑さ</label>
                            <div className="grid grid-cols-3 gap-3">
                              <button
                                 onClick={() => setState(prev => ({ ...prev, complexity: Complexity.STANDARD }))}
                                 className={`p-4 rounded-xl border-2 text-left transition-all ${state.complexity === Complexity.STANDARD ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white hover:border-purple-300'}`}
                              >
                                 <BuildingOfficeIcon className={`w-6 h-6 mb-2 ${state.complexity === Complexity.STANDARD ? 'text-purple-600' : 'text-gray-400'}`} />
                                 <div className="font-semibold text-sm text-gray-900">しっかり（標準）</div>
                                 <div className="text-xs text-gray-500 mt-1">ビジネス向け・詳細</div>
                              </button>
                              <button
                                 onClick={() => setState(prev => ({ ...prev, complexity: Complexity.LIGHT }))}
                                 className={`p-4 rounded-xl border-2 text-left transition-all ${state.complexity === Complexity.LIGHT ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white hover:border-purple-300'}`}
                              >
                                 <SparklesIcon className={`w-6 h-6 mb-2 ${state.complexity === Complexity.LIGHT ? 'text-purple-600' : 'text-gray-400'}`} />
                                 <div className="font-semibold text-sm text-gray-900">ライトめ</div>
                                 <div className="text-xs text-gray-500 mt-1">シンプル・親しみ</div>
                              </button>
                              <button
                                 onClick={() => setState(prev => ({ ...prev, complexity: Complexity.SIMPLE }))}
                                 className={`p-4 rounded-xl border-2 text-left transition-all ${state.complexity === Complexity.SIMPLE ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white hover:border-purple-300'}`}
                              >
                                 <BoltIcon className={`w-6 h-6 mb-2 ${state.complexity === Complexity.SIMPLE ? 'text-purple-600' : 'text-gray-400'}`} />
                                 <div className="font-semibold text-sm text-gray-900">非常にシンプル</div>
                                 <div className="text-xs text-gray-500 mt-1">要点のみ・インパクト</div>
                              </button>
                            </div>
                         </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div>
                           <label className="block text-sm font-medium text-gray-700 mb-2">デザインの要望 (任意)</label>
                           <input
                              type="text"
                              className="w-full p-3 border border-gray-300 rounded-lg"
                              placeholder="例: 青基調"
                              value={state.stylePreferences}
                              onChange={(e) => setState(prev => ({...prev, stylePreferences: e.target.value}))}
                           />
                        </div>
                        <div>
                           <label className="block text-sm font-medium text-gray-700 mb-2">参考画像 (任意・複数可)</label>
                           <div className="flex items-center gap-3">
                              {state.referenceImage ? (
                                 <div className="w-12 h-12 rounded border border-gray-200 overflow-hidden relative">
                                    <img src={state.referenceImage} className="w-full h-full object-cover" />
                                    <button onClick={() => setState(prev => ({...prev, referenceImage: null}))} className="absolute inset-0 bg-black/50 text-white text-xs">×</button>
                                 </div>
                              ) : null}

                              <div className="flex-1">
                                 <button onClick={() => fileInputRef.current?.click()} className="w-full h-12 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50">
                                    <PlusIcon className="w-5 h-5" />
                                 </button>
                                 <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleFileUpload}
                                 />
                              </div>
                           </div>
                           <p className="text-xs text-gray-400 mt-1">デフォルト画像から選択 または画像をアップロード</p>
                        </div>
                      </div>

                      <button
                        onClick={handleGenerateOutline}
                        disabled={!state.prompt || state.isGenerating}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                      >
                         {state.isGenerating ? (
                            <>
                               <ArrowPathIcon className="w-5 h-5 animate-spin" /> ページ構成を生成中...
                            </>
                         ) : (
                            <>
                               <DocumentDuplicateIcon className="w-5 h-5" /> ページ構成を提案してもらう
                            </>
                         )}
                      </button>
                   </div>
                )}

                {state.step === 2 && (
                   <div className="space-y-6">
                      <div className="flex items-center justify-between">
                         <h3 className="text-lg font-bold text-gray-900">ページ構成を確認・編集</h3>
                         <button onClick={() => goToStep(1)} className="text-sm text-gray-500 hover:text-purple-600 underline">最初からやり直す</button>
                      </div>
                      <p className="text-sm text-gray-600">各ページの構成を確認・編集できます。視覚表現・強調ポイント・温度感を調整することで、より効果的なスライドを生成できます。</p>

                      <div className="space-y-4">
                         {state.presentationOutline.map((page, idx) => (
                            <div key={idx} className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                               <div className="flex items-center gap-2 mb-2">
                                  <span className="bg-purple-200 text-purple-800 text-xs font-bold px-2 py-1 rounded">ページ {page.pageNumber}</span>
                               </div>
                               <div className="space-y-3">
                                  <div>
                                     <label className="text-xs font-semibold text-gray-500">タイトル</label>
                                     <input
                                       type="text"
                                       className="w-full p-2 border border-gray-300 rounded bg-white text-sm"
                                       value={page.title}
                                       onChange={(e) => handleOutlineChange(idx, 'title', e.target.value)}
                                     />
                                  </div>
                                  <div>
                                     <label className="text-xs font-semibold text-gray-500">内容</label>
                                     <textarea
                                       className="w-full p-2 border border-gray-300 rounded bg-white text-sm h-16 resize-none"
                                       value={page.content}
                                       onChange={(e) => handleOutlineChange(idx, 'content', e.target.value)}
                                     />
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                     <div>
                                        <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">🎨 視覚表現</label>
                                        <input type="text" className="w-full p-2 border border-gray-300 rounded bg-white text-xs" value={page.visualCue} onChange={(e) => handleOutlineChange(idx, 'visualCue', e.target.value)} />
                                     </div>
                                     <div>
                                        <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">⭐ 強調ポイント</label>
                                        <input type="text" className="w-full p-2 border border-gray-300 rounded bg-white text-xs" value={page.emphasis} onChange={(e) => handleOutlineChange(idx, 'emphasis', e.target.value)} />
                                     </div>
                                     <div>
                                        <label className="text-xs font-semibold text-gray-500 flex items-center gap-1">🌡️ 温度感</label>
                                        <input type="text" className="w-full p-2 border border-gray-300 rounded bg-white text-xs" value={page.mood} onChange={(e) => handleOutlineChange(idx, 'mood', e.target.value)} />
                                     </div>
                                  </div>
                               </div>
                            </div>
                         ))}
                      </div>

                      <button
                        onClick={handleGenerateDeck}
                        disabled={state.isGenerating}
                        className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                      >
                         {state.isGenerating ? (
                            <>
                               <ArrowPathIcon className="w-5 h-5 animate-spin" /> プレゼンテーション生成中...
                            </>
                         ) : (
                            <>
                               <PhotoIcon className="w-5 h-5" /> この構成で{state.presentationOutline.length}ページ分の画像を生成
                            </>
                         )}
                      </button>
                   </div>
                )}

                {state.step === 3 && (
                   <div className="space-y-6">
                      <div className="flex items-center justify-between">
                         <h3 className="text-xl font-bold text-gray-900">生成されたプレゼンテーション</h3>
                         <div className="flex gap-2">
                            <button
                                onClick={() => goToStep(2)}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2"
                            >
                               <ChevronLeftIcon className="w-4 h-4" /> 構成に戻る
                            </button>
                            <button 
                              onClick={handleSaveToDrive}
                              disabled={isSavingToDrive}
                              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                               {isSavingToDrive ? (
                                 <>
                                   <ArrowPathIcon className="w-5 h-5 animate-spin" /> 保存中...
                                 </>
                               ) : (
                                 <>
                                   <ArrowDownTrayIcon className="w-5 h-5" /> Googleドライブに保存
                                 </>
                               )}
                            </button>
                            <button className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                               <PresentationChartLineIcon className="w-5 h-5" /> PPTダウンロード
                            </button>
                            <button onClick={() => switchMode(AppMode.PRESENTATION)} className="text-gray-500 hover:text-gray-900 px-4 py-2 text-sm">新しく作成</button>
                         </div>
                      </div>
                      {driveSaveStatus && (
                        <div className={`p-3 rounded-lg text-sm ${driveSaveStatus.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {driveSaveStatus}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                         {state.generatedImages.map((img, idx) => {
                           const pageInfo = state.presentationOutline[idx];
                           return (
                             <div key={img.id} className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
                                <div className="bg-purple-600 text-white text-xs font-bold px-2 py-1 absolute z-10 m-2 rounded shadow">
                                   {idx + 1}/{state.generatedImages.length}
                                </div>
                                <img src={img.url} className="w-full aspect-video object-cover" />
                                <div className="p-4">
                                   <h4 className="font-bold text-gray-900 text-sm mb-1 truncate">{pageInfo?.title || `Page ${idx+1}`}</h4>
                                   <p className="text-xs text-purple-600 mb-2 truncate">{pageInfo?.content}</p>
                                   <button className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium py-2 rounded">
                                      画像DL
                                   </button>
                                </div>
                             </div>
                           );
                         })}
                      </div>
                   </div>
                )}
             </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
