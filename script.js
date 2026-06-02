const page = {
  width: 1280,
  height: 832
};

/* =========================
   基础状态
========================= */

let score = 0;
let health = 5;
let gameRunning = true;
let isRestarting = false;

const INITIAL_HEALTH = 5;
const GAME_DURATION = 50;

let timeLeft = GAME_DURATION;
let gameStartTime = performance.now();

const BLOOD_SRC = "./static/blood.png";

const MOUTH_OPEN_THRESHOLD = 0.10;

const MAX_FOODS_ON_SCREEN = 7;
const FOOD_SPAWN_INTERVAL = 560;

const RECT_COLLISION_PADDING = 8;
const MOUTH_COLLISION_EXTRA_RADIUS = 10;

const BGM_START_RATE = 1.0;
const BGM_END_RATE = 1.45;

const BGM_NORMAL_VOLUME = 0.45;
const BGM_DUCK_VOLUME = 0.12;
const SFX_VOLUME = 1.0;

/* =========================
   食物配置
========================= */

/**
 * 计分类：
 * 白菜饺子，传统饺子，煎饺2，水果饺子，糖饺子
 */
const GOOD_FOODS = [
  {
    name: "白菜饺子",
    src: "./static/白菜饺子.PNG",
    score: 1
  },
  {
    name: "传统饺子",
    src: "./static/传统饺子.PNG",
    score: 1
  },
  {
    name: "煎饺2",
    src: "./static/煎饺2.png",
    score: 1
  },
  {
    name: "水果饺子",
    src: "./static/水果饺子.PNG",
    score: 1
  },
  {
    name: "糖饺子",
    src: "./static/糖饺子.PNG",
    score: 1
  }
];

/**
 * 扣血类：
 * 咖喱饺子，烧卖，星空饺子，鱼饺子，芝士饺子
 */
const BAD_FOODS = [
  {
    name: "咖喱饺子",
    src: "./static/咖喱饺子.PNG",
    damage: 1
  },
  {
    name: "烧卖",
    src: "./static/烧卖.PNG",
    damage: 1
  },
  {
    name: "星空饺子",
    src: "./static/星空饺子.PNG",
    damage: 1
  },
  {
    name: "鱼饺子",
    src: "./static/鱼饺子.PNG",
    damage: 1
  },
  {
    name: "芝士饺子",
    src: "./static/芝士饺子.PNG",
    damage: 1
  }
];

const ALL_FOODS = [
  ...GOOD_FOODS.map((item) => ({
    ...item,
    type: "good"
  })),
  ...BAD_FOODS.map((item) => ({
    ...item,
    type: "bad"
  }))
];

/* =========================
   DOM
========================= */

const video = document.getElementById("camera-bg");
const mouthCanvas = document.getElementById("mouth-canvas");
const mouthCtx = mouthCanvas.getContext("2d");
const debugStatus = document.getElementById("debug-status");
const foodLayer = document.getElementById("food-layer");
const gameOverLayer = document.getElementById("game-over-layer");
const finalScoreElement = document.getElementById("final-score");

const bgmAudio = document.getElementById("bgm-audio");
const correctAudio = document.getElementById("correct-audio");
const errorAudio = document.getElementById("error-audio");
const audioTip = document.getElementById("audio-tip");

let foods = [];
let foodIdCounter = 0;

let mouthState = {
  detected: false,
  isOpen: false,

  drawX: 0,
  drawY: 0,

  hitX: 0,
  hitY: 0,

  radius: 55,
  ratio: 0
};

let isProcessingFrame = false;
let lastDebugUpdateTime = 0;
let lastFoodSpawnTime = 0;
let lastAnimationTime = performance.now();

let audioUnlocked = false;
let bgmRestoreTimer = null;

/* =========================
   工具函数
========================= */

const random = (min, max) => {
  return Math.random() * (max - min) + min;
};

const randomInt = (min, max) => {
  return Math.floor(random(min, max + 1));
};

const pickRandom = (arr) => {
  return arr[Math.floor(Math.random() * arr.length)];
};

const setDebug = (text) => {
  if (!debugStatus) {
    return;
  }

  debugStatus.textContent = text;
};

const circleRectCollision = (
  circleX,
  circleY,
  circleRadius,
  rectX,
  rectY,
  rectW,
  rectH
) => {
  const closestX = Math.max(rectX, Math.min(circleX, rectX + rectW));
  const closestY = Math.max(rectY, Math.min(circleY, rectY + rectH));

  const dx = circleX - closestX;
  const dy = circleY - closestY;

  return dx * dx + dy * dy <= circleRadius * circleRadius;
};

/* =========================
   页面缩放
========================= */

const resizePage = () => {
  const viewWidth = window.innerWidth;
  const container = document.getElementById("container");

  if (!container) {
    return;
  }

  const scale = viewWidth / page.width;
  const displayHeight = page.height * scale || 0;

  document.body.style.paddingTop = displayHeight + "px";
  container.style.transform = "scale(" + scale + ")";
  container.style.display = "block";
};

const throttleResize = () => {
  let running = false;

  window.addEventListener("resize", () => {
    if (running) {
      return;
    }

    running = true;

    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("optimizedResize"));
      running = false;
    });
  });
};

/* =========================
   音频逻辑
========================= */

const showAudioTip = () => {
  if (audioTip) {
    audioTip.classList.remove("hidden");
  }
};

const hideAudioTip = () => {
  if (audioTip) {
    audioTip.classList.add("hidden");
  }
};

const setupAudio = () => {
  if (bgmAudio) {
    bgmAudio.volume = BGM_NORMAL_VOLUME;
    bgmAudio.loop = true;
    bgmAudio.playbackRate = BGM_START_RATE;
  }

  if (correctAudio) {
    correctAudio.volume = SFX_VOLUME;
  }

  if (errorAudio) {
    errorAudio.volume = SFX_VOLUME;
  }
};

const playBGM = () => {
  if (!bgmAudio) {
    return;
  }

  bgmAudio.volume = BGM_NORMAL_VOLUME;
  bgmAudio.loop = true;

  const promise = bgmAudio.play();

  if (promise && typeof promise.then === "function") {
    promise
      .then(() => {
        audioUnlocked = true;
        hideAudioTip();
      })
      .catch(() => {
        showAudioTip();
      });
  }
};

const pauseBGM = () => {
  if (!bgmAudio) {
    return;
  }

  bgmAudio.pause();
};

const resetBGM = () => {
  if (!bgmAudio) {
    return;
  }

  bgmAudio.pause();
  bgmAudio.currentTime = 0;
  bgmAudio.volume = BGM_NORMAL_VOLUME;
  bgmAudio.playbackRate = BGM_START_RATE;
};

const updateBGMRate = () => {
  if (!bgmAudio || !gameRunning) {
    return;
  }

  const elapsed = GAME_DURATION - timeLeft;
  const progress = Math.min(1, Math.max(0, elapsed / GAME_DURATION));
  const rate = BGM_START_RATE + (BGM_END_RATE - BGM_START_RATE) * progress;

  bgmAudio.playbackRate = rate;
};

const duckBGM = () => {
  if (!bgmAudio) {
    return;
  }

  bgmAudio.volume = BGM_DUCK_VOLUME;
};

const restoreBGMVolume = () => {
  if (!bgmAudio || !gameRunning) {
    return;
  }

  bgmAudio.volume = BGM_NORMAL_VOLUME;
};

const scheduleRestoreBGM = (delay = 700) => {
  if (bgmRestoreTimer) {
    clearTimeout(bgmRestoreTimer);
  }

  bgmRestoreTimer = setTimeout(() => {
    restoreBGMVolume();
    bgmRestoreTimer = null;
  }, delay);
};

/**
 * 播放音效：
 * 1. BGM 不暂停，只降低音量
 * 2. 克隆 audio 节点，避免连续碰撞时音效被 currentTime 打断
 * 3. 音效结束后恢复 BGM
 */
const playSFX = (sourceAudio) => {
  if (!sourceAudio) {
    return;
  }

  duckBGM();

  const sfx = sourceAudio.cloneNode(true);
  sfx.volume = SFX_VOLUME;
  sfx.currentTime = 0;
  sfx.playbackRate = 1;

  const promise = sfx.play();

  if (promise && typeof promise.then === "function") {
    promise
      .then(() => {
        audioUnlocked = true;
        hideAudioTip();
      })
      .catch((error) => {
        console.warn("音效播放失败，可能需要先点击页面：", error);
        showAudioTip();
      });
  }

  sfx.addEventListener("ended", () => {
    restoreBGMVolume();
  });

  scheduleRestoreBGM(750);
};

const unlockAudio = () => {
  audioUnlocked = true;
  hideAudioTip();

  setupAudio();

  /**
   * 用户点击后启动 BGM。
   */
  playBGM();

  /**
   * 预加载音效。
   * 这里只 load，不静音 play，避免一些浏览器报错。
   */
  if (correctAudio) {
    correctAudio.load();
  }

  if (errorAudio) {
    errorAudio.load();
  }
};

window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);
window.addEventListener("touchstart", unlockAudio);

/* =========================
   UI 渲染
========================= */

const renderHealthBar = () => {
  const healthBar = document.getElementById("health-bar");

  if (!healthBar) {
    return;
  }

  healthBar.innerHTML = "";

  for (let i = 0; i < health; i++) {
    const img = document.createElement("img");

    img.src = BLOOD_SRC;
    img.alt = "blood";
    img.className = "blood-icon";
    img.width = 57;
    img.height = 57;

    healthBar.appendChild(img);
  }
};

const renderScore = () => {
  const scoreElement = document.getElementById("score");

  if (!scoreElement) {
    return;
  }

  scoreElement.textContent = score;
};

const renderTimer = () => {
  const timerElement = document.getElementById("timer");

  if (!timerElement) {
    return;
  }

  timerElement.textContent = timeLeft;
};

const addScore = (value) => {
  score += value;
  renderScore();
  playSFX(correctAudio);
};

const reduceHealth = (value) => {
  health = Math.max(0, health - value);
  renderHealthBar();
  playSFX(errorAudio);

  if (health <= 0) {
    triggerGameOver();
  }
};

/* =========================
   嘴巴绘制
========================= */

const clearMouthCanvas = () => {
  if (!mouthCtx || !mouthCanvas) {
    return;
  }

  mouthCtx.clearRect(0, 0, mouthCanvas.width, mouthCanvas.height);
};

const drawMouthCircle = (x, y, radius) => {
  if (!mouthCtx) {
    return;
  }

  clearMouthCanvas();

  mouthCtx.save();

  mouthCtx.beginPath();
  mouthCtx.arc(x, y, radius, 0, Math.PI * 2);
  mouthCtx.strokeStyle = "yellow";
  mouthCtx.lineWidth = 8;
  mouthCtx.shadowColor = "rgba(255, 255, 0, 0.95)";
  mouthCtx.shadowBlur = 20;
  mouthCtx.stroke();

  mouthCtx.restore();
};

const updateDebugRatio = (openRatio, isMouthOpen) => {
  const now = Date.now();

  if (now - lastDebugUpdateTime < 80) {
    return;
  }

  lastDebugUpdateTime = now;

  setDebug(
    `Mouth ratio: ${openRatio.toFixed(3)} ${isMouthOpen ? "OPEN" : "CLOSED"} | Time: ${timeLeft}`
  );
};

/* =========================
   食物生成和移动
========================= */

const createFood = () => {
  if (!gameRunning) {
    return;
  }

  if (foods.length >= MAX_FOODS_ON_SCREEN) {
    return;
  }

  const config = pickRandom(ALL_FOODS);

  const img = document.createElement("img");
  img.src = config.src;
  img.alt = config.name;
  img.className = "food-item";

  const size = random(88, 155);

  img.style.width = size + "px";
  img.style.height = size + "px";

  foodLayer.appendChild(img);

  /**
   * 所有 PNG 都从上方随机掉落。
   */
  const x = random(40, page.width - size - 40);
  const y = random(-260, -90);

  const elapsed = GAME_DURATION - timeLeft;
  const progress = Math.min(1, Math.max(0, elapsed / GAME_DURATION));
  const speedBoost = 1 + progress * 0.7;

  const vx = random(-45, 45) * speedBoost;
  const vy = random(120, 230) * speedBoost;

  const food = {
    id: foodIdCounter++,
    type: config.type,
    name: config.name,
    src: config.src,
    score: config.score || 0,
    damage: config.damage || 0,
    el: img,

    x,
    y,
    displayX: x,
    displayY: y,
    vx,
    vy,

    size,

    rotation: random(0, 360),
    rotationSpeed: random(-65, 65),

    waveSeed: random(0, Math.PI * 2),
    waveAmp: random(8, 30),
    waveSpeed: random(1.2, 3.1),

    alive: true
  };

  foods.push(food);
};

const removeFood = (food) => {
  food.alive = false;

  if (food.el && food.el.parentNode) {
    food.el.parentNode.removeChild(food.el);
  }
};

const clearAllFoods = () => {
  foods.forEach((food) => {
    if (food.el && food.el.parentNode) {
      food.el.parentNode.removeChild(food.el);
    }
  });

  foods = [];
};

const updateFoods = (deltaTime, now) => {
  if (!gameRunning) {
    return;
  }

  if (now - lastFoodSpawnTime > FOOD_SPAWN_INTERVAL) {
    lastFoodSpawnTime = now;
    createFood();
  }

  for (const food of foods) {
    if (!food.alive) {
      continue;
    }

    food.x += food.vx * deltaTime;
    food.y += food.vy * deltaTime;

    food.rotation += food.rotationSpeed * deltaTime;

    const wave =
      Math.sin(now / 1000 * food.waveSpeed + food.waveSeed) * food.waveAmp;

    const displayX = food.x + wave;
    const displayY = food.y;

    food.displayX = displayX;
    food.displayY = displayY;

    food.el.style.transform =
      `translate(${displayX}px, ${displayY}px) rotate(${food.rotation}deg)`;

    const outMargin = 260;

    const isOut =
      food.y > page.height + outMargin ||
      food.x < -outMargin ||
      food.x > page.width + outMargin;

    if (isOut) {
      removeFood(food);
    }
  }

  foods = foods.filter((food) => food.alive);
};

/* =========================
   碰撞检测
========================= */

const checkFoodCollision = () => {
  if (!gameRunning) {
    return;
  }

  if (!mouthState.detected || !mouthState.isOpen) {
    return;
  }

  for (const food of foods) {
    if (!food.alive) {
      continue;
    }

    const rectX = food.displayX - RECT_COLLISION_PADDING;
    const rectY = food.displayY - RECT_COLLISION_PADDING;
    const rectW = food.size + RECT_COLLISION_PADDING * 2;
    const rectH = food.size + RECT_COLLISION_PADDING * 2;

    const collisionRadius =
      mouthState.radius + MOUTH_COLLISION_EXTRA_RADIUS;

    const isHit = circleRectCollision(
      mouthState.hitX,
      mouthState.hitY,
      collisionRadius,
      rectX,
      rectY,
      rectW,
      rectH
    );

    if (isHit) {
      if (food.type === "good") {
        addScore(food.score || 1);
      } else if (food.type === "bad") {
        reduceHealth(food.damage || 1);
      }

      removeFood(food);
    }
  }

  foods = foods.filter((food) => food.alive);
};

/* =========================
   倒计时
========================= */

const updateTimer = (now) => {
  if (!gameRunning) {
    return;
  }

  const elapsedSeconds = Math.floor((now - gameStartTime) / 1000);
  const nextTimeLeft = Math.max(0, GAME_DURATION - elapsedSeconds);

  if (nextTimeLeft !== timeLeft) {
    timeLeft = nextTimeLeft;
    renderTimer();
    updateBGMRate();
  }

  if (timeLeft <= 0) {
    triggerGameOver();
  }
};

/* =========================
   游戏结束和重启
========================= */

const triggerGameOver = () => {
  if (isRestarting) {
    return;
  }

  isRestarting = true;
  gameRunning = false;

  clearAllFoods();
  clearMouthCanvas();
  pauseBGM();

  if (finalScoreElement) {
    finalScoreElement.textContent = score;
  }

  if (gameOverLayer) {
    gameOverLayer.classList.add("active");
  }

  setDebug("Game Over. Restarting in 3s...");

  setTimeout(() => {
    restartGame();
  }, 3000);
};

const restartGame = () => {
  score = 0;
  health = INITIAL_HEALTH;
  timeLeft = GAME_DURATION;
  gameStartTime = performance.now();

  renderScore();
  renderHealthBar();
  renderTimer();

  mouthState.detected = false;
  mouthState.isOpen = false;
  mouthState.drawX = 0;
  mouthState.drawY = 0;
  mouthState.hitX = 0;
  mouthState.hitY = 0;

  clearAllFoods();
  clearMouthCanvas();

  if (gameOverLayer) {
    gameOverLayer.classList.remove("active");
  }

  gameRunning = true;
  isRestarting = false;
  lastFoodSpawnTime = performance.now();

  resetBGM();

  if (audioUnlocked) {
    playBGM();
  } else {
    showAudioTip();
  }

  setDebug("Restarted");
};

/* =========================
   动画循环
========================= */

const gameLoop = (now) => {
  const deltaTime = Math.min((now - lastAnimationTime) / 1000, 0.05);
  lastAnimationTime = now;

  updateTimer(now);
  updateFoods(deltaTime, now);
  checkFoodCollision();

  requestAnimationFrame(gameLoop);
};

/* =========================
   MediaPipe FaceMesh
========================= */

const initFaceMesh = () => {
  if (typeof FaceMesh === "undefined") {
    setDebug("FaceMesh not loaded");
    console.error("FaceMesh 没有加载成功：请检查 /static/mediapipe/face_mesh.js");
    return;
  }

  if (typeof Camera === "undefined") {
    setDebug("Camera not loaded");
    console.error("Camera 没有加载成功：请检查 /static/mediapipe/camera_utils.js");
    return;
  }

  setDebug("Initializing FaceMesh...");

  const faceMesh = new FaceMesh({
    locateFile: (file) => {
      const filePath = `/static/mediapipe/${file}`;
      console.log("FaceMesh request file:", filePath);
      return filePath;
    }
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  faceMesh.onResults((results) => {
    clearMouthCanvas();

    if (
      !results ||
      !results.multiFaceLandmarks ||
      results.multiFaceLandmarks.length === 0
    ) {
      mouthState.detected = false;
      setDebug("No face detected");
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];

    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const leftMouth = landmarks[61];
    const rightMouth = landmarks[291];

    if (!upperLip || !lowerLip || !leftMouth || !rightMouth) {
      mouthState.detected = false;
      setDebug("Mouth landmarks missing");
      return;
    }

    const mouthHeight = Math.abs(lowerLip.y - upperLip.y);
    const mouthWidth = Math.abs(rightMouth.x - leftMouth.x);

    if (mouthWidth <= 0) {
      mouthState.detected = false;
      setDebug("Invalid mouth width");
      return;
    }

    const openRatio = mouthHeight / mouthWidth;
    const isMouthOpen = openRatio > MOUTH_OPEN_THRESHOLD;

    const rawCenterX = ((upperLip.x + lowerLip.x) / 2) * page.width;
    const rawCenterY = ((upperLip.y + lowerLip.y) / 2) * page.height;

    /**
     * canvas 和摄像头是 scaleX(-1) 镜像显示，
     * 但 food-layer 没有镜像。
     * 所以碰撞用视觉坐标：page.width - rawCenterX。
     */
    const visualCenterX = page.width - rawCenterX;
    const visualCenterY = rawCenterY;

    const radius = Math.max(60, mouthWidth * page.width * 0.64);

    mouthState.detected = true;
    mouthState.isOpen = isMouthOpen;

    mouthState.drawX = rawCenterX;
    mouthState.drawY = rawCenterY;

    mouthState.hitX = visualCenterX;
    mouthState.hitY = visualCenterY;

    mouthState.radius = radius;
    mouthState.ratio = openRatio;

    updateDebugRatio(openRatio, isMouthOpen);

    if (isMouthOpen && gameRunning) {
      drawMouthCircle(rawCenterX, rawCenterY, radius);
    }
  });

  const camera = new Camera(video, {
    onFrame: async () => {
      if (isProcessingFrame) {
        return;
      }

      isProcessingFrame = true;

      try {
        await faceMesh.send({
          image: video
        });
      } catch (error) {
        console.error("faceMesh.send error:", error);
        setDebug("FaceMesh send error - check wasm files");
      } finally {
        isProcessingFrame = false;
      }
    },
    width: page.width,
    height: page.height
  });

  camera
    .start()
    .then(() => {
      setDebug("Camera started, waiting FaceMesh...");

      /**
       * 尝试播放 BGM。
       * 浏览器通常会拦截自动播放，所以如果失败，
       * 用户点击页面后 unlockAudio 会再次播放。
       */
      playBGM();
    })
    .catch((error) => {
      setDebug("Camera start failed");
      console.error("Camera start failed:", error);
    });
};

/* =========================
   初始化
========================= */

setupAudio();

renderHealthBar();
renderScore();
renderTimer();

resizePage();
throttleResize();

window.addEventListener("optimizedResize", resizePage);

initFaceMesh();

requestAnimationFrame((now) => {
  lastAnimationTime = now;
  lastFoodSpawnTime = now;
  gameStartTime = now;
  requestAnimationFrame(gameLoop);
});
