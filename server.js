// --- Необходимые модули ---
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
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
        allQuestions = [{ id: 1, text: "Ошибка: Не удалось загрузить вопросы из файла." }];
    }
} catch (error) {
    console.error("[Server Start] КРИТИЧЕСКАЯ ОШИБКА при загрузке questions.json:", error.message);
    console.error("[Server Start] Убедитесь, что файл questions.json существует в корне проекта, доступен для чтения и содержит валидный JSON массив.");
    // Завершаем работу сервера, т.к. без вопросов игра не имеет смысла
    process.exit(1);
}

// --- Константы игры ---
const VOTE_DURATION_SECONDS = 30; // Увеличенное время на голосование - опционально
const USE_TIMER = false; // Установите в false, чтобы отключить таймер

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
// --- Отправка обновленного списка игроков всем в комнате ---
function broadcastPlayerList(roomCode) {
    try {
        const room = rooms[roomCode];
        if (!room || !room.players) {
            console.warn(`[Broadcast] Комната ${roomCode} не существует или не имеет списка игроков`);
            return;
        }

        const currentHostId = room.hostId; // Получаем ID текущего хоста
        // Отправляем id (socket.id), name, playerId И hostId
        const players = room.players.map(p => ({ 
            id: p.id || 'unknown', 
            name: p.name || 'Unknown Player', 
            playerId: p.playerId || 'unknown' 
        }));
        
        // Добавляем информацию о текущем голосовании, если игра в процессе
        let votingStatus = null;
        if (room.state === 'question') {
            const votesReceived = Object.keys(room.votes || {}).length;
            const totalPlayers = room.players.length;
            votingStatus = { votes: votesReceived, total: totalPlayers };
        }
        
        const broadcastData = {
            players: players,
            hostId: currentHostId, // Добавляем ID хоста
            votingStatus: votingStatus // Добавляем статус голосования
        };

        io.to(roomCode).emit('updatePlayerList', broadcastData);
        
        console.log(`[Broadcast] Обновлен список для ${roomCode}. Хост: ${currentHostId}, Статус голосования: ${JSON.stringify(votingStatus)}`);
    } catch (error) {
        console.error(`[Broadcast Error] Ошибка в broadcastPlayerList для комнаты ${roomCode}:`, error);
    }
}

// --- Поиск комнаты по ID сокета игрока ---
// --- Поиск комнаты по ID сокета игрока ---
function findRoomBySocketId(socketId) {
    try {
        const entry = Object.entries(rooms).find(([code, room]) => {
            // Дополнительные проверки безопасности
            if (!room || !room.players || !Array.isArray(room.players)) {
                console.warn(`[findRoomBySocketId] Комната ${code} имеет некорректную структуру`);
                return false;
            }
            
            return room.players.some(player => {
                // Проверяем, что объект игрока корректный
                return player && player.id === socketId;
            });
        });
        
        if (!entry) {
            console.log(`[findRoomBySocketId] Комната для socketId ${socketId} не найдена`);
        }
        
        return entry;
    } catch (error) {
        console.error(`[findRoomBySocketId] Ошибка при поиске комнаты для ${socketId}:`, error);
        return null;
    }
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

// Поиск игрока по имени в комнате
// Возвращает игрока или null
function findPlayerByNameInRoom(roomCode, playerName) {
    const room = rooms[roomCode];
    if (!room || !room.players) return null;
    
    return room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
}

// Обновление статуса голосования для всех в комнате
// Обновление статуса голосования для всех в комнате
function broadcastVotingStatus(roomCode) {
    try {
        const room = rooms[roomCode];
        if (!room || room.state !== 'question') {
            return;
        }
        
        const votesReceived = Object.keys(room.votes || {}).length;
        const totalPlayers = room.players ? room.players.length : 0;
        
        const statusData = { 
            votes: votesReceived, 
            total: totalPlayers 
        };

        io.to(roomCode).emit('votingStatus', statusData);
        
        console.log(`[Voting Status] Комната ${roomCode}: ${votesReceived}/${totalPlayers} проголосовали`);
    } catch (error) {
        console.error(`[Voting Status Error] Ошибка в broadcastVotingStatus для комнаты ${roomCode}:`, error);
    }
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
        const newPlayerId = uuidv4(); // Генерируем ID для создателя

        rooms[roomCode] = {
            hostId: socket.id,
            players: [{ id: socket.id, name: playerName, playerId: newPlayerId }], // Добавили playerId
            shuffledQuestions: [],
            currentQuestionIndex: -1,
            votes: {},
            state: 'waiting',
            timer: null,
            disconnectTimers: {}, // { playerId: setTimeoutInstance }
            hideTimer: !USE_TIMER // Новое поле для отключения таймера
        };

        socket.join(roomCode);
        console.log(`[Room Created] Игрок ${playerName} (playerId: ${newPlayerId}, socketId: ${socket.id}) создал комнату ${roomCode}`);

        // Отправляем playerId клиенту
        socket.emit('roomJoined', {
            roomCode: roomCode,
            players: rooms[roomCode].players.map(p => ({ id: p.id, name: p.name, playerId: p.playerId })),
            isHost: true,
            playerId: newPlayerId,
            hostId: socket.id,
            playerName: playerName // Сохраняем имя для использования при повторном входе
        });
    });

    // --- Обработка ЯВНОГО ВЫХОДА из комнаты ---
   // --- Обработка ЯВНОГО ВЫХОДА из комнаты ---
// --- Обработка ЯВНОГО ВЫХОДА из комнаты ---
socket.on('leaveRoom', () => {
    console.log(`[Leave Room] Пользователь ${socket.id} запросил выход из комнаты`);
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
            return;
        }

        const player = room.players[playerIndex];
        const playerId = player.playerId;
        const playerName = player.name;
        const wasHost = room.hostId === socket.id;

        console.log(`[Player Left Explicitly] Игрок ${playerName} (playerId: ${playerId}, socketId: ${socket.id}) покидает комнату ${roomCode}`);

        // КРИТИЧЕСКИ ВАЖНО: Отменяем таймер неактивности для этого игрока
        if (room.disconnectTimers && room.disconnectTimers[playerId]) {
            clearTimeout(room.disconnectTimers[playerId]);
            delete room.disconnectTimers[playerId];
            console.log(`[Leave Room] Таймер неактивности для ${playerId} отменен.`);
        }

        // Удаляем игрока из комнаты Socket.IO НЕМЕДЛЕННО
        socket.leave(roomCode);

        // Удаляем игрока из списка СРАЗУ
        room.players.splice(playerIndex, 1);
        
        // Удаляем его голос, если он был
        if (room.votes && room.votes[playerId] !== undefined) {
            delete room.votes[playerId];
            console.log(`[Leave Room] Голос игрока ${playerId} удален`);
        }

        // Проверяем, остался ли кто-то
        if (room.players.length === 0) {
            console.log(`[Room Empty] Комната ${roomCode} пуста после выхода игрока ${playerName}. Завершаем игру.`);
            endGame(roomCode, "Last player left the room.");
        } else {
            // Если ушел хост, назначаем нового
            if (wasHost) {
                console.log(`[Host Left Explicitly] Хост ${playerName} покинул комнату ${roomCode}. Назначаем нового.`);
                room.hostId = room.players[0].id;
                io.to(room.hostId).emit('youAreHostNow');
            }
            
            // Обновляем список у всех оставшихся
            broadcastPlayerList(roomCode);

            // Если шел вопрос, проверяем голосование
            if (room.state === 'question') {
                checkAllVoted(roomCode);
                broadcastVotingStatus(roomCode);
            }
        }

        // Помечаем сокет как "явно вышедший", чтобы disconnect не обрабатывал его повторно
        socket._hasExplicitlyLeft = true;
        
    } else {
        console.log(`[Leave Room] Игрок ${socket.id}, запросивший выход, не найден ни в одной комнате.`);
    }
});
    // --- Проверка существования комнаты (перед вводом имени) ---
    socket.on('checkRoomExists', (data) => {
        const roomCode = data.roomCode ? String(data.roomCode).toUpperCase() : null;
        if (!roomCode) return; // Игнорируем пустой запрос

        const room = rooms[roomCode];
        if (!room) {
            console.log(`[Room Check] Комната ${roomCode} не найдена. Отправка ошибки клиенту ${socket.id}`);
            socket.emit('errorMessage', `Room ${roomCode} not found.`);
            return;
        }
        
        // Комната существует, проверяем её состояние
        if (room.state === 'waiting') {
            // Комната в режиме ожидания, разрешаем вход
            console.log(`[Room Check] Комната ${roomCode} существует и доступна. Отправка подтверждения клиенту ${socket.id}`);
            socket.emit('roomExists');
        } else if (room.state === 'question' || room.state === 'results') {
            // Игра уже идет, проверяем был ли игрок в этой комнате ранее по ID сессии
            // или позволяем присоединиться как новому игроку
            console.log(`[Room Check] Комната ${roomCode} активна (состояние: ${room.state}). Проверяем возможность входа для ${socket.id}`);
            
            // Отправляем информацию о том, что комната активна
            // Клиент сам решит, хочет ли попробовать войти
            socket.emit('canJoinActiveRoom', {
                roomCode: roomCode,
                state: room.state
            });
        } else {
            // Игра завершена или в другом состоянии
            console.log(`[Room Check] Комната ${roomCode} найдена, но игра уже завершена или в необычном состоянии (${room.state}). Отправка ошибки клиенту ${socket.id}`);
            socket.emit('errorMessage', `Game in room ${roomCode} is already finished or in an invalid state.`);
        }
    });

    // --- Обработка запроса на вход в активную комнату ---
    socket.on('joinActiveRoom', (data) => {
        const roomCode = data.roomCode ? String(data.roomCode).toUpperCase() : null;
        const playerName = data.playerName ? String(data.playerName).trim() : `User_${socket.id.substring(0,4)}`;
        
        if (!roomCode) {
            socket.emit('errorMessage', 'Missing room code');
            return;
        }
        
        const room = rooms[roomCode];
        if (!room) {
            socket.emit('errorMessage', `Room ${roomCode} no longer exists.`);
            return;
        }
        
        // Проверяем, может быть имя уже используется
        if (findPlayerByNameInRoom(roomCode, playerName)) {
            socket.emit('errorMessage', `Name "${playerName}" is already taken in this room.`);
            return;
        }
        
        // Присоединяем к комнате
        const newPlayerId = uuidv4();
        room.players.push({ id: socket.id, name: playerName, playerId: newPlayerId });
        socket.join(roomCode);
        
        console.log(`[Join Active Room] Игрок ${playerName} (${newPlayerId}) присоединился к активной комнате ${roomCode} в состоянии ${room.state}`);
        
        // Отправляем игроку подтверждение
        socket.emit('roomJoined', {
            roomCode: roomCode,
            players: room.players.map(p => ({ id: p.id, name: p.name, playerId: p.playerId })),
            isHost: false,
            playerId: newPlayerId,
            hostId: room.hostId,
            playerName: playerName
        });
        
        // Сохраняем в базовую игровую информацию, что игрок новый
        room.newPlayers = room.newPlayers || new Set();
        room.newPlayers.add(newPlayerId);
        
        // Обновляем список игроков у всех
        broadcastPlayerList(roomCode);
        
        // Если игра уже идет, сразу отправляем текущее состояние
        const gameState = getCurrentGameState(roomCode, newPlayerId);
        socket.emit('rejoinSuccess', {
            roomCode: roomCode,
            players: room.players.map(p => ({ id: p.id, name: p.name, playerId: p.playerId })),
            isHost: false,
            gameState: gameState,
            hostId: room.hostId
        });
        
        // Если идет вопрос, обновляем статус голосования
        if (room.state === 'question') {
            broadcastVotingStatus(roomCode);
        }
    });

    // --- Обработка ПРИСОЕДИНЕНИЯ к Комнате ---
    socket.on('joinRoom', (data) => {
        console.log(`[Join Room Attempt] Получен запрос от ${socket.id} с данными:`, data);

        const playerName = data.name ? String(data.name).trim() : `User_${socket.id.substring(0,4)}`;
        const roomCode = data.roomCode ? String(data.roomCode).toUpperCase() : null;

        if (!roomCode) {
            console.warn(`[Join Room Error] Отсутствует roomCode у ${socket.id}`);
            socket.emit('errorMessage', 'Room code is missing.');
            return;
        }
        console.log(`[Join Room Attempt] Имя: ${playerName}, Код: ${roomCode}`);

        const room = rooms[roomCode];

        if (!room || room.state !== 'waiting') {
            socket.emit('errorMessage', `Room ${roomCode} is not available for joining right now.`);
            console.warn(`[Join Room Error] Комната ${roomCode} недоступна. Существует: ${!!room}, Состояние: ${room?.state}`);
            return;
        }
        console.log(`[Join Room Attempt] Комната ${roomCode} найдена и в состоянии waiting.`);

        if (room.players.some(player => player.name.toLowerCase() === playerName.toLowerCase())) {
            socket.emit('errorMessage', `Name "${playerName}" is already taken in this room.`);
            console.log(`[Join Room Error] Имя ${playerName} занято в ${roomCode}`);
            return;
        }
        console.log(`[Join Room Attempt] Имя ${playerName} свободно.`);

        // ... (Опциональная проверка MAX_PLAYERS) ...

        const newPlayerId = uuidv4();
        room.players.push({ id: socket.id, name: playerName, playerId: newPlayerId });
        socket.join(roomCode);
        console.log(`[Player Joined] Игрок ${playerName} (playerId: ${newPlayerId}, socketId: ${socket.id}) добавлен в ${roomCode}.`);

        socket.emit('roomJoined', {
            roomCode: roomCode,
            players: room.players.map(p => ({ id: p.id, name: p.name, playerId: p.playerId })),
            isHost: false,
            playerId: newPlayerId,
            hostId: room.hostId,
            playerName: playerName // Сохраняем имя для повторного входа
        });
        console.log(`[Join Room Attempt] Событие 'roomJoined' отправлено ${socket.id}`);

        broadcastPlayerList(roomCode);
        console.log(`[Join Room Attempt] Список игроков разослан в ${roomCode}`);
    });

    // --- Обработка Попытки Переподключения ---
    socket.on('rejoinAttempt', (data) => {
        const playerId = data.playerId ? String(data.playerId) : null;
        const roomCode = data.roomCode ? String(data.roomCode).toUpperCase() : null;
        const playerName = data.playerName || null; // Получаем имя игрока, если оно есть
        
        console.log(`[Rejoin Attempt] От ${socket.id}: playerId=${playerId}, roomCode=${roomCode}, playerName=${playerName}`);

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
                gameState: currentGameState,
                hostId: room.hostId
            });

            // Обновляем статус голосования, если игра в процессе
            if (room.state === 'question') {
                broadcastVotingStatus(roomCode);
            }

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
    socket.on('submitVote', (data) => {
        if (socket._hasExplicitlyLeft) {
        console.log(`[Vote Rejected] Игнорируем голос от уже вышедшего игрока ${socket.id}`);
        return;
    }
        const vote = data.vote; // 'yes' или 'no'

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

        // Используем playerId
        const player = room.players.find(p => p.id === socket.id); // Находим объект игрока по socket.id
        if (!player) { // Доп. проверка, если игрок не найден (маловероятно)
             console.error(`[Vote Error] Не найден объект игрока для ${socket.id} в комнате ${roomCode}`);
             return;
        }
        const playerId = player.playerId; // Получаем ПОСТОЯННЫЙ playerId
        const playerName = player.name; // Получаем имя для лога

        // Проверяем, не голосовал ли уже по playerId
        if (room.votes[playerId] !== undefined) { // Проверяем голос по playerId
            console.warn(`[Vote Rejected] Повторный голос от ${playerName} (playerId: ${playerId}) в ${roomCode}`);
            return;
        }

        // Записываем голос по playerId
        room.votes[playerId] = vote; // СОХРАНЯЕМ ГОЛОС ПО playerId
        console.log(`[Vote Accepted] ${socket.id} (${playerName}) в ${roomCode} проголосовал: ${vote}. Голос сохранен для playerId: ${playerId}.`);
        
        // Обновляем статус голосования для всех клиентов
        broadcastVotingStatus(roomCode);
        
        // Проверяем, все ли проголосовали
        checkAllVoted(roomCode);
    });

    // --- Обработка запроса на ПРИНУДИТЕЛЬНЫЙ показ результатов от хоста ---
    socket.on('forceShowResults', () => {
        const roomEntry = findRoomBySocketId(socket.id);
        if (!roomEntry) {
            console.warn(`[Force Results Error] Игрок ${socket.id} попытался показать результаты, не находясь в комнате.`);
            return;
        }
        const [roomCode, room] = roomEntry;

        // Проверки: этот игрок - ведущий? Комната в процессе вопроса?
        if (room.hostId !== socket.id) {
            console.warn(`[Force Results Error] Игрок ${socket.id} попытался показать результаты в ${roomCode}, не будучи ведущим.`);
            return;
        }
        if (room.state !== 'question') {
            console.warn(`[Force Results Error] Попытка показать результаты в ${roomCode}, которая не в состоянии вопроса (state: ${room.state}).`);
            return;
        }

        console.log(`[Force Results] Ведущий ${socket.id} запросил показ результатов в комнате ${roomCode}`);
        showResults(roomCode); // Показываем результаты принудительно
    });

    // Обновите обработчик nextQuestion
socket.on('nextQuestion', () => {
    const roomEntry = findRoomBySocketId(socket.id);
    if (!roomEntry) {
        console.warn(`[Next Question Error] Игрок ${socket.id} не найден в комнате`);
        return;
    }
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
    
    // *** ВАЖНОЕ ИЗМЕНЕНИЕ: Полностью очищаем голоса перед отправкой следующего вопроса ***
    room.votes = {};
    console.log(`[Next Question] Объект votes очищен для комнаты ${roomCode}: ${JSON.stringify(room.votes)}`);
    
    // Небольшая задержка для синхронизации клиентов
    setTimeout(() => {
        sendNextQuestion(roomCode);
    }, 200);
    });

    // --- Обработка ОТКЛЮЧЕНИЯ пользователя ---
    // --- Обработка ОТКЛЮЧЕНИЯ пользователя ---
    socket.on('disconnect', (reason) => {
    console.log(`[Disconnect] Пользователь ${socket.id} отключился. Причина: ${reason}`);
    
    // ВАЖНО: Если игрок уже явно вышел, игнорируем disconnect
    if (socket._hasExplicitlyLeft) {
        console.log(`[Disconnect] Игрок ${socket.id} уже явно вышел, игнорируем disconnect`);
        return;
    }
    
    const roomEntry = findRoomBySocketId(socket.id);

    if (roomEntry) {
        const [roomCode, room] = roomEntry;

        // Игнорируем, если комната уже завершена
        if (room.state === 'finished') {
            console.log(`[Disconnect] Игрок ${socket.id} отключается от уже завершенной комнаты ${roomCode}.`);
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);

        if (playerIndex === -1) {
            console.log(`[Disconnect] Игрок с socket.id ${socket.id} не найден в активном списке игроков комнаты ${roomCode}.`);
            return;
        }

        const player = room.players[playerIndex];
        const playerId = player.playerId;
        const playerName = player.name;
        const wasHost = room.hostId === socket.id;

        console.log(`[Player Disconnected] Игрок ${playerName} (playerId: ${playerId}, socketId: ${socket.id}) отключается от комнаты ${roomCode}`);

        // --- ЗАПУСК ТАЙМЕРА НЕАКТИВНОСТИ (только для неявного отключения) ---
        const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 минуты
        console.log(`[Disconnect Timer] Запуск таймера неактивности для ${playerName} (${playerId}) на ${INACTIVITY_TIMEOUT_MS / 1000} сек.`);

        // Очищаем предыдущий таймер для этого playerId, если он был
        if (room.disconnectTimers && room.disconnectTimers[playerId]) {
            clearTimeout(room.disconnectTimers[playerId]);
            console.log(`[Disconnect Timer] Очищен предыдущий таймер для ${playerId}.`);
        }

        // Инициализируем disconnectTimers если его нет
        if (!room.disconnectTimers) {
            room.disconnectTimers = {};
        }

        // Создаем новый таймер
        room.disconnectTimers[playerId] = setTimeout(() => {
            console.log(`[Inactivity Timeout] Сработал тайм-аут неактивности для ${playerName} (${playerId}) в комнате ${roomCode}.`);

            const currentRoom = rooms[roomCode];
            if (currentRoom) {
                const currentPlayerIndex = currentRoom.players.findIndex(p => p.playerId === playerId);

                if (currentPlayerIndex !== -1) {
                    const currentPlayer = currentRoom.players[currentPlayerIndex];
                    
                    // Удаляем игрока, ТОЛЬКО ЕСЛИ его socket.id НЕ изменился (т.е. он не переподключился)
                    if (currentPlayer.id === socket.id) {
                        console.log(`[Inactivity Timeout] Игрок ${playerName} (${playerId}) не переподключился вовремя. Удаляем.`);
                        
                        // Удаляем игрока из списка
                        currentRoom.players.splice(currentPlayerIndex, 1);
                        
                        // Удаляем его голос
                        if (currentRoom.votes && currentRoom.votes[playerId] !== undefined) {
                            delete currentRoom.votes[playerId];
                        }

                        if (currentRoom.players.length === 0) {
                            console.log(`[Inactivity Timeout] Комната ${roomCode} стала пустой после тайм-аута. Завершаем игру.`);
                            endGame(roomCode, "Last player timed out.");
                        } else {
                            // Если удалили хоста по тайм-ауту
                            if (currentRoom.hostId === socket.id) {
                                console.log(`[Inactivity Timeout] Хост ${playerName} удален по тайм-ауту. Назначаем нового.`);
                                currentRoom.hostId = currentRoom.players[0].id;
                                io.to(currentRoom.hostId).emit('youAreHostNow');
                            }
                            
                            broadcastPlayerList(roomCode);
                            
                            if (currentRoom.state === 'question') {
                                checkAllVoted(roomCode);
                                broadcastVotingStatus(roomCode);
                            }
                        }
                    } else {
                        console.log(`[Inactivity Timeout] Игрок ${playerName} (${playerId}) уже переподключился (новый socketId: ${currentPlayer.id}). Таймер не удаляет.`);
                    }
                } else {
                    console.log(`[Inactivity Timeout] Игрок ${playerId} уже не найден в списке комнаты ${roomCode} к моменту срабатывания таймера.`);
                }
            }
            
            // Очищаем таймер из хранилища
            if (currentRoom && currentRoom.disconnectTimers) {
                delete currentRoom.disconnectTimers[playerId];
            }

        }, INACTIVITY_TIMEOUT_MS);

        // --- Немедленные действия при disconnect ---
        // Назначаем нового хоста если нужно
        if (wasHost && room.players.length > 1) {
            const potentialNewHost = room.players.find(p => p.id !== socket.id);
            if (potentialNewHost) {
                console.log(`[Host Disconnected] Ведущий ${playerName} отключился. Назначаем ${potentialNewHost.name} новым хостом.`);
                room.hostId = potentialNewHost.id;
                io.to(room.hostId).emit('youAreHostNow');
                broadcastPlayerList(roomCode);
            }
        }
        
        // Обновляем статус голосования если игра идет
        if (room.state === 'question') {
            broadcastVotingStatus(roomCode);
        }
    } else {
        console.log(`[Disconnect] Отключившийся игрок ${socket.id} не найден ни в одной активной комнате.`);
    }
});
}); // Конец io.on('connection', ...)

// =========================
// --- ИГРОВЫЕ ФУНКЦИИ ---
// =========================

function getCurrentGameState(roomCode, playerId) { // playerId нужен для получения myVote
    const room = rooms[roomCode];
    if (!room) return { state: 'finished' }; // Если комнаты нет, считаем игру законченной

    const baseState = {
        state: room.state,
        hideTimer: room.hideTimer || !USE_TIMER // Пересылаем настройку таймера
    };

    // Если игра идет (вопрос) или только что показали результаты
    if (room.state === 'question' || room.state === 'results') {
        const questionIndex = room.currentQuestionIndex;
        // Получаем вопрос из списка этой комнаты
        const question = (room.shuffledQuestions && questionIndex >= 0 && questionIndex < room.shuffledQuestions.length)
                     ? room.shuffledQuestions[questionIndex]
                     : null;

        // Используем ID из JSON
        baseState.questionId = question ? question.id : null; // Получаем и добавляем ID из JSON
        baseState.questionText = question ? question.text : "Question loading error";

        if (room.state === 'question') {
            // Рассчитываем оставшееся время, если таймер включен
            if (!room.hideTimer && USE_TIMER) {
                let durationLeft = VOTE_DURATION_SECONDS;
                if (room.timer && room.timer.startTime) { // Используем сохраненное время старта
                   const elapsed = (Date.now() - room.timer.startTime) / 1000;
                   durationLeft = Math.max(0, Math.round(VOTE_DURATION_SECONDS - elapsed));
                }
                baseState.durationLeft = durationLeft;
            }

            // Получаем голос конкретного игрока по его playerId
            const playersVote = room.votes[playerId]; // Ищем голос по playerId
            baseState.myVote = playersVote === undefined ? null : playersVote; // Отправляем 'yes', 'no' или null
            
            // Добавляем статистику голосования
            const votesReceived = Object.keys(room.votes || {}).length;
            const totalPlayers = room.players.length;
            baseState.votingStatus = { votes: votesReceived, total: totalPlayers };
        } else if (room.state === 'results') {
            // Собираем результаты (ключи в room.votes - это playerId)
            let yesVotes = 0;
            let noVotes = 0;
            Object.values(room.votes || {}).forEach(vote => {
                if (vote === 'yes') yesVotes++;
                else if (vote === 'no') noVotes++;
            });
            baseState.results = { yesVotes, noVotes };
            // Добавляем голос игрока и для экрана результатов, чтобы клиент мог его использовать при реконнекте
            const playersVote = room.votes[playerId];
            baseState.myVote = playersVote === undefined ? null : playersVote;
        }
    }
    // Для 'waiting' или 'finished' дополнительных полей не нужно

    return baseState;
}

// --- Функция отправки следующего вопроса ---
function sendNextQuestion(roomCode) {
    const room = rooms[roomCode];
    if (!room) {
        console.error(`[Send Question Error] Попытка отправить вопрос в несуществующую комнату ${roomCode}`);
        return;
    }
    if (!room.shuffledQuestions || room.shuffledQuestions.length === 0) {
        console.error(`[Send Question Error] В комнате ${roomCode} нет списка вопросов для отправки.`);
        endGame(roomCode, "Internal error: questions list missing.");
        return;
    }

    room.currentQuestionIndex++; // Увеличиваем индекс вопроса для комнаты

    // Проверяем, закончились ли вопросы в перемешанном списке этой комнаты
    if (room.currentQuestionIndex >= room.shuffledQuestions.length) {
        console.log(`[Game Flow] Перемешанные вопросы в комнате ${roomCode} закончились.`);
        endGame(roomCode, 'All questions answered for this session!');
        return;
    }

    // Получаем ТЕКУЩИЙ вопрос из УНИКАЛЬНОГО списка этой комнаты
    const question = room.shuffledQuestions[room.currentQuestionIndex];
    if (!question || typeof question.text === 'undefined' || typeof question.id === 'undefined') {
        console.error(`[Send Question Error] Некорректный объект вопроса для индекса ${room.currentQuestionIndex} в комнате ${roomCode}:`, question);
        endGame(roomCode, "Internal error retrieving question data.");
        return;
    }

    room.state = 'question'; // Переводим комнату в состояние "идет вопрос"
    room.votes = {};         // Очищаем голоса предыдущего раунда

    // Используем ID из JSON
    const questionId = question.id;       // Получаем ID из объекта вопроса
    const questionText = question.text;   // Получаем текст
    const sessionQuestionNumber = room.currentQuestionIndex + 1; // Порядковый номер для логов сервера

    console.log(`[Send Question] Комната ${roomCode}: Отправка вопроса (ID: ${questionId}, Порядковый в сессии: ${sessionQuestionNumber}) Текст: "${questionText}"`);

    // Отправляем событие 'newQuestion' всем клиентам в комнате с ID из JSON
    io.to(roomCode).emit('newQuestion', {
        questionId: questionId,
        questionText: questionText,
        duration: VOTE_DURATION_SECONDS,
        hideTimer: room.hideTimer || !USE_TIMER // Передаем флаг скрытия таймера
    });

    // Сбрасываем статус голосования и отправляем начальное значение
    broadcastVotingStatus(roomCode);

    // Запускаем таймер на сервере только если он включен
    if (!room.hideTimer && USE_TIMER) {
        if (room.timer) clearTimeout(room.timer);
        const timerStartTime = Date.now();
        room.timer = setTimeout(() => {
            const currentRoom = rooms[roomCode]; // Перепроверяем комнату
            if(currentRoom && currentRoom.state === 'question') {
                 console.log(`[Timer Expired] Время для ответа на вопрос (ID: ${questionId}) в ${roomCode} вышло.`);
                 if (currentRoom.timer) currentRoom.timer.startTime = null;
                 showResults(roomCode);
            } else {
                 console.log(`[Timer Expired] Таймер для вопроса (ID: ${questionId}) в ${roomCode} сработал, но комната не в состоянии 'question'.`);
                 if (currentRoom && currentRoom.timer) currentRoom.timer.startTime = null;
            }
        }, VOTE_DURATION_SECONDS * 1000);
        room.timer.startTime = timerStartTime; // Сохраняем время старта
    } else {
        // Если таймер отключен, убедимся что предыдущие таймеры остановлены
        if (room.timer) {
            clearTimeout(room.timer);
            room.timer = null;
        }
    }
}

// --- Функция показа результатов ---
// Полностью замените функцию showResults в server.js
function showResults(roomCode) {
    const room = rooms[roomCode];
    if (!room) {
        console.error(`[CRITICAL] Комната ${roomCode} не существует при попытке показать результаты!`);
        return;
    }
    
    if (room.state !== 'question') {
        console.error(`[CRITICAL] Комната ${roomCode} в неверном состоянии '${room.state}' для показа результатов!`);
        return;
    }
    
    // Останавливаем таймер
    if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
    }
    
    // Меняем состояние
    room.state = 'results';
    
    // Подсчитываем результаты заново, не доверяя предыдущим вычислениям
    let yesVotes = 0;
    let noVotes = 0;
    
    console.log(`[CRITICAL] Все голоса в комнате ${roomCode}:`, JSON.stringify(room.votes));
    
    // Явно итерируем по объекту голосов и считаем
    if (room.votes) {
        for (const [playerId, vote] of Object.entries(room.votes)) {
            if (vote === 'yes') {
                yesVotes++;
            } else if (vote === 'no') {
                noVotes++;
            }
        }
    }
    
    console.log(`[CRITICAL] Подсчитано голосов в комнате ${roomCode}: YES=${yesVotes}, NO=${noVotes}`);
    
    // Получаем данные вопроса с проверками
    let questionId = null;
    let questionText = "Question text unavailable";
    
    try {
        if (room.shuffledQuestions && 
            room.currentQuestionIndex >= 0 && 
            room.currentQuestionIndex < room.shuffledQuestions.length) {
            
            const question = room.shuffledQuestions[room.currentQuestionIndex];
            if (question) {
                questionId = question.id || room.currentQuestionIndex + 1;
                questionText = question.text || "Question text unavailable";
            }
        }
    } catch (error) {
        console.error(`[CRITICAL] Ошибка при получении данных вопроса:`, error);
    }
    
    // Создаем объект результатов
    const resultsData = {
        yesVotes: yesVotes,
        noVotes: noVotes,
        questionId: questionId,
        questionText: questionText
    };
    
    console.log(`[CRITICAL] Отправка результатов в комнату ${roomCode}:`, JSON.stringify(resultsData));
    
    // Отправляем результаты всем в комнате
    io.to(roomCode).emit('showResults', resultsData);
    
    // Дополнительно отправляем каждому игроку индивидуально (для надежности)
    if (room.players && room.players.length > 0) {
        room.players.forEach(player => {
            try {
                console.log(`[CRITICAL] Отправка персональных результатов для ${player.name} (${player.id})`);
                io.to(player.id).emit('showResults', resultsData);
            } catch (error) {
                console.error(`[CRITICAL] Ошибка отправки персональных результатов:`, error);
            }
        });
    }
}

// --- Функция проверки, все ли проголосовали ---
// --- Функция проверки, все ли проголосовали ---
function checkAllVoted(roomCode) {
    try {
        const room = rooms[roomCode];
        // Проверяем, актуальна ли проверка (комната существует и ожидает голоса)
        if (!room || room.state !== 'question') {
            return;
        }

        const playersInRoom = room.players ? room.players.length : 0;
        
        // Максимально надежный подсчет голосов
        let votesReceived = 0;
        if (room.votes && typeof room.votes === 'object') {
            votesReceived = Object.keys(room.votes).length;
        }

        console.log(`[CheckAllVoted] В ${roomCode}: ${votesReceived}/${playersInRoom} игроков проголосовали.`);

        // Если все активные игроки проголосовали, показываем результаты досрочно
        if (playersInRoom > 0 && votesReceived >= playersInRoom) {
            console.log(`[CheckAllVoted] Все (${votesReceived}/${playersInRoom}) в ${roomCode} проголосовали. Показ результатов.`);
            
            // Небольшая задержка для синхронизации клиентов
            setTimeout(() => {
                // Проверяем, что комната все еще существует и в правильном состоянии
                if (rooms[roomCode] && rooms[roomCode].state === 'question') {
                    showResults(roomCode); // Показываем результаты
                }
            }, 500);
        }
    } catch (error) {
        console.error(`[CheckAllVoted Error] Ошибка при проверке голосов в комнате ${roomCode}:`, error);
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

    // Остановка всех таймеров отключения
    if (room.disconnectTimers) {
        Object.values(room.disconnectTimers).forEach(timer => {
            if (timer) clearTimeout(timer);
        });
        room.disconnectTimers = {};
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