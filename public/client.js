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
const timerText = document.getElementById('timerText');
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
// ... (другие элементы)
const roomInfoDisplay = document.getElementById('roomInfoDisplay');
const roomInfoCode = document.getElementById('roomInfoCode');
const roomInfoPlayers = document.getElementById('roomInfoPlayers');
// Элементы выхода
const exitRoomBtn = document.getElementById('exitRoomBtn');
const confirmExitModal = document.getElementById('confirmExitModal');
const confirmExitBtn = document.getElementById('confirmExitBtn');
const cancelExitBtn = document.getElementById('cancelExitBtn');
// Новые элементы для кнопки показа результатов
const showResultsBtn = document.getElementById('showResultsBtn');
// Для отображения статуса голосования
const votingStatusText = document.getElementById('votingStatusText');

// --- Глобальные переменные ---
let amIHost = false;
let currentHostId = null;
let timerInterval = null;
let currentAction = null; // 'join' или 'create' - для модального окна
let currentRoomCode = ''; // Сохраняем код комнаты при открытии модалки Join
let hasVoted = false; // Новая переменная для отслеживания голосования

// --- Функции для переключения экранов ---
function showScreen(screenToShow) {
    console.log(`[SHOW SCREEN] Переключение на экран: ${screenToShow?.id || 'null'}`);
    
    // Запомним, какой был предыдущий экран (для отладки)
    const previousScreen = 
        entryScreen.style.display !== 'none' ? 'entryScreen' :
        waitingRoomScreen.style.display !== 'none' ? 'waitingRoomScreen' :
        questionScreen.style.display !== 'none' ? 'questionScreen' :
        resultsScreen.style.display !== 'none' ? 'resultsScreen' : 'none';
    
    console.log(`[SHOW SCREEN] Переключение с ${previousScreen} на ${screenToShow?.id || 'null'}`);
    
    // Сначала скрываем ВСЕ основные контейнеры экранов
    if (entryScreen) entryScreen.style.display = 'none';
    if (waitingRoomScreen) waitingRoomScreen.style.display = 'none';
    if (questionScreen) questionScreen.style.display = 'none';
    if (resultsScreen) resultsScreen.style.display = 'none';

    // Показываем ТОЛЬКО нужный экран (если он передан и существует)
    if (screenToShow && typeof screenToShow.style !== 'undefined') {
        // Перед показом экрана результатов, проверим, что данные обновлены
        if (screenToShow === resultsScreen) {
            console.log('[SHOW SCREEN] Показываем экран результатов, проверяем данные');
            // Проверка элементов результатов
            const yesCount = resultsScreen.querySelector('.results-count-yes')?.textContent;
            const noCount = resultsScreen.querySelector('.results-count-no')?.textContent;
            console.log(`[SHOW SCREEN] Текущие значения результатов: YES=${yesCount}, NO=${noCount}`);
        }
        
        screenToShow.style.display = 'flex'; // Используем flex для центрирования
        console.log(`[SHOW SCREEN] Экран ${screenToShow.id} показан`);
    }

    // Определяем, является ли текущий экран игровым (вопрос или результаты)
    const isGameScreenActive = screenToShow && (screenToShow === questionScreen || screenToShow === resultsScreen);

    // --- УПРАВЛЕНИЕ КНОПКОЙ ВЫХОДА ---
    if (exitRoomBtn) {
        // Показываем кнопку, если текущий экран - ожидание, вопрос или результаты
        if (screenToShow === waitingRoomScreen || isGameScreenActive) {
            exitRoomBtn.style.display = 'inline-block'; // Или 'block'
        } else {
            exitRoomBtn.style.display = 'none'; // Скрываем на остальных экранах
        }
    } else {
        console.warn("[showScreen] Кнопка exitRoomBtn не найдена в DOM.");
    }

    // --- УПРАВЛЕНИЕ КЛАССОМ ДЛЯ ПРОЗРАЧНОСТИ КНОПКИ ВЫХОДА ---
    if (document.body) {
        if (isGameScreenActive) {
            // Добавляем класс к body, если идет игра (вопрос/результаты)
            document.body.classList.add('in-game-active');
        } else {
            // Убираем класс, если мы не на экране вопроса/результатов
            document.body.classList.remove('in-game-active');
        }
    } else {
         console.warn("[showScreen] document.body не найден.");
    }

    // --- УПРАВЛЕНИЕ ИНФО-ПАНЕЛЬЮ ---
    if (roomInfoDisplay && roomInfoCode && roomInfoPlayers) {
        if (isGameScreenActive) {
             // Показываем и обновляем на экранах вопроса и результатов
            roomInfoDisplay.style.display = 'block'; // Или 'inline-block', 'flex' в зависимости от верстки
            roomInfoCode.textContent = `Room: ${currentRoomCode || '????'}`; // Используем сохраненный currentRoomCode

            // Обновляем список игроков
            try {
                 const playerNames = Array.from(playerList.children).map(li => li.textContent.replace(/\s\(You,?\s?Host?\)$/, '')).join(', '); // Убираем (You) и (Host)
                 roomInfoPlayers.textContent = `Players: ${playerNames || '...'}`;
            } catch(e) {
                 console.error("Ошибка при обновлении списка игроков в инфо-панели:", e);
                 roomInfoPlayers.textContent = 'Players: Error';
            }

        } else {
            // Скрываем на остальных экранах
            roomInfoDisplay.style.display = 'none';
        }
    } else {
        console.warn("[showScreen] Элементы инфо-панели не найдены.");
    }
}
// --- Функции Модального окна Info ---
function openInfoModal(title, message) {
    infoModalTitle.textContent = title || "Notification"; // Устанавливаем заголовок
    infoModalMessage.textContent = message || "";        // Устанавливаем сообщение
    infoModal.style.display = 'flex';                  // Показываем окно
}

// --- Функции Модального окна Confirm Exit ---
function openConfirmExitModal() {
    confirmExitModal.style.display = 'flex';
}

function closeConfirmExitModal() {
    confirmExitModal.style.display = 'none';
}

function closeInfoModal() {
    infoModal.style.display = 'none'; // Скрываем окно
}

// --- Функции Модального окна ---
function openNameModal(actionType) {
    console.log('Вызвана функция openNameModal, тип:', actionType); 
    currentAction = actionType;
    modalNameInput.value = '';
    modalConfirmBtn.disabled = true;
    modalTitle.textContent = (actionType === 'join') ? 'Enter Your Name to Join' : 'Enter Your Name to Create';
    modalConfirmBtn.textContent = (actionType === 'join') ? 'JOIN' : 'CREATE';

    nameModal.style.display = 'flex'; // Показываем модалку
    modalNameInput.focus();
    console.log('Модальное окно имени должно быть видимо.');
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
// Нажатие кнопки "Return to Main Menu" в модалке Game Over
gameOverReturnBtn.addEventListener('click', () => {
    console.log('Return to Main Menu button clicked.'); // Лог для проверки
    closeGameOverModal(); // Закрываем модалку Game Over
    showScreen(entryScreen); // Показываем главный экран входа
});

// Опционально: Закрытие gameOverModal при клике на фон
gameOverModal.addEventListener('click', (event) => {
    if (event.target === gameOverModal) {
        console.log('Clicked on gameOverModal overlay.'); // Лог
        closeGameOverModal();
        showScreen(entryScreen); // Тоже показываем главный экран
    }
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

// --- ОБРАБОТЧИКИ КНОПОК ВЫХОДА ---

// Нажатие кнопки "Exit Room" -> Открывает модалку подтверждения
exitRoomBtn.addEventListener('click', () => {
    openConfirmExitModal();
});

// Нажатие "No, Stay" в модалке подтверждения
cancelExitBtn.addEventListener('click', () => {
    closeConfirmExitModal();
});

// Нажатие "Yes, Leave" в модалке подтверждения
confirmExitBtn.addEventListener('click', () => {
    console.log('User confirmed exit. Emitting leaveRoom event.');
    socket.emit('leaveRoom'); // Отправляем событие на сервер

    // Очищаем данные сессии немедленно на клиенте
    try {
        localStorage.removeItem('whoWasThat_playerId');
        localStorage.removeItem('whoWasThat_roomCode');
        console.log('Session data cleared from localStorage on explicit leave.');
    } catch (e) { console.error("Error clearing localStorage on leave:", e); }

    // Сбрасываем состояние клиента
    amIHost = false;
    currentAction = null;
    currentRoomCode = '';
    hasVoted = false; // Сбрасываем флаг голосования
    if (timerInterval) { // Останавливаем таймер, если был
         clearInterval(timerInterval);
         timerInterval = null;
    }
    // Сбрасываем кнопки и поля (можно вынести в отдельную функцию resetClientState)
    roomCodeInput.value = '';
    joinRoomBtn.disabled = true;
    modalNameInput.value = '';
    modalConfirmBtn.disabled = true;
    startGameBtn.style.display = 'none';
    nextQuestionBtn.style.display = 'none';
    if (showResultsBtn) showResultsBtn.style.display = 'none';
    voteYesBtn.disabled = false;
    voteNoBtn.disabled = false;
    playerList.innerHTML = '';
    roomCodeDisplay.textContent = '';
    questionNumberDisplay.textContent = '#?';
    questionText.textContent = '';
    resultsText.textContent = 'YES: 0, NO: 0';
    const questionReminder = resultsScreen.querySelector('.question-reminder');
    if (questionReminder) questionReminder.textContent = '';


    closeConfirmExitModal(); // Закрываем модалку подтверждения
    showScreen(entryScreen); // Показываем экран входа

    setTimeout(() => {
        const resultsContainer = document.querySelector('#resultsScreen #resultsText');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <span class="results-yes">
                    <span class="results-count-yes">0</span> Yes
                </span>
                <span class="results-no">
                    <span class="results-count-no">0</span> No
                </span>
            `;
        }
    }, 100);
});

 // Закрытие модалки Confirm Exit при клике на темный фон (overlay)
confirmExitModal.addEventListener('click', (event) => {
    if (event.target === confirmExitModal) { // Закрываем только по клику на сам фон
        closeConfirmExitModal();
    }
});
// --- КОНЕЦ ОБРАБОТЧИКОВ ВЫХОДА ---

voteYesBtn.addEventListener('click', () => { submitVote('yes'); });
voteNoBtn.addEventListener('click', () => { submitVote('no'); });
nextQuestionBtn.addEventListener('click', () => {
    socket.emit('nextQuestion');
    nextQuestionBtn.style.display = 'none';
});

// Обработчик для кнопки "Show Results" (только для хоста)
if (showResultsBtn) {
    showResultsBtn.addEventListener('click', () => {
        console.log('Хост запросил показ результатов');
        socket.emit('forceShowResults');
        if (showResultsBtn) showResultsBtn.style.display = 'none';
    });
}

function submitVote(vote) {
    console.log(`Submitting vote: ${vote}`);
    socket.emit('submitVote', { vote });
    hasVoted = true; // Отмечаем, что игрок проголосовал

    // Блокируем обе кнопки
    voteYesBtn.disabled = true;
    voteNoBtn.disabled = true;

    // Удаляем класс selected-vote с обеих кнопок (на всякий случай)
    voteYesBtn.classList.remove('selected-vote');
    voteNoBtn.classList.remove('selected-vote');

    // Добавляем класс selected-vote к НАЖАТОЙ кнопке
    if (vote === 'yes') {
        voteYesBtn.classList.add('selected-vote');
    } else if (vote === 'no') {
        voteNoBtn.classList.add('selected-vote');
    }
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
    }
    isFirstConnect = false;
});

socket.on('disconnect', () => {
    console.log('Disconnected');
    openInfoModal("Connection Lost", "Connection to the server was lost. Please refresh or try again.");

    // Сброс состояния
    showScreen(entryScreen);
    amIHost = false;
    hasVoted = false;
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
    openInfoModal("Error", message);
});

socket.on('roomJoined', (data) => {
    console.log('Joined room:', data.roomCode, 'My PlayerID:', data.playerId, 'HostID:', data.hostId);

    // Сохраняем данные в localStorage
    try {
        localStorage.setItem('whoWasThat_playerId', data.playerId);
        localStorage.setItem('whoWasThat_roomCode', data.roomCode);
        localStorage.setItem('whoWasThat_playerName', data.playerName); // Сохраняем имя игрока для повторного входа
        console.log('PlayerId, RoomCode и PlayerName сохранены в localStorage.');
    } catch (e) {
        console.error('Ошибка сохранения в localStorage:', e);
        openInfoModal("Storage Error", "Could not save session data. Reconnect may not work.");
    }

    // Обновляем глобальные переменные
    currentRoomCode = data.roomCode; // Сохраняем код комнаты
    amIHost = data.isHost;
    currentHostId = data.hostId; // Сохраняем ID хоста
    hasVoted = false; // Сбрасываем флаг голосования при входе в комнату

    // Обновляем UI
    roomCodeDisplay.textContent = data.roomCode;
    updatePlayerListUI(data.players);
    startGameBtn.style.display = amIHost ? 'block' : 'none';
    nextQuestionBtn.style.display = 'none';
    if (showResultsBtn) showResultsBtn.style.display = 'none';

    // Скрываем модалку "Reconnecting...", если она была показана
    closeInfoModal();

    showScreen(waitingRoomScreen); // Показываем экран ожидания
});

// Сервер подтвердил, что комната существует - открываем модалку имени
socket.on('roomExists', () => {
    console.log('Server confirmed room exists, opening name modal.');
    openNameModal('join');
});

socket.on('updatePlayerList', (data) => {
    /*
      Ожидаем от сервера объект data:
      {
        players: [ { id: 'socket_id_1', name: 'Имя1', playerId: 'uuid1' }, ... ],
        hostId: 'socket_id_хоста'
      }
    */
    console.log('[Update Player List] Получен обновленный список:', data);
    if (!data || !data.players) {
        console.error("[Update Player List] Некорректные данные получены от сервера.");
        return;
    }

    currentHostId = data.hostId; // Сохраняем/обновляем актуальный ID хоста

    updatePlayerListUI(data.players); // Вызываем функцию для отрисовки списка в UI

    // Обновляем инфо-панель, если она сейчас видна (на экране вопроса или результатов)
    // Делаем это здесь, т.к. список игроков мог измениться
    if (roomInfoDisplay.style.display === 'block') {
        const playerNames = data.players.map(p => p.name).join(', ');
        roomInfoPlayers.textContent = `Players: ${playerNames}`;
    }
    
    // Обновляем статус голосования если мы на экране вопроса
    updateVotingStatus(data.votingStatus);
});

// Обновление статуса голосования
function updateVotingStatus(votingStatus) {
    if (!votingStatus || !votingStatusText) return;
    
    const voted = votingStatus.votes || 0;
    const total = votingStatus.total || 0;
    
    // Показываем статус голосования
    votingStatusText.textContent = `Voted: ${voted}/${total}`;
    votingStatusText.style.display = 'block';
    
    // Если мы хост и все проголосовали, показываем кнопку "Show Results"
    if (amIHost && voted >= total && showResultsBtn) {
        showResultsBtn.style.display = 'block';
    }
}

// --- Сервер прислал НОВЫЙ ВОПРОС ---
socket.on('newQuestion', (data) => {
    console.log(`[New Question] Получен вопрос ID: ${data.questionId || 'N/A'}, Текст: ${data.questionText}`);

    // Сбрасываем статус голосования
    hasVoted = false;

    // Принудительно сбрасываем состояние UI результатов (для предотвращения кэширования)
    const yesCountSpan = resultsScreen.querySelector('.results-count-yes');
    const noCountSpan = resultsScreen.querySelector('.results-count-no');
    if (yesCountSpan) yesCountSpan.textContent = '0';
    if (noCountSpan) noCountSpan.textContent = '0';
    
    // Показываем ID вопроса
    if (questionNumberDisplay) {
         questionNumberDisplay.textContent = `#${data.questionId || '?'}`;
         questionNumberDisplay.style.display = 'block';
    }
    if (questionText) {
        questionText.textContent = data.questionText || "Loading question...";
    }

    // Управление таймером
    if (data.hideTimer && timerText) {
        timerText.style.display = 'none';
    } else if (timerText) {
        timerText.style.display = 'block';
        startTimer(data.duration || 10);
    }

    // Сбрасываем состояние кнопок
    if (showResultsBtn) {
        showResultsBtn.style.display = amIHost ? 'block' : 'none';
    }
    
    if (votingStatusText) {
        votingStatusText.textContent = 'Voted: 0/0';
    }

    // Разблокируем кнопки и убираем выделение
    if (voteYesBtn) {
        voteYesBtn.disabled = false;
        voteYesBtn.classList.remove('selected-vote');
    }
    if (voteNoBtn) {
        voteNoBtn.disabled = false;
        voteNoBtn.classList.remove('selected-vote');
    }
    console.log('[New Question] Кнопки голосования разблокированы, выделение сброшено.');

    // Показываем экран с вопросом
    showScreen(questionScreen);
});

// Замените всю функцию обработки события 'showResults'
socket.on('showResults', (data) => {
    console.log('[SHOW RESULTS] Получены данные:', JSON.stringify(data));
    
    // Отложим выполнение, чтобы дать браузеру время на обработку других событий
    setTimeout(() => {
        try {
            // Явное обновление DOM с результатами
            updateResultsDOM(data);
            
            // Теперь переключим экран
            showScreen(resultsScreen);
            
            // Настроим кнопки
            if (nextQuestionBtn) nextQuestionBtn.style.display = amIHost ? 'block' : 'none';
            if (showResultsBtn) showResultsBtn.style.display = 'none';
            
            // Остановим таймер
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        } catch (error) {
            console.error('[SHOW RESULTS ERROR]', error);
            // Попытка восстановления
            alert('Error displaying results. Please refresh if you see this error.');
        }
    }, 100); // Небольшая задержка
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
        // Если мы на экране результатов - показываем Next Question
        console.log("[Host Status] Currently on results screen, showing Next Question button.");
        nextQuestionBtn.style.display = 'block';
        startGameBtn.style.display = 'none'; // Убедимся, что Start скрыта
    } else if (questionScreen.style.display === 'flex') {
        // Если мы на экране вопроса - показываем Show Results
        console.log("[Host Status] Currently on question screen, showing Show Results button if it exists.");
        if (showResultsBtn) showResultsBtn.style.display = 'block';
        startGameBtn.style.display = 'none';
        nextQuestionBtn.style.display = 'none';
    } else {
        // Если мы на другом экране (вход) - кнопки хоста пока не нужны
        console.log("[Host Status] Currently on entry screen, host buttons remain hidden for now.");
        startGameBtn.style.display = 'none';
        nextQuestionBtn.style.display = 'none';
        if (showResultsBtn) showResultsBtn.style.display = 'none';
    }
    });

// Сервер подтвердил успешный реконнект
socket.on('rejoinSuccess', (data) => {
    console.log('[Rejoin Success] Rejoin successful! Received game state:', data);

    openInfoModal("Reconnected!", "Successfully rejoined the game.");
    setTimeout(closeInfoModal, 1500);

    amIHost = data.isHost;
    currentRoomCode = data.roomCode;
    currentHostId = data.hostId;
    if(roomCodeDisplay) roomCodeDisplay.textContent = data.roomCode;
    updatePlayerListUI(data.players);

    if(startGameBtn) startGameBtn.style.display = 'none';
    if(nextQuestionBtn) nextQuestionBtn.style.display = 'none';
    if(showResultsBtn) showResultsBtn.style.display = 'none';

    const gameState = data.gameState;
    if (gameState.state === 'waiting') {
        console.log('[Rejoin Success] Game state is WAITING.');
        if(startGameBtn) startGameBtn.style.display = amIHost ? 'block' : 'none';
        if(voteYesBtn) voteYesBtn.disabled = false;
        if(voteNoBtn) voteNoBtn.disabled = false;
        if(voteYesBtn) voteYesBtn.classList.remove('selected-vote');
        if(voteNoBtn) voteNoBtn.classList.remove('selected-vote');
        showScreen(waitingRoomScreen);
    } else if (gameState.state === 'question') {
         console.log('[Rejoin Success] Game state is QUESTION.');
         if(startGameBtn) startGameBtn.style.display = 'none';
         if(nextQuestionBtn) nextQuestionBtn.style.display = 'none';
         if(showResultsBtn) showResultsBtn.style.display = amIHost ? 'block' : 'none';

         // Показываем ID, устанавливаем текст
         if(questionNumberDisplay) {
             questionNumberDisplay.textContent = `#${gameState.questionId || '?'}`;
             questionNumberDisplay.style.display = 'block';
         }
         if(questionText) questionText.textContent = gameState.questionText || 'Loading question...';
         
         // Инициализируем hasVoted из gameState.myVote
         hasVoted = (gameState.myVote !== null);
         
         // Скрываем таймер если он отключен на сервере
         if (gameState.hideTimer && timerText) {
             timerText.style.display = 'none';
         } else if (timerText) {
             timerText.style.display = 'block';
             startTimer(gameState.durationLeft || 10);
         }

         // Обновляем статус голосования
         if (votingStatusText && gameState.votingStatus) {
             const voted = gameState.votingStatus.votes || 0;
             const total = gameState.votingStatus.total || 0;
             votingStatusText.textContent = `Voted: ${voted}/${total}`;
             votingStatusText.style.display = 'block';
         }

         const myVote = gameState.myVote;
         console.log('[Rejoin Success] Получено состояние ГОЛОСА (myVote):', myVote, `(Тип: ${typeof myVote})`);
         if(voteYesBtn) voteYesBtn.disabled = (myVote !== null);
         if(voteNoBtn) voteNoBtn.disabled = (myVote !== null);

         if(voteYesBtn) voteYesBtn.classList.remove('selected-vote');
         if(voteNoBtn) voteNoBtn.classList.remove('selected-vote');
         if (myVote === 'yes' && voteYesBtn) {
             voteYesBtn.classList.add('selected-vote');
         } else if (myVote === 'no' && voteNoBtn) {
             voteNoBtn.classList.add('selected-vote');
         }
         
         if(myVote !== null) { 
             console.log('[Rejoin Success] Кнопки голосования ОТКЛЮЧЕНЫ.'); 
             hasVoted = true;
         } else { 
             console.log('[Rejoin Success] Кнопки голосования ВКЛЮЧЕНЫ.');
             hasVoted = false;
         }

         showScreen(questionScreen);
    } else if (gameState.state === 'results') {
        console.log('[Rejoin Success] Game state is RESULTS.');
        if(startGameBtn) startGameBtn.style.display = 'none';
        if(voteYesBtn) voteYesBtn.disabled = true;
        if(voteNoBtn) voteNoBtn.disabled = true;
        if(voteYesBtn) voteYesBtn.classList.remove('selected-vote');
        if(voteNoBtn) voteNoBtn.classList.remove('selected-vote');
        if(showResultsBtn) showResultsBtn.style.display = 'none';
        
        const yesVotes = gameState.results ? gameState.results.yesVotes : 0;
        const noVotes = gameState.results ? gameState.results.noVotes : 0;
        const yesCountSpanR = resultsScreen.querySelector('.results-count-yes');
        const noCountSpanR = resultsScreen.querySelector('.results-count-no');
        if (yesCountSpanR) yesCountSpanR.textContent = yesVotes;
        if (noCountSpanR) noCountSpanR.textContent = noVotes;

        const questionReminder = resultsScreen.querySelector('.question-reminder');
        if (questionReminder) {
             questionReminder.textContent = `#${gameState.questionId || '?'} ${gameState.questionText || ''}`;
        }
        if(nextQuestionBtn) nextQuestionBtn.style.display = amIHost ? 'block' : 'none';
        showScreen(resultsScreen);
        if (timerInterval) clearInterval(timerInterval);
    } else {
        console.error("[Rejoin Success] Unknown or finished game state received:", gameState.state);
         try { localStorage.removeItem('whoWasThat_playerId'); localStorage.removeItem('whoWasThat_roomCode'); } catch(e){}
         if(voteYesBtn) voteYesBtn.disabled = false;
         if(voteNoBtn) voteNoBtn.disabled = false;
         if(voteYesBtn) voteYesBtn.classList.remove('selected-vote');
         if(voteNoBtn) voteNoBtn.classList.remove('selected-vote');
         if(startGameBtn) startGameBtn.style.display = 'none';
         if(nextQuestionBtn) nextQuestionBtn.style.display = 'none';
         if(exitRoomBtn) exitRoomBtn.style.display = 'none';
         if(showResultsBtn) showResultsBtn.style.display = 'none';
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
    hasVoted = false;

    exitRoomBtn.style.display = 'none'; // <<< Скрываем кнопку выхода

    // Явно скрываем кнопки, которые видны только в игре/лобби
    startGameBtn.style.display = 'none';
    nextQuestionBtn.style.display = 'none';
    if (showResultsBtn) showResultsBtn.style.display = 'none';
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
});

// Обработчик события "Возможность входа в активную комнату"
socket.on('canJoinActiveRoom', (data) => {
    // Показываем модальное окно с вопросом
    openInfoModal(
        "Room already active", 
        `Room ${data.roomCode} is already active. Do you want to rejoin as ${data.playerName || 'a participant'}?`
    );
    
    // Заменяем стандартную кнопку OK на две: "Join" и "Cancel"
    if (infoModalCloseBtn) {
        infoModalCloseBtn.textContent = "Join";
        
        // Создаем вторую кнопку для отмены, если её ещё нет
        if (!document.getElementById('infoModalCancelBtn')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'infoModalCancelBtn';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.className = infoModalCloseBtn.className; // Копируем стили
            cancelBtn.style.backgroundColor = '#FF5B22'; // Оранжевый цвет
            
            // Вставляем после кнопки Join
            infoModalCloseBtn.parentNode.insertBefore(cancelBtn, infoModalCloseBtn.nextSibling);
            
            // Добавляем обработчик
            cancelBtn.addEventListener('click', () => {
                // Удаляем созданную кнопку
                cancelBtn.remove();
                // Возвращаем оригинальный текст кнопке OK
                infoModalCloseBtn.textContent = "OK";
                closeInfoModal();
            });
        }
        
        // Меняем обработчик кнопки Join
        const originalClickHandler = infoModalCloseBtn.onclick;
        infoModalCloseBtn.onclick = () => {
            // Удаляем вторую кнопку если она есть
            const cancelBtn = document.getElementById('infoModalCancelBtn');
            if (cancelBtn) cancelBtn.remove();
            
            // Возвращаем оригинальный текст
            infoModalCloseBtn.textContent = "OK";
            
            // Восстанавливаем оригинальный обработчик
            infoModalCloseBtn.onclick = originalClickHandler;
            
            // Закрываем модальное окно
            closeInfoModal();
            
            // Отправляем запрос на вход в активную комнату
            socket.emit('joinActiveRoom', {
                roomCode: data.roomCode,
                playerName: data.playerName
            });
        };
    }
});

// Дополнительный обработчик для новой кнопки "Show Results"
socket.on('votingStatus', (data) => {
    // Обновляем статус голосования на экране
    updateVotingStatus(data);
});

// --- Вспомогательные функции ---

function updatePlayerListUI(players) {
    playerList.innerHTML = ''; // Очищаем текущий HTML список
    if (!players) return; // Дополнительная проверка

    players.forEach(player => {
        const li = document.createElement('li');
        let displayName = player.name; // Начинаем с имени
        let isCurrentUser = (player.id === socket.id); // Флаг, что это текущий игрок
        let isCurrentHost = (player.id === currentHostId); // Флаг, что это хост

        // Формируем итоговый текст
        if (isCurrentUser && isCurrentHost) {
            displayName += ' (You, Host)';
        } else if (isCurrentUser) {
            displayName += ' (You)';
        } else if (isCurrentHost) {
            displayName += ' (Host)';
        }
        // Устанавливаем текст ОДИН раз
        li.textContent = displayName;

        // Добавляем классы для стилизации
        if (isCurrentHost) {
            li.classList.add('host-name');
        }
        if (isCurrentUser) {
            li.classList.add('my-name');
        }

        playerList.appendChild(li); // Добавляем элемент в список на странице
    });

    // Обновляем инфо-панель, если она видна
    if (roomInfoDisplay.style.display === 'block') {
          const playerNames = players.map(p => p.name).join(', ');
          roomInfoPlayers.textContent = `Players: ${playerNames}`;
    }
}

// Эту новую функцию добавьте после updatePlayerListUI
function updateResultsDOM(data) {
    console.log('[UPDATE RESULTS DOM] Начинаем обновление DOM');
    
    const yesVotes = parseInt(data.yesVotes) || 0;
    const noVotes = parseInt(data.noVotes) || 0;
    
    console.log(`[UPDATE RESULTS DOM] Обработанные значения: yesVotes=${yesVotes}, noVotes=${noVotes}`);
    
    // Всегда пересоздаем структуру результатов
    let resultsContainer = document.querySelector('#resultsScreen #resultsText');
    
    if (!resultsContainer) {
        resultsContainer = document.createElement('div');
        resultsContainer.id = 'resultsText';
        resultsContainer.className = 'results-container';
        
        const resultsScreen = document.getElementById('resultsScreen');
        const questionReminder = resultsScreen.querySelector('.question-reminder');
        if (questionReminder) {
            questionReminder.parentNode.insertBefore(resultsContainer, questionReminder.nextSibling);
        } else {
            resultsScreen.appendChild(resultsContainer);
        }
    }
    
    // Обновляем HTML напрямую
    resultsContainer.innerHTML = `
        <span class="results-yes">
            <span class="results-count-yes">${yesVotes}</span> Yes
        </span>
        <span class="results-no">
            <span class="results-count-no">${noVotes}</span> No
        </span>
    `;
    
    // Обновляем вопрос
    const questionElement = document.querySelector('#resultsScreen .question-reminder');
    if (questionElement) {
        questionElement.textContent = `#${data.questionId || '?'} ${data.questionText || ''}`;
    }
    
    hasVoted = false;
    console.log('[UPDATE RESULTS DOM] DOM обновление завершено');
}

// Функция для отправки попытки переподключения
function attemptRejoin() {
    try {
        const storedPlayerId = localStorage.getItem('whoWasThat_playerId');
        const storedRoomCode = localStorage.getItem('whoWasThat_roomCode');
        const storedPlayerName = localStorage.getItem('whoWasThat_playerName'); // Достаем имя

        if (storedPlayerId && storedRoomCode) {
            console.log(`Found session data in localStorage. Attempting rejoin: playerId=${storedPlayerId}, roomCode=${storedRoomCode}, name=${storedPlayerName}`);
            // Показываем "Reconnecting..." ТОЛЬКО если сокет УЖЕ подключен
            if (socket.connected) {
                 openInfoModal("Reconnecting...", `Attempting to rejoin room ${storedRoomCode}...`);
            } else {
                console.log("Socket not connected yet, waiting for 'connect' event after rejoin attempt.");
            }

            // Отправляем событие на сервер с именем игрока
            socket.emit('rejoinAttempt', {
                playerId: storedPlayerId,
                roomCode: storedRoomCode,
                playerName: storedPlayerName // Добавляем имя для повторного входа
            });
        } else {
            console.log('No session data found in localStorage. Showing entry screen.');
            showScreen(entryScreen);
        }
    } catch (e) {
        console.error('Error reading from localStorage during rejoin attempt:', e);
        showScreen(entryScreen);
    }
}

function startTimer(duration) {
    let timeLeft = duration;
    if (timerDisplay) timerDisplay.textContent = timeLeft;
    if (timerInterval) clearInterval(timerInterval);
    
    // Только если таймер включен
    if (timerText && timerText.style.display !== 'none') {
        timerInterval = setInterval(() => {
            timeLeft--;
            if (timerDisplay) timerDisplay.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                if (voteYesBtn) voteYesBtn.disabled = true;
                if (voteNoBtn) voteNoBtn.disabled = true;
            }
        }, 1000);
    }
}

// --- Инициализация ---
// Проверяем, есть ли элементы для показа статуса голосования, 
// и если нет - создаем
if (!votingStatusText && questionScreen) {
    const votingStatus = document.createElement('p');
    votingStatus.id = 'votingStatusText';
    votingStatus.textContent = 'Voted: 0/0';
    votingStatus.style.color = '#aaa';
    votingStatus.style.marginBottom = '20px';
    votingStatus.style.fontSize = '1.1em';
    votingStatus.style.fontWeight = 'bold';
    votingStatus.style.textAlign = 'center';
    
    // Вставляем перед контейнером кнопок голосования
    const voteButtonsContainer = document.getElementById('voteButtonsContainer');
    if (voteButtonsContainer && voteButtonsContainer.parentNode) {
        voteButtonsContainer.parentNode.insertBefore(votingStatus, voteButtonsContainer);
    }
}

// Проверяем, есть ли кнопка "Show Results" для хоста, 
// и если нет - создаем
if (!showResultsBtn && questionScreen) {
    const showResultsButton = document.createElement('button');
    showResultsButton.id = 'showResultsBtn';
    showResultsButton.textContent = 'Show Results';
    showResultsButton.className = 'pill-button';
    showResultsButton.style.backgroundColor = '#DBB8FF'; // Bratz Purple
    showResultsButton.style.color = '#191919';
    showResultsButton.style.display = 'none'; // Скрыта по умолчанию
    
    // Вставляем после контейнера кнопок голосования
    const voteButtonsContainer = document.getElementById('voteButtonsContainer');
    if (voteButtonsContainer && voteButtonsContainer.parentNode) {
        voteButtonsContainer.parentNode.appendChild(showResultsButton);
    }
    
    // Добавляем обработчик
    showResultsButton.addEventListener('click', () => {
        console.log('Хост запросил показ результатов');
        socket.emit('forceShowResults');
        showResultsButton.style.display = 'none';
    });
}

attemptRejoin();