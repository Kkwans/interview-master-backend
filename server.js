const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'interview-master-secret-key-2026';

app.use(cors());
app.use(express.json());

// 数据库初始化
const db = new Database(path.join(__dirname, 'interview_master.db'));

// 初始化数据库表
function initDB() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 题库表
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      difficulty TEXT DEFAULT 'medium',
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      answer TEXT NOT NULL,
      explanation TEXT,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 知识点/文章表
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 用户进度表
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      question_id TEXT,
      article_id TEXT,
      status TEXT DEFAULT 'pending',
      correct_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      last_review DATETIME,
      next_review DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 错题本表
  db.exec(`
    CREATE TABLE IF NOT EXISTS wrong_answers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      wrong_option TEXT,
      answered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 模拟面试记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      questions TEXT NOT NULL,
      answers TEXT,
      scores TEXT,
      total_score INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('数据库初始化完成');
}

initDB();

// ============ 认证API ============

// 注册
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码必填' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();
    
    try {
      const stmt = db.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)');
      stmt.run(id, username, hashedPassword);
      res.json({ success: true, userId: id, username });
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        res.status(400).json({ error: '用户名已存在' });
      } else {
        throw e;
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 登录
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, userId: user.id, username: user.username });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 中间件：验证token
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: '未授权' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (e) {
    res.status(401).json({ error: 'token无效' });
  }
}

// ============ 题库API ============

// 获取题库（支持分类筛选）
app.get('/api/questions', (req, res) => {
  const { category, difficulty, limit = 100 } = req.query;
  let sql = 'SELECT * FROM questions';
  const params = [];
  const conditions = [];
  
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (difficulty) {
    conditions.push('difficulty = ?');
    params.push(difficulty);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' LIMIT ?';
  params.push(parseInt(limit));
  
  const questions = db.prepare(sql).all(...params);
  questions.forEach(q => q.options = JSON.parse(q.options));
  res.json(questions);
});

// 获取题目分类
app.get('/api/categories', (req, res) => {
  const categories = db.prepare('SELECT DISTINCT category FROM questions').all();
  res.json(categories.map(c => c.category));
});

// 添加题目
app.post('/api/questions', authMiddleware, (req, res) => {
  const { category, difficulty, question, options, answer, explanation, source } = req.body;
  const id = uuidv4();
  
  const stmt = db.prepare(`
    INSERT INTO questions (id, category, difficulty, question, options, answer, explanation, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, category, difficulty || 'medium', question, JSON.stringify(options), answer, explanation, source);
  
  res.json({ success: true, id });
});

// ============ 文章API ============

// 获取文章列表
app.get('/api/articles', (req, res) => {
  const { category, limit = 50 } = req.query;
  let sql = 'SELECT id, category, title, source, created_at FROM articles';
  const params = [];
  
  if (category) {
    sql += ' WHERE category = ?';
    params.push(category);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));
  
  const articles = db.prepare(sql).all(...params);
  res.json(articles);
});

// 获取文章详情
app.get('/api/articles/:id', (req, res) => {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) {
    return res.status(404).json({ error: '文章不存在' });
  }
  res.json(article);
});

// 添加文章
app.post('/api/articles', authMiddleware, (req, res) => {
  const { category, title, content, source } = req.body;
  const id = uuidv4();
  
  const stmt = db.prepare('INSERT INTO articles (id, category, title, content, source) VALUES (?, ?, ?, ?, ?)');
  stmt.run(id, category, title, content, source);
  
  res.json({ success: true, id });
});

// 获取文章分类
app.get('/api/article-categories', (req, res) => {
  const categories = db.prepare('SELECT DISTINCT category FROM articles').all();
  res.json(categories.map(c => c.category));
});

// ============ 用户进度API ============

// 获取用户进度
app.get('/api/progress', authMiddleware, (req, res) => {
  const progress = db.prepare('SELECT * FROM user_progress WHERE user_id = ?').all(req.userId);
  res.json(progress);
});

// 记录答题结果
app.post('/api/progress', authMiddleware, (req, res) => {
  const { questionId, correct } = req.body;
  
  const existing = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND question_id = ?')
    .get(req.userId, questionId);
  
  if (existing) {
    const stmt = db.prepare(`
      UPDATE user_progress 
      SET correct_count = correct_count + ?, wrong_count = wrong_count + ?,
          last_review = CURRENT_TIMESTAMP
      WHERE user_id = ? AND question_id = ?
    `);
    stmt.run(correct ? 1 : 0, correct ? 0 : 1, req.userId, questionId);
  } else {
    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO user_progress (id, user_id, question_id, correct_count, wrong_count, last_review)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(id, req.userId, questionId, correct ? 1 : 0, correct ? 0 : 1);
  }
  
  // 如果答错，记录到错题本
  if (!correct) {
    const wrongId = uuidv4();
    db.prepare('INSERT INTO wrong_answers (id, user_id, question_id) VALUES (?, ?, ?)')
      .run(wrongId, req.userId, questionId);
  }
  
  res.json({ success: true });
});

// 获取错题本
app.get('/api/wrong-answers', authMiddleware, (req, res) => {
  const wrongAnswers = db.prepare(`
    SELECT w.*, q.question, q.options, q.answer, q.explanation, q.category
    FROM wrong_answers w
    JOIN questions q ON w.question_id = q.id
    WHERE w.user_id = ?
    ORDER BY w.answered_at DESC
  `).all(req.userId);
  
  wrongAnswers.forEach(w => w.options = JSON.parse(w.options));
  res.json(wrongAnswers);
});

// ============ 模拟面试API ============

// 创建模拟面试
app.post('/api/interviews', authMiddleware, (req, res) => {
  const { questions, answers, scores, totalScore } = req.body;
  const id = uuidv4();
  
  const stmt = db.prepare(`
    INSERT INTO interviews (id, user_id, questions, answers, scores, total_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, req.userId, JSON.stringify(questions), JSON.stringify(answers), JSON.stringify(scores), totalScore);
  
  res.json({ success: true, id });
});

// 获取面试记录
app.get('/api/interviews', authMiddleware, (req, res) => {
  const interviews = db.prepare(`
    SELECT * FROM interviews WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.userId);
  
  interviews.forEach(i => {
    i.questions = JSON.parse(i.questions);
    i.answers = i.answers ? JSON.parse(i.answers) : [];
    i.scores = i.scores ? JSON.parse(i.scores) : [];
  });
  res.json(interviews);
});

// ============ AI API ============

// AI生成题目
app.post('/api/ai/generate-questions', async (req, res) => {
  const { category, count = 5, difficulty = 'medium' } = req.body;
  
  // 这里应该调用实际的AI API
  // 暂时返回示例数据
  const sampleQuestions = [
    {
      category,
      difficulty,
      question: `请简述${category}中的核心概念`,
      options: ['概念A', '概念B', '概念C', '概念D'],
      answer: '概念A',
      explanation: '这是详细解释...'
    }
  ];
  
  res.json(sampleQuestions);
});

// AI评分
app.post('/api/ai/score', async (req, res) => {
  const { question, answer } = req.body;
  
  // 这里应该调用实际的AI API进行评分
  // 暂时返回示例
  res.json({
    score: 85,
    feedback: '回答基本完整，可以改进...',
    suggestions: ['建议补充更多细节', '注意逻辑结构']
  });
});

// ============ 爬虫相关API ============

// 获取爬虫状态
app.get('/api/crawler/status', authMiddleware, (req, res) => {
  const questionCount = db.prepare('SELECT COUNT(*) as count FROM questions').get();
  const articleCount = db.prepare('SELECT COUNT(*) as count FROM articles').get();
  
  res.json({
    questions: questionCount.count,
    articles: articleCount.count,
    lastUpdate: new Date().toISOString()
  });
});

// 启动爬虫（示例接口）
app.post('/api/crawler/run', authMiddleware, (req, res) => {
  // 这里应该启动实际的爬虫任务
  res.json({ success: true, message: '爬虫任务已启动' });
});

// 批量导入题目
app.post('/api/questions/batch', authMiddleware, (req, res) => {
  const { questions } = req.body;
  
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO questions (id, category, difficulty, question, options, answer, explanation, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((questions) => {
    for (const q of questions) {
      stmt.run(
        q.id || uuidv4(),
        q.category,
        q.difficulty || 'medium',
        q.question,
        JSON.stringify(q.options),
        q.answer,
        q.explanation,
        q.source
      );
    }
  });
  
  insertMany(questions);
  res.json({ success: true, count: questions.length });
});

// 批量导入文章
app.post('/api/articles/batch', authMiddleware, (req, res) => {
  const { articles } = req.body;
  
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO articles (id, category, title, content, source)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((articles) => {
    for (const a of articles) {
      stmt.run(
        a.id || uuidv4(),
        a.category,
        a.title,
        a.content,
        a.source
      );
    }
  });
  
  insertMany(articles);
  res.json({ success: true, count: articles.length });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`面试大师API服务运行在 http://0.0.0.0:${PORT}`);
  console.log(`可从内外网访问: 内网192.168.5.110:${PORT} / 外网100.106.29.60:${PORT}`);
});

// ============ 答题记录API ============

// 提交答题结果
app.post('/api/answer', authMiddleware, (req, res) => {
  const { questionId, selectedAnswer, isCorrect } = req.body;
  
  if (!questionId || !selectedAnswer) {
    return res.status(400).json({ error: '参数不完整' });
  }
  
  try {
    // 记录错题
    if (!isCorrect) {
      const wrongId = uuidv4();
      db.prepare('INSERT INTO wrong_answers (id, user_id, question_id, wrong_option) VALUES (?, ?, ?, ?)')
        .run(wrongId, req.userId, questionId, selectedAnswer);
    }
    
    // 更新进度
    const existing = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND question_id = ?')
      .get(req.userId, questionId);
    
    if (existing) {
      db.prepare(`
        UPDATE user_progress 
        SET correct_count = correct_count + ?, wrong_count = wrong_count + ?, last_review = CURRENT_TIMESTAMP
        WHERE user_id = ? AND question_id = ?
      `).run(isCorrect ? 1 : 0, isCorrect ? 0 : 1, req.userId, questionId);
    } else {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO user_progress (id, user_id, question_id, correct_count, wrong_count, last_review)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(id, req.userId, questionId, isCorrect ? 1 : 0, isCorrect ? 0 : 1);
    }
    
    res.json({ success: true, isCorrect });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 收藏题目
app.post('/api/favorite', authMiddleware, (req, res) => {
  const { questionId, isFavorite } = req.body;
  
  const existing = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND question_id = ?')
    .get(req.userId, questionId);
  
  if (existing) {
    db.prepare('UPDATE user_progress SET is_favorite = ? WHERE user_id = ? AND question_id = ?')
      .run(isFavorite ? 1 : 0, req.userId, questionId);
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO user_progress (id, user_id, question_id, is_favorite, last_review)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, req.userId, questionId, isFavorite ? 1 : 0);
  }
  
  res.json({ success: true });
});

// 获取收藏
app.get('/api/favorites', authMiddleware, (req, res) => {
  const favorites = db.prepare(`
    SELECT p.*, q.question, q.options, q.answer, q.explanation, q.category
    FROM user_progress p
    JOIN questions q ON p.question_id = q.id
    WHERE p.user_id = ? AND p.is_favorite = 1
    ORDER BY p.last_review DESC
  `).all(req.userId);
  
  favorites.forEach(f => f.options = JSON.parse(f.options));
  res.json(favorites);
});

// 公开题库查询（无需登录）
app.get('/api/public/questions', (req, res) => {
  const { category, difficulty, limit = 50 } = req.query;
  let sql = 'SELECT id, category, difficulty, question, options, answer FROM questions';
  const params = [];
  const conditions = [];
  
  if (category && category !== 'all') {
    conditions.push('category = ?');
    params.push(category);
  }
  if (difficulty) {
    conditions.push('difficulty = ?');
    params.push(difficulty);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ' ORDER BY RANDOM() LIMIT ?';
  params.push(parseInt(limit));
  
  const questions = db.prepare(sql).all(...params);
  questions.forEach(q => q.options = JSON.parse(q.options));
  res.json(questions);
});

// 公开分类
app.get('/api/public/categories', (req, res) => {
  const categories = db.prepare('SELECT DISTINCT category FROM questions ORDER BY category').all();
  res.json(categories.map(c => c.category));
});
