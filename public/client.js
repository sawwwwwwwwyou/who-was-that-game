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
// Элементы модального окна Info
const infoModal = document.getElementById('infoModal');
const infoModalTitle = document.getElementById('infoModalTitle');
const infoModalMessage = document.getElementById('infoModalMessage');
const infoModalCloseBtn = document.getElementById('infoModalCloseBtn');
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
// --- Функции Модального окна Info ---
function openInfoModal(title, message) {
    infoModalTitle.textContent = title || "Notification"; // Устанавливаем заголовок
    infoModalMessage.textContent = message || "";        // Устанавливаем сообщение
    infoModal.style.display = 'flex';                  // Показываем окно
}

function closeInfoModal() {
    infoModal.style.display = 'none'; // Скрываем окно
}

// --- Функции Модального окна ---
function openNameModal(actionType) {
    console.log('Вызвана функция openNameModal, тип:', actionType); // <-- Добавь лог для проверки вызова
    currentAction = actionType;
    modalNameInput.value = '';
    modalConfirmBtn.disabled = true;
    modalTitle.textContent = (actionType === 'join') ? 'Enter Your Name to Join' : 'Enter Your Name to Create';
    modalConfirmBtn.textContent = (actionType === 'join') ? 'JOIN' : 'CREATE';

    nameModal.style.display = 'flex'; // Показываем модалку
    modalNameInput.focus();
    console.log('Модальное окно имени должно быть видимо.'); // <-- Добавь лог
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
// Нажатие кнопки "OK" в модалке Info
infoModalCloseBtn.addEventListener('click', () => {
    closeInfoModal();
});

// Закрытие модалки Info при клике на темный фон (overlay)
infoModal.addEventListener('click', (event) => {
    if (event.target === infoModal) {
        closeInfoModal();
    }
});
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
    // Очищаем старые данные перед новой попыткой входа
    try { localStorage.removeItem('whoWasThat_playerId'); localStorage.removeItem('whoWasThat_roomCode'); } catch(e){}

    currentRoomCode = roomCodeInput.value.trim().toUpperCase();
    if (currentRoomCode.length === 4) {
        console.log(`Checking room existence: ${currentRoomCode}`);
        socket.emit('checkRoomExists', { roomCode: currentRoomCode });
    } // else ... alert - можно убрать, т.к. кнопка неактивна
});

// Нажатие кнопки CREATE ROOM -> Открывает модалку
createRoomBtn.addEventListener('click', () => {
     // Очищаем старые данные перед новой попыткой входа
     try { localStorage.removeItem('whoWasThat_playerId'); localStorage.removeItem('whoWasThat_roomCode'); } catch(e){}

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

let isFirstConnect = true;

socket.on('connect', () => {
    console.log('Successfully connected! Socket ID:', socket.id);

    // Важно: isFirstConnect здесь означает первый connect ПОСЛЕ ЗАГРУЗКИ СКРИПТА.
    if (!isFirstConnect) {
        // Это реконнект ПОСЛЕ ОБРЫВА СВЯЗИ, а не первая загрузка.
        console.log('Reconnect detected AFTER initial connection. Attempting rejoin...');
        attemptRejoin(); // Пытаемся восстановить сессию, если предыдущая попытка не удалась или связь снова рвалась
    } else {
        console.log('First connection established after script load.');
         // При первом коннекте attemptRejoin УЖЕ была вызвана при инициализации.
         // Если там были данные, rejoinAttempt УЖЕ отправлен (или будет отправлен как только сокет подключится).
         // Если данных не было, entryScreen УЖЕ показан.
         // Поэтому здесь НИЧЕГО ДЕЛАТЬ НЕ НУЖНО.
    }
    isFirstConnect = false;
});

socket.on('disconnect', () => {
    console.log('Disconnected');
    // alert('Connection lost.'); // <<-- УДАЛЯЕМ ИЛИ КОММЕНТИРУЕМ ЭТО
    openInfoModal("Connection Lost", "Connection to the server was lost. Please refresh or try again."); // <<< ДОБАВЛЯЕМ ЭТО

    // Сброс состояния (оставляем как было)
    showScreen(entryScreen);
    amIHost = false;
    if (timerInterval) clearInterval(timerInterval);
    // ... (остальные сбросы из предыдущих шагов)
    roomCodeInput.value = '';
    joinRoomBtn.disabled = true;
    modalNameInput.value = '';
    modalConfirmBtn.disabled = true;
    playerList.innerHTML = '';
    roomCodeDisplay.textContent = '';
});

socket.on('connect_error', (err) => { console.error('Connection Error:', err); });

socket.on('errorMessage', (message) => {
    console.error('Server Error:', message);
    // alert(message); // <<-- УДАЛЯЕМ ИЛИ КОММЕНТИРУЕМ ЭТО
    openInfoModal("Error", message); // <<< ДОБАВЛЯЕМ ЭТО
});

socket.on('roomJoined', (data) => {
    console.log('Joined room:', data.roomCode, 'My PlayerID:', data.playerId); // Логируем playerId

    // --- СОХРАНЕНИЕ ДАННЫХ В LOCALSTORAGE ---
    try {
        localStorage.setItem('whoWasThat_playerId', data.playerId);
        localStorage.setItem('whoWasThat_roomCode', data.roomCode);
        console.log('PlayerId и RoomCode сохранены в localStorage.');
    } catch (e) {
        console.error('Ошибка сохранения в localStorage:', e);
        // Показываем ошибку пользователю, т.к. реконнект не будет работать
        openInfoModal("Storage Error", "Could not save session data. Reconnect may not work.");
    }
    // --- КОНЕЦ СОХРАНЕНИЯ ---

    roomCodeDisplay.textContent = data.roomCode;
    updatePlayerList(data.players); // Обновляем список (может понадобиться playerId позже)
    amIHost = data.isHost;
    startGameBtn.style.display = amIHost ? 'block' : 'none';
    nextQuestionBtn.style.display = 'none';

    // Скрываем модалку "Reconnecting...", если она была показана
    closeInfoModal(); // Используем нашу универсальную модалку

    showScreen(waitingRoomScreen); // Показываем экран ожидания
});

// Сервер подтвердил, что комната существует - открываем модалку имени

socket.on('roomExists', () => {
    console.log('Server confirmed room exists, opening name modal.'); // <-- ДОЛЖЕН ПОЯВИТЬСЯ В КОНСОЛИ КЛИЕНТА
    openNameModal('join'); // <<< САМОЕ ВАЖНОЕ: эта строка должна вызваться
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
        console.log("[Host Status] Event received: You are the new host!");
        amIHost = true; // Обновляем флаг
        openInfoModal("Host Status", "You are the new host!"); // Показываем уведомление

        // Проверяем, на каком экране мы СЕЙЧАС, и показываем нужную кнопку
        if (waitingRoomScreen.style.display === 'flex') {
            // Если мы в лобби - показываем Start Game
            console.log("[Host Status] Currently on waiting screen, showing Start Game button.");
            startGameBtn.style.display = 'block';
            nextQuestionBtn.style.display = 'none'; // Убедимся, что Next скрыта
        } else if (resultsScreen.style.display === 'flex') {
            // --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
            // Если мы на экране результатов - показываем Next Question
            console.log("[Host Status] Currently on results screen, showing Next Question button.");
            nextQuestionBtn.style.display = 'block';
            startGameBtn.style.display = 'none'; // Убедимся, что Start скрыта
            // --- КОНЕЦ ИЗМЕНЕНИЯ ---
        } else {
            // Если мы на другом экране (вопрос или вход) - кнопки хоста пока не нужны
            console.log("[Host Status] Currently on question/entry screen, host buttons remain hidden for now.");
            startGameBtn.style.display = 'none';
            nextQuestionBtn.style.display = 'none';
        }
    });

// Сервер подтвердил успешный реконнект
socket.on('rejoinSuccess', (data) => {
    /* Ожидаемый формат data: См. предыдущие комментарии */
    console.log('[Rejoin Success] Rejoin successful! Received game state:', data);

    // Показываем короткое уведомление об успехе
    openInfoModal("Reconnected!", "Successfully rejoined the game.");
    setTimeout(closeInfoModal, 1500); // Закрыть через 1.5 сек

    // Восстанавливаем состояние клиента
    amIHost = data.isHost;
    currentRoomCode = data.roomCode;
    roomCodeDisplay.textContent = data.roomCode;
    updatePlayerList(data.players);

    // Сбрасываем кнопки, которые не должны быть видны по умолчанию
    startGameBtn.style.display = 'none';
    nextQuestionBtn.style.display = 'none';

    // Отображаем правильный экран и данные игры на основе gameState
    const gameState = data.gameState;
    if (gameState.state === 'waiting') {
        console.log('[Rejoin Success] Game state is WAITING.');
        startGameBtn.style.display = amIHost ? 'block' : 'none';
        voteYesBtn.disabled = false; // Разблокируем кнопки
        voteNoBtn.disabled = false;
        showScreen(waitingRoomScreen);
    } else if (gameState.state === 'question') {
         console.log('[Rejoin Success] Game state is QUESTION.');
         startGameBtn.style.display = 'none';
         nextQuestionBtn.style.display = 'none';

        questionNumberDisplay.textContent = `#${gameState.questionNumber || '?'}`;
        questionText.textContent = gameState.questionText || 'Loading question...';
        startTimer(gameState.durationLeft || VOTE_DURATION_SECONDS);

        // --- ДОБАВЛЕНИЕ: Явный лог и проверка myVote ---
        const myVote = gameState.myVote; // Получаем голос из состояния
        console.log('[Rejoin Success] Получено состояние ГОЛОСА (myVote):', myVote, `(Тип: ${typeof myVote})`); // <<< ЛОГ ДАННЫХ С СЕРВЕРА
        voteYesBtn.disabled = (myVote !== null); // Блокируем, если не null
        voteNoBtn.disabled = (myVote !== null);  // Блокируем, если не null
         if(myVote !== null) { console.log('[Rejoin Success] Кнопки голосования ОТКЛЮЧЕНЫ (т.к. myVote не null).'); }
         else { console.log('[Rejoin Success] Кнопки голосования ВКЛЮЧЕНЫ (т.к. myVote равен null).'); }
        // --- КОНЕЦ ДОБАВЛЕНИЯ ---

        showScreen(questionScreen);
    } else if (gameState.state === 'results') {
        console.log('[Rejoin Success] Game state is RESULTS.');
        startGameBtn.style.display = 'none';
        voteYesBtn.disabled = true; // Блокируем кнопки
        voteNoBtn.disabled = true;

        const yesVotes = gameState.results ? gameState.results.yesVotes : 0;
        const noVotes = gameState.results ? gameState.results.noVotes : 0;
        resultsText.textContent = `YES: ${yesVotes}, NO: ${noVotes}`;
        const questionReminder = resultsScreen.querySelector('.question-reminder');
        if (questionReminder) {
            questionReminder.textContent = `Question #${gameState.questionNumber || '?'}: ${gameState.questionText || ''}`;
        }
        nextQuestionBtn.style.display = amIHost ? 'block' : 'none';
        showScreen(resultsScreen);
        if (timerInterval) clearInterval(timerInterval);
    } else {
        console.error("[Rejoin Success] Unknown or finished game state received:", gameState.state);
         try { localStorage.removeItem('whoWasThat_playerId'); localStorage.removeItem('whoWasThat_roomCode'); } catch(e){}
         voteYesBtn.disabled = false;
         voteNoBtn.disabled = false;
         showScreen(entryScreen);
    }
});

// Сервер отклонил попытку реконнекта
socket.on('rejoinFailed', (data) => {
    /* Ожидаемый формат data:
       { message: "Причина отказа" }
    */
    console.warn('Rejoin failed:', data.message);

    // Показываем ошибку пользователю
    openInfoModal("Reconnection Failed", data.message);
    // Не закрываем автоматически, пользователь нажмет OK

    // Очищаем сохраненные данные, чтобы не пытаться снова
    try {
        localStorage.removeItem('whoWasThat_playerId');
        localStorage.removeItem('whoWasThat_roomCode');
    } catch (e) { console.error("Ошибка очистки localStorage:", e); }

    // После закрытия модалки ошибки (по кнопке ОК) покажем главный экран
    // Мы не можем сделать это прямо здесь, т.к. окно открыто.
    // Пользователь сам нажмет ОК и окажется на главном экране (т.к. другие экраны скрыты).
    // Убедимся, что другие экраны скрыты:
     showScreen(null); // Скрыть все игровые экраны
     entryScreen.style.display = 'flex'; // Показать только экран входа под модалкой

});

    // --- Сервер сообщил, что игра окончена ---
    socket.on('gameOver', (data) => {
        console.log('[Game Over Event] Игра окончена:', data.message);

        // Останавливаем клиентский таймер, если он был активен
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null; // Сбрасываем ссылку на таймер
            console.log('[Game Over Event] Клиентский таймер остановлен.');
        }

        // Открываем модальное окно Game Over с сообщением от сервера
        openGameOverModal(data.message || "The game has ended.");

        // --- ОЧИСТКА LOCALSTORAGE ПРИ КОНЦЕ ИГРЫ ---
        try {
            localStorage.removeItem('whoWasThat_playerId');
            localStorage.removeItem('whoWasThat_roomCode');
            console.log('[Game Over Event] Данные сессии удалены из localStorage.');
        } catch (e) {
            console.error("[Game Over Event] Ошибка очистки localStorage:", e);
        }
        // --- КОНЕЦ ОЧИСТКИ ---

        // Сбрасываем состояние клиента
        amIHost = false;
        currentAction = null;
        currentRoomCode = '';

        // Явно скрываем кнопки, которые видны только в игре/лобби
        startGameBtn.style.display = 'none';
        nextQuestionBtn.style.display = 'none';
        voteYesBtn.disabled = false; // Сброс кнопок голосования на всякий случай
        voteNoBtn.disabled = false;


        // Сбрасываем состояние элементов ввода на главном экране
        roomCodeInput.value = '';
        joinRoomBtn.disabled = true;
        modalNameInput.value = '';
        modalConfirmBtn.disabled = true;

        // Очищаем элементы предыдущей игры
        playerList.innerHTML = '';
        roomCodeDisplay.textContent = '';
        questionNumberDisplay.textContent = '#?';
        questionText.textContent = '';
        resultsText.textContent = 'YES: 0, NO: 0';
        const questionReminder = resultsScreen.querySelector('.question-reminder');
        if (questionReminder) questionReminder.textContent = '';


        // Не переключаем экран здесь, ждем нажатия кнопки в модалке gameOverModal
        // showScreen(entryScreen); // <<< ЭТО НЕПРАВИЛЬНО ЗДЕСЬ
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

// Функция для отправки попытки переподключения
function attemptRejoin() {
    try {
        const storedPlayerId = localStorage.getItem('whoWasThat_playerId');
        const storedRoomCode = localStorage.getItem('whoWasThat_roomCode');

        if (storedPlayerId && storedRoomCode) {
            console.log(`Found session data in localStorage. Attempting rejoin: playerId=${storedPlayerId}, roomCode=${storedRoomCode}`);
            // Показываем "Reconnecting..." ТОЛЬКО если сокет УЖЕ подключен
            // Если сокет еще не подключен (первая загрузка), пользователь просто увидит пустой экран или экран входа позже.
            // Можно добавить проверку socket.connected
            if (socket.connected) { // Проверяем, есть ли уже соединение
                 openInfoModal("Reconnecting...", `Attempting to rejoin room ${storedRoomCode}...`);
            } else {
                console.log("Socket not connected yet, waiting for 'connect' event after rejoin attempt.");
                // Можно показать какой-то общий лоадер на весь экран, но пока оставим так.
            }


            // Отправляем событие на сервер СРАЗУ ЖЕ (не ждем connect)
            // Если сокет еще не подключен, событие будет отправлено сразу после установки соединения.
            socket.emit('rejoinAttempt', {
                playerId: storedPlayerId,
                roomCode: storedRoomCode
            });
        } else {
            console.log('No session data found in localStorage. Showing entry screen.');
            // Если данных НЕТ, показываем экран входа
            showScreen(entryScreen); // <<< ПОКАЗЫВАЕМ ЭКРАН ВХОДА ЗДЕСЬ
        }
    } catch (e) {
        console.error('Error reading from localStorage during rejoin attempt:', e);
        showScreen(entryScreen); // При ошибке тоже показываем экран входа
    }
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
attemptRejoin(); // <<< ВОЗВРАЩАЕМ ЭТО: Пытаемся переподключиться при загрузке