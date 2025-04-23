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
// ... (другие элементы)
const roomInfoDisplay = document.getElementById('roomInfoDisplay');
const roomInfoCode = document.getElementById('roomInfoCode');
const roomInfoPlayers = document.getElementById('roomInfoPlayers');
// Элементы выхода
const exitRoomBtn = document.getElementById('exitRoomBtn');
const confirmExitModal = document.getElementById('confirmExitModal');
const confirmExitBtn = document.getElementById('confirmExitBtn');
const cancelExitBtn = document.getElementById('cancelExitBtn');
// --- Глобальные переменные ---
let amIHost = false;
let currentHostId = null;
let timerInterval = null;
let currentAction = null; // 'join' или 'create' - для модального окна
let currentRoomCode = ''; // Сохраняем код комнаты при открытии модалки Join

// --- Функции для переключения экранов ---
// --- Функции для переключения экранов ---
function showScreen(screenToShow) {
    // Возвращаем главный заголовок по умолчанию (если нужно)
    // document.querySelector('h1').textContent = 'Who Was That?';

    // Сначала скрываем ВСЕ основные контейнеры экранов
    // Убедимся, что переменные экранов существуют перед доступом к style
    if (entryScreen) entryScreen.style.display = 'none';
    if (waitingRoomScreen) waitingRoomScreen.style.display = 'none';
    if (questionScreen) questionScreen.style.display = 'none';
    if (resultsScreen) resultsScreen.style.display = 'none';

    // Показываем ТОЛЬКО нужный экран (если он передан и существует)
    if (screenToShow && typeof screenToShow.style !== 'undefined') {
        screenToShow.style.display = 'flex'; // Используем flex для центрирования
    }

    // Определяем, является ли текущий экран игровым (вопрос или результаты)
    // Добавляем проверки на существование переменных на всякий случай
    const isGameScreenActive = screenToShow && (screenToShow === questionScreen || screenToShow === resultsScreen);

    // --- УПРАВЛЕНИЕ КНОПКОЙ ВЫХОДА ---
    // Проверяем существование кнопки перед доступом к style
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
    // Проверяем существование document.body перед доступом к classList
    if (document.body) {
        if (isGameScreenActive) {
            // Добавляем класс к body, если идет игра (вопрос/результаты)
            document.body.classList.add('in-game-active');
            // console.log('[showScreen] Добавлен класс in-game-active к body'); // Лог для отладки
        } else {
            // Убираем класс, если мы не на экране вопроса/результатов
            document.body.classList.remove('in-game-active');
            // console.log('[showScreen] Удален класс in-game-active с body'); // Лог для отладки
        }
    } else {
         console.warn("[showScreen] document.body не найден.");
    }


    // --- УПРАВЛЕНИЕ ИНФО-ПАНЕЛЬЮ ---
    // Проверяем существование панели и ее дочерних элементов
    if (roomInfoDisplay && roomInfoCode && roomInfoPlayers) {
        if (isGameScreenActive) {
             // Показываем и обновляем на экранах вопроса и результатов
            roomInfoDisplay.style.display = 'block'; // Или 'inline-block', 'flex' в зависимости от верстки
            roomInfoCode.textContent = `Room: ${currentRoomCode || '????'}`; // Используем сохраненный currentRoomCode

            // Обновляем список игроков (можно сделать отдельную функцию)
            try {
                 // Получаем список имен игроков из текущего playerList (простой способ)
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
        console.warn("[showScreen] Элементы инфо-панели (roomInfoDisplay, roomInfoCode, roomInfoPlayers) не найдены.");
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

function submitVote(vote) {
    console.log(`Submitting vote: ${vote}`);
    socket.emit('submitVote', { vote });

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
    console.log('Joined room:', data.roomCode, 'My PlayerID:', data.playerId, 'HostID:', data.hostId);

    // Сохраняем данные в localStorage
    try {
        localStorage.setItem('whoWasThat_playerId', data.playerId);
        localStorage.setItem('whoWasThat_roomCode', data.roomCode);
        console.log('PlayerId и RoomCode сохранены в localStorage.');
    } catch (e) {
        console.error('Ошибка сохранения в localStorage:', e);
        openInfoModal("Storage Error", "Could not save session data. Reconnect may not work.");
    }

    // Обновляем глобальные переменные
    currentRoomCode = data.roomCode; // Сохраняем код комнаты
    amIHost = data.isHost;
    currentHostId = data.hostId; // <<< СОХРАНЯЕМ ID ХОСТА

    // Обновляем UI
    roomCodeDisplay.textContent = data.roomCode;
    updatePlayerListUI(data.players); // <<< ВЫЗЫВАЕМ ОБНОВЛЕННУЮ ФУНКЦИЮ ОТРИСОВКИ
    startGameBtn.style.display = amIHost ? 'block' : 'none';
    nextQuestionBtn.style.display = 'none';

    // Скрываем модалку "Reconnecting...", если она была показана
    closeInfoModal();

    showScreen(waitingRoomScreen); // Показываем экран ожидания
});

// Сервер подтвердил, что комната существует - открываем модалку имени

socket.on('roomExists', () => {
    console.log('Server confirmed room exists, opening name modal.'); // <-- ДОЛЖЕН ПОЯВИТЬСЯ В КОНСОЛИ КЛИЕНТА
    openNameModal('join'); // <<< САМОЕ ВАЖНОЕ: эта строка должна вызваться
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
});


// --- Сервер прислал НОВЫЙ ВОПРОС ---
// --- Сервер прислал НОВЫЙ ВОПРОС ---
socket.on('newQuestion', (data) => {
    /*
      Ожидаем от сервера объект data:
      {
        questionId: 101, // <<< ID ИЗ JSON
        questionText: "Текст вопроса?",
        duration: 10
      }
    */
    console.log(`[New Question] Получен вопрос ID: ${data.questionId || 'N/A'}, Текст: ${data.questionText}`);

    // --- ИЗМЕНЕНИЕ: Показываем ID вопроса ---
    if (questionNumberDisplay) {
         questionNumberDisplay.textContent = `#${data.questionId || '?'}`; // Устанавливаем ID
         questionNumberDisplay.style.display = 'block'; // <<< ДЕЛАЕМ ВИДИМЫМ
    }
    if (questionText) {
        questionText.textContent = data.questionText || "Loading question..."; // Показываем текст вопроса
    }
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---

    // Сбрасываем и запускаем таймер
    startTimer(data.duration || VOTE_DURATION_SECONDS);

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

socket.on('showResults', (data) => {
    /*
       Ожидаем от сервера объект data:
       {
         yesVotes: 3,
         noVotes: 1,
         questionId: 101, // <<< ID ИЗ JSON
         questionText: "Текст вопроса, на который отвечали"
       }
    */
    console.log('[Show Results] Получены результаты:', data);

    // Обновляем текст с результатами
    // if (resultsText) resultsText.textContent = `YES: ${data.yesVotes || 0}, NO: ${data.noVotes || 0}`;
    const yesCountSpan = resultsScreen.querySelector('.results-count-yes');
const noCountSpan = resultsScreen.querySelector('.results-count-no');
if (yesCountSpan) yesCountSpan.textContent = data.yesVotes || 0;
if (noCountSpan) noCountSpan.textContent = data.noVotes || 0;

    // Обновляем текст вопроса-напоминания, используя ID из JSON
    const questionReminder = resultsScreen.querySelector('.question-reminder');
     if(questionReminder) {
         // --- ИЗМЕНЕНИЕ: Используем ID из JSON ---
         questionReminder.textContent = `#${data.questionId || '?'} ${data.questionText || ''}`;
         // --- КОНЕЦ ИЗМЕНЕНИЯ ---
     } else {
          console.warn("[Show Results] Элемент .question-reminder не найден.");
     }

    // Показываем экран результатов
    showScreen(resultsScreen);

    // Показываем кнопку "Next Question" ТОЛЬКО ведущему
    if (nextQuestionBtn) nextQuestionBtn.style.display = amIHost ? 'block' : 'none';

     // Останавливаем клиентский таймер на всякий случай
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
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
    /* Ожидаемый формат data: См. комментарии выше, теперь с questionId */
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

         // --- ИЗМЕНЕНИЕ: Скрываем номер, показываем текст ---
         if(questionNumberDisplay) {
             questionNumberDisplay.textContent = `#${gameState.questionId || '?'}`; // Устанавливаем ID
             questionNumberDisplay.style.display = 'block'; // <<< ДЕЛАЕМ ВИДИМЫМ
         }
         if(questionText) questionText.textContent = gameState.questionText || 'Loading question...';
         // --- КОНЕЦ ИЗМЕНЕНИЯ ---

         startTimer(gameState.durationLeft || VOTE_DURATION_SECONDS);

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
         if(myVote !== null) { console.log('[Rejoin Success] Кнопки голосования ОТКЛЮЧЕНЫ.'); }
         else { console.log('[Rejoin Success] Кнопки голосования ВКЛЮЧЕНЫ.'); }

         showScreen(questionScreen);
    } else if (gameState.state === 'results') {
        console.log('[Rejoin Success] Game state is RESULTS.');
        if(startGameBtn) startGameBtn.style.display = 'none';
        if(voteYesBtn) voteYesBtn.disabled = true;
        if(voteNoBtn) voteNoBtn.disabled = true;
        if(voteYesBtn) voteYesBtn.classList.remove('selected-vote');
        if(voteNoBtn) voteNoBtn.classList.remove('selected-vote');
        const yesVotes = gameState.results ? gameState.results.yesVotes : 0;
        const noVotes = gameState.results ? gameState.results.noVotes : 0;
        const yesCountSpanR = resultsScreen.querySelector('.results-count-yes'); // Используем другие переменные на всякий случай
        const noCountSpanR = resultsScreen.querySelector('.results-count-no');
        if (yesCountSpanR) yesCountSpanR.textContent = yesVotes;
        if (noCountSpanR) noCountSpanR.textContent = noVotes;

       // const yesVotes = gameState.results ? gameState.results.yesVotes : 0;
       // const noVotes = gameState.results ? gameState.results.noVotes : 0;
       // if(resultsText) resultsText.textContent = `YES: ${yesVotes}, NO: ${noVotes}`;

        const questionReminder = resultsScreen.querySelector('.question-reminder');
        if (questionReminder) {
             // --- ИЗМЕНЕНИЕ: Используем ID из JSON ---
             questionReminder.textContent = `#${gameState.questionId || '?'} ${gameState.questionText || ''}`;
             // --- КОНЕЦ ИЗМЕНЕНИЯ ---
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

        exitRoomBtn.style.display = 'none'; // <<< Скрываем кнопку выхода

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