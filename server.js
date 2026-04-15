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

// 获取文章分类（支持二级分类）
app.get('/api/article-categories', (req, res) => {
  const categories = db.prepare('SELECT DISTINCT category, sub_category FROM articles WHERE category IS NOT NULL').all();
  // 整理成树形结构
  const catMap = {};
  categories.forEach(c => {
    if (!catMap[c.category]) catMap[c.category] = { name: c.category, children: [] };
    if (c.sub_category) catMap[c.category].children.push(c.sub_category);
  });
  res.json(Object.values(catMap));
});

// 获取题库分类（支持二级分类）
app.get('/api/categories', (req, res) => {
  // 备用分类数据
  const FALLBACK_CATEGORIES = {
    'Java基础': ['语法基础', '面向对象', '集合框架', '异常处理', '泛型', '注解', '反射', 'IO流'],
    'JVM': ['内存模型', '垃圾回收', '类加载', 'JVM调优', '性能监控'],
    'JUC': ['线程基础', '同步机制', '并发工具', '线程池', 'AQS', 'CAS'],
    'Redis': ['数据类型', '持久化', '复制', '集群', '缓存', '事务'],
    'Kafka': ['架构原理', '生产者', '消费者', '集群'],
    '计算机网络': ['TCP/IP', 'HTTP/HTTPS', 'DNS', 'Socket'],
    '操作系统': ['进程线程', '内存管理', '文件系统'],
    '数据库': ['MySQL', '索引', '事务', '优化', 'NoSQL'],
    '设计模式': ['创建型', '结构型', '行为型'],
    '数据结构': ['数组', '链表', '栈队列', '树', '图', '排序'],
    'AI': ['LLM基础', 'Prompt工程', 'RAG', 'Agent'],
    'Agent': ['AutoGen', 'LangChain', 'CrewAI', 'MCP'],
    '前端': ['HTML/CSS', 'JavaScript', 'React', 'Vue', '小程序', '工程化', 'TypeScript', 'Nodejs']
  };
  
  const categories = db.prepare('SELECT DISTINCT category, sub_category FROM questions').all();
  const catMap = {};
  
  categories.forEach(c => {
    if (!catMap[c.category]) {
      catMap[c.category] = { name: c.category, children: [] };
      // 如果数据库为空，使用备用数据
      if (FALLBACK_CATEGORIES[c.category]) {
        catMap[c.category].children = FALLBACK_CATEGORIES[c.category];
      }
    }
    // 添加数据库中的sub_category
    if (c.sub_category && !catMap[c.category].children.includes(c.sub_category)) {
      catMap[c.category].children.push(c.sub_category);
    }
  });
  
  // 添加备用中可能有但数据库没有的
  Object.keys(FALLBACK_CATEGORIES).forEach(cat => {
    if (!catMap[cat]) {
      catMap[cat] = { name: cat, children: FALLBACK_CATEGORIES[cat] };
    }
  });
  
  res.json(Object.values(catMap));
});

// 获取文章列表
app.get('/api/articles', (req, res) => {
  const { category, sub_category, limit = 20 } = req.query;
  let sql = 'SELECT * FROM articles';
  const params = [];
  const conditions = [];
  if (category) { conditions.push('category = ?'); params.push(category); }
  if (sub_category) { conditions.push('sub_category = ?'); params.push(sub_category); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));
  const articles = db.prepare(sql).all(...params);
  res.json(articles);
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

// 同步错题从APP
app.post('/api/user/wrong-sync', authMiddleware, async (req, res) => {
  const { wrongQuestions } = req.body;
  if (!wrongQuestions || !Array.isArray(wrongQuestions)) {
    return res.status(400).json({ error: '无效数据' });
  }
  
  try {
    for (const wq of wrongQuestions) {
      // 查找或创建题目
      let question = db.prepare('SELECT id FROM questions WHERE id = ?').get(wq.question_id);
      if (!question) continue;
      
      // 检查是否已有错题记录
      const existing = db.prepare('SELECT * FROM wrong_answers WHERE user_id = ? AND question_id = ?')
        .get(req.userId, wq.question_id);
      
      if (existing) {
        // 更新错题次数
        db.prepare('UPDATE wrong_answers SET wrong_count = ?, answered_at = ? WHERE id = ?')
          .run(wq.wrong_count, new Date().toISOString(), existing.id);
      } else {
        // 新增错题记录
        db.prepare('INSERT INTO wrong_answers (user_id, question_id, wrong_count, answered_at) VALUES (?, ?, ?, ?)')
          .run(req.userId, wq.question_id, wq.wrong_count || 1, new Date().toISOString());
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '同步失败' });
  }
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

// 公开题库查询（支持三级分类筛选）
app.get('/api/public/questions', (req, res) => {
  const { category, sub_category, third_category, difficulty, limit = 50 } = req.query;
  let sql = 'SELECT id, category, sub_category, third_category, difficulty, question, options, answer, explanation FROM questions';
  const params = [];
  const conditions = [];
  
  if (category && category !== 'all') {
    conditions.push('category = ?');
    params.push(category);
  }
  if (sub_category) {
    conditions.push('sub_category = ?');
    params.push(sub_category);
  }
  if (third_category) {
    conditions.push('third_category = ?');
    params.push(third_category);
  }
  if (difficulty && difficulty !== 'all') {
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

// 三级分类树API
app.get('/api/category-tree', (req, res) => {
  // 定义完整的三级分类体系
  const CATEGORY_TREE = {
    'Java基础': {
      '语法基础': ['变量与类型', '运算符', '流程控制', '数组'],
      '面向对象': ['类与对象', '继承与多态', '抽象类与接口', '内部类'],
      '集合框架': ['List接口', 'Set接口', 'Map接口', 'Collections工具类'],
      '异常处理': ['异常体系', 'try-catch', 'throws与throw', '自定义异常'],
      '泛型': ['泛型类', '泛型方法', '泛型通配符', '类型擦除'],
      '反射': ['Class对象', ' Constructor', 'Field', 'Method'],
      'IO流': ['字节流', '字符流', '缓冲流', '对象序列化']
    },
    'JVM': {
      '内存模型': ['程序计数器', 'Java虚拟机栈', '本地方法栈', '堆', '方法区'],
      '垃圾回收': ['标记算法', '垃圾收集器', 'GC日志', '内存分配策略'],
      '类加载': ['加载过程', '双亲委派', '类加载器', '自定义类加载器'],
      'JVM调优': ['参数配置', 'JProfiler', 'MAT分析', 'JConsole'],
      '性能监控': ['jstat', 'jmap', 'jstack', 'visualvm']
    },
    'JUC': {
      '线程基础': ['Thread', 'Runnable', 'Callable', '线程状态'],
      '同步机制': ['synchronized', 'volatile', 'final', 'static'],
      '并发工具': ['CountDownLatch', 'CyclicBarrier', 'Semaphore', 'Exchanger'],
      '线程池': ['ThreadPoolExecutor', 'Executors', 'Future', 'ScheduledExecutor'],
      'AQS': ['AbstractQueuedSynchronizer', 'ReentrantLock', 'ReentrantReadWriteLock'],
      'CAS': ['AtomicInteger', 'AtomicReference', 'LongAdder', 'CAS问题']
    },
    'Redis': {
      '数据类型': ['String', 'Hash', 'List', 'Set', 'ZSet', 'Bitmap'],
      '持久化': ['RDB', 'AOF', '混合持久化', '备份恢复'],
      '复制': ['主从复制', '哨兵', '集群', ' Jedis/Redisson'],
      '缓存': ['缓存策略', '缓存穿透', '缓存击穿', '缓存雪崩'],
      '事务': ['MULTI/EXEC', 'Watch', 'Lua脚本', 'pipeline']
    },
    'Kafka': {
      '架构原理': ['broker', 'topic', 'partition', 'offset', 'replica'],
      '生产者': ['发送流程', '分区策略', 'acks', '幂等性'],
      '消费者': ['消费组', 'offset管理', '再均衡', '拦截器'],
      '集群': ['Controller', 'ISR', '日志同步', ' Leader选举']
    },
    '计算机网络': {
      'TCP/IP': ['TCP三次握手', 'TCP四次挥手', 'TCP状态转换', '粘包拆包'],
      'HTTP': ['请求格式', '响应码', 'HTTPS', 'HTTP/2/HTTP/3'],
      'DNS': ['域名解析', 'DNS缓存', 'CDN', 'DNS劫持'],
      'Socket': ['BIO', 'NIO', 'AIO', 'Netty']
    },
    '操作系统': {
      '进程线程': ['进程', '线程', '协程', '用户态/内核态'],
      '内存管理': ['虚拟内存', '分页/分段', '页面置换', '内存泄漏'],
      '文件系统': ['inode', '目录结构', '文件系统类型', 'IO调度']
    },
    '数据库': {
      'MySQL': ['存储引擎', '日志系统', '事务隔离级别', '锁机制'],
      '索引': ['B+树索引', 'Hash索引', '全文索引', '索引优化'],
      '事务': ['ACID', 'redo日志', 'undo日志', '分布式事务'],
      '优化': ['EXPLAIN', '慢查询', 'SQL优化', '结构优化'],
      'NoSQL': ['MongoDB', 'ElasticSearch', 'HBase', 'Neo4j']
    },
    '设计模式': {
      '创建型': ['单例', '工厂方法', '抽象工厂', '建造者', '原型'],
      '结构型': ['适配器', '装饰器', '代理', '外观', '组合', '桥接'],
      '行为型': ['观察者', '策略', '模板方法', '责任链', '迭代器', '命令']
    },
    '数据结构': {
      '数组': ['顺序结构', '查找', '排序', '动态数组'],
      '链表': ['单向链表', '双向链表', '循环链表', 'LRU缓存'],
      '栈队列': ['顺序栈', '链式栈', '循环队列', '阻塞队列'],
      '树': ['二叉树', '二叉搜索树', '平衡树', '红黑树', 'B树', 'B+树'],
      '图': ['邻接矩阵', '邻接表', 'DFS/BFS', '最短路径', '拓扑排序'],
      '排序': ['冒泡/选择', '插入', '归并', '快速', '堆', '计数']
    },
    'AI': {
      'LLM基础': ['Transformer', 'GPT', 'Claude', 'Gemini', 'Embedding'],
      'Prompt工程': ['提示词技巧', 'Few-shot', 'CoT', 'ReAct'],
      'RAG': ['向量数据库', '文档切分', '检索排序', 'Hybrid Search'],
      'Agent': ['规划能力', '工具使用', '记忆机制', 'Agent框架']
    },
    'Agent': {
      'AutoGen': ['Agent设计', '对话模式', '工具集成', '团队协作'],
      'LangChain': ['LCEL', 'Tool/Agent', 'Memory', 'Chain'],
      'CrewAI': ['Roles', 'Tasks', 'Process', 'Memory'],
      'MCP': ['Server', 'Client', '协议', '最佳实践']
    },
    '前端': {
      'HTML/CSS': ['标签', '盒模型', 'Flex', 'Grid', '响应式'],
      'JavaScript': ['数据类型', '函数', '原型', '异步', 'DOM'],
      'React': ['组件', 'Hooks', '状态管理', 'Virtual DOM'],
      'Vue': ['响应式', '指令', '组件', 'Composition API'],
      '工程化': ['Webpack', 'Vite', 'ESLint', '单元测试']
    },
    '数据算法': {
      '机器学习': ['监督学习', '无监督学习', '深度学习', '特征工程'],
      'NLP': ['分词', 'NER', '文本分类', '情感分析'],
      '推荐系统': ['协同过滤', '内容推荐', '召回', '排序'],
      '搜索': ['倒排索引', 'ES', 'IK分词', '搜索排序']
    }
  };
  res.json(CATEGORY_TREE);
});

// 获取分类下的文章列表
app.get('/api/articles-by-category', (req, res) => {
  const { category, sub_category, limit = 20 } = req.query;
  let sql = 'SELECT id, category, title, source, created_at FROM articles';
  const params = [];
  const conditions = [];
  
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (sub_category) {
    conditions.push('sub_category = ?');
    params.push(sub_category);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));
  
  try {
    const articles = db.prepare(sql).all(...params);
    res.json(articles);
  } catch (e) {
    // 表中没有sub_category字段，返回空数组
    res.json([]);
  }
});

// 获取分类下的题目（支持三级分类）
app.get('/api/questions-by-category', (req, res) => {
  const { category, sub_category, third_category, limit = 50, difficulty } = req.query;
  let sql = 'SELECT id, category, sub_category, third_category, difficulty, question, options, answer, explanation FROM questions';
  const params = [];
  const conditions = [];
  
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (sub_category) {
    conditions.push('sub_category = ?');
    params.push(sub_category);
  }
  if (third_category) {
    conditions.push('third_category = ?');
    params.push(third_category);
  }
  if (difficulty && difficulty !== 'all') {
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
