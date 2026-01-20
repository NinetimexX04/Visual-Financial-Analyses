const Anthropic = require('@anthropic-ai/sdk');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY
});

// Stocks that will always have dramatic news for demo purposes
const DEMO_DRAMATIC_STOCKS = {
  // Very positive - breakthrough news
  'NVDA': 'very_positive',
  'TSLA': 'very_positive',
  'XOM': 'very_positive',
  // Very negative - crisis news
  'META': 'very_negative',
  'PFE': 'very_negative',
  'BAC': 'very_negative',
};

/**
 * Generate realistic mock news based on recent stock performance
 * This simulates what NewsAPI would return
 */
function generateMockNews(ticker, priceChange) {
  // Check if this is a demo stock with forced sentiment
  const forcedSentiment = DEMO_DRAMATIC_STOCKS[ticker];

  const newsTemplates = {
    very_positive: [
      `BREAKING: ${ticker} announces revolutionary breakthrough, stock soars in after-hours trading`,
      `${ticker} reports record-shattering earnings, beats estimates by 40%`,
      `Major institutional investors pile into ${ticker} amid historic growth`,
      `${ticker} secures massive $50B government contract, analysts call it "game-changing"`,
      `FDA grants ${ticker} fast-track approval for blockbuster treatment`,
      `${ticker} CEO announces industry-disrupting AI partnership with unprecedented potential`
    ],
    very_negative: [
      `BREAKING: ${ticker} faces federal investigation, executives subpoenaed`,
      `${ticker} announces massive layoffs amid catastrophic revenue decline`,
      `Class action lawsuit filed against ${ticker} for alleged fraud`,
      `${ticker} loses major contract worth billions, stock in freefall`,
      `Whistleblower reveals serious safety concerns at ${ticker} facilities`,
      `${ticker} credit rating downgraded to junk status by major agencies`
    ],
    positive: [
      `${ticker} announces strong quarterly earnings, beating analyst expectations`,
      `Analysts upgrade ${ticker} to 'buy' rating on improved fundamentals`,
      `${ticker} unveils new product line, shares surge on innovation`,
      `Institutional investors increase stake in ${ticker} amid growth prospects`,
      `${ticker} expands into new markets, revenue growth accelerates`
    ],
    negative: [
      `${ticker} faces regulatory scrutiny, shares decline on uncertainty`,
      `Analysts downgrade ${ticker} citing increased competition`,
      `${ticker} misses revenue targets, CEO addresses investor concerns`,
      `Market volatility impacts ${ticker} performance this quarter`,
      `${ticker} reports supply chain challenges affecting margins`
    ],
    neutral: [
      `${ticker} maintains steady performance in current market conditions`,
      `Industry experts discuss ${ticker}'s position in competitive landscape`,
      `${ticker} announces routine operational updates for investors`,
      `Analysts maintain hold rating on ${ticker} pending market clarity`,
      `${ticker} releases standard quarterly guidance in line with expectations`
    ]
  };

  // Determine category - use forced sentiment for demo stocks
  let category;
  if (forcedSentiment) {
    category = forcedSentiment;
  } else if (priceChange > 4) {
    category = 'very_positive';
  } else if (priceChange < -4) {
    category = 'very_negative';
  } else if (priceChange > 1.5) {
    category = 'positive';
  } else if (priceChange < -1.5) {
    category = 'negative';
  } else {
    category = 'neutral';
  }

  const templates = newsTemplates[category];
  const articles = [];

  // Generate 3-5 mock articles
  const numArticles = Math.floor(Math.random() * 3) + 3;
  const usedTemplates = new Set();

  for (let i = 0; i < numArticles; i++) {
    let template;
    do {
      template = templates[Math.floor(Math.random() * templates.length)];
    } while (usedTemplates.has(template) && usedTemplates.size < templates.length);
    usedTemplates.add(template);

    const sources = ['Bloomberg', 'Reuters', 'CNBC', 'Wall Street Journal', 'Financial Times', 'MarketWatch'];

    articles.push({
      title: template,
      description: generateDescription(ticker, category),
      source: sources[i % sources.length],
      publishedAt: new Date(Date.now() - Math.random() * 12 * 60 * 60 * 1000).toISOString()
    });
  }

  return articles;
}

function generateDescription(ticker, category) {
  const descriptions = {
    very_positive: [
      `Markets react enthusiastically as ${ticker} delivers news that analysts are calling a major turning point for the company and potentially the entire sector.`,
      `Investors are scrambling to increase positions as ${ticker} announces developments that could reshape its competitive position for years to come.`
    ],
    very_negative: [
      `Shareholders express serious concern as ${ticker} faces challenges that analysts warn could have lasting implications for the company's future.`,
      `Market watchers are closely monitoring the situation as ${ticker} navigates what some are calling a potential crisis point.`
    ],
    positive: [
      `Market analysis suggests positive outlook for ${ticker} based on recent developments and improving fundamentals.`,
      `Investors respond favorably to ${ticker} news, with analysts noting improved prospects ahead.`
    ],
    negative: [
      `Analysts express caution regarding ${ticker} following recent developments that have raised concerns among investors.`,
      `Market sentiment turns cautious on ${ticker} as traders assess potential headwinds.`
    ],
    neutral: [
      `Market analysis suggests stable outlook for ${ticker} based on recent developments and trading patterns.`,
      `${ticker} continues to trade within expected ranges as investors await further catalysts.`
    ]
  };

  const options = descriptions[category];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Analyze sentiment using Claude API with mock news
 */
async function analyzeSentiment(ticker, newsArticles) {
  if (newsArticles.length === 0) {
    return {
      sentiment: 'neutral',
      confidence: 0,
      summary: 'No recent news available',
      reasoning: 'No articles found in the last 24 hours'
    };
  }

  const newsText = newsArticles
    .map((article, i) => {
      return `Article ${i + 1} (${article.source}):
Title: ${article.title}
Description: ${article.description}
Published: ${new Date(article.publishedAt).toLocaleString()}`;
    })
    .join('\n\n');

  const prompt = `You are a financial analyst reviewing recent news about ${ticker} stock.

Analyze the following news articles and determine:
1. Overall sentiment: very_positive, positive, neutral, negative, or very_negative
2. Confidence level (0-100): How certain are you about this sentiment?
3. Brief summary: One sentence explaining the key news
4. Reasoning: Why did you choose this sentiment?

Guidelines:
- very_positive: Major breakthrough, exceptional earnings, game-changing announcement - use 75-95 confidence
- very_negative: Major scandal, huge losses, regulatory crisis, leadership crisis - use 75-95 confidence
- positive/negative: Good/bad news but not extraordinary - use 60-80 confidence
- neutral: Mixed news or routine updates - use 40-70 confidence

IMPORTANT: If the news contains words like "BREAKING", "record-shattering", "revolutionary", "crisis", "investigation", "fraud", or "catastrophic" - these are STRONG signals for very_positive or very_negative sentiment with HIGH confidence (80+).

Recent news articles:
${newsText}

Respond ONLY with valid JSON in this exact format:
{
  "sentiment": "very_positive|positive|neutral|negative|very_negative",
  "confidence": 85,
  "summary": "Brief one-sentence summary here",
  "reasoning": "Brief explanation of sentiment choice"
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = message.content[0].text;

    // Try to parse JSON (handle potential markdown code blocks)
    let jsonText = responseText;
    if (responseText.includes('```json')) {
      jsonText = responseText.split('```json')[1].split('```')[0].trim();
    } else if (responseText.includes('```')) {
      jsonText = responseText.split('```')[1].split('```')[0].trim();
    }

    const analysis = JSON.parse(jsonText);

    if (!analysis.sentiment || !analysis.summary) {
      throw new Error('Invalid response structure from Claude');
    }

    return analysis;

  } catch (error) {
    console.error(`Claude analysis error for ${ticker}:`, error.message);

    // Fallback: return sentiment based on demo stock list
    const forcedSentiment = DEMO_DRAMATIC_STOCKS[ticker];
    if (forcedSentiment) {
      return {
        sentiment: forcedSentiment,
        confidence: 85,
        summary: forcedSentiment === 'very_positive'
          ? `Major positive developments reported for ${ticker}`
          : `Significant concerns emerging for ${ticker}`,
        reasoning: 'Based on recent breaking news reports'
      };
    }

    return {
      sentiment: 'neutral',
      confidence: 50,
      summary: 'Analysis pending',
      reasoning: 'Unable to complete full analysis'
    };
  }
}

/**
 * Get complete sentiment analysis for a stock
 * Uses mock news + real Claude AI analysis
 */
async function getStockSentiment(ticker, stockData = null) {
  console.log(`Analyzing sentiment for ${ticker}...`);

  // Use actual price change if provided, otherwise random
  const priceChange = stockData?.changePercent || (Math.random() * 10 - 5);

  // Generate realistic mock news based on price movement
  const news = generateMockNews(ticker, priceChange);

  // Use real Claude AI to analyze the mock news
  const analysis = await analyzeSentiment(ticker, news);

  return {
    ticker,
    sentiment: analysis.sentiment,
    confidence: analysis.confidence,
    summary: analysis.summary,
    reasoning: analysis.reasoning || '',
    newsCount: news.length,
    analyzedAt: new Date().toISOString(),
    priceChange: priceChange
  };
}

module.exports = {
  analyzeSentiment,
  getStockSentiment
};
