// --- Необходимые модули ---
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs'); // Модуль для работы с файловой системой
const { v4: uuidv4 } = require('uuid');

// --- Инициализация Express и Socket.IO ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- Middleware для статических файлов ---
// Отдаем файлы из папки 'public' (index.html, style.css, client.js)
app.use(express.static('public'));

// --- Хранилище данных об игре ---
const rooms = {}; // Объект для хранения активных комнат

// --- Загрузка вопросов из JSON файла ---
let allQuestions = []; // Массив для хранения ВСЕХ вопросов из файла
try {
    // Читаем файл синхронно при запуске сервера
    const questionsData = fs.readFileSync('questions.json', 'utf8');
    allQuestions = JSON.parse(questionsData); // Преобразуем JSON строку в массив объектов
    console.log(`[Server Start] Успешно загружено ${allQuestions.length} вопросов из questions.json`);
    if (!Array.isArray(allQuestions) || allQuestions.length === 0) {
        console.warn("[Server Start] ВНИМАНИЕ: Файл questions.json пуст, не является массивом или не содержит вопросов!");
        // Используем запасной вопрос, чтобы сервер мог запуститься
        allQuestions = [{ text: "Ошибка: Не удалось загрузить вопросы из файла." }];
    }
} catch (error) {
    console.error("[Server Start] КРИТИЧЕСКАЯ ОШИБКА при загрузке questions.json:", error.message);
    console.error("[Server Start] Убедитесь, что файл questions.json существует в корне проекта, доступен для чтения и содержит валидный JSON массив.");
    // Завершаем работу сервера, т.к. без вопросов игра не имеет смысла
    process.exit(1);
}

// --- Константы игры ---
const VOTE_DURATION_SECONDS = 10; // Время на голосование в секундах

// ==============================
// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
// ==============================

// --- Функция для перемешивания массива (Fisher-Yates Shuffle) ---
function shuffleArray(array) {
  const shuffled = [...array]; // Создаем КОПИЮ массива, чтобы не изменять оригинал
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Эффективный обмен элементами
  }
  return shuffled;
}

// --- Генерация случайного кода комнаты (4 заглавные буквы) ---
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms[code]); // Гарантируем уникальность кода
    return code;
}

// --- Отправка обновленного списка игроков всем в комнате ---
function broadcastPlayerList(roomCode) {
    const room = rooms[roomCode];
    if (room && room.players) {
        const currentHostId = room.hostId; // Получаем ID текущего хоста
        // Отправляем id (socket.id), name, playerId И hostId
        const players = room.players.map(p => ({ id: p.id, name: p.name, playerId: p.playerId }));
        io.to(roomCode).emit('updatePlayerList', { // Отправляем объект
            players: players,
            hostId: currentHostId // Добавляем ID хоста
        });
         console.log(`[Broadcast] Обновлен список для ${roomCode}. Хост: ${currentHostId}`);
    }
}

// --- Поиск комнаты по ID сокета игрока ---
function findRoomBySocketId(socketId) {
    const entry = Object.entries(rooms).find(([code, room]) => {
        return room.players && room.players.some(player => player.id === socketId);
    });
    if (!entry) console.log(`[Debug] Не найдена комната для socketId: ${socketId}`); // Раскомментируй для отладки
    return entry;
}
// Поиск комнаты и игрока по playerId
// Возвращает { roomCode, room, player } или null
function findPlayerByPlayerId(playerId) {
    for (const [roomCode, room] of Object.entries(rooms)) {
        if (room.players) {
            const player = room.players.find(p => p.playerId === playerId);
            if (player) {
                return { roomCode, room, player }; // Нашли!
            }
        }
    }
    return null; // Не нашли ни в одной комнате
}

// ==================================
// --- ОБРАБОТКА СОБЫТИЙ SOCKET.IO ---
// ==================================

io.on('connection', (socket) => {
    console.log(`[Connection] Пользователь подключился: ${socket.id}`);

    // --- Обработка СОЗДАНИЯ Комнаты ---
    socket.on('createRoom', (data) => {
    const playerName = data.name ? String(data.name).trim() : `User_${socket.id.substring(0,4)}`;
    const roomCode = generateRoomCode();
    const newPlayerId = uuidv4(); // <<< Генерируем ID для создателя

    rooms[roomCode] = {
        hostId: socket.id,
        // Добавляем playerId к первому игроку (хосту)
        players: [{ id: socket.id, name: playerName, playerId: newPlayerId }], // <<< Добавили playerId
        shuffledQuestions: [],
        currentQuestionIndex: -1,
        votes: {},
        state: 'waiting',
        timer: null,
        // Добавим место для хранения таймеров отключения
        disconnectTimers: {} // { playerId: setTimeoutInstance }
    };

    socket.join(roomCode);
    console.log(`[Room Created] Игрок ${playerName} (playerId: ${newPlayerId}, socketId: ${socket.id}) создал комнату ${roomCode}`);

    // Отправляем playerId клиенту
    socket.emit('roomJoined', {
    roomCode: roomCode,
    players: rooms[roomCode].players.map(p => ({ id: p.id, name: p.name, playerId: p.playerId })), // Отправляем полный список
    isHost: true,
    playerId: newPlayerId,
    hostId: socket.id // <<< Добавляем ID хоста (это он сам)
});
});

// --- Обработка ЯВНОГО ВЫХОДА из комнаты ---
socket.on('leaveRoom', () => {
    console.log(`[Leave Room] Запрос на выход от ${socket.id}`);
    const roomEntry = findRoomBySocketId(socket.id);

    if (roomEntry) {
        const [roomCode, room] = roomEntry;

        // Игнорируем, если комната уже завершена
        if (room.state === 'finished') {
             console.log(`[Leave Room] Игрок ${socket.id} пытается выйти из уже завершенной комнаты ${roomCode}.`);
             return;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) {
             console.log(`[Leave Room] Игрок ${socket.id} не найден в комнате ${roomCode} при попытке выхода.`);
             return; // Игрока уже нет
        }

        const player = room.players[playerIndex];
        const playerId = player.playerId;
        const playerName = player.name;
        const wasHost = room.hostId === socket.id;

        console.log(`[Player Left Explicitly] Игрок ${playerName} (playerId: ${playerId}, socketId: ${socket.id}) покидает комнату ${roomCode}`);

        // Отменяем таймер неактивности, если он был запущен для этого игрока
         if (room.disconnectTimers && room.disconnectTimers[playerId]) {
             clearTimeout(room.disconnectTimers[playerId]);
             delete room.disconnectTimers[playerId];
             console.log(`[Leave Room] Таймер неактивности для ${playerId} отменен.`);
         }

        // Удаляем игрока из списка СРАЗУ
        room.players.splice(playerIndex, 1);
        delete room.votes[playerId]; // Удаляем его голос

        // Проверяем, остался ли кто-то
        if (room.players.length === 0) {
            console.log(`[Room Empty] Комната ${roomCode} пуста после выхода игрока ${playerName}. Завершаем игру.`);
            endGame(roomCode, "Last player left the room.");
        } else {
            // Если ушел хост, назначаем нового
            if (wasHost) {
                console.log(`[Host Left Explicitly] Хост ${playerName} покинул комнату ${roomCode}. Назначаем нового.`);
                room.hostId = room.players[0].id; // Назначаем первого оставшегося
                io.to(room.hostId).emit('youAreHostNow');
                 // Обновляем список у всех (важно после смены хоста)
                broadcastPlayerList(roomCode);
            } else {
                 // Если ушел не хост, просто обновляем список у оставшихся
                 broadcastPlayerList(roomCode);
            }

            // Если шел вопрос, проверяем голосование
            if (room.state === 'question') {
                checkAllVoted(roomCode);
            }
        }
    } else {
        console.log(`[Leave Room] Игрок ${socket.id}, запросивший выход, не найден ни в одной комнате.`);
    }
    // Явно отсоединяем сокет от комнаты на сервере (хотя клиент и так уходит)
    // socket.leave(roomCode); // Это может быть излишним, т.к. клиент сам уходит на главный экран
});

    // --- Проверка существования комнаты (перед вводом имени) ---
     socket.on('checkRoomExists', (data) => {
        const roomCode = data.roomCode ? String(data.roomCode).toUpperCase() : null;
        if (!roomCode) return; // Игнорируем пустой запрос

        const room = rooms[roomCode];
        if (room && room.state === 'waiting') { // Проверяем, что комната существует И ожидает игроков
            console.log(`[Room Check] Комната ${roomCode} существует и доступна. Отправка подтверждения клиенту ${socket.id}`);
            socket.emit('roomExists'); // Комната найдена и готова к присоединению
        } else if (room) {
             console.log(`[Room Check] Комната ${roomCode} найдена, но игра уже идет или завершена (состояние: ${room.state}). Отправка ошибки клиенту ${socket.id}`);
             socket.emit('errorMessage', `Game in room ${roomCode} is already in progress or finished.`);
        }
        else {
            console.log(`[Room Check] Комната ${roomCode} не найдена. Отправка ошибки клиенту ${socket.id}`);
            socket.emit('errorMessage', `Room ${roomCode} not found.`);
        }
    });


    // --- Обработка ПРИСОЕДИНЕНИЯ к Комнате ---
        // --- Обработка ПРИСОЕДИНЕНИЯ к Комнате (после ввода имени) ---
    socket.on('joinRoom', (data) => {
    console.log(`[Join Room Attempt] Получен запрос от ${socket.id} с данными:`, data); // <-- ЛОГ 1: Запрос получен?

    const playerName = data.name ? String(data.name).trim() : `User_${socket.id.substring(0,4)}`;
    const roomCode = data.roomCode ? String(data.roomCode).toUpperCase() : null;

    if (!roomCode) {
         console.warn(`[Join Room Error] Отсутствует roomCode у ${socket.id}`);
         socket.emit('errorMessage', 'Room code is missing.');
         return;
    }
    console.log(`[Join Room Attempt] Имя: ${playerName}, Код: ${roomCode}`); // <-- ЛОГ 2: Данные прочитаны

    const room = rooms[roomCode];

    if (!room || room.state !== 'waiting') {
         socket.emit('errorMessage', `Room ${roomCode} is not available for joining right now.`);
         console.warn(`[Join Room Error] Комната ${roomCode} недоступна. Существует: ${!!room}, Состояние: ${room?.state}`);
         return;
    }
     console.log(`[Join Room Attempt] Комната ${roomCode} найдена и в состоянии waiting.`); // <-- ЛОГ 3: Комната ОК

    if (room.players.some(player => player.name.toLowerCase() === playerName.toLowerCase())) {
        socket.emit('errorMessage', `Name "${playerName}" is already taken in this room.`);
        console.log(`[Join Room Error] Имя ${playerName} занято в ${roomCode}`);
        return;
    }
    console.log(`[Join Room Attempt] Имя ${playerName} свободно.`); // <-- ЛОГ 4: Имя ОК

    // ... (Опциональная проверка MAX_PLAYERS) ...

    const newPlayerId = uuidv4();
    room.players.push({ id: socket.id, name: playerName, playerId: newPlayerId });
    socket.join(roomCode);
    console.log(`[Player Joined] Игрок ${playerName} (playerId: ${newPlayerId}, socketId: ${socket.id}) добавлен в ${roomCode}.`); // <-- ЛОГ 5: Игрок добавлен

    socket.emit('roomJoined', {
    roomCode: roomCode,
    players: room.players.map(p => ({ id: p.id, name: p.name, playerId: p.playerId })), // Отправляем полный список
    isHost: false,
    playerId: newPlayerId,
    hostId: room.hostId // <<< Добавляем ID текущего хоста комнаты
});
     console.log(`[Join Room Attempt] Событие 'roomJoined' отправлено ${socket.id}`); // <-- ЛОГ 6: Подтверждение отправлено

    broadcastPlayerList(roomCode); // <-- Оповещение остальных
     console.log(`[Join Room Attempt] Список игроков разослан в ${roomCode}`); // <-- ЛОГ 7: Список разослан
});

// --- Обработка Попытки Переподключения ---
// --- Обработка Попытки Переподключения ---
socket.on('rejoinAttempt', (data) => {
    const playerId = data.playerId ? String(data.playerId) : null;
    const roomCode = data.roomCode ? String(data.roomCode).toUpperCase() : null;
    console.log(`[Rejoin Attempt] От ${socket.id}: playerId=${playerId}, roomCode=${roomCode}`);

    if (!playerId || !roomCode) {
        console.warn(`[Rejoin Failed] Недостаточно данных от ${socket.id}`);
        socket.emit('rejoinFailed', { message: 'Invalid rejoin data provided.' });
        return;
    }

    const room = rooms[roomCode];
    // Ищем индекс игрока с таким playerId ИМЕННО в запрошенной комнате
    const playerIndex = room ? room.players.findIndex(p => p.playerId === playerId) : -1;

    if (room && playerIndex !== -1) {
        // --- Игрок найден в комнате ---
        const player = room.players[playerIndex];
        const oldSocketId = player.id; // Запоминаем старый ID на случай, если он был хостом
        console.log(`[Rejoin] Найден игрок ${player.name} (playerId: ${playerId}). Старый socketId: ${oldSocketId}, Новый: ${socket.id}`);

        // Обновляем socket.id игрока на новый
        player.id = socket.id;
        // Присоединяем новый сокет к комнате Socket.IO
        socket.join(roomCode);

        // --- Обновление статуса хоста ---
        let isRejoiningClientHost = false; // Флаг для ответа клиенту
        // Проверяем, был ли СТАРЫЙ сокет этого игрока хостом
        if (room.hostId === oldSocketId) {
            console.log(`[Rejoin] Игрок ${player.name} был хостом. Обновляем hostId на ${socket.id}.`);
            room.hostId = socket.id; // Обновляем hostId на НОВЫЙ socket.id
            isRejoiningClientHost = true;
        } else {
            // Иначе проверяем, является ли ТЕКУЩИЙ сокет (уже обновленный) хостом
            // (на случай, если хост сменился, пока игрок был офлайн, и назначили именно его)
            isRejoiningClientHost = (room.hostId === socket.id);
            console.log(`[Rejoin] Игрок ${player.name} не был хостом (старый ID: ${oldSocketId}). Текущий хост: ${room.hostId}. Этот игрок хост: ${isRejoiningClientHost}`);
        }
        // --- Конец обновления статуса хоста ---


        // Если для этого игрока был таймер отключения, удаляем его
        if (room.disconnectTimers && room.disconnectTimers[playerId]) {
            clearTimeout(room.disconnectTimers[playerId]);
            delete room.disconnectTimers[playerId];
            console.log(`[Rejoin] Таймер отключения для ${playerId} отменен.`);
        }

        // Отправляем обновленный список игроков всем в комнате
        broadcastPlayerList(roomCode);

        // Отправляем переподключившемуся игроку подтверждение и актуальное состояние игры
        const currentGameState = getCurrentGameState(roomCode, playerId); // playerId нужен для получения myVote
        socket.emit('rejoinSuccess', {
            roomCode: roomCode,
            players: room.players.map(p => ({ id: p.id, name: p.name, playerId: p.playerId })),
            isHost: isRejoiningClientHost, // Используем флаг, который мы только что определили
            gameState: currentGameState
        });

        console.log(`[Rejoin Success] Игроку ${player.name} (хост: ${isRejoiningClientHost}) отправлено состояние: ${currentGameState.state}`);

    } else {
        // --- Игрок не найден или комнаты нет ---
         console.warn(`[Rejoin Failed] Игрок ${playerId} не найден в комнате ${roomCode} (Комната существует: ${!!room})`);
         let message = `Could not rejoin room ${roomCode}. `;
         if (!room) {
             message += 'Room does not exist or has expired.';
         } else {
             message += 'You are not part of this game session or were removed due to inactivity.';
         }
         socket.emit('rejoinFailed', { message: message });
    }
});

    // --- Обработка НАЧАЛА ИГРЫ ---
    socket.on('startGame', () => {
        const roomEntry = findRoomBySocketId(socket.id);
        if (!roomEntry) {
             console.warn(`[Start Game Error] Игрок ${socket.id} попытался начать игру, не находясь в комнате.`);
             return;
        }
        const [roomCode, room] = roomEntry;

        // Проверки: этот игрок - ведущий? Комната в ожидании? Достаточно игроков?
        if (room.hostId !== socket.id) {
            console.warn(`[Start Game Error] Игрок ${socket.id} попытался начать игру в ${roomCode}, не будучи ведущим.`);
            return;
        }
        if (room.state !== 'waiting') {
            console.warn(`[Start Game Error] Попытка начать игру в ${roomCode}, которая не в состоянии ожидания (state: ${room.state}).`);
            return;
        }
        const MIN_PLAYERS = 2; // Минимум игроков для старта (можно 1 для теста, или 2 для реальной игры)
        if (room.players.length < MIN_PLAYERS) {
            socket.emit('errorMessage', `Need at least ${MIN_PLAYERS} player(s) to start.`);
            console.log(`[Start Game Info] Попытка начать игру в ${roomCode} с ${room.players.length} игроками.`);
            return;
        }

        // --- Перемешиваем вопросы для ЭТОЙ игровой сессии ---
        if (allQuestions.length > 0) {
            room.shuffledQuestions = shuffleArray(allQuestions); // Создаем уникальный порядок для этой комнаты
            room.currentQuestionIndex = -1; // Сбрасываем индекс перед первым вопросом
            console.log(`[Game Started] Ведущий ${socket.id} начал игру в ${roomCode}. Перемешано ${room.shuffledQuestions.length} вопросов.`);
            sendNextQuestion(roomCode); // Отправляем первый вопрос
        } else {
            // Случай, если вопросы не загрузились при старте сервера
            console.error(`[Start Game Error] Невозможно начать игру в ${roomCode}: нет загруженных вопросов!`);
            io.to(roomCode).emit('errorMessage', 'Error: Could not load questions. Cannot start game.');
            endGame(roomCode, 'Question loading error.'); // Завершаем игру в этой комнате
        }
    });


    // --- Обработка ГОЛОСА от игрока ---
    // --- Обработка ГОЛОСА от игрока ---
socket.on('submitVote', (data) => {
    const vote = data.vote; // 'yes' или 'no'
    // console.log(`[Vote Received] От ${socket.id}: ${vote}`); // Базовый лог получения

    const roomEntry = findRoomBySocketId(socket.id);
    if (!roomEntry) {
        console.error(`[Vote Error] Комната для ${socket.id} не найдена при попытке голосования!`);
        return;
    }
    const [roomCode, room] = roomEntry;

    // Проверяем состояние комнаты и валидность голоса
    if (room.state !== 'question' || (vote !== 'yes' && vote !== 'no')) {
        console.warn(`[Vote Rejected] Неверное состояние (${room.state}) или голос (${vote}) от ${socket.id} в ${roomCode}`);
        return;
    }

    // --- ИЗМЕНЕНИЕ: Используем playerId ---
    const player = room.players.find(p => p.id === socket.id); // Находим объект игрока по socket.id
    if (!player) { // Доп. проверка, если игрок не найден (маловероятно)
         console.error(`[Vote Error] Не найден объект игрока для ${socket.id} в комнате ${roomCode}`);
         return;
    }
    const playerId = player.playerId; // <<< Получаем ПОСТОЯННЫЙ playerId
    const playerName = player.name; // <<< Получаем имя для лога

    // Проверяем, не голосовал ли уже по playerId
    if (room.votes[playerId] !== undefined) { // <<< Проверяем голос по playerId
        console.warn(`[Vote Rejected] Повторный голос от ${playerName} (playerId: ${playerId}) в ${roomCode}`);
        return;
    }

    // Записываем голос по playerId
    room.votes[playerId] = vote; // <<< СОХРАНЯЕМ ГОЛОС ПО playerId
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---

    // --- ДОБАВЛЕНИЕ: Подробный лог ---
    console.log(`[Vote Accepted] ${socket.id} (${playerName}) в ${roomCode} проголосовал: ${vote}. Голос сохранен для playerId: ${playerId}.`);
    // Логируем ВСЕ текущие голоса в комнате (ключи - playerId)
    console.log(`[Vote Accepted] Текущие голоса в ${roomCode}:`, JSON.stringify(room.votes)); // <<< ВАЖНЫЙ ЛОГ СОХРАНЕННЫХ ГОЛОСОВ
    // --- КОНЕЦ ДОБАВЛЕНИЯ ---

    // Проверяем, все ли проголосовали
    checkAllVoted(roomCode);
});


    // --- Обработка запроса на СЛЕДУЮЩИЙ ВОПРОС ---
    socket.on('nextQuestion', () => {
         const roomEntry = findRoomBySocketId(socket.id);
         if (!roomEntry) return;
         const [roomCode, room] = roomEntry;

         // Проверки: ведущий ли и в правильном ли состоянии комната
         if (room.hostId !== socket.id) {
             console.warn(`[Next Question Error] Игрок ${socket.id} запросил след. вопрос в ${roomCode}, не будучи ведущим.`);
             return;
         }
         if (room.state !== 'results') {
             console.warn(`[Next Question Error] Попытка запросить след. вопрос в ${roomCode} не из экрана результатов (state: ${room.state}).`);
             return;
         }

         console.log(`[Next Question] Ведущий ${socket.id} запросил следующий вопрос в комнате ${roomCode}`);
         sendNextQuestion(roomCode); // Отправляем следующий вопрос
    });


    // --- Обработка ОТКЛЮЧЕНИЯ пользователя ---
        // --- Обработка ОТКЛЮЧЕНИЯ пользователя ---
    socket.on('disconnect', (reason) => {
        console.log(`[Disconnect] Пользователь ${socket.id} отключился. Причина: ${reason}`);
        const roomEntry = findRoomBySocketId(socket.id); // Ищем комнату по socket.id отключающегося

        if (roomEntry) {
            const [roomCode, room] = roomEntry;

            // Игнорируем, если комната уже завершена (на всякий случай)
            if (room.state === 'finished') {
                 console.log(`[Disconnect] Игрок ${socket.id} отключается от уже завершенной комнаты ${roomCode}.`);
                 return;
            }

            // Находим индекс и данные игрока по его ТЕКУЩЕМУ (отключающемуся) socket.id
            const playerIndex = room.players.findIndex(p => p.id === socket.id);

            // Если игрока с таким socket.id уже нет в комнате (например, он уже переподключился с новым id)
            if (playerIndex === -1) {
                console.log(`[Disconnect] Игрок с socket.id ${socket.id} не найден в активном списке игроков комнаты ${roomCode} (возможно, уже переподключился или удален).`);
                return; // Ничего не делаем
            }

            // Получаем постоянные данные игрока (playerId и имя)
            const player = room.players[playerIndex];
            const playerId = player.playerId;
            const playerName = player.name;
            const wasHost = room.hostId === socket.id; // Был ли этот отключающийся сокет хостом

            console.log(`[Player Disconnected] Игрок ${playerName} (playerId: ${playerId}, socketId: ${socket.id}) отключается от комнаты ${roomCode}`);

            // --- ЗАПУСК ТАЙМЕРА НЕАКТИВНОСТИ ---
            // Не удаляем игрока сразу, а даем ему шанс переподключиться
            const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 минуты
            console.log(`[Disconnect Timer] Запуск таймера неактивности для ${playerName} (${playerId}) на ${INACTIVITY_TIMEOUT_MS / 1000} сек.`);

            // Очищаем предыдущий таймер для этого playerId, если он вдруг был
            if (room.disconnectTimers && room.disconnectTimers[playerId]) {
                clearTimeout(room.disconnectTimers[playerId]);
                console.log(`[Disconnect Timer] Очищен предыдущий таймер для ${playerId}.`);
            }

            // Создаем новый таймер
            room.disconnectTimers[playerId] = setTimeout(() => {
                 // --- ТАЙМЕР НЕАКТИВНОСТИ СРАБОТАЛ ---
                 console.log(`[Inactivity Timeout] Сработал тайм-аут неактивности для ${playerName} (${playerId}) в комнате ${roomCode}.`);

                 // Проверяем, что комната все еще существует
                 const currentRoom = rooms[roomCode];
                 if (currentRoom) {
                     // Ищем игрока по playerId в ТЕКУЩЕМ списке игроков комнаты
                     const currentPlayerIndex = currentRoom.players.findIndex(p => p.playerId === playerId);

                     if (currentPlayerIndex !== -1) { // Если игрок с таким playerId все еще в списке
                         const currentPlayer = currentRoom.players[currentPlayerIndex];
                         // Удаляем игрока, ТОЛЬКО ЕСЛИ его socket.id НЕ изменился (т.е. он не переподключился)
                         if (currentPlayer.id === socket.id) {
                             console.log(`[Inactivity Timeout] Игрок ${playerName} (${playerId}) не переподключился вовремя. Удаляем.`);
                             currentRoom.players.splice(currentPlayerIndex, 1); // Удаляем из массива
                             delete currentRoom.votes[playerId]; // Удаляем его голос, если был

                             // Проверяем, не осталась ли комната пустой
                             if (currentRoom.players.length === 0) {
                                 console.log(`[Inactivity Timeout] Комната ${roomCode} стала пустой после тайм-аута. Завершаем игру.`);
                                 endGame(roomCode, "Last player timed out.");
                             } else {
                                 // Если удалили хоста по тайм-ауту
                                 if (currentRoom.hostId === socket.id) { // Сравниваем со старым ID!
                                     console.log(`[Inactivity Timeout] Хост ${playerName} удален по тайм-ауту. Назначаем нового.`);
                                     currentRoom.hostId = currentRoom.players[0].id; // Назначаем первого оставшегося
                                     io.to(currentRoom.hostId).emit('youAreHostNow');
                                 }
                                 // Обновляем список у оставшихся
                                 broadcastPlayerList(roomCode);
                                 // Если шел вопрос, проверяем голосование (т.к. кол-во игроков изменилось)
                                 if (currentRoom.state === 'question') {
                                     checkAllVoted(roomCode);
                                 }
                             }
                         } else {
                              console.log(`[Inactivity Timeout] Игрок ${playerName} (${playerId}) уже переподключился (новый socketId: ${currentPlayer.id}). Таймер не удаляет.`);
                         }
                     } else {
                          console.log(`[Inactivity Timeout] Игрок ${playerId} уже не найден в списке комнаты ${roomCode} к моменту срабатывания таймера.`);
                     }
                 } else {
                     console.log(`[Inactivity Timeout] Комната ${roomCode} уже не существует к моменту срабатывания таймера.`);
                 }
                 // Удаляем запись о таймере из хранилища комнаты
                 if (currentRoom && currentRoom.disconnectTimers) {
                      delete currentRoom.disconnectTimers[playerId];
                 }

            }, INACTIVITY_TIMEOUT_MS);
            // --- КОНЕЦ ЗАПУСКА ТАЙМЕРА ---


            // --- Немедленные действия при disconnect ---
            // Проверяем, нужно ли немедленно назначить нового хоста
            if (wasHost && room.players.length > 1) { // Если ушел хост И есть кому передать (>0 игроков КРОМЕ него)
                // Находим первого игрока, который НЕ является отключающимся хостом
                const potentialNewHost = room.players.find(p => p.id !== socket.id);
                if (potentialNewHost) {
                    console.log(`[Host Disconnected] Ведущий ${playerName} отключился. Назначаем ${potentialNewHost.name} новым хостом *сразу*.`);
                    room.hostId = potentialNewHost.id;
                    io.to(room.hostId).emit('youAreHostNow');
                    broadcastPlayerList(roomCode); // Обновляем список, чтобы все видели статус
                } else {
                     console.warn(`[Host Disconnected] Хост ${playerName} ушел, но не удалось найти нового хоста в ${roomCode} среди ${room.players.length} игроков.`);
                }
            } else if (!wasHost && room.players.length > 0) {
                 // Если ушел НЕ хост, можно опционально обновить список игроков сразу,
                 // чтобы показать статус "отключен" (но мы этого пока не делаем, просто ждем таймера)
                 // broadcastPlayerList(roomCode);
                 console.log(`[Player Disconnected] Игрок ${playerName} (не хост) отключился от ${roomCode}. Ждем таймера неактивности.`);
            }
            // Мы НЕ вызываем checkAllVoted здесь при отключении НЕ хоста,
            // т.к. игрок формально еще числится в комнате до срабатывания таймера.

        } else {
             console.log(`[Disconnect] Отключившийся игрок ${socket.id} не найден ни в одной активной комнате.`);
        }
    });

}); // Конец io.on('connection', ...)


// =========================
// --- ИГРОВЫЕ ФУНКЦИИ ---
// =========================
// Функция для получения текущего состояния игры для отправки клиенту

// Функция для получения текущего состояния игры для отправки клиенту
function getCurrentGameState(roomCode, playerId) { // playerId передается для поиска голоса
    const room = rooms[roomCode];
    if (!room) return { state: 'finished' }; // Если комнаты нет, считаем игру законченной

    const baseState = {
        state: room.state,
        // Дополнительные поля будут добавлены ниже
    };

    if (room.state === 'question' || room.state === 'results') {
        const questionIndex = room.currentQuestionIndex;
        const question = (room.shuffledQuestions && questionIndex >= 0 && questionIndex < room.shuffledQuestions.length)
                     ? room.shuffledQuestions[questionIndex]
                     : null;

        baseState.questionNumber = questionIndex + 1;
        baseState.questionText = question ? question.text : "Question loading error";

        if (room.state === 'question') {
            // Рассчитываем оставшееся время
            let durationLeft = VOTE_DURATION_SECONDS;
            if (room.timer && room.timer.startTime) {
               const elapsed = (Date.now() - room.timer.startTime) / 1000;
               durationLeft = Math.max(0, Math.round(VOTE_DURATION_SECONDS - elapsed));
            }
            baseState.durationLeft = durationLeft;

            // --- ДОБАВЛЕНИЕ: Логирование поиска голоса ---
            // Ищем голос по ПЕРЕДАННОМУ playerId
            const playersVote = room.votes[playerId]; // Ищем голос по playerId
            console.log(`[GetGameState] Для playerId ${playerId} в комнате ${roomCode} найден голос: ${playersVote === undefined ? 'undefined' : playersVote}. Все голоса в комнате:`, JSON.stringify(room.votes)); // <<< ЛОГ ПРОВЕРКИ ГОЛОСА
            baseState.myVote = playersVote === undefined ? null : playersVote; // Отправляем 'yes', 'no' или null
            // --- КОНЕЦ ДОБАВЛЕНИЯ ---

        } else if (room.state === 'results') {
            // Собираем результаты (ключи в room.votes УЖЕ playerId)
            let yesVotes = 0;
            let noVotes = 0;
            Object.values(room.votes || {}).forEach(vote => {
                if (vote === 'yes') yesVotes++;
                else if (vote === 'no') noVotes++;
            });
            baseState.results = { yesVotes, noVotes };
        }
    }
    // Для 'waiting' или 'finished' дополнительных полей не нужно

    return baseState;
}

// --- Функция отправки следующего вопроса ---
// --- Функция отправки следующего вопроса ---
function sendNextQuestion(roomCode) {
    const room = rooms[roomCode];
    if (!room) {
        console.error(`[Send Question Error] Попытка отправить вопрос в несуществующую комнату ${roomCode}`);
        return;
    }
     // Дополнительная проверка на случай, если вопросы не были перемешаны при старте
    if (!room.shuffledQuestions || room.shuffledQuestions.length === 0) {
        console.error(`[Send Question Error] В комнате ${roomCode} нет списка вопросов для отправки.`);
        endGame(roomCode, "Internal error: questions list missing.");
        return;
    }

    // Увеличиваем индекс вопроса для комнаты
    room.currentQuestionIndex++;

    // Проверяем, закончились ли вопросы в перемешанном списке этой комнаты
    if (room.currentQuestionIndex >= room.shuffledQuestions.length) {
        console.log(`[Game Flow] Перемешанные вопросы в комнате ${roomCode} закончились.`);
        endGame(roomCode, 'All questions answered for this session!');
        return;
    }

    // Получаем текущий вопрос из УНИКАЛЬНОГО списка этой комнаты
    const question = room.shuffledQuestions[room.currentQuestionIndex];
    room.state = 'question'; // Переводим комнату в состояние "идет вопрос"
    room.votes = {};         // Очищаем голоса предыдущего раунда

    const questionNumber = room.currentQuestionIndex + 1; // Номер вопроса в текущей сессии

    console.log(`[Send Question] Комната ${roomCode}: Отправка вопроса ${questionNumber} ("${question.text}")`);

    // Отправляем событие 'newQuestion' всем клиентам в комнате
    io.to(roomCode).emit('newQuestion', {
        questionNumber: questionNumber,
        questionText: question.text,
        duration: VOTE_DURATION_SECONDS
    });

    // Запускаем таймер на сервере (останавливаем предыдущий, если был)
    if (room.timer) clearTimeout(room.timer);

    const timerStartTime = Date.now(); // <<< Запоминаем время старта таймера

    room.timer = setTimeout(() => {
        // Проверяем, что комната все еще существует и в нужном состоянии перед показом результатов по таймеру
        const currentRoom = rooms[roomCode];
        if(currentRoom && currentRoom.state === 'question') {
             console.log(`[Timer Expired] Время для ответа на вопрос ${questionNumber} в комнате ${roomCode} вышло.`);
             if (currentRoom.timer) currentRoom.timer.startTime = null; // Очищаем время старта при срабатывании
             showResults(roomCode); // Показываем результаты по истечении времени
        } else {
             console.log(`[Timer Expired] Таймер для вопроса ${questionNumber} в комнате ${roomCode} сработал, но комната уже не в состоянии 'question' (state: ${currentRoom?.state}). Результаты не показываем.`);
             // Очищаем startTime на всякий случай
              if (currentRoom && currentRoom.timer) currentRoom.timer.startTime = null;
        }
    }, VOTE_DURATION_SECONDS * 1000);

    room.timer.startTime = timerStartTime; // <<< Сохраняем время старта в объект таймера
}

// --- Функция показа результатов ---
function showResults(roomCode) {
    const room = rooms[roomCode];
    // Проверяем, что комната существует и находится в нужном состоянии
    if (!room || room.state !== 'question') {
        // console.log(`[Show Results] Пропуск для ${roomCode}: комната не найдена или не в состоянии вопроса (state: ${room?.state}).`);
        return; // Не показываем результаты, если состояние неверное
    }


    // Останавливаем таймер (если он еще активен, например, все проголосовали досрочно)
    if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
    }

    room.state = 'results'; // Переводим комнату в состояние "показ результатов"

    // Подсчитываем голоса
    let yesVotes = 0;
    let noVotes = 0;
    const currentVotes = room.votes || {}; // Голоса этого раунда
    Object.values(currentVotes).forEach(vote => {
        if (vote === 'yes') yesVotes++;
        else if (vote === 'no') noVotes++;
    });

    // Получаем текст вопроса из списка этой комнаты
    const questionIndex = room.currentQuestionIndex;
    const question = (room.shuffledQuestions && questionIndex >= 0 && questionIndex < room.shuffledQuestions.length)
                     ? room.shuffledQuestions[questionIndex]
                     : null; // На случай ошибки получаем null

    const questionNumber = questionIndex + 1;
    console.log(`[Show Results] Комната ${roomCode}, Вопрос ${questionNumber}: Показ результатов - ДА: ${yesVotes}, НЕТ: ${noVotes}`);

    // Отправляем результаты всем клиентам в комнате
    io.to(roomCode).emit('showResults', {
        yesVotes,
        noVotes,
        questionText: question ? question.text : "Error: Question text not found" // Отправляем текст вопроса для контекста
    });
}

// --- Функция проверки, все ли проголосовали ---
function checkAllVoted(roomCode) {
    const room = rooms[roomCode];
    // Проверяем, актуальна ли проверка (комната существует и ожидает голоса)
    if (!room || room.state !== 'question') {
        // console.log(`[CheckAllVoted] Пропуск для ${roomCode}: комната не найдена или не в состоянии вопроса.`);
        return;
    }

    const playersInRoom = room.players.length;
    const votesReceived = Object.keys(room.votes).length;
    // console.log(`[CheckAllVoted] В ${roomCode}: ${votesReceived} голосов из ${playersInRoom} игроков.`); // Для отладки

    // Если все активные игроки проголосовали, показываем результаты досрочно
    if (playersInRoom > 0 && votesReceived >= playersInRoom) { // Используем >= на случай гонки состояний
        console.log(`[CheckAllVoted] Все (${votesReceived}/${playersInRoom}) в ${roomCode} проголосовали. Показ результатов.`);
        showResults(roomCode); // Показываем результаты немедленно
    }
}

// --- Функция завершения игры и очистки комнаты ---
function endGame(roomCode, message) {
    const room = rooms[roomCode];
    if (!room) {
        console.log(`[End Game] Попытка завершить уже удаленную комнату ${roomCode}`);
        return;
    }

    console.log(`[End Game] Завершение игры в комнате ${roomCode}. Причина: ${message}`);
    room.state = 'finished'; // Помечаем как завершенную

    // Останавливаем таймер, если он был активен
    if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
    }

    // Отправляем событие gameOver всем в комнате
    io.to(roomCode).emit('gameOver', { message: message });

    // Удаляем комнату из памяти сервера
    // Делаем это с небольшой задержкой, чтобы все успели получить gameOver
    setTimeout(() => {
        if (rooms[roomCode]) { // Проверяем еще раз, вдруг ее удалили в другом месте
             delete rooms[roomCode];
             console.log(`[Room Deleted] Комната ${roomCode} удалена после завершения игры.`);
        }
    }, 1000); // Задержка в 1 секунду перед удалением
}


// ============================
// --- ЗАПУСК HTTP СЕРВЕРА ---
// ============================
const PORT = process.env.PORT || 3000; // Используем порт из окружения или 3000 по умолчанию
server.listen(PORT, () => {
    console.log(`[Server Start] Сервер запущен и слушает порт ${PORT}`);
});