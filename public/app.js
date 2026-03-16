// 状态管理
let currentFile = null;
let currentQuiz = null;
let userAnswers = {};
let quizHistory = JSON.parse(localStorage.getItem('quizHistory') || '[]');

// API Key 管理
function saveApiKey() {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  if (!apiKey) {
    alert('请输入 API Key');
    return;
  }
  
  fetch('/api/set-apikey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      document.getElementById('apiKeyStatus').textContent = '✓ 已保存';
      localStorage.setItem('userApiKey', apiKey);
    }
  });
}

// 加载保存的 API Key
function loadApiKey() {
  const savedKey = localStorage.getItem('userApiKey');
  if (savedKey) {
    document.getElementById('apiKeyInput').value = savedKey;
    saveApiKey();
  }
}

// DOM 元素
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const removeBtn = document.getElementById('removeBtn');
const generateBtn = document.getElementById('generateBtn');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const uploadSection = document.getElementById('uploadSection');
const quizSection = document.getElementById('quizSection');
const quizContent = document.getElementById('quizContent');
const quizTitle = document.getElementById('quizTitle');
const quizTypeBadge = document.getElementById('quizTypeBadge');
const questionCount = document.getElementById('questionCount');
const submitBtn = document.getElementById('submitBtn');
const results = document.getElementById('results');
const scoreDisplay = document.getElementById('scoreDisplay');
const reviewContent = document.getElementById('reviewContent');
const retryBtn = document.getElementById('retryBtn');
const backBtn = document.getElementById('backBtn');
const historyList = document.getElementById('historyList');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  renderHistory();
  loadApiKey();
});

// 初始化事件监听
function initEventListeners() {
  // 上传区域点击
  uploadArea.addEventListener('click', () => fileInput.click());
  
  // 文件选择
  fileInput.addEventListener('change', handleFileSelect);
  
  // 拖拽上传
  uploadArea.addEventListener('dragover', handleDragOver);
  uploadArea.addEventListener('dragleave', handleDragLeave);
  uploadArea.addEventListener('drop', handleDrop);
  
  // 移除文件
  removeBtn.addEventListener('click', removeFile);
  
  // 生成题目
  generateBtn.addEventListener('click', generateQuiz);
  
  // 提交答案
  submitBtn.addEventListener('click', submitAnswers);
  
  // 重新练习
  retryBtn.addEventListener('click', retryQuiz);
  
  // 返回上传
  backBtn.addEventListener('click', showUploadSection);
}

// 处理文件选择
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    setFile(file);
  }
}

// 处理拖拽
function handleDragOver(e) {
  e.preventDefault();
  uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) {
    setFile(file);
  }
}

// 设置文件
function setFile(file) {
  // 验证文件类型
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];
  
  if (!validTypes.includes(file.type) && !file.name.endsWith('.doc') && !file.name.endsWith('.docx')) {
    showError('请选择 Word 文档 (.doc 或 .docx)');
    return;
  }
  
  currentFile = file;
  fileName.textContent = file.name;
  fileInfo.style.display = 'flex';
  uploadArea.style.display = 'none';
  generateBtn.disabled = false;
  hideError();
}

// 移除文件
function removeFile() {
  currentFile = null;
  fileInput.value = '';
  fileInfo.style.display = 'none';
  uploadArea.style.display = 'block';
  generateBtn.disabled = true;
}

// 获取选择的题目类型
function getQuizType() {
  const selected = document.querySelector('input[name="quizType"]:checked');
  return selected ? selected.value : 'reading';
}

// 生成题目
async function generateQuiz() {
  if (!currentFile) {
    showError('请先上传文档');
    return;
  }
  
  const quizType = getQuizType();
  
  // 显示加载状态
  loading.style.display = 'block';
  generateBtn.disabled = true;
  hideError();
  
  try {
    const formData = new FormData();
    formData.append('document', currentFile);
    formData.append('quizType', quizType);
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || '生成题目失败');
    }
    
    // 获取生成的题目
    const quizResponse = await fetch(`/api/quiz/${data.quizId}`);
    currentQuiz = await quizResponse.json();
    
    // 保存到历史记录
    saveToHistory(currentQuiz);
    
    // 显示答题界面
    showQuizSection();
    
  } catch (error) {
    showError(error.message);
    loading.style.display = 'none';
    generateBtn.disabled = false;
  }
}

// 显示答题界面
function showQuizSection() {
  uploadSection.style.display = 'none';
  quizSection.style.display = 'block';
  
  // 设置标题和信息
  quizTitle.textContent = currentQuiz.title;
  quizTypeBadge.textContent = getQuizTypeName(currentQuiz.type);
  questionCount.textContent = `${currentQuiz.questions.length} 道题`;
  
  // 渲染题目
  renderQuestions();
  
  // 重置状态
  userAnswers = {};
  results.style.display = 'none';
  submitBtn.style.display = 'block';
  
  // 隐藏加载
  loading.style.display = 'none';
  generateBtn.disabled = false;
}

// 显示上传界面
function showUploadSection() {
  quizSection.style.display = 'none';
  uploadSection.style.display = 'block';
  currentQuiz = null;
}

// 获取题目类型名称
function getQuizTypeName(type) {
  const names = {
    vocabulary: '📚 词汇练习',
    fillBlank: '✏️ 填空题',
    speaking: '🗣️ 口语练习'
  };
  return names[type] || '练习题';
}

// 渲染题目
function renderQuestions() {
  quizContent.innerHTML = '';
  
  // 如果是口语练习，渲染不同的格式
  if (currentQuiz.type === 'speaking') {
    renderSpeakingQuestions();
    return;
  }
  
  currentQuiz.questions.forEach((question, index) => {
    const questionCard = document.createElement('div');
    questionCard.className = 'question-card';
    questionCard.innerHTML = `
      <div class="question-number">第 ${index + 1} 题</div>
      <div class="question-text">${question.question}</div>
      <ul class="options-list">
        ${question.options.map((option, optIndex) => {
          const optionLetter = option.charAt(0);
          return `
            <li class="option-item" data-question="${index}" data-option="${optionLetter}">
              <span class="option-marker">${optionLetter}</span>
              <span class="option-text">${option.substring(2)}</span>
            </li>
          `;
        }).join('')}
      </ul>
    `;
    
    quizContent.appendChild(questionCard);
    
    // 添加选项点击事件
    questionCard.querySelectorAll('.option-item').forEach(option => {
      option.addEventListener('click', () => selectOption(option));
    });
  });
}

// 渲染口语练习题目
function renderSpeakingQuestions() {
  currentQuiz.questions.forEach((question, index) => {
    const questionCard = document.createElement('div');
    questionCard.className = 'question-card speaking-card';
    questionCard.innerHTML = `
      <div class="question-number">第 ${index + 1} 题</div>
      <div class="question-text">${question.question}</div>
      <div class="speaking-hints">
        <strong>💡 提示：</strong>${question.hints || ''}
      </div>
      
      <!-- 录音区域 -->
      <div class="recording-area">
        <button class="record-btn" id="recordBtn_${index}" onclick="toggleRecording(${index})">
          <span class="record-icon">🎤</span>
          <span class="record-text">开始录音</span>
        </button>
        <div class="recording-status" id="recordingStatus_${index}"></div>
        <div class="audio-playback" id="audioPlayback_${index}"></div>
      </div>
      
      <textarea class="speaking-answer" data-question="${index}" placeholder="或者在这里用英语写下你的回答..."></textarea>
      ${question.sampleAnswer ? `
        <div class="sample-answer">
          <strong>📝 参考回答：</strong>
          <p>${question.sampleAnswer}</p>
        </div>
      ` : ''}
    `;
    
    quizContent.appendChild(questionCard);
    
    // 添加文本框事件
    const textarea = questionCard.querySelector('.speaking-answer');
    textarea.addEventListener('input', (e) => {
      userAnswers[index] = e.target.value;
    });
    
    // 初始化录音
    initRecording(index);
  });
}

// 录音功能
let mediaRecorder = null;
let audioChunks = [];
let currentRecordingIndex = null;
let audioBlobs = {};

function initRecording(index) {
  // 预加载之前保存的录音
  loadRecordings(index);
}

async function loadRecordings(index) {
  try {
    const response = await fetch(`/api/recordings/${currentQuiz.id}`);
    const files = await response.json();
    const playbackDiv = document.getElementById(`audioPlayback_${index}`);
    if (!playbackDiv) return;
    
    const questionFiles = files.filter(f => f.name.includes(`_${index}_`));
    if (questionFiles.length > 0) {
      playbackDiv.innerHTML = questionFiles.map(f => `
        <div class="saved-recording">
          <audio controls src="${f.url}"></audio>
          <span class="recording-time">${new Date(f.time).toLocaleString()}</span>
        </div>
      `).join('');
    }
  } catch (e) {
    console.log('加载录音失败:', e);
  }
}

async function toggleRecording(index) {
  const btn = document.getElementById(`recordBtn_${index}`);
  const statusDiv = document.getElementById(`recordingStatus_${index}`);
  
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // 停止录音
    mediaRecorder.stop();
    btn.classList.remove('recording');
    btn.querySelector('.record-text').textContent = '开始录音';
    statusDiv.textContent = '录音已保存';
  } else {
    // 开始录音
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      currentRecordingIndex = index;
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await saveRecording(audioBlob, index);
        
        // 显示录音回放
        const playbackDiv = document.getElementById(`audioPlayback_${index}`);
        if (playbackDiv) {
          const audioUrl = URL.createObjectURL(audioBlob);
          playbackDiv.innerHTML = `
            <div class="saved-recording">
              <audio controls src="${audioUrl}"></audio>
              <button class="delete-recording" onclick="deleteRecording(this, ${index})">🗑️</button>
            </div>
          `;
        }
        
        // 停止所有轨道
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      btn.classList.add('recording');
      btn.querySelector('.record-text').textContent = '停止录音';
      statusDiv.textContent = '录音中...';
      
    } catch (e) {
      alert('无法访问麦克风，请确保已授予权限');
      console.error(e);
    }
  }
}

async function saveRecording(blob, questionIndex) {
  try {
    const response = await fetch('/api/save-recording', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/webm' },
      body: blob
    });
    const data = await response.json();
    if (data.success) {
      console.log('录音已保存:', data.filename);
    }
  } catch (e) {
    console.error('保存录音失败:', e);
  }
}

function deleteRecording(btn, index) {
  if (confirm('确定要删除这条录音吗？')) {
    btn.parentElement.remove();
  }
}

// 全局函数
window.toggleRecording = toggleRecording;
window.deleteRecording = deleteRecording;

// 选择选项
function selectOption(optionElement) {
  const questionIndex = optionElement.dataset.question;
  const selectedOption = optionElement.dataset.option;
  
  // 清除同题的其他选择
  const sameQuestion = document.querySelectorAll(`[data-question="${questionIndex}"]`);
  sameQuestion.forEach(opt => opt.classList.remove('selected'));
  
  // 设置新选择
  optionElement.classList.add('selected');
  
  // 保存答案
  userAnswers[questionIndex] = selectedOption;
}

// 提交答案
function submitAnswers() {
  // 口语练习不需要评分，直接显示完成
  if (currentQuiz.type === 'speaking') {
    const answeredQuestions = Object.keys(userAnswers).length;
    const totalQuestions = currentQuiz.questions.length;
    
    if (answeredQuestions < totalQuestions) {
      if (!confirm(`你还有 ${totalQuestions - answeredQuestions} 道题未回答，确定要提交吗？`)) {
        return;
      }
    }
    
    // 显示口语练习完成
    showSpeakingResults();
    return;
  }
  
  // 检查是否所有题目都回答了
  const totalQuestions = currentQuiz.questions.length;
  const answeredQuestions = Object.keys(userAnswers).length;
  
  if (answeredQuestions < totalQuestions) {
    if (!confirm(`你还有 ${totalQuestions - answeredQuestions} 道题未回答，确定要提交吗？`)) {
      return;
    }
  }
  
  // 计算分数
  let correctCount = 0;
  currentQuiz.questions.forEach((question, index) => {
    const userAnswer = userAnswers[index];
    if (userAnswer === question.answer) {
      correctCount++;
    }
  });
  
  const score = Math.round((correctCount / totalQuestions) * 100);
  
  // 显示结果
  showResults(score, correctCount, totalQuestions);
}

// 显示结果
function showResults(score, correctCount, totalQuestions) {
  submitBtn.style.display = 'none';
  results.style.display = 'block';
  
  // 显示分数
  let scoreMessage = '';
  if (score >= 90) {
    scoreMessage = '🎉 太棒了！';
  } else if (score >= 70) {
    scoreMessage = '👍 做得不错！';
  } else if (score >= 60) {
    scoreMessage = '💪 继续加油！';
  } else {
    scoreMessage = '📚 再多练习一下！';
  }
  
  scoreDisplay.innerHTML = `
    <span class="score-number">${score}分</span>
    <span class="score-text">${scoreMessage} (${correctCount}/${totalQuestions})</span>
  `;
  
  // 显示答案解析
  renderReview();
  
  // 标记正确答案
  markCorrectAnswers();
}

// 显示口语练习结果
function showSpeakingResults() {
  submitBtn.style.display = 'none';
  results.style.display = 'block';
  
  const answeredCount = Object.values(userAnswers).filter(a => a && a.trim()).length;
  const totalQuestions = currentQuiz.questions.length;
  
  scoreDisplay.innerHTML = `
    <span class="score-number">完成！</span>
    <span class="score-text">你完成了 ${answeredCount}/${totalQuestions} 道口语练习</span>
  `;
  
  // 显示所有问题和用户的回答
  renderSpeakingReview();
}

// 渲染口语练习答案回顾
function renderSpeakingReview() {
  reviewContent.innerHTML = '';
  
  currentQuiz.questions.forEach((question, index) => {
    const userAnswer = userAnswers[index] || '';
    
    const reviewDiv = document.createElement('div');
    reviewDiv.className = 'review-question speaking-review';
    reviewDiv.innerHTML = `
      <div class="review-question-text">${index + 1}. ${question.question}</div>
      <div class="your-answer">
        <strong>你的回答：</strong>
        <p>${userAnswer || '(未作答)'}</p>
      </div>
      ${question.sampleAnswer ? `
        <div class="review-explanation">
          <strong>📝 参考回答：</strong>
          <p>${question.sampleAnswer}</p>
        </div>
      ` : ''}
    `;
    
    reviewContent.appendChild(reviewDiv);
  });
}

// 标记正确答案
function markCorrectAnswers() {
  currentQuiz.questions.forEach((question, index) => {
    const options = document.querySelectorAll(`[data-question="${index}"]`);
    const userAnswer = userAnswers[index];
    
    options.forEach(option => {
      const optionLetter = option.dataset.option;
      
      // 标记正确答案
      if (optionLetter === question.answer) {
        option.classList.add('correct');
      }
      
      // 标记用户选择的错误答案
      if (optionLetter === userAnswer && userAnswer !== question.answer) {
        option.classList.add('incorrect');
      }
    });
  });
}

// 渲染答案解析
function renderReview() {
  reviewContent.innerHTML = '';
  
  currentQuiz.questions.forEach((question, index) => {
    const userAnswer = userAnswers[index];
    const isCorrect = userAnswer === question.answer;
    
    const reviewDiv = document.createElement('div');
    reviewDiv.className = 'review-question';
    reviewDiv.innerHTML = `
      <div class="review-question-text">${index + 1}. ${question.question}</div>
      <div class="review-answer">
        正确答案：${question.answer} 
        ${isCorrect ? '✅' : '❌'}
        ${userAnswer ? `(你的答案：${userAnswer})` : '(未作答)'}
      </div>
      <div class="review-explanation">${question.explanation || ''}</div>
    `;
    
    reviewContent.appendChild(reviewDiv);
  });
}

// 重新练习
function retryQuiz() {
  userAnswers = {};
  results.style.display = 'none';
  submitBtn.style.display = 'block';
  
  // 清除所有标记
  document.querySelectorAll('.option-item').forEach(option => {
    option.classList.remove('selected', 'correct', 'incorrect');
  });
}

// 保存到历史记录
function saveToHistory(quiz) {
  quizHistory.unshift({
    id: quiz.id,
    title: quiz.title,
    type: quiz.type,
    createdAt: quiz.createdAt
  });
  
  // 只保留最近 20 条
  if (quizHistory.length > 20) {
    quizHistory = quizHistory.slice(0, 20);
  }
  
  localStorage.setItem('quizHistory', JSON.stringify(quizHistory));
  renderHistory();
}

// 渲染历史记录
function renderHistory() {
  if (quizHistory.length === 0) {
    historyList.innerHTML = '<p class="empty-hint">暂无历史记录</p>';
    return;
  }
  
  historyList.innerHTML = quizHistory.map(quiz => `
    <div class="history-item" onclick="loadHistoryQuiz('${quiz.id}')">
      <span class="history-title">${getQuizTypeName(quiz.type)} - ${quiz.title}</span>
      <span class="history-meta">${new Date(quiz.createdAt).toLocaleDateString('zh-CN')}</span>
    </div>
  `).join('');
}

// 加载历史题目（简化版，实际需要从服务器获取）
function loadHistoryQuiz(quizId) {
  alert('历史题目加载功能开发中...');
}

// 显示错误
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add('show');
}

// 隐藏错误
function hideError() {
  errorMessage.classList.remove('show');
}
