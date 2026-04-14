const axios = require('axios');
const { JSDOM } = require('jsdom');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'interview_master.db'));

// 更多文章来源
const SOURCES = {
  '前端': [
    'https://www.runoob.com/react/react-tutorial.html',
    'https://www.runoob.com/vue2/vue-tutorial.html',
    'https://www.runoob.com/w3cnote/nodejs-tutorial.html',
    'https://www.runoob.com/typescript/ts-tutorial.html',
  ],
  'Java基础': [
    'https://www.runoob.com/java/java-files-io.html',
    'https://www.runoob.com/java/java-collections.html',
  ],
  'AI': [
    'https://platform.openai.com/docs/guides/text-generation',
    'https://python.langchain.com/docs/get_started/introduction',
  ],
  'Agent': [
    'https://docs.langchain.com/docs/langgraph',
    'https://microsoft.github.io/autogen/',
  ],
  'JVM': [
    'https://www.runoob.com/w3cnote/jvm-learning.html',
  ],
  '数据库': [
    'https://www.runoob.com/mysql/mysql-tutorial.html',
  ],
};

async function fetchPage(url) {
  try {
    const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    return new JSDOM(res.data);
  } catch (e) {
    console.error(`获取失败: ${url}`);
    return null;
  }
}

async function scrapeArticles() {
  let total = 0;
  
  for (const [category, urls] of Object.entries(SOURCES)) {
    console.log(`\n=== ${category} ===`);
    
    for (const url of urls) {
      const dom = await fetchPage(url);
      if (!dom) continue;
      
      const doc = dom.window.document;
      const main = doc.querySelector('main, .content, #main, article') || doc.body;
      const headings = main.querySelectorAll('h2, h3');
      
      let count = 0;
      headings.forEach(h => {
        const title = h.textContent.trim();
        if (title.length < 5 || title.length > 80) return;
        
        let body = '';
        let sibling = h.nextElementSibling;
        while (sibling && !['H2', 'H3'].includes(sibling.tagName)) {
          body += sibling.textContent.trim() + ' ';
          sibling = sibling.nextElementSibling;
        }
        body = body.trim().substring(0, 3000);
        
        if (body.length > 100) {
          try {
            db.prepare(`INSERT OR IGNORE INTO articles (id, category, title, content, created_at) VALUES (?, ?, ?, ?, ?)`)
              .run(uuidv4(), category, title, body, new Date().toISOString());
            count++;
          } catch (e) {}
        }
      });
      
      if (count > 0) console.log(`  ✓ ${count} 篇`);
      total += count;
    }
  }
  
  return total;
}

(async () => {
  console.log('开始爬取更多文章...');
  const n = await scrapeArticles();
  console.log(`\n完成！新增 ${n} 篇文章`);
  
  const total = db.prepare('SELECT COUNT(*) as c FROM articles').get().c;
  console.log(`总计: ${total} 篇`);
  db.close();
})();
