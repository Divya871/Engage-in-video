const stream = (socket) => {
  socket.on('subscribe', (data) => {
    //subscribe/join a room
    socket.join(data.room);
    socket.join(data.socketId);

    //Inform other members in the room of new user's arrival
    // console.log('socket', socket);
    // console.log('socket.adapter', socket.adapter);
    // console.log('socket.rpp', socket.adapter.rooms, data.room);
    console.log(Array.from(socket.adapter.rooms));
    console.log(socket.adapter.rooms);
    console.log(Array.from(socket.adapter.rooms).findIndex(x=>x[0]===data.room));
    if (Array.from(socket.adapter.rooms).findIndex(x=>x[0]===data.room)>=0) {
      socket.to(data.room).emit('new_user', { socketId: data.socketId });
    }

    // console.log(socket.rooms);
  });

  socket.on('newUserStart', (data) => {
    // console.log('newUserStart', socket);
    socket.to(data.to).emit('newUserStart', { sender: data.sender });
  });

  socket.on('sdp', (data) => {
    // console.log('sdp', socket);

    socket
      .to(data.to)
      .emit('sdp', { description: data.description, sender: data.sender });
  });

  socket.on('ice candidates', (data) => {
    // console.log('ice candidates', socket);

    socket
      .to(data.to)
      .emit('ice candidates', {
        candidate: data.candidate,
        sender: data.sender,
      });
  });

  socket.on('chat', (data) => {
    // console.log('chat', socket);

    socket.to(data.room).emit('chat', { sender: data.sender, msg: data.msg });
  });
};

module.exports = stream;
