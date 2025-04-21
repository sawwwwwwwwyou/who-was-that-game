// --- Необходимые модули ---
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs'); // Модуль для работы с файловой системой

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
    if (room && room.players) { // Проверяем, что комната и игроки существуют
        const players = room.players.map(p => ({ id: p.id, name: p.name }));
        io.to(roomCode).emit('updatePlayerList', players);
    }
}

// --- Поиск комнаты по ID сокета игрока ---
function findRoomBySocketId(socketId) {
    // Object.entries преобразует { code1: room1, code2: room2 } в [[code1, room1], [code2, room2]]
    return Object.entries(rooms).find(([code, room]) => {
        // Ищем комнату, в массиве игроков которой есть игрок с нужным ID
        return room.players && room.players.some(player => player.id === socketId);
    });
    // Возвращает [roomCode, roomObject] или undefined, если не найдено
}


// ==================================
// --- ОБРАБОТКА СОБЫТИЙ SOCKET.IO ---
// ==================================

io.on('connection', (socket) => {
    console.log(`[Connection] Пользователь подключился: ${socket.id}`);

    // --- Обработка СОЗДАНИЯ Комнаты ---
    socket.on('createRoom', (data) => {
        const playerName = data.name ? String(data.name).trim() : `User_${socket.id.substring(0,4)}`; // Имя или дефолтное
        const roomCode = generateRoomCode();

        // Создаем новую комнату
        rooms[roomCode] = {
            hostId: socket.id,          // ID создателя - это ведущий
            players: [{ id: socket.id, name: playerName }], // Массив игроков
            shuffledQuestions: [],      // Массив вопросов для ЭТОЙ сессии (пока пустой)
            currentQuestionIndex: -1,   // Индекс текущего вопроса (-1 = игра не начата)
            votes: {},                  // Объект для хранения голосов { socketId: 'yes'/'no', ... }
            state: 'waiting',           // Состояние комнаты: 'waiting', 'question', 'results', 'finished'
            timer: null                 // Ссылка на таймер setTimeout
        };

        socket.join(roomCode); // Присоединяем сокет создателя к комнате Socket.IO
        console.log(`[Room Created] Игрок ${playerName} (ID: ${socket.id}) создал комнату ${roomCode}`);

        // Отправляем создателю подтверждение и данные о комнате
        socket.emit('roomJoined', {
            roomCode: roomCode,
            players: rooms[roomCode].players.map(p => ({ id: p.id, name: p.name })), // Отправляем только нужные данные
            isHost: true // Он создатель, значит он ведущий
        });
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
    socket.on('joinRoom', (data) => {
        const playerName = data.name ? String(data.name).trim() : `User_${socket.id.substring(0,4)}`;
        const roomCode = data.roomCode ? String(data.roomCode).toUpperCase() : null;

        if (!roomCode) return; // Игнорируем, если нет кода

        const room = rooms[roomCode];

        // Доп. проверка на случай, если комната исчезла/запустилась между checkRoomExists и joinRoom
        if (!room) {
             socket.emit('errorMessage', `Room ${roomCode} not found or is unavailable.`);
             console.log(`[Join Error] Комната ${roomCode} не найдена при попытке присоединения ${playerName}`);
             return;
        }
         if (room.state !== 'waiting') {
             socket.emit('errorMessage', `Game in room ${roomCode} is already in progress or finished.`);
             console.log(`[Join Error] Попытка входа в ${roomCode} (состояние: ${room.state}) игроком ${playerName}`);
             return;
        }

        // Проверка на занятое имя
        if (room.players.some(player => player.name.toLowerCase() === playerName.toLowerCase())) { // Сравнение без учета регистра
            socket.emit('errorMessage', `Name "${playerName}" is already taken in this room.`);
            console.log(`[Join Error] Попытка входа в ${roomCode} с занятым именем ${playerName}`);
            return;
        }

        // Проверка максимального количества игроков (опционально)
        // const MAX_PLAYERS = 8;
        // if (room.players.length >= MAX_PLAYERS) {
        //     socket.emit('errorMessage', `Room ${roomCode} is full.`);
        //     console.log(`[Join Error] Попытка входа в полную комнату ${roomCode} игроком ${playerName}`);
        //     return;
        // }


        // Все проверки пройдены, добавляем игрока
        room.players.push({ id: socket.id, name: playerName });
        socket.join(roomCode); // Присоединяем сокет игрока к комнате Socket.IO
        console.log(`[Player Joined] Игрок ${playerName} (ID: ${socket.id}) присоединился к комнате ${roomCode}. Всего игроков: ${room.players.length}`);

        // Отправляем присоединившемуся подтверждение и данные о комнате
        socket.emit('roomJoined', {
            roomCode: roomCode,
            players: room.players.map(p => ({ id: p.id, name: p.name })),
            isHost: false // Он не создатель, значит не ведущий
        });

        // Оповещаем ВСЕХ ОСТАЛЬНЫХ в комнате об обновлении списка игроков
        broadcastPlayerList(roomCode);
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
        const vote = data.vote; // 'yes' или 'no'
        // console.log(`[Vote Received] От ${socket.id}: ${vote}`); // Можно раскомментировать для детальной отладки

        const roomEntry = findRoomBySocketId(socket.id);
        if (!roomEntry) {
            console.error(`[Vote Error] Комната для ${socket.id} не найдена при попытке голосования!`);
            return;
        }
        const [roomCode, room] = roomEntry;
        // console.log(`[Vote Processing] Игрок ${socket.id} в комнате ${roomCode}. Состояние: ${room.state}`); // Для отладки

        // Проверяем состояние комнаты и валидность голоса
        if (room.state !== 'question' || (vote !== 'yes' && vote !== 'no')) {
            console.warn(`[Vote Rejected] Неверное состояние (${room.state}) или голос (${vote}) от ${socket.id} в ${roomCode}`);
            return;
        }
        // Проверяем, не голосовал ли уже
        if (room.votes[socket.id] !== undefined) {
            console.warn(`[Vote Rejected] Повторный голос от ${socket.id} в ${roomCode}`);
            return;
        }

        // Записываем голос
        room.votes[socket.id] = vote;
        console.log(`[Vote Accepted] ${socket.id} (${room.players.find(p=>p.id===socket.id)?.name || '??'}) в ${roomCode} проголосовал: ${vote}. Голосов: ${Object.keys(room.votes).length}/${room.players.length}`);

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
    socket.on('disconnect', (reason) => {
        console.log(`[Disconnect] Пользователь ${socket.id} отключился. Причина: ${reason}`);
        const roomEntry = findRoomBySocketId(socket.id);

        if (roomEntry) {
            const [roomCode, room] = roomEntry;

            // Игнорируем, если комната уже завершена
            if (room.state === 'finished') {
                 console.log(`[Disconnect] Игрок ${socket.id} отключается от уже завершенной комнаты ${roomCode}.`);
                 return;
            }

            const playerName = room.players.find(p => p.id === socket.id)?.name || socket.id; // Имя для лога
            console.log(`[Player Left] Игрок ${playerName} (ID: ${socket.id}) выходит из комнаты ${roomCode}`);

            const wasHost = room.hostId === socket.id;
            // Удаляем игрока из массива players
            room.players = room.players.filter(player => player.id !== socket.id);
            // Удаляем голос вышедшего игрока, если он был
            delete room.votes[socket.id];

            // Если больше не осталось игроков
            if (room.players.length === 0) {
                console.log(`[Room Empty] Комната ${roomCode} пуста после выхода игрока.`);
                endGame(roomCode, "Last player left."); // Завершаем и удаляем комнату
                return; // Выходим
            }

            // Если ушел ведущий, и остались другие игроки
            if (wasHost) {
                console.log(`[Host Left] Ведущий покинул комнату ${roomCode}. Назначаем нового.`);
                room.hostId = room.players[0].id; // Назначаем первого в списке новым ведущим
                console.log(`[New Host] Новый ведущий в ${roomCode}: ${room.players[0].name} (ID: ${room.hostId})`);
                // Сообщаем новому ведущему о его статусе
                io.to(room.hostId).emit('youAreHostNow');
                // Обновляем список игроков у всех (чтобы показать нового ведущего, если клиент это отображает)
                broadcastPlayerList(roomCode);
            } else {
                 // Ушел не ведущий, просто обновляем список игроков у оставшихся
                 broadcastPlayerList(roomCode);
            }

            // Если игра идет (этап вопроса), проверяем, не закончили ли все голосовать после выхода игрока
            if (room.state === 'question') {
                checkAllVoted(roomCode);
            }
        } else {
             console.log(`[Disconnect] Отключившийся игрок ${socket.id} не найден ни в одной активной комнате.`);
        }
    });

}); // Конец io.on('connection', ...)


// =========================
// --- ИГРОВЫЕ ФУНКЦИИ ---
// =========================

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
    room.timer = setTimeout(() => {
        console.log(`[Timer Expired] Время для ответа на вопрос ${questionNumber} в комнате ${roomCode} вышло.`);
        showResults(roomCode); // Показываем результаты по истечении времени
    }, VOTE_DURATION_SECONDS * 1000);
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