console.log('client.js загружен');

const socket = io();

// --- Получаем ссылки на элементы DOM ---
// Экраны
const entryScreen = document.getElementById('entryScreen');
const waitingRoomScreen = document.getElementById('waitingRoomScreen');
const questionScreen = document.getElementById('questionScreen');
const resultsScreen = document.getElementById('resultsScreen');
// Элементы экрана входа
const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
// Элементы экрана ожидания
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const playerList = document.getElementById('playerList');
const startGameBtn = document.getElementById('startGameBtn');
// Элементы экрана вопроса
const questionText = document.getElementById('questionText');
const timerDisplay = document.getElementById('timerDisplay');
const voteYesBtn = document.getElementById('voteYesBtn');
const voteNoBtn = document.getElementById('voteNoBtn');
// Элементы экрана результатов
const resultsText = document.getElementById('resultsText');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');
// Элементы модального окна
const nameModal = document.getElementById('nameModal');
const modalTitle = document.getElementById('modalTitle');
const modalNameInput = document.getElementById('modalNameInput');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
// ... (другие элементы)
// Элементы модального окна Game Over
// ... (другие элементы)
const questionNumberDisplay = document.getElementById('questionNumberDisplay');
const gameOverModal = document.getElementById('gameOverModal');
const gameOverMessage = document.getElementById('gameOverMessage');
const gameOverReturnBtn = document.getElementById('gameOverReturnBtn');

// --- Глобальные переменные ---
let amIHost = false;
let timerInterval = null;
let currentAction = null; // 'join' или 'create' - для модального окна
let currentRoomCode = ''; // Сохраняем код комнаты при открытии модалки Join

// --- Функции для переключения экранов ---
function showScreen(screenToShow) {
    document.querySelector('h1').textContent = 'Who Was That?';
    entryScreen.style.display = 'none';
    entryScreen.style.display = 'none';
    waitingRoomScreen.style.display = 'none';
    questionScreen.style.display = 'none';
    resultsScreen.style.display = 'none';
    // Убедимся, что экраны - flex контейнеры (если они не display: none)
    if (screenToShow) {
        screenToShow.style.display = 'flex';
    }
}

// --- Функции Модального окна ---
function openNameModal(actionType) {
    currentAction = actionType; // Запоминаем, зачем открыли ('join' или 'create')
    modalNameInput.value = ''; // Очищаем поле имени
    modalConfirmBtn.disabled = true; // Кнопка подтверждения неактивна
    modalTitle.textContent = (actionType === 'join') ? 'Enter Your Name to Join' : 'Enter Your Name to Create';
    modalConfirmBtn.textContent = (actionType === 'join') ? 'JOIN' : 'CREATE';

    nameModal.style.display = 'flex'; // Показываем модалку (она flex оверлей)
    modalNameInput.focus(); // Ставим фокус в поле ввода имени
}
// --- Функции Модального окна Game Over ---
function openGameOverModal(message) {
    gameOverMessage.textContent = message || "The game has ended."; // Показываем сообщение от сервера или дефолтное
    gameOverModal.style.display = 'flex'; // Показываем оверлей
}

function closeGameOverModal() {
    gameOverModal.style.display = 'none';
}
function closeNameModal() {
    nameModal.style.display = 'none';
    currentAction = null;
    currentRoomCode = '';
}

// --- Обработчики событий Экрана Входа ---

// (с) Проверка поля ввода кода комнаты
roomCodeInput.addEventListener('input', () => {
    // Приводим к верхнему регистру и обрезаем до 4 символов
    roomCodeInput.value = roomCodeInput.value.toUpperCase().substring(0, 4);
    // Активируем кнопку JOIN, если введено 4 символа
    if (roomCodeInput.value.length === 4) {
        joinRoomBtn.disabled = false;
    } else {
        joinRoomBtn.disabled = true;
    }
});

// Нажатие кнопки JOIN GAME
joinRoomBtn.addEventListener('click', () => {
    currentRoomCode = roomCodeInput.value.trim().toUpperCase(); // Получаем код сразу
    if (currentRoomCode.length === 4) {
        console.log(`Проверка существования комнаты: ${currentRoomCode}`);
        // Отправляем событие на сервер для проверки
        socket.emit('checkRoomExists', { roomCode: currentRoomCode });
        // НЕ открываем модалку здесь, ждем ответа 'roomExists'
    } else {
        // На всякий случай, хотя кнопка должна быть неактивна
        alert('Room code must be 4 letters.');
    }
});

// (г) Нажатие кнопки CREATE ROOM -> Открывает модалку
createRoomBtn.addEventListener('click', () => {
    openNameModal('create');
});

// --- Обработчики событий Модального Окна ---

// Проверка поля ввода имени в модалке
modalNameInput.addEventListener('input', () => {
    if (modalNameInput.value.trim().length > 0) {
        modalConfirmBtn.disabled = false;
    } else {
        modalConfirmBtn.disabled = true;
    }
});

// Нажатие кнопки Confirm в модалке
modalConfirmBtn.addEventListener('click', () => {
    const name = modalNameInput.value.trim();
    if (!name) return; // Доп. проверка, хотя кнопка должна быть неактивна

    if (currentAction === 'join') {
        console.log(`Отправка joinRoom: name=${name}, roomCode=${currentRoomCode}`);
        socket.emit('joinRoom', { name, roomCode: currentRoomCode });
    } else if (currentAction === 'create') {
        console.log(`Отправка createRoom: name=${name}`);
        socket.emit('createRoom', { name });
    }
    closeNameModal(); // Закрываем модалку после отправки
});

// Нажатие кнопки Cancel в модалке
modalCancelBtn.addEventListener('click', () => {
    closeNameModal();
});

// Закрытие модалки при клике на темный фон (overlay)
nameModal.addEventListener('click', (event) => {
    // Закрываем, только если клик был по самому оверлею, а не по его содержимому
    if (event.target === nameModal) {
        closeNameModal();
    }
});


// --- Обработчики событий Игрового Процесса ---

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

voteYesBtn.addEventListener('click', () => { submitVote('yes'); });
voteNoBtn.addEventListener('click', () => { submitVote('no'); });
nextQuestionBtn.addEventListener('click', () => {
    socket.emit('nextQuestion');
    nextQuestionBtn.style.display = 'none';
});

function submitVote(vote) {
    socket.emit('submitVote', { vote });
    voteYesBtn.disabled = true;
    voteNoBtn.disabled = true;
}

// --- Обработка событий от Сервера ---

socket.on('connect', () => { console.log('Connected:', socket.id); });

socket.on('disconnect', () => {
    console.log('Disconnected');
    alert('Connection lost.');
    showScreen(entryScreen); // Возврат на главный экран
    amIHost = false;
    if (timerInterval) clearInterval(timerInterval);
});

socket.on('connect_error', (err) => { console.error('Connection Error:', err); });

socket.on('errorMessage', (message) => {
    console.error('Server Error:', message);
    alert(message);
});

socket.on('roomJoined', (data) => {
    console.log('Joined room:', data.roomCode);
    roomCodeDisplay.textContent = data.roomCode;
    updatePlayerList(data.players);
    amIHost = data.isHost;
    startGameBtn.style.display = amIHost ? 'block' : 'none';
    nextQuestionBtn.style.display = 'none'; // Всегда скрыта при входе
    showScreen(waitingRoomScreen); // Показываем экран ожидания
});

// Сервер подтвердил, что комната существует - открываем модалку имени
socket.on('roomExists', () => {
    console.log('Server confirmed room exists, opening name modal.');
    openNameModal('join'); // Теперь открываем модалку здесь
});

socket.on('updatePlayerList', (players) => {
    console.log('Player list update:', players);
    updatePlayerList(players);
     // Обновляем видимость кнопки Start Game, если мы хост (на случай, если игрок вышел/вошел)
    if (waitingRoomScreen.style.display === 'flex' && amIHost) {
       startGameBtn.style.display = 'block';
    }
});

socket.on('newQuestion', (data) => {
    /*
      Ожидаем от сервера объект data:
      {
        questionNumber: 1, // НОМЕР ВОПРОСА
        questionText: "Текст вопроса?",
        duration: 10
      }
    */
    console.log(`Получен вопрос #${data.questionNumber}: ${data.questionText}`);

    // Отображаем номер вопроса
    questionNumberDisplay.textContent = `#${data.questionNumber}`; // Показываем номер

    // Отображаем текст вопроса
    questionText.textContent = data.questionText;

    // Сбрасываем и запускаем таймер
    startTimer(data.duration);

    // Разблокируем кнопки голосования
    voteYesBtn.disabled = false;
    voteNoBtn.disabled = false;

    // Показываем экран с вопросом
    showScreen(questionScreen);

    // Опционально: Меняем главный заголовок H1 (если нужно)
    // document.querySelector('h1').textContent = 'What do you think?';
});

socket.on('showResults', (data) => {
    console.log('Showing results:', data);
    resultsText.textContent = `YES: ${data.yesVotes}, NO: ${data.noVotes}`;

    // Обновляем текст вопроса-напоминания
    const questionReminder = resultsScreen.querySelector('.question-reminder');
    if (questionReminder) {
         questionReminder.textContent = `Question: ${data.questionText || ''}`;
    }

    showScreen(resultsScreen);
    nextQuestionBtn.style.display = amIHost ? 'block' : 'none'; // Показываем кнопку хосту
    if (timerInterval) clearInterval(timerInterval);
});

socket.on('youAreHostNow', () => {
    console.log("Became new host!");
    amIHost = true;
    alert('You are the new host!');
    // Обновляем кнопки в зависимости от текущего экрана
    if (waitingRoomScreen.style.display === 'flex') {
        startGameBtn.style.display = 'block';
    } else if (resultsScreen.style.display === 'flex') {
        nextQuestionBtn.style.display = 'block';
    }
});

socket.on('gameOver', (data) => {
    console.log('Game Over:', data.message);
    if (timerInterval) clearInterval(timerInterval); // Останавливаем таймер

    openGameOverModal(data.message); // Открываем модалку

    // --- Усиленный сброс состояния клиента ---
    amIHost = false;            // Сбрасываем статус хоста
    currentAction = null;       // Сбрасываем текущее действие модалки
    currentRoomCode = '';       // Сбрасываем код комнаты

    // Явно скрываем кнопки, которые не должны быть видны на главном экране
    startGameBtn.style.display = 'none';
    nextQuestionBtn.style.display = 'none';

    // Очищаем поля ввода и дизейблим кнопку Join
    roomCodeInput.value = '';
    joinRoomBtn.disabled = true;
    // Можно также очистить поле имени в модалке на всякий случай
    modalNameInput.value = '';
    modalConfirmBtn.disabled = true;

    // Очищаем список игроков на экране ожидания (на случай если пользователь вернется туда)
    playerList.innerHTML = '';
    roomCodeDisplay.textContent = '';

    // !!! Важно: НЕ вызываем showScreen(entryScreen) здесь,
    // т.к. пользователь должен сначала закрыть модалку gameOverModal.
    // Переход на entryScreen теперь происходит при нажатии gameOverReturnBtn.
});

// Дополняем обработчик кнопки в модалке Game Over
gameOverReturnBtn.addEventListener('click', () => {
    closeGameOverModal(); // Закрываем модалку
    showScreen(entryScreen); // !! Вот теперь показываем главный экран !!
});
// Нажатие кнопки "Return to Main Menu" в модалке Game Over
gameOverReturnBtn.addEventListener('click', () => {
    closeGameOverModal(); // Закрываем модалку
    showScreen(entryScreen); // Показываем главный экран
});


// --- Вспомогательные функции ---

function updatePlayerList(players) {
    playerList.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player.name;
        if (player.id === socket.id) {
             li.textContent += ' (You)';
             li.style.fontWeight = 'bold'; // Выделяем себя
        }
        // TODO: Можно получать hostId от сервера и помечать хоста
        playerList.appendChild(li);
    });
}

function startTimer(duration) {
    let timeLeft = duration;
    timerDisplay.textContent = timeLeft;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            voteYesBtn.disabled = true;
            voteNoBtn.disabled = true;
        }
    }, 1000);
}

// --- Инициализация ---
showScreen(entryScreen); // Начинаем с экрана входа