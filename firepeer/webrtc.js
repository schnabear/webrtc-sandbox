'use strict';

var isFF = window.mozRTCPeerConnection ? true : false;
var dbRef = new Firebase('https://scorching-inferno-7057.firebaseio.com');
var roomRef = dbRef.child("rooms");
var iceServers = [];
iceServers.push({'urls': 'stun:stun.services.mozilla.com'});
iceServers.push({'urls': 'stun:stun.l.google.com:19302'});
iceServers.push({'urls': 'stun:stun.anyfirewall.com:3478'});
iceServers.push({'urls': 'turn:turn.bistri.com:80', 'credential': 'webrtc', 'username': 'webrtc'});
var pcConfig = {'iceServers': iceServers};
var pcConstraints = {'optional': [{'DtlsSrtpKeyAgreement': true}/*, {'RtpDataChannels': true}*/]};
if (isFF) {
    // FF to FF only not FF to Chrome
    var sdpConstraints = {
        'offerToReceiveAudio': false,
        'offerToReceiveVideo': false
    };
} else {
    var sdpConstraints = {
        'optional': [],
        'mandatory': {
            'OfferToReceiveAudio': false,
            'OfferToReceiveVideo': false
        }
    };
}

var ROOM = document.location.hash.substr(1);
var type = "answerer";
var otherType = "offerer";

if (!ROOM) {
    ROOM = guid();
    type = "offerer";
    otherType = "answerer";
    window.prompt('Room Link:', document.location.href + '#' + ROOM);
}

// Delete records on user disconnection event
roomRef.child(ROOM).onDisconnect().remove();

function trace(text) {
    if (text[text.length - 1] === '\n') {
        text = text.substring(0, text.length - 1);
    }
    if (window.performance) {
        var now = (window.performance.now() / 1000).toFixed(3);
        console.log(now + ': ' + text);
    } else {
        console.log(text);
    }
}

function id() {
    return (Math.random() * 10000 + 10000 | 0).toString();
}

function guid() {
    // http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

function send(room, key, data) {
    roomRef.child(room).child(key).set(data, function(e) {
        if (e) {
            console.error(e);
        }
    });
}

function recv(room, type, callback) {
    roomRef.child(room).child(type).on("value", function(snapshot, key) {
        var data = snapshot.val();
        if (data) {
            callback(data);
        }
    }, function(e) {
        console.log(e);
    });
}

function createPeerConnection() {
    var pc = new RTCPeerConnection(pcConfig, pcConstraints);
    pc.onicecandidate = function(e) {
        console.log('PC onICECandidate Event');
        console.log(e);
        if (!e.candidate) {
            return;
        }
        pc.onicecandidate = null;

        console.log(JSON.stringify(e.candidate));
        send(ROOM, "candidate:" + type, JSON.stringify(e.candidate));
    }
    if (isFF) {
        pc.ontrack = function(e) {
            console.log('PC onTrack Event');
            console.log(e);
        }
    } else {
        pc.onaddstream = function(e) {
            console.log('PC onAddStream Event');
            console.log(e);
        }
    }
    pc.onconnection = function(e) {
        console.log('PC onConnection Event');
        console.log(e);
    }
    pc.onsignalingstatechange = function(e) {
        console.log('PC onSignalingStateChange Event');
        console.log(e);
    }
    pc.oniceconnectionstatechange = function(e) {
        console.log('PC onIceConnectionStateChange Event');
        console.log(e);
        switch (pc.iceConnectionState) {
            case 'completed':
                // Remove handshake data from signaling server
                console.log('PC Ice Connection State: ' + pc.iceConnectionState);
                roomRef.child(ROOM).remove();
                break;
            case 'failed':
                // Remove and establish a new connection
            case 'closed':
                // Remove instance of connection
                console.log('PC Ice Connection State: ' + pc.iceConnectionState);
                break;
            case 'new':
            case 'checking':
            case 'connected':
            case 'disconnected':
            default:
                console.log('PC Ice Connection State: ' + pc.iceConnectionState);
        }
    }
    pc.onicegatheringstatechange = function(e) {
        console.log('PC onIceGatheringStateChange Event');
        console.log(e);
    }
    return pc;
}

function createDataChannel(pc, channelName) {
    channelName = (typeof channelName !== 'undefined') ? channelName : 'sendDataChannel';
    return pc.createDataChannel(channelName, {'reliable': true});
}

function bindDataChannelEvent(dc) {
    if (typeof dc !== 'object') {
        throw new Error('Argument NOT an object'); // Do nothing or throw an exception
    }

    dc.onopen = function(e) {
        console.log('DC onOpen Event');
        console.log(e);
    };
    dc.onmessage = function(e) {
        console.log('DC onMessage Event');
        console.log(e);

        // https://github.com/cjb/serverless-webrtc/blob/master/js/serverless-webrtc.js#L135
        if (e.data.charCodeAt(0) == 2) {
            return;
        }

        var data = JSON.parse(e.data);
        // Process data content here ...
        console.log(data);
    };
    dc.onclose = function(e) {
        console.log('DC onClose Event');
        console.log(e);
    };
    dc.onerror = function(e) {
        console.log('DC onError Event');
        console.error(e);
    };
}

function handleSession(pc, session) {
    var sessionDescription = new RTCSessionDescription(JSON.parse(session));
    pc.setRemoteDescription(sessionDescription);
}

function createOffer(pc) {
    pc.createOffer(function(description) {
        console.log('PC createOffer OK');
        pc.setLocalDescription(description);
        // Send description on signaling server for non serverless
        console.log(description);
        send(ROOM, "offer", JSON.stringify(description));
    }, function(e) {
        console.error(e);
    }, sdpConstraints);
}

function createAnswer(pc) {
    pc.createAnswer(function(description) {
        console.log('PC createAnswer OK');
        pc.setLocalDescription(description);
        // Send description on signaling server for non serverless
        console.log(description);
        send(ROOM, "answer", JSON.stringify(description));
    }, function(e) {
        console.error(e);
    }, sdpConstraints);
}

var localPC = createPeerConnection();

if (type == "offerer") {
    var localDC = createDataChannel(localPC);
    bindDataChannelEvent(localDC);
    createOffer(localPC);
    recv(ROOM, "answer", function(session) {
        console.log('RECV Answer');
        handleSession(localPC, session);
    });
} else {
    var localDC = null;
    localPC.ondatachannel = function(e) {
        console.log(e);
        localDC = e.channel || e; // Chrome sends event (e.channel), FF sends raw channel (e)
        bindDataChannelEvent(localDC);
    };
    recv(ROOM, "offer", function(session) {
        console.log('RECV Offer');
        handleSession(localPC, session);
        createAnswer(localPC);
    });
}

recv(ROOM, "candidate:" + otherType, function (candidate) {
    console.log('RECV Candidate ' + otherType);
    localPC.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
});

// Test connection using the following...
// localDC.send(JSON.stringify({message: 'FOO'}))
// localDC.send(JSON.stringify({message: 'BAR'}))
