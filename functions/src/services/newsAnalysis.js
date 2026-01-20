const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY
});

/**
 * Get company name from Yahoo Finance
 */
async function getCompanyName(ticker) {
  try {
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
      { timeout: 5000 }
    );
    
    const meta = response.data.chart.result?.[0]?.meta;
    if (meta?.shortName) {
      // Clean up the name (remove Inc., Corp., etc. for better search)
      let name = meta.shortName;
      name = name.replace(/,?\s*(Inc\.?|Corp\.?|Corporation|Ltd\.?|LLC|PLC|N\.?V\.?|S\.?A\.?)$/i, '');
      return name.trim();
    }
    
    return null;
  } catch (error) {
    console.error(`Failed to get company name for ${ticker}:`, error.message);
    return null;
  }
}

/**
 * Fetch real news from NewsAPI
 */
async function fetchNews(ticker, companyName = null) {
  if (!NEWS_API_KEY) {
    console.warn('NEWS_API_KEY not set, using mock data');
    return null;
  }

  try {
    // Use provided company name or fall back to ticker
    const searchTerm = companyName || ticker;
    
    console.log(`Searching news for: "${searchTerm} stock"`);
    
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: `${searchTerm} stock`,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 5,
        apiKey: NEWS_API_KEY
      },
      timeout: 10000
    });

    if (response.data.articles && response.data.articles.length > 0) {
      console.log(`✓ Found ${response.data.articles.length} articles for ${ticker}`);
      return response.data.articles.map(article => ({
        title: article.title || '',
        description: article.description || '',
        source: article.source?.name || 'Unknown',
        publishedAt: article.publishedAt,
        url: article.url
      }));
    }

    console.log(`○ No articles found for ${ticker}`);
    return [];

  } catch (error) {
    console.error(`NewsAPI error for ${ticker}:`, error.message);
    
    if (error.response?.status === 401) {
      console.error('Invalid NEWS_API_KEY');
    } else if (error.response?.status === 429) {
      console.error('NewsAPI rate limit exceeded');
    }
    
    return null;
  }
}

/**
 * Generate mock news as fallback when NewsAPI fails or isn't configured
 */
function generateMockNews(ticker) {
  const templates = [
    `${ticker} shares trade mixed amid broader market movements`,
    `Analysts maintain current outlook on ${ticker} stock`,
    `${ticker} continues to track sector performance`,
    `Investors watch ${ticker} ahead of upcoming earnings`,
    `${ticker} holds steady in current trading session`
  ];

  return templates.slice(0, 3).map((title, i) => ({
    title,
    description: `Market update regarding ${ticker} stock performance and investor sentiment.`,
    source: ['Reuters', 'Bloomberg', 'MarketWatch'][i],
    publishedAt: new Date(Date.now() - i * 3600000).toISOString()
  }));
}

/**
 * Analyze sentiment using Claude API
 */
async function analyzeSentiment(ticker, newsArticles) {
  if (!newsArticles || newsArticles.length === 0) {
    return {
      sentiment: 'neutral',
      confidence: 30,
      summary: 'No recent news available',
      reasoning: 'No articles found'
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
- very_positive: Major breakthrough, exceptional earnings, game-changing announcement (75-95 confidence)
- very_negative: Major scandal, huge losses, regulatory crisis (75-95 confidence)
- positive/negative: Good/bad news but not extraordinary (60-80 confidence)
- neutral: Mixed news or routine updates (40-70 confidence)

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

    // Parse JSON (handle potential markdown code blocks)
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
    
    return {
      sentiment: 'neutral',
      confidence: 40,
      summary: 'Unable to analyze sentiment',
      reasoning: 'Analysis error occurred'
    };
  }
}

/**
 * Get complete sentiment analysis for a stock
 */
async function getStockSentiment(ticker) {
  console.log(`Analyzing sentiment for ${ticker}...`);

  // Get company name dynamically from Yahoo Finance
  const companyName = await getCompanyName(ticker);
  console.log(`Company name for ${ticker}: ${companyName || 'not found, using ticker'}`);

  // Try real news first, fallback to mock
  let news = await fetchNews(ticker, companyName);
  let usingMockData = false;

  if (news === null) {
    console.log(`Using mock news for ${ticker}`);
    news = generateMockNews(ticker);
    usingMockData = true;
  } else if (news.length === 0) {
    console.log(`No news found for ${ticker}, using mock`);
    news = generateMockNews(ticker);
    usingMockData = true;
  }

  // Analyze with Claude
  const analysis = await analyzeSentiment(ticker, news);

  return {
    ticker,
    sentiment: analysis.sentiment,
    confidence: analysis.confidence,
    summary: analysis.summary,
    reasoning: analysis.reasoning || '',
    newsCount: news.length,
    usingMockData,
    companyName: companyName || ticker,
    analyzedAt: new Date().toISOString()
  };
}

module.exports = {
  getCompanyName,
  fetchNews,
  analyzeSentiment,
  getStockSentiment
};