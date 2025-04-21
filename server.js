const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const rooms = {};
const questions = [
    { id: 1, text: "Было бы вам интересно узнать точную дату своей смерти?" },
    { id: 2, text: "Считаете ли вы, что у искусственного интеллекта могут быть права?" },
    { id: 3, text: "Вы бы предпочли быть невероятно богатым, но одиноким, или бедным, но окруженным любовью?" },
    { id: 4, text: "Согласны ли вы, что цель оправдывает средства?" },
    { id: 5, text: "Верите ли вы в существование судьбы?" }
    // Добавьте сюда больше вопросов
];

const VOTE_DURATION_SECONDS = 10;

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms[code]);
    return code;
}

function broadcastPlayerList(roomCode) {
    if (rooms[roomCode]) {
        const players = rooms[roomCode].players.map(p => ({ id: p.id, name: p.name }));
        io.to(roomCode).emit('updatePlayerList', players);
    }
}

function findRoomBySocketId(socketId) {
    return Object.entries(rooms).find(([code, room]) =>
        room.players.some(player => player.id === socketId)
    );
}

io.on('connection', (socket) => {
    console.log('Новый пользователь подключился:', socket.id);

    socket.on('createRoom', (data) => {
        const playerName = data.name;
        const roomCode = generateRoomCode();

        rooms[roomCode] = {
            hostId: socket.id,
            players: [{ id: socket.id, name: playerName }],
            currentQuestionIndex: -1,
            votes: {},
            state: 'waiting',
            timer: null
        };

        socket.join(roomCode);
        console.log(`Игрок ${playerName} (ID: ${socket.id}) создал комнату ${roomCode}`);

        socket.emit('roomJoined', {
            roomCode: roomCode,
            players: rooms[roomCode].players.map(p => ({ id: p.id, name: p.name })),
            isHost: true
        });
    });
// --- Проверка существования комнаты (перед вводом имени) ---
socket.on('checkRoomExists', (data) => {
    const roomCode = data.roomCode;
    const room = rooms[roomCode];

    if (room) {
        // Комната существует, отправляем подтверждение клиенту
        console.log(`Комната ${roomCode} существует. Отправка подтверждения клиенту ${socket.id}`);
        socket.emit('roomExists'); // Отправляем событие обратно
    } else {
        // Комната не найдена
        console.log(`Комната ${roomCode} не найдена. Отправка ошибки клиенту ${socket.id}`);
        socket.emit('errorMessage', `Room ${roomCode} not found.`);
    }
});
socket.on('joinRoom', (data) => {
    const playerName = data.name;
    const roomCode = data.roomCode;
    const room = rooms[roomCode]; // Получаем комнату

    // --- УДАЛЯЕМ ЭТУ ПРОВЕРКУ ---
    // if (!room) {
    //     socket.emit('errorMessage', `Комната ${roomCode} не найдена.`);
    //     console.log(`Попытка входа в несуществующую комнату ${roomCode} игроком ${playerName}`);
    //     return;
    // }
    // --- КОНЕЦ УДАЛЕНИЯ ---

    // !!! Важно: Добавляем проверку на случай, если комната исчезла между проверкой и вводом имени
    if (!room) {
         socket.emit('errorMessage', `Room ${roomCode} disappeared.`);
         console.log(`Комната ${roomCode} исчезла перед присоединением ${playerName}`);
         return;
    }


    // Проверка 2: Имя не занято? (ОСТАВЛЯЕМ)
    if (room.players.some(player => player.name === playerName)) {
        socket.emit('errorMessage', `Name "${playerName}" is already taken in this room.`);
        console.log(`Попытка входа в комнату ${roomCode} с занятым именем ${playerName}`);
        return;
    }

    // Проверка 3: Игра уже не идет? (ОСТАВЛЯЕМ)
    if (room.state !== 'waiting') {
         socket.emit('errorMessage', `Game in room ${roomCode} is already in progress.`);
         console.log(`Попытка входа в комнату ${roomCode} во время игры игроком ${playerName}`);
         return;
    }

    // Все проверки пройдены, добавляем игрока (ОСТАВЛЯЕМ)
    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomCode);
    console.log(`Игрок ${playerName} (ID: ${socket.id}) присоединился к комнате ${roomCode}`);

    // Отправляем подтверждение и данные (ОСТАВЛЯЕМ)
    socket.emit('roomJoined', {
        roomCode: roomCode,
        players: room.players.map(p => ({ id: p.id, name: p.name })),
        isHost: false
    });

    // Оповещаем остальных (ОСТАВЛЯЕМ)
    broadcastPlayerList(roomCode);
});

    socket.on('startGame', () => {
        const roomEntry = findRoomBySocketId(socket.id);
        if (!roomEntry) return;
        const [roomCode, room] = roomEntry;

        if (room.hostId !== socket.id) return;
        if (room.state !== 'waiting') return;
        if (room.players.length < 2) {
            socket.emit('errorMessage', 'Нужно как минимум 2 игрока для начала.');
            return;
        }

        console.log(`Ведущий ${socket.id} начал игру в комнате ${roomCode}`);
        sendNextQuestion(roomCode);
    });

    socket.on('submitVote', (data) => {
        const roomEntry = findRoomBySocketId(socket.id);
        if (!roomEntry) return;
        const [roomCode, room] = roomEntry;
        const vote = data.vote;

        if (room.state !== 'question' || (vote !== 'yes' && vote !== 'no')) return;
        if (room.votes[socket.id] !== undefined) return;

        room.votes[socket.id] = vote;
        console.log(`Игрок ${socket.id} в ${roomCode} проголосовал: ${vote}`);
        checkAllVoted(roomCode);
    });
    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
        const roomEntry = findRoomBySocketId(socket.id);
    
        if (roomEntry) {
            const [roomCode, room] = roomEntry;
            // Добавим проверку, не завершена ли уже комната
            if (room.state === 'finished') {
                 console.log(`Игрок ${socket.id} отключается от уже завершенной комнаты ${roomCode}.`);
                 // Можно просто выйти, комната скоро будет удалена или уже удалена
                 return;
            }
    
            const playerName = room.players.find(p => p.id === socket.id)?.name || socket.id;
            console.log(`Игрок ${playerName} (ID: ${socket.id}) выходит из комнаты ${roomCode}`);
    
            const wasHost = room.hostId === socket.id;
            room.players = room.players.filter(player => player.id !== socket.id);
            delete room.votes[socket.id];
    
            if (room.players.length === 0) {
                console.log(`Комната ${roomCode} пуста после выхода игрока.`);
                // Завершаем и удаляем комнату
                endGame(roomCode, "Last player left."); // <<< ВЫЗЫВАЕМ endGame
                return; // Выходим
            }
    
            // Если ушел хост и остались другие игроки
            if (wasHost) {
                console.log(`Ведущий покинул комнату ${roomCode}. Назначаем нового.`);
                room.hostId = room.players[0].id;
                console.log(`Новый ведущий в ${roomCode}: ${room.players[0].name} (ID: ${room.hostId})`);
                io.to(room.hostId).emit('youAreHostNow');
                broadcastPlayerList(roomCode); // Обновляем список у всех
            } else {
                 // Ушел не ведущий, просто обновляем список игроков
                 broadcastPlayerList(roomCode);
            }
    
            // Если игра шла, проверяем, не закончили ли все голосовать
            if (room.state === 'question') {
                checkAllVoted(roomCode);
            }
        }
    });

    socket.on('submitVote', (data) => {
        const vote = data.vote;
        console.log(`[Vote Received] От ${socket.id}: ${vote}`); // Лог 1: Голос получен
    
        const roomEntry = findRoomBySocketId(socket.id);
        if (!roomEntry) {
            console.error(`[Vote Error] Комната для ${socket.id} не найдена!`); // Лог 2: Ошибка поиска комнаты
            return;
        }
    
        const [roomCode, room] = roomEntry;
        console.log(`[Vote Processing] Игрок ${socket.id} в комнате ${roomCode}. Текущее состояние комнаты: ${room.state}`); // Лог 3: Комната найдена, состояние
    
        // Проверка: комната в состоянии вопроса? И голос допустимый?
        if (room.state !== 'question') {
            console.warn(`[Vote Rejected] Неверное состояние комнаты (${room.state}) для ${socket.id} в ${roomCode}`); // Лог 4: Неверное состояние
            return;
        }
         if (vote !== 'yes' && vote !== 'no') {
             console.warn(`[Vote Rejected] Недопустимый голос '${vote}' от ${socket.id} в ${roomCode}`); // Лог 5: Неверный голос
             return;
         }
    
    
        // Проверка: игрок уже голосовал за этот вопрос?
        if (room.votes[socket.id] !== undefined) {
            console.warn(`[Vote Rejected] ${socket.id} уже голосовал (${room.votes[socket.id]}) в ${roomCode}`); // Лог 6: Повторный голос
            return; // Уже голосовал
        }
    
        // Записываем голос
        room.votes[socket.id] = vote;
        console.log(`[Vote Accepted] ${socket.id} в ${roomCode} проголосовал: ${vote}. Текущие голоса:`, room.votes); // Лог 7: Голос принят
    
        // Проверяем, все ли проголосовали
        checkAllVoted(roomCode);
    });
    
    // Добавим лог в checkAllVoted
    function checkAllVoted(roomCode) {
        const room = rooms[roomCode];
        // Добавим проверку на существование комнаты, т.к. она могла быть удалена
        if (!room || room.state !== 'question') {
             console.log(`[CheckAllVoted] Пропуск для ${roomCode}: комната не найдена или не в состоянии вопроса.`);
             return;
        }
    
    
        const playersInRoom = room.players.length;
        const votesReceived = Object.keys(room.votes).length;
        console.log(`[CheckAllVoted] В ${roomCode}: ${votesReceived} голосов из ${playersInRoom} игроков.`); // Лог 8: Проверка голосов
    
        // Если количество голосов равно количеству игроков, показываем результаты досрочно
        if (playersInRoom > 0 && votesReceived === playersInRoom) { // Убедимся, что игроки есть
            console.log(`[CheckAllVoted] Все (${playersInRoom}) в ${roomCode} проголосовали. Показ результатов.`); // Лог 9: Все проголосовали
            showResults(roomCode); // Показываем результаты немедленно
        }
    }
    
    socket.on('nextQuestion', () => {
         const roomEntry = findRoomBySocketId(socket.id);
         if (!roomEntry) return;
         const [roomCode, room] = roomEntry;

         if (room.hostId !== socket.id) return;
         if (room.state !== 'results') return;

         console.log(`Ведущий ${socket.id} запросил следующий вопрос в комнате ${roomCode}`);
         sendNextQuestion(roomCode);
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
        const roomEntry = findRoomBySocketId(socket.id);

        if (roomEntry) {
            const [roomCode, room] = roomEntry;
            const playerName = room.players.find(p => p.id === socket.id)?.name || socket.id;
            console.log(`Игрок ${playerName} (ID: ${socket.id}) выходит из комнаты ${roomCode}`);

            const wasHost = room.hostId === socket.id;
            room.players = room.players.filter(player => player.id !== socket.id);
            delete room.votes[socket.id];

            if (room.players.length === 0) {
                console.log(`Комната ${roomCode} пуста и удаляется.`);
                if (room.timer) clearTimeout(room.timer);
                delete rooms[roomCode];
                return;
            }

            if (wasHost) {
                console.log(`Ведущий покинул комнату ${roomCode}. Назначаем нового.`);
                room.hostId = room.players[0].id;
                console.log(`Новый ведущий в ${roomCode}: ${room.players[0].name} (ID: ${room.hostId})`);
                io.to(room.hostId).emit('youAreHostNow');
                broadcastPlayerList(roomCode);
            } else {
                 broadcastPlayerList(roomCode);
            }

            if (room.state === 'question') {
                checkAllVoted(roomCode);
            }
        }
    });
});

// --- Игровые функции ---

// Функция отправки следующего вопроса
function sendNextQuestion(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    room.currentQuestionIndex++;
    if (room.currentQuestionIndex >= questions.length) {
        // Вопросы закончились! Вызываем функцию завершения.
        console.log(`Вопросы в комнате ${roomCode} закончились.`);
        endGame(roomCode, 'All questions answered!'); // <<< ВЫЗЫВАЕМ endGame
        return;
    }
    // ... (остальной код отправки вопроса и таймера)
    const question = questions[room.currentQuestionIndex];
    room.state = 'question';
    room.votes = {};
    const questionNumber = room.currentQuestionIndex + 1;
    console.log(`Отправка вопроса ${questionNumber} ("${question.text}") в комнату ${roomCode}`);
    io.to(roomCode).emit('newQuestion', {
        questionNumber: questionNumber,
        questionText: question.text,
        duration: VOTE_DURATION_SECONDS
    });
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => {
        console.log(`Время для ответа на вопрос ${questionNumber} в комнате ${roomCode} вышло.`);
        showResults(roomCode);
    }, VOTE_DURATION_SECONDS * 1000);
}
// Функция показа результатов
function showResults(roomCode) {
    const room = rooms[roomCode];
    // Убедимся, что комната еще существует и находится в состоянии вопроса
    if (!room || room.state !== 'question') return;

    // Останавливаем таймер, если он еще активен
    if (room.timer) clearTimeout(room.timer);
    room.timer = null; // Сбрасываем таймер

    room.state = 'results'; // Устанавливаем состояние "показ результатов"

    // Подсчитываем голоса
    let yesVotes = 0;
    let noVotes = 0;
    const currentVotes = room.votes || {};
    Object.values(currentVotes).forEach(vote => {
        if (vote === 'yes') yesVotes++;
        else if (vote === 'no') noVotes++;
    });

    const questionIndex = room.currentQuestionIndex; // Получаем индекс текущего вопроса
    // Добавим проверку, что индекс валидный
    const question = (questionIndex >= 0 && questionIndex < questions.length)
                     ? questions[questionIndex]
                     : null;

    console.log(`Показ результатов в комнате ${roomCode}: ДА-${yesVotes}, НЕТ-${noVotes}`);

    // Отправляем результаты всем в комнате
    io.to(roomCode).emit('showResults', {
        yesVotes,
        noVotes,
        // Добавим проверку на случай, если вопрос не найден
        questionText: question ? question.text : "Error: Question not found"
    });
}
function checkAllVoted(roomCode) {
    const room = rooms[roomCode];
    if (!room || room.state !== 'question') return;

    const playersInRoom = room.players.length;
    const votesReceived = Object.keys(room.votes).length;

    if (votesReceived === playersInRoom && playersInRoom > 0) { // Добавил проверку playersInRoom > 0
        console.log(`Все игроки (${playersInRoom}) в комнате ${roomCode} проголосовали.`);
        showResults(roomCode);
    }
}
// Функция завершения игры и очистки комнаты
function endGame(roomCode, message) {
    const room = rooms[roomCode];
    if (!room) return; // Комната уже могла быть удалена

    console.log(`Завершение игры в комнате ${roomCode}. Причина: ${message}`);
    room.state = 'finished'; // Помечаем как завершенную

    // Останавливаем таймер, если он был активен
    if (room.timer) {
        clearTimeout(room.timer);
        room.timer = null;
    }

    // Отправляем событие gameOver всем в комнате
    io.to(roomCode).emit('gameOver', { message: message });

    // Опционально: Можно добавить задержку перед удалением, чтобы все успели получить сообщение
    // setTimeout(() => {
    //     delete rooms[roomCode];
    //     console.log(`Комната ${roomCode} удалена после завершения игры.`);
    // }, 5000); // Удалить через 5 секунд

    // Или удаляем сразу (если клиенты корректно обрабатывают gameOver и отключаются или переходят):
    delete rooms[roomCode];
    console.log(`Комната ${roomCode} удалена после завершения игры.`);

    // Примечание: Сокеты сами НЕ отключаются при удалении комнаты.
    // Клиенты должны сами обработать gameOver (например, вернуться на главный экран).
    // При попытке нового действия (join/create) будет создана новая комната.
}
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Откройте в браузере http://localhost:${PORT}`);
});