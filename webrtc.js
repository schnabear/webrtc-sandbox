'use strict';

var config = {'iceServers': [{'url': 'stun:stun.services.mozilla.com'}, {'url': 'stun:stun.l.google.com:19302'}]};
var optional = {'optional': [{'DtlsSrtpKeyAgreement': true}]};
// var optional = {'optional': [{'DtlsSrtpKeyAgreement': true}, {'RtpDataChannels': true}]};
var sdpConstraints = {
    optional: [],
    mandatory: {
        OfferToReceiveAudio: false,
        OfferToReceiveVideo: false
    }
};

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

function createPeerConnection() {
    var pc = new RTCPeerConnection(config, optional);
    pc.onicecandidate = function(e) {
        console.log('PC onICECandidate Event');
        console.log(e);
        if (e.candidate == null) {
            window.prompt('localDescription:', JSON.stringify(pc.localDescription));
        } else {
            console.log(JSON.stringify(e.candidate));
        }
    }
    pc.onaddstream = function(e) {
        console.log('PC onAddStream Event');
        console.log(e);
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
    }, function(e) {
        console.error(e);
    }, sdpConstraints);
}

// isCaller set at HTML TRUE or FALSE

var isCaller = window.confirm('isCaller Initialization');

var localPC = createPeerConnection();

if (isCaller) {
    var localDC = createDataChannel(localPC);
    bindDataChannelEvent(localDC);
    // Create offer session for client
    createOffer(localPC);
    // Expecting description prompt here
    // Delay session handling for async description prompt
    setTimeout(function() {
        var session = window.prompt('Client Session:');
        handleSession(localPC, session);
    }, 1000);
} else {
    var localDC = null;
    localPC.ondatachannel = function(e) {
        localDC = e.channel || e; // Chrome sends event, FF sends raw channel
        bindDataChannelEvent(localDC);
    };
    var session = window.prompt('Host Session:');
    handleSession(localPC, session);
    // Create answer session for host
    createAnswer(localPC);
    // Expecting description prompt here
}

// Test connection using the following...
// localDC.send(JSON.stringify({message: 'FOO'}))
// localDC.send(JSON.stringify({message: 'BAR'}))
