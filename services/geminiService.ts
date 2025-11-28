import { GoogleGenAI, Type, SchemaType } from "@google/genai";
import { Complexity, GeneratedImage, PresentationPage } from "../types";

// Helper to get client instance with current key
const getAiClient = () => {
  // Vercel環境変数から読み取る（VITE_プレフィックスが必要）
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (window as any).aistudio?.getApiKey?.();
  if (!apiKey) {
    throw new Error("APIキーが見つかりません。環境変数VITE_GEMINI_API_KEYを設定するか、キーを選択してください。");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Generates suggestions for improving a slide based on the topic.
 */
export const generateSuggestions = async (topic: string): Promise<string[]> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `"${topic}"に関するプレゼンテーションスライドを視覚的に改善するための、具体的で短い3つのポイントを日本語で提案してください。
      レイアウト、色、明瞭さに焦点を当ててください。有効なJSON文字列配列として返してください。`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text);
    }
    return ["コントラストを上げる", "テキストを簡潔にする", "配色を統一する"];
  } catch (error) {
    console.error("Error generating suggestions:", error);
    return ["テキストの密度を減らす", "高品質なアイコンを使用する", "十分なコントラストを確保する"];
  }
};

/**
 * Generates a presentation outline (JSON) based on topic and page count.
 */
export const generatePresentationOutline = async (
  topic: string,
  pageCount: number,
  complexity: Complexity
): Promise<PresentationPage[]> => {
  const ai = getAiClient();
  
  const prompt = `あなたはプロのプレゼンテーション構成作家です。
  以下のテーマで${pageCount}枚のプレゼンテーション資料の構成を作成してください。
  
  テーマ: ${topic}
  複雑さ: ${complexity}
  
  各ページについて、以下の要素を含むJSON配列を返してください:
  - pageNumber: ページ番号
  - title: スライドのタイトル
  - content: スライドの具体的なテキスト内容（箇条書きなど）
  - visualCue: 生成AIへの画像生成指示（視覚表現の具体的な説明）
  - emphasis: 強調ポイント
  - mood: 温度感（例：信頼感、危機感、希望など）

  言語は日本語でお願いします。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              pageNumber: { type: Type.INTEGER },
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              visualCue: { type: Type.STRING },
              emphasis: { type: Type.STRING },
              mood: { type: Type.STRING }
            }
          }
        }
      }
    });

    const text = response.text;
    if (text) return JSON.parse(text);
    return [];
  } catch (e) {
    console.error("Outline generation failed", e);
    throw e;
  }
};

/**
 * Generates presentation infographics using Gemini 3 Pro Image Preview
 * Supports Reference Image and Animation Mode
 */
export const generateInfographics = async (
  prompt: string,
  complexity: Complexity,
  style: string,
  count: number,
  referenceImage: string | null,
  isAnimationMode: boolean
): Promise<GeneratedImage[]> => {
  const ai = getAiClient();

  let complexityPrompt = "";
  switch (complexity) {
    case Complexity.STANDARD:
      complexityPrompt = "標準的なビジネスインフォグラフィック。テキストとビジュアルのバランスが良い。プロフェッショナルで詳細。";
      break;
    case Complexity.LIGHT:
      complexityPrompt = "明るく軽やかなインフォグラフィック。余白を効果的に使用。清潔感がありモダン。";
      break;
    case Complexity.SIMPLE:
      complexityPrompt = "非常にシンプルなスライド。インパクト重視で詳細は省く。一つの重要なメッセージに焦点を当てる。";
      break;
  }

  let fullPrompt = `高品質なプレゼンテーションスライドまたはインフォグラフィックを作成してください。
  テーマ: ${prompt}
  スタイル: ${style}
  複雑さ: ${complexityPrompt}
  プロフェッショナルなプレゼンテーションに適した画像にしてください。
  アスペクト比: 16:9
  言語: 日本語
  `;

  if (isAnimationMode) {
    fullPrompt += `
    【重要】アニメーション用の連作スライドを作成してください。
    1枚の完成図を${count}段階のステップに分割し、徐々に要素が増えていく、または変化していく様子を描写してください。
    例: Step 1: 背景と基本図形のみ -> Step 2: 矢印とアイコンが追加 -> Step 3: 詳細テキストと強調効果が追加。
    それぞれの画像が一連のアニメーションとして成立するように整合性を保ってください。
    `;
  }

  const parts: any[] = [{ text: fullPrompt }];

  // Add reference image if provided
  if (referenceImage) {
    const match = referenceImage.match(/^data:(.+);base64,(.+)$/);
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2]
        }
      });
      parts[0].text += "\n\n提供された画像のスタイル、配色、トーン＆マナーを厳密に参考にしてください。";
    }
  }

  // We generate sequentially or in parallel depending on requirements. 
  // For animation/reference consistency, sometimes single request with multiple images is better, 
  // but Gemini API currently generates one main image per 'generateContent' usually unless requested otherwise or via Imagen.
  // We will loop.
  
  const promises = Array.from({ length: count }).map(async (_, index) => {
    try {
      const currentPrompt = isAnimationMode 
        ? `${fullPrompt}\nこれはアニメーションのステップ ${index + 1} / ${count} です。前のステップの要素を含みつつ、新しい情報を追加してください。`
        : fullPrompt;

      const requestParts = [...parts];
      requestParts[0] = { text: currentPrompt };

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: requestParts,
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: "1K"
          }
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64Data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          return {
            id: `gen-${Date.now()}-${index}`,
            url: `data:${mimeType};base64,${base64Data}`,
            promptUsed: currentPrompt
          };
        }
      }
    } catch (e) {
      console.error(`Generation failed for image ${index + 1}`, e);
      return null;
    }
    return null;
  });

  const results = await Promise.all(promises);
  return results.filter((img): img is GeneratedImage => img !== null);
};


/**
 * Generates a single slide image for a specific presentation page
 */
export const generatePresentationPageImage = async (
  page: PresentationPage,
  style: string,
  referenceImage: string | null
): Promise<GeneratedImage | null> => {
  const ai = getAiClient();
  
  // Use fallbacks if specific instructions are missing (e.g. from CSV import)
  const visualCue = page.visualCue || "スライドの内容を効果的に伝える、プロフェッショナルなビジュアルや図解を自動的に生成してください。";
  const emphasis = page.emphasis || "内容の要点を視覚的に強調する";
  const mood = page.mood || "信頼感のある";

  const prompt = `プレゼンテーションスライドを作成してください。
  ページ: ${page.pageNumber}
  タイトル: ${page.title}
  内容: ${page.content}
  
  視覚表現の指示: ${visualCue}
  強調ポイント: ${emphasis}
  温度感: ${mood}
  スタイル: ${style}
  
  文字は日本語で、読みやすく配置してください。インフォグラフィック要素を取り入れてください。`;

  const parts: any[] = [{ text: prompt }];

  if (referenceImage) {
    const match = referenceImage.match(/^data:(.+);base64,(.+)$/);
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2]
        }
      });
      parts[0].text += "\n\n【最重要】提供された画像のスタイル（配色、フォントの雰囲気、アイコンのスタイル）を維持して、統一感のあるスライドセットの一部として作成してください。";
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64Data = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png';
        return {
          id: `pres-page-${page.pageNumber}-${Date.now()}`,
          url: `data:${mimeType};base64,${base64Data}`,
          promptUsed: prompt
        };
      }
    }
  } catch (e) {
    console.error(`Page ${page.pageNumber} generation failed`, e);
    return null;
  }
  return null;
};

/**
 * Edits an existing image using Gemini 2.5 Flash Image
 */
export const editInfographic = async (
  base64Image: string,
  instruction: string
): Promise<GeneratedImage | null> => {
  try {
    const ai = getAiClient();
    
    // Extract base64 data and mime type
    const match = base64Image.match(/^data:(.+);base64,(.+)$/);
    if (!match) throw new Error("Invalid base64 image data");
    
    const mimeType = match[1];
    const data = match[2];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data
            }
          },
          {
            text: `この画像を編集してください: ${instruction}。全体的なレイアウトは維持しつつ、要求された変更を適用してください。`
          }
        ]
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const newBase64Data = part.inlineData.data;
        const newMimeType = part.inlineData.mimeType || 'image/png';
        return {
          id: `edit-${Date.now()}`,
          url: `data:${newMimeType};base64,${newBase64Data}`,
          promptUsed: instruction
        };
      }
    }
  } catch (error) {
    console.error("Error editing image:", error);
    throw error;
  }
  return null;
};