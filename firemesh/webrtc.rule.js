var rule = {
    "rules": {
        "$room": {
            "ping": {
                ".read": true,
                "$UID": {
                    ".write": true,
                    ".validate": "newData.isNumber()"
                }
            },
            "peer": {
                "$UID": {
                    ".read": true,
                    "$RID": {
                        ".write": true,
                        ".validate": "newData.isNumber()"
                    }
                }
            },
            "handshake": {
                "$KEY": {
                    ".read": true,
                    ".write": "data.exists() && !newData.exists()",
                    "answer": {
                        ".write": "!data.exists() && newData.exists()",
                        ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 1028"
                    },
                    "offer": {
                        ".write": "!data.exists() && newData.exists()",
                        ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 1028"
                    },
                    "candidate:answer": {
                        ".write": "!data.exists() && newData.exists()",
                        ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 1028"
                    },
                    "candidate:offer": {
                        ".write": "!data.exists() && newData.exists()",
                        ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 1028"
                    }
                }  
            }
        }
    }
};
