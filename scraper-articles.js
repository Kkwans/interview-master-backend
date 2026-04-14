const axios = require('axios');
const { JSDOM } = require('jsdom');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'interview_master.db'));

// 文章来源配置
const SOURCES = {
  'Java基础': [
    'https://javaguide.cn/java/basis/',
    'https://www.runoob.com/java/java-tutorial.html',
  ],
  'JVM': [
    'https://javaguide.cn/java/jvm/',
    'https://xiaolincoding.com/jvm/',
  ],
  'Redis': [
    'https://javaguide.cn/database/redis/redis-questions-01.html',
    'https://xiaolincoding.com/redis/',
  ],
  '计算机网络': [
    'https://javaguide.cn/cs-basics/network/',
    'https://xiaolincoding.com/os/',
  ],
  '前端': [
    'https://www.runoob.com/html/html-tutorial.html',
    'https://www.runoob.com/css/css-tutorial.html',
    'https://www.runoob.com/js/js-tutorial.html',
  ],
  'AI': [
    'https://www.promptingguide.cn/',
    'https://python.langchain.com/',
  ],
};

// 通用爬取函数
async function fetchPage(url) {
  try {
    const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return new JSDOM(res.data);
  } catch (e) {
    console.error(`获取失败: ${url}`, e.message);
    return null;
  }
}

// 爬取文章
async function scrapeArticles() {
  const results = [];
  
  for (const [category, urls] of Object.entries(SOURCES)) {
    console.log(`\n=== 爬取分类: ${category} ===`);
    
    for (const url of urls) {
      const dom = await fetchPage(url);
      if (!dom) continue;
      
      const doc = dom.window.document;
      
      // 提取文章标题和内容
      const title = doc.querySelector('title')?.textContent || '';
      const h1s = doc.querySelectorAll('h1, h2');
      const content = [];
      
      h1s.forEach(h => {
        const text = h.textContent.trim();
        if (text.length > 5 && text.length < 100) {
          // 获取该标题下的内容
          let sectionContent = '';
          let sibling = h.nextElementSibling;
          while (sibling && sibling.tagName !== 'H1' && sibling.tagName !== 'H2') {
            sectionContent += sibling.textContent.trim() + '\n';
            sibling = sibling.nextElementSibling;
          }
          if (sectionContent.length > 50) {
            content.push({ title: text, body: sectionContent.substring(0, 2000) });
          }
        }
      });
      
      // 保存到数据库
      for (const c of content) {
        try {
          const id = uuidv4();
          db.prepare(`INSERT OR IGNORE INTO articles (id, category, title, content, created_at) VALUES (?, ?, ?, ?, ?)`)
            .run(id, category, c.title, c.body, new Date().toISOString());
          results.push({ category, title: c.title });
        } catch (e) {
          // 忽略重复
        }
      }
      console.log(`  ✓ ${url} - ${content.length} 篇`);
    }
  }
  
  return results;
}

// 测试
(async () => {
  console.log('开始爬取文章...');
  const results = await scrapeArticles();
  console.log(`\n完成！共爬取 ${results.length} 篇文章`);
  process.exit(0);
})();
