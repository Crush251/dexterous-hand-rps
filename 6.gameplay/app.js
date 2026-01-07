// 剪刀石头布的姿势定义（按不同手型号分类）
const GesturePresets = {
    // L10 蜗轮蜗杆型号
    'L10_worm_gear': {
        ROCK: {
            finger: [1,49, 128, 40, 36, 41, 46],
            palm: [4,128, 128, 128, 128]
        },
        PAPER: {
            finger: [1,255, 255, 255, 255, 255, 255],
            palm: [4,128, 128, 128, 128]
        },
        SCISSORS: {
            finger: [1,0, 103, 255, 255, 0, 0],
            palm: [4,255, 128, 128, 128]
        }
    },
    // L10 球关节型号
    'L10_ball_joint': {
        ROCK: {
            finger: [1,49, 128, 40, 36, 41, 46],
            palm: [4,128, 128, 128, 128]
        },
        PAPER: {
            finger: [1,255, 255, 255, 255, 255, 255],
            palm: [4,128, 128, 128, 128]
        },
        SCISSORS: {
            finger: [1,0, 103, 255, 255, 0, 0],
            palm: [4,255, 128, 128, 128]
        }
    },
    // O6/L6 型号
    'O6/L6': {
        ROCK: {
            finger: [1,65, 170, 25, 25, 25, 25]
        },
        PAPER: {
            finger: [1,255, 255, 255, 255, 255, 255]
          
        },
        SCISSORS: {
            finger: [1,65,180,255,255,25,25]
        }
    }
};

// 手势映射
const GestureMap = {
    '石头': 'ROCK',
    '布': 'PAPER', 
    '剪刀': 'SCISSORS'
};

const GestureIcons = {
    '石头': '👊',
    '布': '✋',
    '剪刀': '✌️'
};

// 解析Base URL
function parseBaseUrl(url) {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('baseurl');
}

// 获取设备配置信息（页面加载时调用一次）
async function loadDeviceConfig() {
    try {
        const response = await fetch(`${baseHost}/api/hand/handsconfig`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        
        const data = await response.json();
        
        if (data.status === 'ok' && data.data && data.data.length > 0) {
            // 保存所有设备配置信息（数组）
            deviceConfig = data.data.map(config => {
                // 处理 model 字段，可能是 "O6/L6" 这样的格式
                let model = config.model || 'unknown';
                // 保持原始格式，不拆分
                
                return {
                    interface: config.interface || 'can0',
                    model: model, // L10 / L6 / O6 / O7 / O6/L6
                    variant: config.variant || '', // 仅 L10 有此字段：worm_gear 或 ball_joint
                    side: config.side || 'right' // left / right
                };
            });
            
            console.log('设备配置加载成功，共', deviceConfig.length, '个设备:', deviceConfig);
            
            // 输出每个设备的信息
            deviceConfig.forEach((config, index) => {
                if (config.model === 'L10') {
                    console.log(`设备 ${index + 1}: L10 型号，变体: ${config.variant || '未指定'}, 接口: ${config.interface}, 手: ${config.side}`);
                } else {
                    console.log(`设备 ${index + 1}: ${config.model} 型号, 接口: ${config.interface}, 手: ${config.side}`);
                }
            });
            
            return deviceConfig;
        } else {
            console.error('获取设备配置失败:', data.message || data.error);
            return null;
        }
    } catch (error) {
        console.error('加载设备配置时发生错误:', error);
        return null;
    }
}

// 发送 CAN 消息到指定端口
async function sendCanMessage(canMessage) {
    const canServerUrl = "http://localhost:5260/api/can";
    
    try {
        const response = await fetch(canServerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(canMessage)
        });

        const data = await response.json();
        if (data.status === 'success' || response.ok) {
            console.log(`CAN 消息发送成功:`, canMessage);
            return true;
        } else {
            console.error(`CAN 消息发送失败:`, data.error || data.message);
            return false;
        }
    } catch (error) {
        console.error(`CAN 消息请求错误:`, error);
        return false;
    }
}

// 根据设备配置获取对应的手势预设键
function getGesturePresetKey(config) {
    if (!config) {
        console.warn('设备配置为空，使用默认配置');
        return 'O6/L6'; // 默认使用 O6/L6
    }
    
    const { model, variant } = config;
    
    // L10 型号根据 variant 区分
    if (model === 'L10') {
        if (variant === 'worm_gear') {
            return 'L10_worm_gear';
        } else if (variant === 'ball_joint') {
            return 'L10_ball_joint';
        } else {
            // L10 但没有指定 variant，默认使用 worm_gear
            console.warn('L10 型号未指定 variant，默认使用 worm_gear');
            return 'L10_worm_gear';
        }
    }
    // O6/L6 型号
    else if (model === 'O6/L6' || model === 'O6' || model === 'L6') {
        return 'O6/L6';
    }
    // 其他未知型号，默认使用 O6/L6
    else {
        console.warn(`未知型号 ${model}，使用默认配置 O6/L6`);
        return 'O6/L6';
    }
}

// 根据左右手获取 CAN ID
function getCanId(side) {
    // 左手为 0x28，右手为 0x27
    return side === 'left' ? 0x28 : 0x27;
}

// 封装调用函数 - 并发发送所有设备的 CAN 消息
async function performGesture(gesture) {
    // 检查设备配置是否已加载
    if (!deviceConfig || !Array.isArray(deviceConfig) || deviceConfig.length === 0) {
        console.error('设备配置未加载或为空，无法执行手势');
        return;
    }
    
    console.log(`开始执行手势 ${gesture}，共 ${deviceConfig.length} 个设备（并发发送）`);
    
    // 为每个设备创建发送任务，并发执行
    const sendTasks = deviceConfig.map(async (config, index) => {
        try {
            // 获取对应型号的手势预设键
            const presetKey = getGesturePresetKey(config);
            const modelPresets = GesturePresets[presetKey];
            
            if (!modelPresets) {
                console.error(`设备 ${index + 1} (${config.interface}): 未找到对应型号的手势预设:`, presetKey);
                return;
            }
            
            // 获取具体的手势预设（ROCK、PAPER 或 SCISSORS）
            const preset = modelPresets[gesture];
            
            if (!preset) {
                console.error(`设备 ${index + 1} (${config.interface}): 无效的手势:`, gesture);
                return;
            }
            
            const fingerpose = preset.finger;
            
            // 构建 finger CAN 消息
            const fingerCanMessage = {
                interface: config.interface,
                id: getCanId(config.side),
                data: fingerpose
            };
            
            console.log(`设备 ${index + 1} (${config.interface}, ${config.side}手): 使用 ${presetKey} 配置执行手势 ${gesture}`);
            
            // 发送 finger 消息
            await sendCanMessage(fingerCanMessage);
            
            // 如果有 palm 数据，延迟后发送
            if (preset.palm) {
                const palmCanMessage = {
                    interface: config.interface,
                    id: getCanId(config.side),
                    data: preset.palm
                };
                // 短暂延迟后发送手掌姿势
                await new Promise(resolve => setTimeout(resolve, 10));
                await sendCanMessage(palmCanMessage);
            }
        } catch (error) {
            console.error(`设备 ${index + 1} (${config.interface}): 发送失败`, error);
        }
    });
    
    // 并发执行所有设备的发送任务
    await Promise.all(sendTasks);
    
    console.log(`手势 ${gesture} 执行完成（所有设备并发发送完成）`);
}

// 页面元素
const video = document.getElementById('webcam');
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status');
const cameraStartButton = document.getElementById('camera-start-btn');
const cameraStopButton = document.getElementById('camera-stop-btn');
const handCountSpan = document.getElementById('hand-count');
const landmarksInfo = document.getElementById('landmarks-info');
const fpsCounter = document.getElementById('fps');
const currentGestureSpan = document.getElementById('current-gesture');

// 游戏控制元素
const gameStartButton = document.getElementById('start-btn');
const gamePauseButton = document.getElementById('pause-btn');
const gameStopButton = document.getElementById('stop-btn');
const gameStatusText = document.getElementById('game-status-text');
const countdownDisplay = document.getElementById('countdown-display');

// 记分板元素
const playerScoreSpan = document.getElementById('player-score');
const robotScoreSpan = document.getElementById('robot-score');

// 手势对比元素
const gestureComparison = document.getElementById('gesture-comparison');
const playerGestureIcon = document.getElementById('player-gesture');
const playerGestureName = document.getElementById('player-gesture-name');
const robotGestureIcon = document.getElementById('robot-gesture');
const robotGestureName = document.getElementById('robot-gesture-name');

// 游戏结果元素
const gameResult = document.getElementById('game-result');
const resultText = document.getElementById('result-text');
const resultDetail = document.getElementById('result-detail');

// 手势置信度元素
const rockConfidence = document.getElementById('rock-confidence');
const paperConfidence = document.getElementById('paper-confidence');
const scissorsConfidence = document.getElementById('scissors-confidence');

// 手势卡片元素
const rockCard = document.getElementById('rock-card');
const paperCard = document.getElementById('paper-card');
const scissorsCard = document.getElementById('scissors-card');

// 全局变量
let hands;
let camera;
let lastFrameTime = 0;
let isCameraRunning = false;
let currentGesture = "未识别";
let gestureConfidence = 0;
let deviceConfig = null; // 存储设备配置信息
let baseHost = "http://localhost:1217";

// 游戏状态变量
let gameState = 'idle'; // idle, countdown, waiting, judging, paused
let countdownTimer = null;
let gameTimer = null;
let playerScore = 0;
let robotScore = 0;
let robotGesture = '';
let playerGesture = '';
let gestureDetectionTimeout = null;

// 定义手部连接关系
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],  // 拇指
    [0, 5], [5, 6], [6, 7], [7, 8],  // 食指
    [0, 9], [9, 10], [10, 11], [11, 12],  // 中指
    [0, 13], [13, 14], [14, 15], [15, 16],  // 无名指
    [0, 17], [17, 18], [18, 19], [19, 20],  // 小指
    [5, 9], [9, 13], [13, 17],  // 掌心连接
    [0, 5], [0, 17]  // 手腕连接
];

// 本地存储键名
const STORAGE_KEYS = {
    PLAYER_SCORE: 'rps_player_score',
    ROBOT_SCORE: 'rps_robot_score'
};

// 初始化游戏
function initGame() {
    loadScores();
    updateScoreDisplay();
    setupEventListeners();
}

// 加载分数
function loadScores() {
    playerScore = parseInt(localStorage.getItem(STORAGE_KEYS.PLAYER_SCORE)) || 0;
    robotScore = parseInt(localStorage.getItem(STORAGE_KEYS.ROBOT_SCORE)) || 0;
}

// 保存分数
function saveScores() {
    localStorage.setItem(STORAGE_KEYS.PLAYER_SCORE, playerScore.toString());
    localStorage.setItem(STORAGE_KEYS.ROBOT_SCORE, robotScore.toString());
}

// 更新分数显示
function updateScoreDisplay() {
    playerScoreSpan.textContent = playerScore;
    robotScoreSpan.textContent = robotScore;
}

// 重置分数
function resetScores() {
    playerScore = 0;
    robotScore = 0;
    saveScores();
    updateScoreDisplay();
}

// 设置事件监听器
function setupEventListeners() {
    gameStartButton.addEventListener('click', startGame);
    gamePauseButton.addEventListener('click', pauseGame);
    gameStopButton.addEventListener('click', stopGame);
    cameraStartButton.addEventListener('click', startCamera);
    cameraStopButton.addEventListener('click', stopCamera);
}

// 开始游戏
function startGame() {
    if (gameState === 'paused') {
        resumeGame();
        return;
    }
    
    if (!isCameraRunning) {
        alert('请先启动摄像头！');
        return;
    }
    
    console.log('开始游戏');
    gameState = 'running';
    gameStartButton.disabled = true;
    gamePauseButton.disabled = false;
    gameStopButton.disabled = false;
    
    startRound();
}

// 暂停游戏
function pauseGame() {
    if (gameState === 'running' || gameState === 'countdown' || gameState === 'waiting' || gameState === 'judging') {
        gameState = 'paused';
        clearCountdown();
        clearGameTimer();
        gameStartButton.disabled = false;
        gameStartButton.textContent = '🎯 继续游戏';
        gamePauseButton.disabled = true;
        gameStatusText.textContent = '游戏已暂停';
        hideElements();
    }
}

// 继续游戏
function resumeGame() {
    gameState = 'running';
    gameStartButton.disabled = true;
    gameStartButton.textContent = '🎯 开始游戏';
    gamePauseButton.disabled = false;
    startRound();
}

// 停止游戏
function stopGame() {
    gameState = 'idle';
    clearCountdown();
    clearGameTimer();
    
    // 重置UI
    gameStartButton.disabled = false;
    gameStartButton.textContent = '🎯 开始游戏';
    gamePauseButton.disabled = true;
    gameStopButton.disabled = true;
    
    gameStatusText.textContent = '点击开始游戏';
    hideElements();
    
    // 重置分数
    resetScores();
}

// 开始新一轮
function startRound() {
    if (gameState !== 'running' && gameState !== 'judging') {
        console.log('游戏状态不正确，无法开始新一轮:', gameState);
        return;
    }
    
    console.log('开始新一轮，当前状态:', gameState);
    gameState = 'running';
    resetRoundDisplay();
    startCountdown();
}

// 重置回合显示
function resetRoundDisplay() {
    gestureComparison.classList.add('hidden');
    gameResult.classList.add('hidden');
    playerGesture = '';
    robotGesture = '';
    currentGesture = "未识别";
}

// 开始倒计时
function startCountdown() {
    gameState = 'countdown';
    gameStatusText.classList.add('hidden');
    countdownDisplay.classList.remove('hidden');
    
    let count = 3;
    let robotGestureGenerated = false;
    countdownDisplay.textContent = count;
    
    // 定义一个名为countdown的箭头函数，用于处理倒计时逻辑
    const countdown = () => {
        // 如果当前游戏状态不是“countdown”（倒计时），则直接返回，不执行后续逻辑
        if (gameState !== 'countdown') return;
        
        // 倒计时数字减1
        count--;
        // 如果倒计时还没结束（大于0）
        if (count > 0) {
            // 更新页面上的倒计时显示
            countdownDisplay.textContent = count;
            
            // 如果倒计时数字为1，并且机器人手势还没有生成
            // 这里的目的是在倒计时剩余0.5秒时生成机器人手势，增加紧张感
            if (count === 1 && !robotGestureGenerated) {
                setTimeout(() => {
                    // 再次确认游戏状态仍然是倒计时，防止中途被打断
                    if (gameState === 'countdown') {
                        // 生成机器人的手势
                        generateRobotGesture();
                        // 标记机器人手势已经生成，避免重复生成
                        robotGestureGenerated = true;
                    }
                }, 900); // 延迟900毫秒后执行
            }
            
            // 设置下一次倒计时的定时器，1秒后再次调用countdown函数
            countdownTimer = setTimeout(countdown, 1000);
        } else {
            // 如果倒计时结束（count <= 0），显示“出招！”提示
            countdownDisplay.textContent = '出招！';
            // 0.5秒后执行回合（即让玩家和机器人出手）
            setTimeout(() => {
                executeRound();
            }, 500);
        }
    };
    
    // 设置下一次倒计时的定时器，1秒后再次调用countdown函数
    countdownTimer = setTimeout(countdown, 1000);
}

// 执行回合
function executeRound() {
    if (gameState !== 'countdown') return;
    
    gameState = 'waiting';
    countdownDisplay.classList.add('hidden');
    gameStatusText.classList.remove('hidden');
    gameStatusText.textContent = '正在识别手势...';
    
    // 如果机器人手势还没生成，现在生成（防护措施）
    if (!robotGesture) {
        generateRobotGesture();
    }
    
    // 开始检测玩家手势
    startPlayerGestureDetection();
}

// 生成机器人手势
function generateRobotGesture() {
    const gestures = ['石头', '布', '剪刀'];
    robotGesture = gestures[Math.floor(Math.random() * gestures.length)];
    
    // 发送手势到灵巧手
    const gestureKey = GestureMap[robotGesture];
    performGesture(gestureKey);
    
    // 显示机器人手势
    robotGestureIcon.textContent = GestureIcons[robotGesture];
    robotGestureName.textContent = robotGesture;
    
    console.log('机器人出:', robotGesture);
}

// 开始玩家手势检测
function startPlayerGestureDetection() {
    gestureComparison.classList.remove('hidden');
    playerGestureIcon.textContent = '❓';
    playerGestureName.textContent = '识别中...';
    
    // 5秒超时
    gestureDetectionTimeout = setTimeout(() => {
        if (gameState === 'waiting') {
            playerGesture = '超时';
            judgeRound();
        }
    }, 5000);
}

// 判断回合结果
function judgeRound() {
    if (gameState !== 'waiting') return;
    
    gameState = 'judging';
    clearTimeout(gestureDetectionTimeout);
    
    let result = '';
    let winner = '';
    
    if (playerGesture === '超时') {
        result = '超时失败';
        winner = 'robot';
        robotScore++;
    } else if (playerGesture === robotGesture) {
        result = '平局';
        winner = 'draw';
    } else if (
        (playerGesture === '石头' && robotGesture === '剪刀') ||
        (playerGesture === '布' && robotGesture === '石头') ||
        (playerGesture === '剪刀' && robotGesture === '布')
    ) {
        result = '你赢了！';
        winner = 'player';
        playerScore++;
    } else {
        result = '你输了！';
        winner = 'robot';
        robotScore++;
    }
    
    showResult(result, winner);
    updateScoreDisplay();
    saveScores();
    
    // 1秒后开始下一轮（只要游戏状态是judging且不是paused）
    gameTimer = setTimeout(() => {
        if (gameState === 'judging') {
            console.log('开始下一轮...');
            startRound();
        }
    }, 1000);
}

// 显示结果
function showResult(result, winner) {
    gameStatusText.textContent = '本轮结束';
    
    resultText.textContent = result;
    resultText.className = 'result-text';
    
    if (winner === 'player') {
        resultText.classList.add('win');
        resultDetail.textContent = '🎉 恭喜你获得一分！';
        playerScoreSpan.classList.add('score-update');
    } else if (winner === 'robot') {
        resultText.classList.add('lose');
        resultDetail.textContent = '😤 机器人获得一分！';
        robotScoreSpan.classList.add('score-update');
    } else {
        resultText.classList.add('draw');
        resultDetail.textContent = '🤝 平局，再来一局！';
    }
    
    gameResult.classList.remove('hidden');
    
    // 移除分数动画
    setTimeout(() => {
        playerScoreSpan.classList.remove('score-update');
        robotScoreSpan.classList.remove('score-update');
    }, 600);
}

// 隐藏游戏元素
function hideElements() {
    gestureComparison.classList.add('hidden');
    gameResult.classList.add('hidden');
    countdownDisplay.classList.add('hidden');
    gameStatusText.classList.remove('hidden');
}

// 清除倒计时
function clearCountdown() {
    if (countdownTimer) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
    }
}

// 清除游戏计时器
function clearGameTimer() {
    if (gameTimer) {
        clearTimeout(gameTimer);
        gameTimer = null;
    }
    if (gestureDetectionTimeout) {
        clearTimeout(gestureDetectionTimeout);
        gestureDetectionTimeout = null;
    }
}

// 设置canvas大小
function setupCanvas() {
    const container = document.getElementById('video-container');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // 使用容器尺寸，确保canvas不会溢出
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    
    console.log('Canvas设置尺寸:', containerWidth, 'x', containerHeight);
}

// 初始化MediaPipe Hands模型
async function initHandDetection() {
    try {
        statusDiv.textContent = "正在加载手部检测模型...";
        
        hands = new Hands({
            locateFile: (file) => {
                return `libs/mediapipe/hands/${file}`;
            }
        });

        // 配置模型
        await hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        // 设置结果回调
        hands.onResults(onResults);

        statusDiv.textContent = "模型加载完成，点击'启动摄像头'开始检测";
        cameraStartButton.disabled = false;

    } catch (error) {
        statusDiv.textContent = `初始化失败: ${error.message}`;
        console.error("初始化失败:", error);
    }
}

// 处理检测结果
function onResults(results) {
    // 计算FPS
    const now = performance.now();
    const elapsed = now - lastFrameTime;
    lastFrameTime = now;
    const fps = Math.round(1000 / elapsed);
    fpsCounter.textContent = `FPS: ${fps}`;

    // 清除canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 更新检测到的手数量
    const handCount = results.multiHandLandmarks?.length || 0;
    handCountSpan.textContent = handCount;

    // 重置手势置信度显示
    resetGestureConfidence();

    // 如果检测到手
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // 绘制手部关键点
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label;
            
            // 绘制连接线和关键点
            drawConnectors(ctx, landmarks, HAND_CONNECTIONS, 
                { color: handedness === 'Left' ? '#00FF00' : '#FF0000', lineWidth: 5 });
            drawLandmarks(ctx, landmarks, 
                { color: handedness === 'Left' ? '#00CC00' : '#CC0000', lineWidth: 2 });
            
            // 在手腕处标示左/右手
            const wrist = landmarks[0];
            ctx.fillStyle = handedness === 'Left' ? '#00FF00' : '#FF0000';
            ctx.font = '16px Arial';
            ctx.fillText(handedness === 'Left' ? '左手' : '右手', 
                         wrist.x * canvas.width, 
                         wrist.y * canvas.height - 10);
            
            // 识别石头剪刀布手势
            const gesture = recognizeRockPaperScissors(landmarks);
            
            // 在手部上方显示识别的手势
            ctx.font = '20px Arial';
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            const gestureText = `${gesture.name} (${Math.round(gesture.confidence * 100)}%)`;
            const textX = wrist.x * canvas.width;
            const textY = wrist.y * canvas.height - 30;
            ctx.strokeText(gestureText, textX, textY);
            ctx.fillText(gestureText, textX, textY);
            
            // 更新手势置信度显示
            updateGestureConfidence(gesture.name, gesture.confidence);
            
            // 如果置信度高，更新当前识别的手势
            if (gesture.confidence > 0.7 && gesture.name !== "未识别") {
                currentGesture = gesture.name;
                gestureConfidence = gesture.confidence;
                
                // 如果正在等待玩家手势且还未确定
                if (gameState === 'waiting' && !playerGesture) {
                    playerGesture = gesture.name;
                    playerGestureIcon.textContent = GestureIcons[gesture.name];
                    playerGestureName.textContent = gesture.name;
                    
                    // 立即判断，不需要延迟
                    judgeRound();
                }
            }
        }

        // 更新关键点信息
        updateLandmarksInfo(results.multiHandLandmarks, results.multiHandedness);
    } else {
        landmarksInfo.textContent = "尚未检测到手部";
        currentGesture = "等待手势...";
        gestureConfidence = 0;
    }
    
    // 更新当前手势显示
    currentGestureSpan.textContent = currentGesture;
}

// 识别石头剪刀布手势
function recognizeRockPaperScissors(landmarks) {
    const thumbIsOpen = isThumbOpen(landmarks);
    const indexIsOpen = isFingerOpen(landmarks, 8, 6);
    const middleIsOpen = isFingerOpen(landmarks, 12, 10);
    const ringIsOpen = isFingerOpen(landmarks, 16, 14);
    const pinkyIsOpen = isFingerOpen(landmarks, 20, 18);
    
    const openFingers = [thumbIsOpen, indexIsOpen, middleIsOpen, ringIsOpen, pinkyIsOpen];
    const openCount = openFingers.filter(Boolean).length;
    
    let gesture = "未识别";
    let confidence = 0.5;
    
    // 石头: 所有手指都弯曲
    if (!thumbIsOpen && !indexIsOpen && !middleIsOpen && !ringIsOpen && !pinkyIsOpen) {
        gesture = "石头";
        confidence = 0.9;
    }
    // 布: 所有手指都伸展
    else if (openCount >= 4) {
        gesture = "布";
        confidence = 0.85;
    }
    // 剪刀: 食指和中指伸展，其他手指弯曲
    else if (indexIsOpen && middleIsOpen && !ringIsOpen && !pinkyIsOpen) {
        gesture = "剪刀";
        confidence = 0.8;
    }
    
    return { name: gesture, confidence: confidence };
}

// 检查拇指是否伸展
function isThumbOpen(landmarks) {
    const thumb_tip = landmarks[4];
    const thumb_ip = landmarks[3];
    return thumb_tip.x < thumb_ip.x; 
}

// 检查手指是否伸展
function isFingerOpen(landmarks, tipIdx, pipIdx) {
    const finger_tip = landmarks[tipIdx];
    const finger_pip = landmarks[pipIdx];
    return finger_tip.y < finger_pip.y;
}

// 更新手势置信度显示
function updateGestureConfidence(gesture, confidence) {
    const confidencePercent = Math.round(confidence * 100);
    
    switch(gesture) {
        case "石头":
            rockConfidence.textContent = `${confidencePercent}%`;
            rockCard.classList.add('active');
            break;
        case "布":
            paperConfidence.textContent = `${confidencePercent}%`;
            paperCard.classList.add('active');
            break;
        case "剪刀":
            scissorsConfidence.textContent = `${confidencePercent}%`;
            scissorsCard.classList.add('active');
            break;
    }
}

// 重置手势置信度显示
function resetGestureConfidence() {
    rockConfidence.textContent = "0%";
    paperConfidence.textContent = "0%";
    scissorsConfidence.textContent = "0%";
    
    rockCard.classList.remove('active');
    paperCard.classList.remove('active');
    scissorsCard.classList.remove('active');
}

// 更新关键点信息显示
function updateLandmarksInfo(multiHandLandmarks, multiHandedness) {
    let infoText = '';
    
    for (let i = 0; i < multiHandLandmarks.length; i++) {
        const handedness = multiHandedness[i].label;
        const confidence = multiHandedness[i].score.toFixed(2);
        const landmarks = multiHandLandmarks[i];
        
        const gesture = recognizeRockPaperScissors(landmarks);
        
        infoText += `手 #${i+1} (${handedness === 'Left' ? '左手' : '右手'}, 置信度: ${confidence})\n`;
        infoText += `检测到的手势: ${gesture.name} (置信度: ${gesture.confidence.toFixed(2)})\n`;
        
        const fingertips = [
            { name: '拇指', index: 4 },
            { name: '食指', index: 8 },
            { name: '中指', index: 12 },
            { name: '无名指', index: 16 },
            { name: '小指', index: 20 }
        ];
        
        for (const finger of fingertips) {
            const tip = landmarks[finger.index];
            infoText += `  ${finger.name}尖: x=${Math.round(tip.x*100)/100}, y=${Math.round(tip.y*100)/100}, z=${Math.round(tip.z*100)/100}\n`;
        }
        
        infoText += '\n';
    }
    
    landmarksInfo.textContent = infoText || "尚未检测到手部";
}

// 启动摄像头
async function startCamera() {
    try {
        statusDiv.textContent = "正在启动摄像头...";
        
        const constraints = {
            video: {
                width: 640,
                height: 480
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
            setupCanvas();
            startDetection();
        };
        
        cameraStartButton.disabled = true;
        cameraStopButton.disabled = false;
        isCameraRunning = true;
        
    } catch (error) {
        statusDiv.textContent = `摄像头启动失败: ${error.message}`;
        console.error("摄像头启动失败:", error);
    }
}

// 开始检测
function startDetection() {
    statusDiv.textContent = "正在检测手部...";
    
    camera = new Camera(video, {
        onFrame: async () => {
            await hands.send({image: video});
        },
        width: 640,
        height: 480
    });
    
    camera.start();
}

// 停止摄像头
function stopCamera() {
    if (camera) {
        camera.stop();
    }
    
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    handCountSpan.textContent = "0";
    landmarksInfo.textContent = "尚未检测到手部";
    statusDiv.textContent = "摄像头已停止";
    currentGestureSpan.textContent = "等待手势...";
    resetGestureConfidence();
    
    cameraStartButton.disabled = false;
    cameraStopButton.disabled = true;
    isCameraRunning = false;
    
    // 如果游戏正在进行，停止游戏
    if (gameState !== 'idle') {
        stopGame();
    }
}

// 辅助函数 - 绘制关键点连接线
function drawConnectors(ctx, landmarks, connections, options) {
    const { color = 'white', lineWidth = 1 } = options || {};
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    
    for (const connection of connections) {
        const [i, j] = connection;
        const from = landmarks[i];
        const to = landmarks[j];
        
        if (from && to) {
            ctx.beginPath();
            ctx.moveTo(from.x * canvas.width, from.y * canvas.height);
            ctx.lineTo(to.x * canvas.width, to.y * canvas.height);
            ctx.stroke();
        }
    }
}

// 辅助函数 - 绘制关键点
function drawLandmarks(ctx, landmarks, options) {
    const { color = 'red', lineWidth = 2 } = options || {};
    
    ctx.fillStyle = color;
    
    for (const landmark of landmarks) {
        ctx.beginPath();
        ctx.arc(
            landmark.x * canvas.width,
            landmark.y * canvas.height,
            lineWidth * 2,
            0,
            2 * Math.PI
        );
        ctx.fill();
    }
}

// 页面加载完成后初始化
window.addEventListener('load', async () => {
    // 首先加载设备配置信息（只加载一次）
    await loadDeviceConfig();
    
    // 然后初始化手部检测模型和游戏
    initHandDetection();
    initGame();
}); 