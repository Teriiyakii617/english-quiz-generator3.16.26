const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// AI 配置 - 使用硅基流动 (有免费额度)
const AI_CONFIG = {
  apiKey: '',  // 用户输入
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: 'Qwen/Qwen2-7B-Instruct'
};

console.log('🔧 AI 配置: SiliconFlow Qwen2-7B (免费额度)');

app.use(cors());app.use(express.static('.'));
app.use(express.static('.'));
app.use(express.json());
app.use(express.static('public'));

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        file.mimetype === 'application/msword') {
      cb(null, true);
    } else {
      cb(new Error('只支持 Word 文档 (.docx, .doc)'), false);
    }
  }
});

let generatedQuizzes = new Map();

// 用户自定义 API Key
let userApiKey = null;

// 提取 Word 文档文本
async function extractTextFromWord(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer: buffer });
    return result.value;
  } catch (error) {
    throw new Error('无法解析 Word 文档：' + error.message);
  }
}

// 调用 AI 生成题目
async function callAI(prompt) {
  // 使用用户的 API Key 或默认
  const apiKey = userApiKey || AI_CONFIG.apiKey;
  
  if (!apiKey) {
    throw new Error('请先配置 API Key');
  }

  const requestData = {
    model: AI_CONFIG.model,
    messages: [
      { role: 'system', content: '你是一个专业的英语教育助手，擅长根据文章内容生成各种类型的英语练习题。题目必须基于文章内容，禁止编造。选项必须与文章内容相关。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.9
  };

  return new Promise((resolve, reject) => {
    const url = new URL(`${AI_CONFIG.baseUrl}/chat/completions`);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    };

    console.log('🌐 调用 AI...');

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('📥 AI 响应状态:', res.statusCode);
        console.log('📥 AI 响应长度:', data.length);
        
        if (!data || data.trim() === '') {
          reject(new Error('AI 返回空响应'));
          return;
        }
        
        console.log('📥 AI 响应:', data.substring(0, 500));
        
        try {
          const result = JSON.parse(data);
          // Kimi 格式: result.choices[0].message.content
          if (result.choices && result.choices[0] && result.choices[0].message) {
            resolve(result.choices[0].message.content);
          } else if (result.error) {
            reject(new Error('API 错误: ' + (result.error.message || JSON.stringify(result.error))));
          } else {
            reject(new Error('AI 响应格式错误: ' + JSON.stringify(result).substring(0, 200)));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(requestData));
    req.end();
  });
}

// 解析 AI 返回的 JSON
function parseAIResponse(content) {
  // 移除 markdown 代码块标记
  let jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('JSON 解析失败:', e);
      // 尝试修复常见问题
      try {
        // 修复截断问题
        const fixed = jsonMatch[0].replace(/,\s*$/, '').replace(/\}\s*$/, '}');
        return JSON.parse(fixed);
      } catch (e2) {
        console.error('修复后仍失败:', e2);
      }
    }
  }
  return null;
}

// 生成题目的提示词
function generateQuizPrompt(text, quizType) {
  const prompts = {
    vocabulary: `请根据以下英语文章内容，生成 5 道词汇练习题（选择题）。题目必须基于文章中的真实词汇！

文章内容：
${text}

要求：
1. 只使用文章中出现过的词汇来出题
2. 每题测试一个文章中的重要单词的意思或用法
3. 每道题 4 个选项（A/B/C/D），选项必须与文章内容相关
4. 标注正确答案
5. 必须包含 explanation 解释
6. 输出纯 JSON 格式：{"questions": [{"question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "answer": "A", "explanation": "..."}]}`,
    
    fillBlank: `请根据以下英语文章内容，生成 5 道填空题。题目必须基于文章内容！

文章内容：
${text}

要求：
1. 从文章中选取关键句子，挖空重要词汇或短语
2. 答案必须是文章中出现的词汇
3. 每题提供 4 个相关选项（A/B/C/D）
4. 标注正确答案
5. 必须包含 explanation 解释
6. 输出纯 JSON 格式：{"questions": [{"question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "answer": "A", "explanation": "..."}]}`,
    
    speaking: `请根据以下英语文章内容，生成 5 道口语练习题。问题必须与文章主题密切相关！

文章内容：
${text}

要求：
1. 根据文章的核心主题生成开放性问题
2. 问题要引发思考，让学生结合文章内容回答
3. 每题提供 hints 提示和 sampleAnswer 参考回答
4. 输出纯 JSON 格式：{"questions": [{"question": "...", "hints": "...", "sampleAnswer": "..."}]}`
  };
  
  return prompts[quizType] || prompts.fillBlank;
}

// 上传 Word 文档并生成题目
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传 Word 文档' });
    }

    const quizType = req.body.quizType || 'fillBlank';
    
    const text = await extractTextFromWord(req.file.buffer);
    
    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: '文档内容太短或无法读取' });
    }

    console.log(`📄 已提取文档内容，长度: ${text.length} 字符`);
    console.log(`🎯 题目类型: ${quizType}`);

    const prompt = generateQuizPrompt(text, quizType);
    
    let questions = null;
    
    try {
      console.log('🤖 正在调用 AI 生成题目...');
      const aiResponse = await callAI(prompt);
      const parsed = parseAIResponse(aiResponse);
      if (parsed && parsed.questions) {
        questions = parsed.questions;
        console.log(`✅ AI 成功生成 ${questions.length} 道题目`);
      }
    } catch (e) {
      console.error('❌ AI 调用失败:', e.message);
    }
    
    if (!questions) {
      return res.status(500).json({ error: 'AI 生成题目失败，请重试' });
    }
    
    const quizId = Date.now().toString();
    const quiz = {
      id: quizId,
      title: req.file.originalname.replace(/\.[^/.]+$/, ''),
      type: quizType,
      text: text.substring(0, 500) + '...',
      questions: questions,
      createdAt: new Date().toISOString()
    };
    
    generatedQuizzes.set(quizId, quiz);
    
    res.json({ 
      success: true, 
      quizId,
      message: '题目生成成功！',
      quizType
    });
    
  } catch (error) {
    console.error('生成题目失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取题目
app.get('/api/quiz/:id', (req, res) => {
  const quiz = generatedQuizzes.get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: '题目不存在' });
  }
  res.json(quiz);
});

// 获取所有题目列表
app.get('/api/quizzes', (req, res) => {
  const quizzes = Array.from(generatedQuizzes.values()).map(q => ({
    id: q.id,
    title: q.title,
    type: q.type,
    createdAt: q.createdAt
  }));
  res.json(quizzes);
});

// 设置 API Key
app.post('/api/set-apikey', express.json(), (req, res) => {
  userApiKey = req.body.apiKey;
  console.log('🔑 用户 API Key 已设置');
  res.json({ success: true });
});

// 录音文件保存接口
const fs = require('fs');
const path = require('path');

app.post('/api/save-recording', express.raw({ type: 'audio/webm', limit: '50mb' }), async (req, res) => {
  try {
    const { quizId, questionIndex } = req.body;
    
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: '没有录音数据' });
    }
    
    const uploadsDir = path.join(__dirname, 'public', 'recordings');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const filename = `recording_${quizId}_${questionIndex}_${Date.now()}.webm`;
    const filepath = path.join(uploadsDir, filename);
    
    fs.writeFileSync(filepath, req.body);
    
    console.log('💾 录音已保存:', filename);
    
    res.json({ success: true, filename: `/recordings/${filename}` });
  } catch (error) {
    console.error('保存录音失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取录音列表
app.get('/api/recordings/:quizId', (req, res) => {
  try {
    const recordingsDir = path.join(__dirname, 'public', 'recordings');
    if (!fs.existsSync(recordingsDir)) {
      return res.json([]);
    }
    
    const files = fs.readdirSync(recordingsDir)
      .filter(f => f.startsWith(`recording_${req.params.quizId}_`))
      .map(f => ({
        name: f,
        url: `/recordings/${f}`,
        time: fs.statSync(path.join(recordingsDir, f)).mtime
      }))
      .sort((a, b) => b.time - a.time);
    
    res.json(files);
  } catch (error) {
    res.json([]);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎓 英语练习题生成器运行在端口 ${PORT}`);
  console.log(`📱 手机访问: https://你的应用名.onrender.com`);
  console.log(`🎤 录音功能: 已启用`);
});
