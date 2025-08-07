import { GoogleGenerativeAI } from "@google/generative-ai"
import type { ProcessedCandle, TechnicalIndicators, TradingSignal } from "../types/trading"

export class GeminiService {
  private genAI: GoogleGenerativeAI
  private model: any

  constructor() {
    // The API key is provided directly in this environment.
    // Do not use process.env.NEXT_PUBLIC_GEMINI_API_KEY here.
    const apiKey = ""
    
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set. Please add NEXT_PUBLIC_GEMINI_API_KEY to your environment variables.");
    }
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
  }

  async enhanceAnalysis(
    candles: ProcessedCandle[],
    indicators: TechnicalIndicators,
    currentSignal: TradingSignal,
    currentSymbol: { displayName: string; priceDecimals: number },
  ): Promise<TradingSignal> {
    try {
      const marketData = this.prepareMarketData(candles, indicators, currentSignal, currentSymbol)
      const prompt = this.createAnalysisPrompt(marketData)

      const result = await this.model.generateContent(prompt)
      const response = await result.response
      const aiAnalysis = response.text()

      const enhancedSignal = this.parseAIResponse(
        aiAnalysis,
        currentSignal,
        candles[candles.length - 1].close,
        currentSymbol,
      )
      return enhancedSignal
    } catch (error) {
      console.error("Error in enhanceAnalysis:", error); // Log the error for debugging
      return currentSignal
    }
  }

  private prepareMarketData(
    candles: ProcessedCandle[],
    indicators: TechnicalIndicators,
    signal: TradingSignal,
    symbol: { displayName: string; priceDecimals: number },
  ) {
    const recent = candles.slice(-20)
    const currentPrice = candles[candles.length - 1].close
    // Ensure candles[candles.length - 1440] exists before accessing its properties
    const priceChange24h =
      ((currentPrice - (candles[candles.length - 1440]?.close || currentPrice)) /
        (candles[candles.length - 1440]?.close || currentPrice)) *
      100

    return {
      currentPrice,
      priceChange24h,
      volume: recent[recent.length - 1].volume,
      avgVolume: recent.reduce((sum, c) => sum + c.volume, 0) / recent.length,
      recentPrices: recent.map((c) => c.close),
      recentHighs: recent.map((c) => c.high),
      recentLows: recent.map((c) => c.low),
      indicators,
      currentSignal: signal,
      marketCap: "Major Pair", // EUR/USD is a major forex pair
      volatility: this.calculateVolatility(recent),
      symbolDisplayName: symbol.displayName,
      priceDecimals: symbol.priceDecimals,
    }
  }

  private calculateVolatility(candles: ProcessedCandle[]): number {
    const returns = []
    for (let i = 1; i < candles.length; i++) {
      const ret = Math.log(candles[i].close / candles[i - 1].close)
      returns.push(ret)
    }

    if (returns.length === 0) return 0; // Handle case with no returns to avoid division by zero

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length

    return Math.sqrt(variance) * 100
  }

  private createAnalysisPrompt(data: any): string {
    return `
Bạn là một chuyên gia phân tích giao dịch Forex ${data.symbolDisplayName} với 15 năm kinh nghiệm. Hãy phân tích dữ liệu thị trường sau và đưa ra dự đoán chính xác:

THÔNG TIN THỊ TRỊỜNG:
- Giá hiện tại: $${data.currentPrice.toFixed(data.priceDecimals)}
- Thay đổi 24h: ${data.priceChange24h.toFixed(2)}%
- Volume hiện tại: ${data.volume.toFixed(0)}
- Volume trung bình: ${data.avgVolume.toFixed(0)}
- Độ biến động: ${data.volatility.toFixed(2)}%

CHỈ SỐ KỸ THUẬT:
- RSI: ${data.indicators.rsi.toFixed(1)}
- MACD: ${data.indicators.macd.toFixed(4)}
- MACD Signal: ${data.indicators.macdSignal.toFixed(4)}
- SMA20: $${data.indicators.sma20.toFixed(data.priceDecimals)}
- SMA50: $${data.indicators.sma50.toFixed(data.priceDecimals)}
- EMA12: $${data.indicators.ema12.toFixed(data.priceDecimals)}
- EMA26: $${data.indicators.ema26.toFixed(data.priceDecimals)}

TÍN HIỆU HIỆN TẠI:
- Hành động: ${data.currentSignal.action}
- Độ tin cậy: ${data.currentSignal.confidence}%
- Xác suất thắng: ${data.currentSignal.probability}%
- Độ mạnh: ${data.currentSignal.strength}

GIÁ GẦN ĐÂY (5 tick): ${data.recentPrices
      .slice(-5)
      .map((p: number) => p.toFixed(data.priceDecimals))
      .join(", ")}

YÊU CẦU PHÂN TÍCH:
1. Đánh giá tổng thể thị trường (BULLISH/BEARISH/SIDEWAYS)
2. Xác định hành động tối ưu (BUY/SELL/HOLD)
3. Tính toán độ tin cậy chính xác (0-100%)
4. Dự đoán xác suất thắng (0-100%)
5. Đánh giá độ mạnh tín hiệu (WEAK/MODERATE/STRONG/VERY_STRONG)
6. Giải thích lý do chi tiết
7. Đề xuất giá vào lệnh, stop loss, take profit

ĐỊNH DẠNG PHẢN HỒI (JSON):
{
"action": "BUY|SELL|HOLD",
"confidence": số_từ_0_đến_100,
"probability": số_từ_0_đến_100,
"strength": "WEAK|MODERATE|STRONG|VERY_STRONG",
"reason": "Giải thích chi tiết bằng tiếng Việt",
"entry_price": giá_vào_lệnh,
"stop_loss": giá_cắt_lỗ,
"take_profit": giá_chốt_lời,
"market_outlook": "BULLISH|BEARISH|SIDEWAYS",
"risk_level": "LOW|MEDIUM|HIGH",
"time_horizon": "SHORT|MEDIUM|LONG"
}

Hãy phân tích kỹ lưỡng và đưa ra dự đoán chính xác nhất có thể!
    `
  }

  private parseAIResponse(
    aiResponse: string,
    fallbackSignal: TradingSignal,
    currentPrice: number,
    symbol: { priceDecimals: number },
  ): TradingSignal {
    try {
      // Extract JSON from AI response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error("No JSON found in AI response")
      }

      const aiAnalysis = JSON.parse(jsonMatch[0])

      const priceDecimals = symbol.priceDecimals || 5 // Default to 5 if not provided

      return {
        action: aiAnalysis.action || fallbackSignal.action,
        confidence: Math.min(Math.max(aiAnalysis.confidence || fallbackSignal.confidence, 0), 100),
        timestamp: Date.now(),
        reason: aiAnalysis.reason || fallbackSignal.reason, // Use AI's reason if available
        probability: Math.min(Math.max(aiAnalysis.probability || fallbackSignal.probability, 0), 100),
        strength: aiAnalysis.strength || fallbackSignal.strength,
        entry_price: Number.parseFloat((aiAnalysis.entry_price || currentPrice).toFixed(priceDecimals)),
        stop_loss: Number.parseFloat((aiAnalysis.stop_loss || fallbackSignal.stop_loss).toFixed(priceDecimals)),
        take_profit: Number.parseFloat((aiAnalysis.take_profit || fallbackSignal.take_profit).toFixed(priceDecimals)),
        market_outlook: aiAnalysis.market_outlook || "UNKNOWN", // Added new field
        risk_level: aiAnalysis.risk_level || "MEDIUM", // Added new field
        time_horizon: aiAnalysis.time_horizon || "SHORT", // Added new field
      }
    } catch (error) {
      console.error("Error parsing AI response:", error); // Log the parsing error
      return {
        ...fallbackSignal,
        reason: `🤖 AI Analysis: ${fallbackSignal.reason} (AI processing error, using technical analysis)`,
        confidence: Math.min(fallbackSignal.confidence + 5, 95), // Slight boost for attempting AI
      }
    }
  }

  async getMarketSentiment(): Promise<string> {
    try {
      const prompt = `
Phân tích tâm lý thị trường Forex hiện tại, tập trung vào cặp EUR/USD dựa trên:
- Tin tức kinh tế vĩ mô gần đây (lãi suất, lạm phát, việc làm của Mỹ và EU)
- Xu hướng của chỉ số DXY (US Dollar Index)
- Các sự kiện chính trị lớn ảnh hưởng đến EUR/USD

Trả về một trong các giá trị: EXTREMELY_BULLISH, BULLISH, NEUTRAL, BEARISH, EXTREMELY_BEARISH
Kèm theo giải thích ngắn gọn bằng tiếng Việt.

Định dạng: SENTIMENT|Giải thích
      `

      const result = await this.model.generateContent(prompt)
      const response = await result.response
      return response.text()
    } catch (error) {
      console.error("Error getting market sentiment:", error); // Log the error
      return "NEUTRAL|Không thể phân tích tâm lý thị trường"
    }
  }
}
