import helperFunctions from './helpers.js';

window.addEventListener('load', () => {
  const room = helperFunctions.getQString(location.href, 'room');
  const username = sessionStorage.getItem('username');

  if (!room) {
    document.querySelector('#room-create').attributes.removeNamedItem('hidden');
  } else if (!username) {
    document
      .querySelector('#username-set')
      .attributes.removeNamedItem('hidden');
  } else {
    let commElem = document.getElementsByClassName('room-comm');

    for (let i = 0; i < commElem.length; i++) {
      commElem[i].attributes.removeNamedItem('hidden');
    }

    var pc = [];

    let socket = io('/stream');

    var socketId = '';
    var myStream = '';
    var screen = '';
    var recordedStream = [];
    var mediaRecorder = '';

    //Get user video by default
    getAndSetUserStream();

    socket.on('connect', () => {
      console.log('CONNECTION ESTABLISHED', room, socket.io.engine.id);
      //set socketId
      socketId = socket.io.engine.id;

      socket.emit('subscribe', {
        room: room,
        socketId: socketId,
      });

      socket.on('new_user', (data) => {
        console.log('new_user', data);
        socket.emit('newUserStart', { to: data.socketId, sender: socketId });
        pc.push(data.socketId);
        init(true, data.socketId);
      });

      socket.on('newUserStart', (data) => {
        pc.push(data.sender);
        init(false, data.sender);
      });

      socket.on('ice candidates', async (data) => {
        data.candidate
          ? await pc[data.sender].addIceCandidate(
              new RTCIceCandidate(data.candidate)
            )
          : '';
      });

      socket.on('sdp', async (data) => {
        if (data.description.type === 'offer') {
          data.description
            ? await pc[data.sender].setRemoteDescription(
                new RTCSessionDescription(data.description)
              )
            : '';

          helperFunctions
            .getUserFullMedia()
            .then(async (stream) => {
              if (!document.getElementById('local').srcObject) {
                helperFunctions.setLocalStream(stream);
              }

              //save my stream
              myStream = stream;

              stream.getTracks().forEach((track) => {
                pc[data.sender].addTrack(track, stream);
              });

              let answer = await pc[data.sender].createAnswer();

              await pc[data.sender].setLocalDescription(answer);

              socket.emit('sdp', {
                description: pc[data.sender].localDescription,
                to: data.sender,
                sender: socketId,
              });
            })
            .catch((e) => {
              console.error(e);
            });
        } else if (data.description.type === 'answer') {
          await pc[data.sender].setRemoteDescription(
            new RTCSessionDescription(data.description)
          );
        }
      });

      socket.on('chat', (data) => {
        console.log('chat', data);
        helperFunctions.addChat(data, 'remote');
      });
    });

    function getAndSetUserStream() {
      helperFunctions
        .getUserFullMedia()
        .then((stream) => {
          //save my stream
          myStream = stream;

          helperFunctions.setLocalStream(stream);
        })
        .catch((e) => {
          console.error(`stream error: ${e}`);
        });
    }

    function sendMsg(msg) {
      let data = {
        room: room,
        msg: msg,
        sender: username,
      };

      //emit chat message
      socket.emit('chat', data);

      //add localchat
      helperFunctions.addChat(data, 'local');
    }

    function init(createOffer, partnerName) {
      pc[partnerName] = new RTCPeerConnection(helperFunctions.getIceServer());

      if (screen && screen.getTracks().length) {
        screen.getTracks().forEach((track) => {
          pc[partnerName].addTrack(track, screen); //should trigger negotiationneeded event
        });
      } else if (myStream) {
        myStream.getTracks().forEach((track) => {
          pc[partnerName].addTrack(track, myStream); //should trigger negotiationneeded event
        });
      } else {
        helperFunctions
          .getUserFullMedia()
          .then((stream) => {
            //save my stream
            myStream = stream;

            stream.getTracks().forEach((track) => {
              pc[partnerName].addTrack(track, stream); //should trigger negotiationneeded event
            });

            helperFunctions.setLocalStream(stream);
          })
          .catch((e) => {
            console.error(`stream error: ${e}`);
          });
      }

      //create offer
      if (createOffer) {
        pc[partnerName].onnegotiationneeded = async () => {
          let offer = await pc[partnerName].createOffer();

          await pc[partnerName].setLocalDescription(offer);

          socket.emit('sdp', {
            description: pc[partnerName].localDescription,
            to: partnerName,
            sender: socketId,
          });
        };
      }

      //send ice candidate to partnerNames
      pc[partnerName].onicecandidate = ({ candidate }) => {
        socket.emit('ice candidates', {
          candidate: candidate,
          to: partnerName,
          sender: socketId,
        });
      };

      //add
      pc[partnerName].ontrack = (e) => {
        let str = e.streams[0];
        if (document.getElementById(`${partnerName}-video`)) {
          document.getElementById(`${partnerName}-video`).srcObject = str;
        } else {
          let videoContainerWrapper = document.getElementById(
            'videos-container-wrapper'
          );
          //video elem
          let newVid = document.createElement('video');
          newVid.id = `${partnerName}-video`;
          newVid.srcObject = str;
          newVid.autoplay = true;
          newVid.className = 'remote-video';

          //video container

          let videoContainer = document.createElement('div');
          videoContainer.classList = ['video-container'];
          videoContainer.appendChild(newVid);

          //video controls elements
          //   let controlDiv = document.createElement('div');
          //   controlDiv.className = 'remote-video-controls';
          //   controlDiv.innerHTML = `
          //     <i class="fa fa-microphone text-white pr-3 mute-remote-mic" title="Mute"></i>
          //     <i class="fa fa-expand text-white expand-remote-video" title="Expand"></i>
          //     `;

          //   //create a new div for card
          //   let cardDiv = document.createElement('div');
          //   cardDiv.className = 'card card-sm';
          //   cardDiv.id = partnerName;
          //   cardDiv.appendChild(newVid);
          //   cardDiv.appendChild(controlDiv);

          //put div in main-section elem

          videoContainerWrapper.appendChild(videoContainer);
          reorganize();
          //   document.getElementById('videos').appendChild(cardDiv);

          helperFunctions.adjustVideoElemSize();
        }
      };

      pc[partnerName].onconnectionstatechange = (d) => {
        switch (pc[partnerName].iceConnectionState) {
          case 'disconnected':
          case 'failed':
            helperFunctions.closeVideo(partnerName);
            break;

          case 'closed':
            helperFunctions.closeVideo(partnerName);
            break;
        }
      };

      pc[partnerName].onsignalingstatechange = (d) => {
        switch (pc[partnerName].signalingState) {
          case 'closed':
            console.log("Signalling state is 'closed'");
            helperFunctions.closeVideo(partnerName);
            break;
        }
      };
    }

    const videoAspectRatio =
      16 / 9; /* SET TO WHAT YOU WANT IT TO BE FOR EACH PERSON DIV */
    const maxCols = 7;
    // const screen = document.getElementById('screen');
    const container = document.getElementById('videos-container-wrapper');

    function reorganize() {
      const videoContainers = container.querySelectorAll('.video-container');
      const videoContainerCount = videoContainers.length;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      console.log('windowWidth', windowWidth);
      console.log('windowHeight', windowHeight);
      let videoContainerWrapper = document.getElementById(
        'videos-container-wrapper'
      );
      const wrapperElementWidth = videoContainerWrapper.offsetWidth;
      const wrapperElementHeight = videoContainerWrapper.offsetHeight-30;
      const screenAspect = wrapperElementWidth / wrapperElementHeight;

      console.log('wrapperElementWidth', wrapperElementWidth);
      console.log('wrapperElementHeight', wrapperElementHeight);

      console.log('------------');
      let cols = 1;
      for (cols; cols <= maxCols; cols++) {
        if (videoContainerCount <= cols * cols) {
          break;
        }
      }

      let w = 0; //will be of the container in px
      let h = 0; //will be height of the container in px

      if (videoContainerCount > cols * (cols - 1)) {
        // > OK for 5 and 6 not OK for 7
        h = wrapperElementHeight;
        w = h * videoAspectRatio;
      } else {
        w = wrapperElementWidth;
        h = w / videoAspectRatio;
      }

      // container.style.width = w + 'px';
      document.getElementById('videoContainerStyle').innerHTML =
        '.video-container {flex: 0 0 ' +
        100 / cols +
        '%; height: ' +
        h / cols +
        'px;}';
      if (videoContainerCount <= cols * (cols - 1)) {
        h = h - h / cols;
      } // for when last row is empty
      // container.style.marginTop = -h / 2 + 'px';
    }

    window.addEventListener('resize', reorganize);

    function shareScreen() {
      helperFunctions
        .shareScreen()
        .then((stream) => {
          helperFunctions.toggleShareIcons(true);

          //disable the video toggle btns while sharing screen. This is to ensure clicking on the btn does not interfere with the screen sharing
          //It will be enabled was user stopped sharing screen
          helperFunctions.toggleVideoBtnDisabled(true);

          //save my screen stream
          screen = stream;

          //share the new stream with all partners
          broadcastNewTracks(stream, 'video', false);

          //When the stop sharing button shown by the browser is clicked
          screen.getVideoTracks()[0].addEventListener('ended', () => {
            stopSharingScreen();
          });
        })
        .catch((e) => {
          console.error(e);
        });
    }

    function stopSharingScreen() {
      //enable video toggle btn
      helperFunctions.toggleVideoBtnDisabled(false);

      return new Promise((res, rej) => {
        screen.getTracks().length
          ? screen.getTracks().forEach((track) => track.stop())
          : '';

        res();
      })
        .then(() => {
          helperFunctions.toggleShareIcons(false);
          broadcastNewTracks(myStream, 'video');
        })
        .catch((e) => {
          console.error(e);
        });
    }

    function broadcastNewTracks(stream, type, mirrorMode = true) {
      helperFunctions.setLocalStream(stream, mirrorMode);

      let track =
        type == 'audio'
          ? stream.getAudioTracks()[0]
          : stream.getVideoTracks()[0];

      for (let p in pc) {
        let pName = pc[p];

        if (typeof pc[pName] == 'object') {
          helperFunctions.replaceTrack(track, pc[pName]);
        }
      }
    }

    function toggleRecordingIcons(isRecording) {
      let e = document.getElementById('record');

      if (isRecording) {
        e.setAttribute('title', 'Stop recording');
        e.children[0].classList.add('text-danger');
        e.children[0].classList.remove('text-white');
      } else {
        e.setAttribute('title', 'Record');
        e.children[0].classList.add('text-white');
        e.children[0].classList.remove('text-danger');
      }
    }

    function startRecording(stream) {
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
      });

      mediaRecorder.start(1000);
      toggleRecordingIcons(true);

      mediaRecorder.ondataavailable = function (e) {
        recordedStream.push(e.data);
      };

      mediaRecorder.onstop = function () {
        toggleRecordingIcons(false);

        helperFunctions.saveRecordedStream(recordedStream, username);

        setTimeout(() => {
          recordedStream = [];
        }, 3000);
      };

      mediaRecorder.onerror = function (e) {
        console.error(e);
      };
    }

    //Chat textarea
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
      if (e.which === 13 && e.target.value.trim()) {
        e.preventDefault();

        sendMsg(e.target.value);

        setTimeout(() => {
          e.target.value = '';
        }, 50);
      }
    });

    //When the video icon is clicked
    document.getElementById('toggle-video').addEventListener('click', (e) => {
      e.preventDefault();

      let elem = document.getElementById('toggle-video');

      if (myStream.getVideoTracks()[0].enabled) {
        e.target.classList.remove('fa-video');
        e.target.classList.add('fa-video-slash');
        elem.setAttribute('title', 'Show Video');

        myStream.getVideoTracks()[0].enabled = false;
      } else {
        e.target.classList.remove('fa-video-slash');
        e.target.classList.add('fa-video');
        elem.setAttribute('title', 'Hide Video');

        myStream.getVideoTracks()[0].enabled = true;
      }

      broadcastNewTracks(myStream, 'video');
    });

    //When the mute icon is clicked
    document.getElementById('toggle-mute').addEventListener('click', (e) => {
      e.preventDefault();

      let elem = document.getElementById('toggle-mute');

      if (myStream.getAudioTracks()[0].enabled) {
        e.target.classList.remove('fa-microphone-alt');
        e.target.classList.add('fa-microphone-alt-slash');
        elem.setAttribute('title', 'Unmute');

        myStream.getAudioTracks()[0].enabled = false;
      } else {
        e.target.classList.remove('fa-microphone-alt-slash');
        e.target.classList.add('fa-microphone-alt');
        elem.setAttribute('title', 'Mute');

        myStream.getAudioTracks()[0].enabled = true;
      }

      broadcastNewTracks(myStream, 'audio');
    });

    //When user clicks the 'Share screen' button
    document.getElementById('share-screen').addEventListener('click', (e) => {
      e.preventDefault();

      if (
        screen &&
        screen.getVideoTracks().length &&
        screen.getVideoTracks()[0].readyState != 'ended'
      ) {
        stopSharingScreen();
      } else {
        shareScreen();
      }
    });

    //When record button is clicked
    document.getElementById('record').addEventListener('click', (e) => {
      /**
       * Ask user what they want to record.
       * Get the stream based on selection and start recording
       */
      if (!mediaRecorder || mediaRecorder.state == 'inactive') {
        helperFunctions.toggleModal('recording-options-modal', true);
      } else if (mediaRecorder.state == 'paused') {
        mediaRecorder.resume();
      } else if (mediaRecorder.state == 'recording') {
        mediaRecorder.stop();
      }
    });

    //When user choose to record screen
    document.getElementById('record-screen').addEventListener('click', () => {
      helperFunctions.toggleModal('recording-options-modal', false);

      if (screen && screen.getVideoTracks().length) {
        startRecording(screen);
      } else {
        helperFunctions
          .shareScreen()
          .then((screenStream) => {
            startRecording(screenStream);
          })
          .catch(() => {});
      }
    });

    //When user choose to record own video
    document.getElementById('record-video').addEventListener('click', () => {
      helperFunctions.toggleModal('recording-options-modal', false);

      if (myStream && myStream.getTracks().length) {
        startRecording(myStream);
      } else {
        helperFunctions
          .getUserFullMedia()
          .then((videoStream) => {
            startRecording(videoStream);
          })
          .catch(() => {});
      }
    });
  }
});
