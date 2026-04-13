const axios = require('axios');
const { JSDOM } = require('jsdom');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'interview_master.db'));

// 从JavaGuide爬取题目
async function scrapeJavaGuide() {
  const urls = [
    'https://javaguide.cn/java/basis/java-basic-questions-01.html',
    'https://javaguide.cn/java/basis/java-basic-questions-02.html',
  ];
  
  let questions = [];
  
  for (const url of urls) {
    try {
      console.log(`爬取: ${url}`);
      const res = await axios.get(url, { timeout: 10000 });
      const dom = new JSDOM(res.data);
      const doc = dom.window.document;
      
      // 提取QA对
      const qaBlocks = doc.querySelectorAll('.question, .faq-item, h2, h3');
      let currentQ = '';
      
      qaBlocks.forEach(el => {
        const text = el.textContent.trim();
        if (text.length > 10 && text.length < 500) {
          if (text.includes('？') || text.includes('?') || text.includes('：')) {
            currentQ = text;
          } else if (currentQ && text.length > 20) {
            // 找到答案
            if (!questions.find(q => q.question === currentQ)) {
              questions.push({
                question: currentQ,
                answer: text.substring(0, 200),
                category: 'Java基础'
              });
            }
            currentQ = '';
          }
        }
      });
    } catch (e) {
      console.error(`爬取失败: ${url}`, e.message);
    }
  }
  
  return questions;
}

// 从小林coding爬取
async function scrapeXiaoLinCoding() {
  const urls = [
    'https://xiaolincoding.com/interview/interview.html',
  ];
  
  let questions = [];
  
  for (const url of urls) {
    try {
      console.log(`爬取: ${url}`);
      const res = await axios.get(url, { timeout: 10000 });
      const dom = new JSDOM(res.data);
      const doc = dom.window.document;
      
      // 提取标题和问题
      const headings = doc.querySelectorAll('h2, h3, h4');
      headings.forEach(el => {
        const text = el.textContent.trim();
        if ((text.includes('？') || text.includes('?')) && text.length < 200) {
          const next = el.nextElementSibling;
          if (next && next.textContent.length > 10) {
            questions.push({
              question: text,
              answer: next.textContent.substring(0, 300),
              category: 'Java基础'
            });
          }
        }
      });
    } catch (e) {
      console.error(`爬取失败: ${url}`, e.message);
    }
  }
  
  return questions;
}

// 直接生成高质量题目（基于知识图谱）
function generateQuestions() {
  const topics = {
    'Java基础': [
      { q: '什么是Java的多态？', a: '多态是指同一个方法调用在不同对象上产生不同行为。包括编译时多态（重载）和运行时多态（重写）。' },
      { q: 'Java中==和equals()的区别？', a: '==比较的是引用地址，equals()默认比较引用，但String等类重写了equals()比较内容。' },
      { q: 'String为什么是不可变的？', a: 'String使用char数组存储，且声明为final。不可变性保证了安全性、线程安全和字符串池优化。' },
      { q: 'HashMap和HashTable的区别？', a: 'HashMap允许null键/值，非线程安全，效率高；HashTable不允许null，不推荐使用，可用ConcurrentHashMap。' },
      { q: 'ArrayList和LinkedList的区别？', a: 'ArrayList基于数组，随机访问O(1)，增删O(n)；LinkedList基于双向链表，增删O(1)，访问O(n)。' },
      { q: '什么是反射？Java反射的优缺点？', a: '反射是动态获取类信息并操作类的机制。优点：灵活、可扩展；缺点：性能差、破坏封装。' },
      { q: 'Java异常体系？', a: 'Throwable分为Error（系统级）和Exception。Exception分为CheckedException和RuntimeException。' },
      { q: 'try-catch-finally的执行顺序？', a: 'try执行后，finally必然执行。即使try或catch有return，finally也会在return前执行。' },
      { q: '什么是泛型？泛型的好处？', a: '泛型是参数化类型。好处：类型安全、消除强制类型转换、代码复用。' },
      { q: 'List<? extends T>和List<? super T>的区别？', a: '? extends T只能读取（生产者），? super T只能写入（消费者）。PECS原则：Producer extends, Consumer super。' },
    ],
    'JVM': [
      { q: 'JVM内存区域有哪些？', a: '程序计数器、虚拟机栈、本地方法栈、堆、方法区（元空间）、运行时常量池。' },
      { q: '什么情况下对象会进入老年代？', a: '1)年龄达到阈值（默认15）；2)大对象直接进老年代；3)Survivor中相同年龄对象超过一半。' },
      { q: 'Minor GC和Full GC的区别？', a: 'Minor GC清理年轻代，频率高、速度快；Full GC清理整个堆和方法区，时间长、可能STW。' },
      { q: '垃圾回收算法有哪些？', a: '标记-清除、标记-整理、复制、分代收集。年轻代用复制，老年代用标记-整理。' },
      { q: 'CMS和G1垃圾收集器的区别？', a: 'CMS是并发收集，专注老年代，会产生碎片；G1把堆划分为Region，可预测停顿时间。' },
      { q: '什么情况下会发生OOM？', a: '1)堆内存不足；2)方法区/元空间不足；3)栈内存不足；4)直接内存不足。' },
      { q: '类加载过程？', a: '加载->验证->准备->解析->初始化。其中验证包括：文件格式、元数据、字节码、符号引用。' },
      { q: '双亲委派模型？', a: '类加载器从上往下依次是：Bootstrap、Extension、Application。加载时先让父加载器尝试，只有父无法完成时才自己加载。' },
      { q: 'JVM调优参数有哪些？', a: '-Xms/-Xmx堆大小、-Xmn年轻代大小、-XX:MetaspaceSize元空间、-XX:+UseG1GC使用G1等。' },
      { q: '什么是内存泄漏？如何排查？', a: '对象无法被GC回收即为内存泄漏。排查：MAT工具、Java VisualVM、arthas等。' },
    ],
    'JUC': [
      { q: 'volatile关键字的作用？', a: '保证可见性（一个线程修改对其他线程可见）和有序性（防止指令重排序），但不保证原子性。' },
      { q: 'synchronized和ReentrantLock的区别？', a: 'synchronized是关键字，自动释放锁；ReentrantLock是类，需要手动释放。可中断、可公平锁。' },
      { q: 'ThreadPoolExecutor的核心参数？', a: 'corePoolSize、maxPoolSize、keepAliveTime、unit、workQueue、threadFactory、handler。' },
      { q: '线程池的工作流程？', a: '1)小于corePoolSize创建线程；2)满则加入队列；3)队列满则创建临时线程；4)还满则拒绝。' },
      { q: 'CAS是什么？有什么问题？', a: 'Compare And Swap，乐观锁。问题：ABA问题、自旋开销、只能保证单个变量原子性。' },
      { q: 'AQS是什么？', a: 'AbstractQueuedSynchronizer，抽象队列同步器。ReentrantLock、CountDownLatch、Semaphore等基于AQS实现。' },
      { q: 'CountDownLatch和CyclicBarrier的区别？', a: 'CountDownLatch是一次性的，计数到0后不可重置；CyclicBarrier可重复使用。' },
      { q: 'ThreadLocal的原理和内存泄漏？', a: '每个线程有ThreadLocalMap，用ThreadLocal对象作为key。内存泄漏：Entry继承WeakReference，key被回收后value可能泄漏。' },
      { q: '生产者-消费者模式？', a: '生产者生产数据放入缓冲区，消费者从缓冲区消费数据。常用BlockingQueue实现。' },
      { q: '什么是死锁？如何避免？', a: '死锁：两个线程相互等待对方持有的资源。避免：破坏互斥、占有且等待、不可抢占、循环等待条件。' },
    ],
    'Redis': [
      { q: 'Redis的数据类型？', a: 'String、List、Set、ZSet、Hash、Bitmaps、HyperLogLog、Geo、Stream。' },
      { q: 'Redis的持久化方式？', a: 'RDB（快照）和AOF（追加文件）。RDB恢复快但可能丢数据，AOF最多丢1秒数据。' },
      { q: 'Redis的过期键删除策略？', a: '惰性删除（访问时检查）、定期删除（定时抽检）、淘汰策略（内存不足时）。' },
      { q: 'Redis的淘汰策略？', a: 'noeviction、volatile-lru、allkeys-lru、volatile-ttl等。推荐volatile-lru。' },
      { q: 'Redis的主从复制？', a: '主从复制：master写，slave读。流程：slave连接master、发送PSYNC、master发送RDB、增量同步。' },
      { q: 'Redis哨兵模式？', a: '哨兵监控主从、故障检测、自动故障转移。原理：哨兵定时ping主从，超过阈值则主观下线，投票决定客观下线。' },
      { q: 'Redis集群？', a: '16384个槽，CRC16(key) % 16384 决定槽。每个槽可有主从，提高可用性。' },
      { q: '缓存穿透、击穿、雪崩？', a: '穿透：查不存在的数据；击穿：热点key过期；雪崩：大量key同时过期。解决方案：布隆过滤器、互斥锁、永不过期。' },
      { q: 'Redis为什么快？', a: '内存存储、单线程避免了锁开销、IO多路复用、丰富的数据结构。' },
      { q: 'Redis的事务？', a: 'MULTI/EXEC/WATCH。支持原子性但不保证回滚。Watch实现乐观锁。' },
    ],
    'Kafka': [
      { q: 'Kafka的核心概念？', a: 'Topic（主题）、Partition（分区）、Producer（生产者）、Consumer（消费者）、Broker（服务器）。' },
      { q: 'Kafka的消息顺序性？', a: 'Kafka只保证单个Partition内的顺序。可以通过key发送到同一Partition保证顺序。' },
      { q: 'Kafka的高吞吐量原因？', a: '顺序写磁盘、零拷贝、批量处理、压缩、多线程Producer、IO多路复用。' },
      { q: 'Kafka的分区策略？', a: 'key指定、轮询、随机。消费者：RangeAssignor、RoundRobinAssignor。' },
      { q: 'Kafka的ISR机制？', a: 'In-Sync Replicas，与Leader保持同步的副本集合。只有ISR中的副本才能被选为Leader。' },
      { q: 'Kafka的消费者组？', a: '同一消费者组内只有一个消费者能消费分区，实现负载均衡。不同组之间互相独立。' },
      { q: 'Kafka如何保证不丢消息？', a: 'Producer：acks=all+重试；Consumer：手动提交offset；Broker：副本数>=2。' },
      { q: 'Kafka的Leader选举？', a: 'Controller选举第一个ISR中的副本为Leader。Controller通过ZK选举。' },
      { q: 'Kafka的压缩？', a: '支持GZIP、Snappy、LZ4、ZSTD。Producer压缩，Broker保持，Consumer解压。' },
      { q: 'Kafka Stream？', a: 'Kafka的流处理库，提供聚合、连接、窗口等操作。简化流处理开发。' },
    ],
    '计算机网络': [
      { q: 'TCP三次握手？', a: '1)SYN=1,seq=x；2)SYN=1,ACK=1,seq=y,ack=x+1；3)ACK=1,seq=x+1,ack=y+1。' },
      { q: 'TCP四次挥手？', a: '1)FIN=1,seq=u；2)ACK=1,ack=u+1；3)FIN=1,seq=v；4)ACK=1,ack=v+1。TIME_WAIT等待2MSL。' },
      { q: 'HTTP和HTTPS的区别？', a: 'HTTP:80端口，明文；HTTPS:443端口，SSL/TLS加密证书。可防止MITM攻击。' },
      { q: 'HTTP状态码？', a: '1xx信息、2xx成功、3xx重定向、4xx客户端错误、5xx服务器错误。常见：200/204/301/302/304/400/401/403/404/500/502/503。' },
      { q: 'GET和POST的区别？', a: 'GET参数在URL有长度限制（浏览器），POST在请求体无限制。GET幂等，POST不幂等。' },
      { q: 'Cookie和Session？', a: 'Cookie存储在客户端，Session存储在服务器。Session依赖Cookie的JSESSIONID。' },
      { q: 'DNS解析过程？', a: '1)浏览器缓存；2)系统缓存；3)hosts文件；4)DNS服务器递归查询。' },
      { q: '输入URL到页面显示的过程？', a: 'DNS解析->TCP连接->发送HTTP请求->服务器处理->响应->浏览器解析HTML->渲染->JS执行。' },
      { q: 'TCP和UDP的区别？', a: 'TCP面向连接、可靠、慢；UDP无连接、不保证可靠、快。HTTP基于TCP，DNS基于UDP。' },
      { q: 'HTTPS的握手过程？', a: '1)ClientHello；2)ServerHello+证书；3)证书验证+Pre-master；4)生成会话密钥；5)加密通信。' },
    ],
    '数据库': [
      { q: 'MySQL索引的数据结构？', a: 'B+树。叶子节点存储数据，非叶子节点只存储索引。适合范围查询和排序。' },
      { q: '最左前缀原则？', a: '索引从最左开始匹配，可以但不必须包含所有列。a,b,c索引可以匹配a或a,b。' },
      { q: 'InnoDB和MyISAM的区别？', a: 'InnoDB支持事务、行锁、外键；MyISAM不支持事务，支持全文索引。InnoDB支持MVCC。' },
      { q: '事务的ACID特性？', a: 'Atomic（原子性）、Consistency（一致性）、Isolation（隔离性）、Durability（持久性）。' },
      { q: '事务的隔离级别？', a: 'Read Uncommitted、Read Committed、Repeatable Read（MySQL默认）、Serializable。' },
      { q: '什么是幻读？如何解决？', a: '同一事务两次查询结果不同。解决：MVCC+Next-Key Lock（间隙锁）。' },
      { q: 'MySQL的锁机制？', a: '行锁（Record Lock）、间隙锁（Gap Lock）、Next-Key Lock。意向锁表级。' },
      { q: '慢查询如何优化？', a: '1)EXPLAIN分析；2)添加索引；3)优化SQL；4)分库分表；5)读写分离。' },
      { q: '分库分表？', a: '垂直分库/分表：按业务；水平分库/分表：按数据量。中间件：ShardingSphere、MyCat。' },
      { q: '什么是主从复制？', a: 'Master写，Slave读。原理：Binlog日志，Slave IO线程拉取，SQL线程回放。' },
    ],
    '操作系统': [
      { q: '进程和线程的区别？', a: '进程是资源分配单位，线程是CPU调度单位。进程有独立地址空间，线程共享进程空间。' },
      { q: '进程的状态？', a: '创建、就绪、运行、阻塞、终止。' },
      { q: '死锁的必要条件？', a: '互斥条件、占有且等待、不可抢占、循环等待。' },
      { q: '页面置换算法？', a: 'OPT（理想）、FIFO、LRU（最近最少使用）、Clock（NRU）。' },
      { q: '什么是虚拟内存？', a: '将内存扩展到磁盘，使用页表映射。让程序认为有连续完整内存。' },
      { q: 'CPU调度算法？', a: 'FCFS、SJF、时间片轮转、多级队列、优先级调度。' },
      { q: '什么是系统调用？', a: '用户态到内核态的接口。如open、read、write、fork、exec等。' },
      { q: 'Linux的内存管理？', a: 'Buddy System（伙伴系统）+ Slab分配器。' },
      { q: '什么是IO多路复用？', a: 'select、poll、epoll。一个线程管理多个IO，epoll效率最高。' },
      { q: '零拷贝技术？', a: 'DMA直接内存访问，减少CPU拷贝。Kafka、Netty使用零拷贝。' },
    ],
    '设计模式': [
      { q: '单例模式？', a: '确保只有一个实例。懒汉（线程不安全/安全）、饿汉、Double Check Lock、枚举。' },
      { q: '工厂模式？', a: '工厂方法：定义创建接口，让子类决定；抽象工厂：创建一系列相关对象。' },
      { q: '代理模式？', a: '为其他对象提供代理控制访问。静态代理、动态代理（JDK Proxy、CGLIB）。' },
      { q: '观察者模式？', a: '定义一对多依赖，当对象变化时通知所有依赖者。JDK：Observer/EventListener。' },
      { q: '策略模式？', a: '定义一系列算法，让它们可互换。Spring：Resource、Environment。' },
      { q: '装饰器模式？', a: '动态给对象添加职责。Java IO：InputStream->BufferedInputStream。' },
      { q: '模板方法模式？', a: '定义算法骨架，某些步骤由子类实现。Spring：AbstractJdbcDaoSupport。' },
      { q: 'Builder模式？', a: '构建复杂对象。StringBuilder、OkHttpClient、Retrofit。' },
      { q: '享元模式？', a: '共享细粒度对象。Integer、String常量池、线程池。' },
      { q: '责任链模式？', a: '多个对象依次处理请求。Servlet Filter、Netty ChannelPipeline。' },
    ],
    '数据结构': [
      { q: '数组和链表的区别？', a: '数组：连续内存，O(1)访问，增删O(n)；链表：不连续，O(n)访问，增删O(1)。' },
      { q: '栈和队列的区别？', a: '栈：LIFO，后进先出；队列：FIFO，先进先出。' },
      { q: 'HashMap的底层结构？', a: 'JDK1.8：数组+链表+红黑树。链表>8转红黑树，红黑树<6转链表。' },
      { q: '红黑树的特点？', a: '节点红黑、根黑、叶黑、红黑不相邻、路径黑高相同。自平衡二叉搜索树。' },
      { q: 'B树和B+树的区别？', a: 'B树所有节点存数据，B+树非叶子节点只存索引，叶子节点存所有数据并链表相连。' },
      { q: 'Top K问题？', a: '1)堆：O(NlogK)；2)快速选择：O(N)；3)排序：O(NlogN)。' },
      { q: '布隆过滤器？', a: '多位数组+多个Hash函数。判断不存在一定不存在，判断存在可能误判。' },
      { q: 'LRU缓存实现？', a: 'HashMap+双向链表。HashMap O(1)查找，链表O(1)移动。Java：LinkedHashMap。' },
      { q: '什么是跳表？', a: '多层链表。查找O(logN)，空间换时间。Redis SortedSet使用跳表。' },
      { q: '动态规划 vs 贪心？', a: 'DP：全局最优；贪心：局部最优。不一定得到全局最优。' },
    ],
    'AI': [
      { q: 'Transformer的核心组件？', a: 'Self-Attention（自注意力机制）、Multi-Head Attention（多头注意力）、Positional Encoding（位置编码）。' },
      { q: 'BERT和GPT的区别？', a: 'BERT：双向Transformer，理解任务；GPT：单向Transformer，生成任务。' },
      { q: '什么是Token？', a: '文本分解的基本单元。可以是字符、词、子词。GPT-4使用BPE。' },
      { q: 'Prompt Engineering？', a: '设计输入提示来引导LLM输出。技巧：Few-shot、CoT、角色设定。' },
      { q: 'RAG技术？', a: 'Retrieval Augmented Generation，检索增强生成。让LLM引用外部知识。' },
      { q: '什么是Embedding？', a: '将文本映射到向量空间。语义相似文本在向量空间中也相近。' },
      { q: 'LLM幻觉问题？', a: 'LLM生成看似合理但实际错误的内容。解决方案：RAG、知识库、事实核查。' },
      { q: 'Fine-tuning微调？', a: '在预训练模型基础上，用特定数据进一步训练。LoRA是高效微调方法。' },
      { q: '什么是Function Calling？', a: '让LLM调用外部工具/函数。扩展LLM能力边界，实现实时信息获取。' },
      { q: 'AI Agent是什么？', a: 'AI Agent = LLM + Planning + Memory + Tools。能自主规划和执行任务。' },
    ],
    'Agent': [
      { q: 'ReAct prompting？', a: 'Reasoning + Acting，交替进行推理和行动。提高复杂任务表现。' },
      { q: 'LangChain核心组件？', a: 'Chains（链）、Agents（代理）、Memory（记忆）、Tools（工具）、Prompt Templates。' },
      { q: 'Tool Calling流程？', a: '1)LLM识别需要调用工具；2)生成调用参数；3)执行工具；4)将结果返回LLM。' },
      { q: '什么是Memory？', a: '短期记忆（ConversationBuffer）、长期记忆（Vector Store）、实体记忆。' },
      { q: 'Agent的规划能力？', a: 'CoT（思维链）、ToT（思维树）、ReAct。分解任务、逐步执行。' },
      { q: '什么是向量数据库？', a: '存储和检索向量。Milvus、Pinecone、Chroma。用于RAG的语义检索。' },
      { q: 'Multi-Agent系统？', a: '多个Agent协作。角色分工、消息传递、共同完成任务。' },
      { q: 'Agent的安全问题？', a: 'Prompt注入、工具滥用、信息泄露。需要输入验证和权限控制。' },
      { q: 'AutoGPT原理？', a: '自动分解任务、执行、反思、迭代。Loop直到目标达成。' },
      { q: '如何评估Agent？', a: '任务完成率、效率、用户满意度。多维度综合评估。' },
    ]
  };
  
  let questions = [];
  for (const [category, qs] of Object.entries(topics)) {
    for (const item of qs) {
      questions.push({
        question: item.q,
        answer: item.a,
        category: category
      });
    }
  }
  return questions;
}

// 保存到数据库
function saveQuestions(questions) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO questions (id, category, difficulty, question, options, answer, explanation, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let count = 0;
  for (const q of questions) {
    const options = [
      q.answer,
      '选项B：这是另一个答案',
      '选项C：第三个可能答案',
      '选项D：第四个可能答案'
    ];
    // 打乱选项
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    
    stmt.run(
      uuidv4(),
      q.category,
      'medium',
      q.question,
      JSON.stringify(options),
      q.answer,
      q.answer,
      '知识图谱生成'
    );
    count++;
  }
  return count;
}

async function main() {
  console.log('开始扩充题库...');
  
  // 生成高质量题目
  const questions = generateQuestions();
  console.log(`生成了 ${questions.length} 道高质量题目`);
  
  const saved = saveQuestions(questions);
  console.log(`成功保存 ${saved} 道题目`);
  
  const total = db.prepare('SELECT COUNT(*) as count FROM questions').get().count;
  console.log(`题库总数: ${total} 道`);
}

main().catch(console.error);
