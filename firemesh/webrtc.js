'use strict';

function SignalingServer(endpoint) {
    this.endpoint = endpoint;
    this.dbRef = new Firebase(endpoint);
    return this;
}
// TODO: Add onDisconnect removal
SignalingServer.prototype = {
    send: function(room, key, data) {
        return this.dbRef.child(room).child(key).set(data, function(e) {
            if (e) {
                console.error(e);
            }
        });
    },
    receive: function(room, key, event, callback) {
        return this.dbRef.child(room).child(key).on(event, function(snapshot) {
            if (snapshot.key() && snapshot.val()) {
                callback(snapshot, key);
            }
        }, function(e) {
            console.log(e);
        });
    },
    detach: function(room, key, event, callback) {
        return this.dbRef.child(room).child(key).off(event, callback);
    },
    delete: function(room, key) {
        return this.dbRef.child(room).child(key).remove();
    }
};

function RandomGenerator() {
    return this;
}
RandomGenerator.id = function() {
    return (Math.random() * 10000 + 10000 | 0).toString();
}
RandomGenerator.guid = function() {
    // http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

function ConnectionStorage() {
    this.pcwStorage = [];
    this.dcwStorage = []
    return this;
}
ConnectionStorage.prototype = {
    push: function(wrapper, type, identifier) {
        switch (type) {
            case 'PCW':
                this.pcwStorage[identifier] = wrapper;
                break;
            case 'DCW':
                this.dcwStorage[identifier] = wrapper;
                break;
            default:
                throw new Error('Storage only accepts wrapper types PCW or DCW.');
        }
    },
    sendAll: function(data) {
        this.dcwStorage.forEach(function(element, index, array) {
            this.dcwStorage[index].send(data);
        }, this);
    },
    clean: function() {
        this.pcwStorage.forEach(function(element, index, array) {
            if (this.pcwStorage[index].pc == null || ['failed', 'closed'].indexOf(this.pcwStorage[index].pc.iceConnectionState) >= 0) {
                this.delete(index);
            }
        }, this);
    },
    delete: function(identifier) {
        if (this.dcwStorage[identifier].pc !== undefined || this.pcwStorage[identifier].pc !== null) {
            this.pcwStorage[identifier].pc = null;
        }
        if (this.dcwStorage[identifier].dc !== undefined || this.dcwStorage[identifier].dc !== null) {
            this.dcwStorage[identifier].dc = null;
        }
        delete this.pcwStorage[identifier];
        delete this.dcwStorage[identifier];
    }
};

function PeerConnectionWrapper(config, constraints) {
    this.identifier = RandomGenerator.id();
    this.pc = new RTCPeerConnection(config, constraints);
    return this;
}
PeerConnectionWrapper.prototype = {
    createDataChannel: function(type, channelName) {
        return new DataChannelWrapper(this.pc, type, channelName);
    },
    createOffer: function(successCallback, failureCallback, constraints) {
        var that = this;
        this.pc.createOffer(function(description) {
            that.pc.setLocalDescription(description);
            successCallback(description);
        }, function(e) {
            failureCallback(e);
        }, constraints);
    },
    createAnswer: function(successCallback, failureCallback, constraints) {
        var that = this;
        this.pc.createAnswer(function(description) {
            that.pc.setLocalDescription(description);
            successCallback(description);
        }, function(e) {
            failureCallback(e);
        }, constraints);
    },
    handleSession: function(session) {
        var sessionDescription = new RTCSessionDescription(JSON.parse(session));
        this.pc.setRemoteDescription(sessionDescription);
    },
    addIceCandidate: function(candidate) {
        this.pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
    },
    onIceCandidate: function(callback) {
        this.pc.onicecandidate = callback;
    },
    onTrack: function(callback) {
        if (window.mozRTCPeerConnection) {
            this.pc.ontrack = callback;
        } else {
            this.pc.onaddstream = callback;
        }
    },
    onConnection: function(callback) {
        this.pc.onconnection = callback;
    },
    onConnectionStateChange: function(callback) {
        this.pc.onconnectionstatechange = callback;
    },
    onSignalingStateChange: function(callback) {
        this.pc.onsignalingstatechange = callback;
    },
    onIceConnectionStateChange: function(callback) {
        this.pc.oniceconnectionstatechange = callback;
    },
    onIceGatheringStateChange: function(callback) {
        this.pc.onicegatheringstatechange = callback;
    },
    onIdentityResult: function(callback) {
        this.pc.onidentityresult = callback;
    },
    onIdPAssertionError: function(callback) {
        this.pc.onidpassertionerror = callback;
    },
    onIdPValidationError: function(callback) {
        this.pc.onidpvalidationerror = callback;
    },
    onNegotiationNeeded: function(callback) {
        this.pc.onnegotiationneeded = callback;
    },
    onPeerIdentity: function(callback) {
        this.pc.onpeeridentity = callback;
    },
    onRemoveStream: function(callback) {
        this.pc.onremovestream = callback;
    },
    onDataChannel: function(callback) {
        this.pc.ondatachannel = callback;
    }
};

function DataChannelWrapper(pc, type, channelName) {
    this.message = '';
    this.chunksize = 10000;
    var that = this;
    switch (type) {
        case 'offer':
            channelName = (typeof channelName !== 'undefined') ? channelName : 'sendDataChannel';
            var promise = new Promise(function(resolve, reject) {
                that.dc = pc.createDataChannel(channelName, {'reliable': true});
                resolve(that); // Oh boi
            });
            break;
        case 'answer':
            var promise = new Promise(function(resolve, reject) {
                pc.ondatachannel = function(e) {
                    that.dc = e.channel || e; // Chrome sends event (e.channel), FF sends raw channel (e), Oh shit waddup
                    resolve(that);
                };
            });
            break;
        default:
            throw new Error('Data channel type can either be answer or offer.');
    }
    return promise;
}
DataChannelWrapper.prototype = {
    onOpen: function(callback) {
        this.dc.onopen = callback;
    },
    onMessage: function(callback) {
        var that = this;
        this.dc.onmessage = function(e) {
            // https://github.com/cjb/serverless-webrtc/blob/master/js/serverless-webrtc.js#L135
            if (e.data.charCodeAt(0) == 2) {
                return;
            }

            var data = JSON.parse(e.data);
            if (data.type == 'fragment') {
                that.message += data.content;

                if (data.section == 'e') {
                    callback(JSON.parse(that.message));
                    that.message = '';
                }
            } else {
                callback(JSON.parse(data.content));
            }
        };
    },
    onClose: function(callback) {
        this.dc.onclose = callback;
    },
    onError: function(callback) {
        this.dc.onerror = callback;
    },
    onBufferedAmountLow: function(callback) {
        this.dc.onbufferedamountlow = callback;
    },
    send: function(data) {
        if (this.dc.readyState == 'open') {
            let dataContent = {
                type: typeof data,
                content: null
            };
            data = JSON.stringify(data);
            dataContent.content = data;
            dataContent = JSON.stringify(dataContent);

            if (dataContent.length > this.chunksize) {
                // TODO: Please don't forget to optimize data fragmentation
                // TODO: Would race problems happen?
                let offset = 0;
                let dataFragment = {
                    type: 'fragment',
                    content: null,
                    section: 's'
                };
                let adjustedChunksize = this.chunksize - JSON.stringify(dataFragment).length;
                do {
                    dataFragment.content = data.substring(offset, offset + adjustedChunksize);
                    offset = offset + adjustedChunksize;
                    if (offset >= data.length) {
                        dataFragment.section = 'e';
                    }
                    this.dc.send(JSON.stringify(dataFragment));
                } while (offset < data.length);
            } else {
                this.dc.send(dataContent);
            }
        } else {
            console.log('DC Skip Sending For State: ' + this.dc.readyState);
        }
    },
    close: function() {
        this.dc.close();
    }
};

var iceServers = [];
iceServers.push({'urls': 'stun:stun.services.mozilla.com'});
iceServers.push({'urls': 'stun:stun.l.google.com:19302'});
iceServers.push({'urls': 'stun:stun.anyfirewall.com:3478'});
iceServers.push({'urls': 'turn:turn.bistri.com:80', 'credential': 'webrtc', 'username': 'webrtc'});
var pcConfig = {'iceServers': iceServers};
var pcConstraints = {'optional': [{'DtlsSrtpKeyAgreement': true}/*, {'RtpDataChannels': true}*/]};
if (window.mozRTCPeerConnection) {
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
var ROOM = document.location.hash.substr(1) || RandomGenerator.guid();
var UID = RandomGenerator.id();
var getKey = (k1, k2) => k1 > k2 ? k1 + ':' + k2 : k2 + ':' + k1;
var ss = new SignalingServer('https://scorching-inferno-7058.firebaseio.com/');
var storage = new ConnectionStorage();

ss.receive(ROOM, 'peer/' + UID, 'child_added', function(snapshot) {
    var RID = snapshot.key();
    // var RID_TIMESTAMP = snapshot.val();

    // Remove peer remote ID upon acceptance
    ss.send(ROOM, 'peer/' + UID + '/' + RID, null);

    // NOP on same UID and RID
    if (UID == RID) {
        return;
    }

    // Get general purpose kiss
    var KEY = getKey(RID, UID);

    // Create answer peer connection request
    var pcw = new PeerConnectionWrapper(pcConfig, pcConstraints);
    storage.push(pcw, 'PCW', pcw.identifier);
    pcw.onIceCandidate(function(e) {
        console.log('PC onICECandidate Event');
        console.log(e);
        if (!e.candidate) {
            return;
        }

        pcw.pc.onicecandidate = null;
        console.log(JSON.stringify(e.candidate));
        ss.send(ROOM, 'handshake/' + KEY + '/candidate:answer', JSON.stringify(e.candidate));
    });
    pcw.onIceConnectionStateChange(function(e) {
        console.log('PC onIceConnectionStateChange Event');
        console.log('PC Ice Connection State: ' + pcw.pc.iceConnectionState);
        console.log(e);

        // Remove handshake data after connection completed
        if (pcw.pc.iceConnectionState == 'completed') {
            ss.delete(ROOM, 'handshake/' + KEY);
        }
    });

    var dcwPromise = pcw.createDataChannel('answer');
    dcwPromise.then(function(dcw) {
        storage.push(dcw, 'DCW', pcw.identifier);
        dcw.onMessage(function(data) {
            console.log('DC onMessage Event');
            console.log(data);
        });
    }, function() {
        console.log('DC onMessage Event Promise Failed');
    });

    var receiveSession = ss.receive(ROOM, 'handshake/' + KEY + '/offer', 'value', function(snapshot) {
        var session = snapshot.val();
        pcw.handleSession(session);
        pcw.createAnswer(function(description) {
            // Send description on signaling server for non serverless
            console.log('PC createAnswer OK');
            console.log(description);
            ss.send(ROOM, 'handshake/' + KEY + '/answer', JSON.stringify(description));
        }, function(e) {
            console.error(e);
        }, sdpConstraints);
        ss.detach(ROOM, 'handshake/' + KEY + '/offer', 'value', receiveSession);
    });
    var receiveCandidate = ss.receive(ROOM, 'handshake/' + KEY + '/candidate:offer', 'value', function(snapshot) {
        var candidate = snapshot.val();
        pcw.addIceCandidate(candidate);
        ss.detach(ROOM, 'handshake/' + KEY + '/candidate:offer', 'value', receiveCandidate);
    });
});
ss.receive(ROOM, 'ping', 'child_added', function(snapshot) {
    var RID = snapshot.key();
    // var RID_TIMESTAMP = snapshot.val();

    // Remove ping upon receiving the receiver ID
    ss.send(ROOM, 'ping/' + RID, null);

    // NOP on same UID and RID
    if (UID == RID) {
        return;
    }

    // Send own ID as peer for remote
    ss.send(ROOM, 'peer/' + RID + '/' + UID, Firebase.ServerValue.TIMESTAMP);

    // Get general purpose kiss
    var KEY = getKey(RID, UID);

    // Create offer peer connection request
    var pcw = new PeerConnectionWrapper(pcConfig, pcConstraints);
    storage.push(pcw, 'PCW', pcw.identifier);
    pcw.onIceCandidate(function(e) {
        console.log('PC onICECandidate Event');
        console.log(e);
        if (!e.candidate) {
            return;
        }

        pcw.pc.onicecandidate = null;
        console.log(JSON.stringify(e.candidate));
        ss.send(ROOM, 'handshake/' + KEY + '/candidate:offer', JSON.stringify(e.candidate));
    });
    pcw.onIceConnectionStateChange(function(e) {
        console.log('PC onIceConnectionStateChange Event');
        console.log('PC Ice Connection State: ' + pcw.pc.iceConnectionState);
        console.log(e);

        // Remove handshake data after connection completed
        if (pcw.pc.iceConnectionState == 'completed') {
            ss.delete(ROOM, 'handshake/' + KEY);
        }
    });

    var dcwPromise = pcw.createDataChannel('offer');
    dcwPromise.then(function(dcw) {
        storage.push(dcw, 'DCW', pcw.identifier);
        dcw.onMessage(function(data) {
            console.log('DC onMessage Event');
            console.log(data);
        });
    }, function() {
        console.log('DC onMessage Event Promise Failed');
    });

    pcw.createOffer(function(description) {
        // Send description on signaling server for non serverless
        console.log('PC createOffer OK');
        console.log(description);
        ss.send(ROOM, 'handshake/' + KEY + '/offer', JSON.stringify(description));
    }, function(e) {
        console.error(e);
    }, sdpConstraints);

    var receiveSession = ss.receive(ROOM, 'handshake/' + KEY + '/answer', 'value', function(snapshot) {
        var session = snapshot.val();
        pcw.handleSession(session);
        ss.detach(ROOM, 'handshake/' + KEY + '/answer', 'value', receiveSession);
    });
    var receiveCandidate = ss.receive(ROOM, 'handshake/' + KEY + '/candidate:answer', 'value', function(snapshot) {
        var candidate = snapshot.val();
        pcw.addIceCandidate(candidate);
        ss.detach(ROOM, 'handshake/' + KEY + '/candidate:answer', 'value', receiveCandidate);
    });
});
ss.send(ROOM, 'ping/' + UID, Firebase.ServerValue.TIMESTAMP);

window.setInterval(function() {
    // Do additional cleanup of closed connection instances
    storage.clean();
}, 1000);

// Test connection using the following...
// storage.sendAll(JSON.stringify({message: 'FOO'}))
// storage.sendAll(JSON.stringify({message: 'BAR'}))